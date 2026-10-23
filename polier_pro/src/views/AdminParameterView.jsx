import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Settings, Euro, ClipboardList, Pencil, X, Plus, FileText, NotebookPen, Calculator, Upload, Coins } from "lucide-react";
import { PreisFormular } from "./PreisFormular.jsx";
import { KalkulationspreisFormular, KALKULATIONSPREIS_KATEGORIEN } from "./KalkulationspreisFormular.jsx";
import { VorlageFormular } from "./VorlageFormular.jsx";
import { useBackButton } from "../hooks/useBackButton.js";
import { VorlagenUploadPanel } from "../components/VorlagenUploadPanel.jsx";
import { kiAngebotVorlageAnalysieren, kiTagebuchVorlageAnalysieren } from "../lib/ai.js";
import { parseGaeb90, gaeb90ZuPositionen, gaeb90DateiLesen, parseGaeb90Preise, gaeb90PreiseEinspielen } from "../lib/gaeb90.js";
import { parseGaebXml, gaebXmlDateiLesen } from "../lib/gaebXml.js";
import { zuschlagFeldName, ZUSCHLAG_KOMPONENTEN, ZUSCHLAG_KOMPONENTEN_LABEL, ZUSCHLAG_KOMPONENTEN_BESCHREIBUNG } from "../lib/kalkulation.js";

export function AdminParameterView({ einheitspreise, setEinheitspreise, lvVorlagen, setLvVorlagen, angebotVorlage, setAngebotVorlage, tagebuchVorlage, setTagebuchVorlage, kalkulationspreise, setKalkulationspreise, standardZuschlaege, setStandardZuschlaege, session }) {
  const [aktiv,    setAktiv]    = useState("preise"); // preise | kalkpreise | vorlagen | angebotsvorlage | tagebuchvorlage
  const [neuPreis, setNeuPreis] = useState(null);
  const [neuVorlage,setNeuVorlage] = useState(null);
  const [editPreis, setEditPreis] = useState(null);
  const [neuKalkPreis, setNeuKalkPreis] = useState(null);
  const [editKalkPreis, setEditKalkPreis] = useState(null);
  useBackButton(neuPreis || editPreis, () => { setNeuPreis(null); setEditPreis(null); });
  useBackButton(neuVorlage, () => setNeuVorlage(null));
  useBackButton(neuKalkPreis || editKalkPreis, () => { setNeuKalkPreis(null); setEditKalkPreis(null); });

  // ── Mutter-LV: GAEB-Import direkt als LV-Vorlage speichern ────────────────
  // Baut auf denselben Parsern wie der GAEB-Import im Angebot (gaeb90.js/
  // gaebXml.js) auf, landet aber direkt in lvVorlagen (firmenweite, dauerhafte
  // Preisbibliothek) statt in einem einzelnen Angebot — Grundlage für den
  // automatischen Preisabgleich neuer Ausschreibungen (siehe AngebotView.jsx,
  // lib/mutterlv.js).
  const [mutterLvFehler, setMutterLvFehler] = useState("");
  const [mutterLvInfo,   setMutterLvInfo]   = useState(null);
  const mutterLvStructInputRef = useRef(null);
  const mutterLvXmlInputRef    = useRef(null);
  const mutterLvPreiseInputRef = useRef(null);
  const [preiseZielVorlageId, setPreiseZielVorlageId] = useState(null);

  function vorlageAusImport(name, positionen) {
    setLvVorlagen(prev => [...prev, { id: Date.now(), name, gewerk: "", positionen }]);
  }

  async function mutterLvStrukturImportieren(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setMutterLvFehler(""); setMutterLvInfo(null);
    try {
      const text = await gaeb90DateiLesen(datei);
      const geparst = parseGaeb90(text);
      const positionen = gaeb90ZuPositionen(geparst);
      if (positionen.length === 0) {
        setMutterLvFehler("Keine Positionen erkannt — ist das eine GAEB90-Datei (.d81/.d83/.d85/.d86)?");
        return;
      }
      const name = geparst.projektTitel || datei.name.replace(/\.[^.]+$/, "");
      vorlageAusImport(name, positionen);
      setMutterLvInfo({ name, anzahl: positionen.length, warnungen: geparst.warnungen.length });
    } catch (err) {
      setMutterLvFehler("Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      e.target.value = "";
    }
  }

  async function mutterLvXmlImportieren(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setMutterLvFehler(""); setMutterLvInfo(null);
    try {
      const text = await gaebXmlDateiLesen(datei);
      const geparst = parseGaebXml(text);
      const positionen = gaeb90ZuPositionen(geparst);
      if (positionen.length === 0) {
        setMutterLvFehler("Keine Positionen erkannt — ist das eine GAEB-DA-XML-Datei (.x83)?");
        return;
      }
      const name = geparst.projektTitel || datei.name.replace(/\.[^.]+$/, "");
      vorlageAusImport(name, positionen);
      setMutterLvInfo({ name, anzahl: positionen.length, warnungen: geparst.warnungen.length });
    } catch (err) {
      setMutterLvFehler("Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      e.target.value = "";
    }
  }

  async function mutterLvPreiseImportieren(e) {
    const datei = e.target.files?.[0];
    const zielId = preiseZielVorlageId;
    if (!datei || zielId == null) return;
    setMutterLvFehler(""); setMutterLvInfo(null);
    try {
      const text = await gaeb90DateiLesen(datei);
      const geparst = parseGaeb90Preise(text);
      if (geparst.preise.length === 0) {
        setMutterLvFehler("Keine Preise erkannt — ist das eine bepreiste GAEB90-Datei (.d84/.d86)?");
        return;
      }
      const ziel = lvVorlagen.find(v => v.id === zielId);
      const { positionen, treffer, fehlend } = gaeb90PreiseEinspielen(ziel?.positionen || [], geparst.preise);
      setLvVorlagen(prev => prev.map(v => v.id === zielId ? { ...v, positionen } : v));
      setMutterLvInfo({ name: ziel?.name, treffer, fehlend, preise: true });
    } catch (err) {
      setMutterLvFehler("Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      e.target.value = "";
      setPreiseZielVorlageId(null);
    }
  }

  function preisLoeschen(id) {
    setEinheitspreise(prev => prev.filter(p => p.id !== id));
  }

  function preisSpeichern(p) {
    if (p.id && einheitspreise.find(x=>x.id===p.id)) {
      setEinheitspreise(prev => prev.map(x => x.id===p.id ? p : x));
    } else {
      setEinheitspreise(prev => [...prev, { ...p, id:Date.now() }]);
    }
    setNeuPreis(null); setEditPreis(null);
  }

  function kalkPreisLoeschen(id) {
    setKalkulationspreise(prev => prev.filter(p => p.id !== id));
  }

  function kalkPreisSpeichern(p) {
    if (p.id && kalkulationspreise.find(x=>x.id===p.id)) {
      setKalkulationspreise(prev => prev.map(x => x.id===p.id ? p : x));
    } else {
      setKalkulationspreise(prev => [...prev, { ...p, id:Date.now() }]);
    }
    setNeuKalkPreis(null); setEditKalkPreis(null);
  }

  return (
    <div>
      <div style={{ color:"var(--text)", fontWeight:700, fontSize:15, marginBottom:10,
        display:"flex", alignItems:"center", gap:7 }}>
        <Settings size={16} /> Angebots-Parameter
      </div>

      {/* Tab-Toggle — 3er-Grid statt einer Reihe: bei mehreren Tabs lief eine
          gemeinsame flex:1-Reihe auf schmalen Bildschirmen aus dem
          sichtbaren Bereich heraus (der letzte Tab war nicht mehr erreichbar). */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:12 }}>
        {[["preise",Euro,"Einheitspreise"],["kalkpreise",Calculator,"Kalkulationspreise"],["vorlagen",ClipboardList,"LV-Vorlagen"],["angebotsvorlage",FileText,"Angebots-Vorlage"],["tagebuchvorlage",NotebookPen,"Bautagebuch-Vorlage"]].map(([k,Icon,l]) => (
          <button key={k} onClick={() => setAktiv(k)}
            style={{ background: aktiv===k ? "var(--yellow)" : "var(--surface2)",
              color: aktiv===k ? "#1a1200" : "var(--muted)",
              border:`1.5px solid ${aktiv===k ? "var(--yellow)" : "var(--border)"}`,
              borderRadius:10, padding:10, fontWeight: aktiv===k ? 700 : 400,
              cursor:"pointer", fontSize:13, fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
              textAlign:"center" }}><Icon size={13} /> {l}</button>
        ))}
      </div>

      {/* EINHEITSPREISE */}
      {aktiv === "preise" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:7 }}>
            <div style={{ color:"var(--muted)", fontSize:12 }}>
              {einheitspreise.length} Positionen
            </div>
            <button onClick={() => setNeuPreis({ gewerk:"", einheit:"m²", preis:0, beschreibung:"" })}
              style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
                borderRadius:10, padding:"7px 14px", fontWeight:700,
                cursor:"pointer", fontSize:12, fontFamily:"inherit",
                display:"flex", alignItems:"center", gap:5 }}>
              <Plus size={13} /> Position
            </button>
          </div>

          {einheitspreise.map(p => (
            <div key={p.id} style={{ background:"var(--surface)", borderRadius:12,
              padding:"9px 14px", marginBottom:6,
              border:"1.5px solid var(--border)" }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ color:"var(--text)", fontWeight:700, fontSize:13 }}>
                    {p.gewerk} · {p.beschreibung}
                  </div>
                  <div style={{ color:"var(--muted)", fontSize:12, marginTop:2 }}>
                    {p.einheit} · {p.preis.toLocaleString("de-DE")} €/{p.einheit}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => setEditPreis(p)}
                    style={{ background:"var(--surface2)", border:"1px solid var(--border)",
                      color:"var(--muted)", borderRadius:8, padding:"4px 10px",
                      cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}><Pencil size={13} /></button>
                  <button onClick={() => preisLoeschen(p.id)}
                    style={{ background:"var(--rbg)", border:"1px solid var(--red)",
                      color:"var(--red)", borderRadius:8, padding:"4px 10px",
                      cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}><X size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KALKULATIONSPREISE — Lohn-/Material-/Geräte-/Fremdleistungs-
          Stammdaten für die EP-Kalkulation (anders als Einheitspreise oben,
          das fertige Verkaufspreise pro Gewerk sind). Nach Kategorie
          gruppiert statt einer flachen Liste, damit die Zuordnung beim
          Zusammenstellen einer Kalkulation in AngebotEditor klar bleibt. */}
      {aktiv === "kalkpreise" && (
        <div>
          {/* Standard-Zuschläge: firmenweites Zuschlagsschema je Kostenart,
              granular in Baustellengemeinkosten (BGK), Allgemeine
              Geschäftskosten (AGK) und Wagnis & Gewinn (WuG) gegliedert
              (siehe lib/kalkulation.js) — Default für jede neu angelegte
              Positions-Kalkulation (AngebotEditor.jsx::kalkUmschalten) statt
              0%, und wird beim Fremdleistungs-Satz zusätzlich automatisch auf
              den dort als Kostenbasis behandelten Mutter-LV-Preis angewendet,
              wenn aus einer Ausschreibung ein Angebot generiert wird
              (lib/mutterlv.js). */}
          <div style={{ background:"var(--surface2)", border:"1px dashed var(--border)",
            borderRadius:12, padding:"10px 12px", marginBottom:14 }}>
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700,
              textTransform:"uppercase", marginBottom:7 }}>Standard-Zuschläge (%)</div>
            <div style={{ display:"grid", gridTemplateColumns:"56px 1fr 1fr 1fr", gap:6, marginBottom:4 }}>
              <div></div>
              {ZUSCHLAG_KOMPONENTEN.map(komponente => (
                <div key={komponente} title={ZUSCHLAG_KOMPONENTEN_BESCHREIBUNG[komponente]}
                  style={{ color:"var(--muted)", fontSize:10, textAlign:"center" }}>
                  {ZUSCHLAG_KOMPONENTEN_LABEL[komponente]}
                </div>
              ))}
            </div>
            {[["Lohn","lohn"],["Material","material"],["Gerät","geraet"],["Fremdl.","fremdleistung"]].map(([l,kostenart]) => (
              <div key={kostenart} style={{ display:"grid", gridTemplateColumns:"56px 1fr 1fr 1fr",
                gap:6, marginBottom:6, alignItems:"center" }}>
                <div style={{ color:"var(--muted)", fontSize:11 }}>{l}</div>
                {ZUSCHLAG_KOMPONENTEN.map(komponente => {
                  const feld = zuschlagFeldName(kostenart, komponente);
                  return (
                    <input key={komponente} type="number" min="0" value={standardZuschlaege?.[feld] ?? ""}
                      onChange={e => setStandardZuschlaege(x => ({ ...x, [feld]: Number(e.target.value) }))}
                      placeholder="0" style={{ width:"100%", background:"var(--surface)", color:"var(--text)",
                        border:"1.5px solid var(--border)", borderRadius:8, padding:"7px 8px",
                        fontSize:12.5, boxSizing:"border-box", fontFamily:"inherit", textAlign:"center" }} />
                  );
                })}
              </div>
            ))}
            <div style={{ color:"var(--muted)", fontSize:11, marginTop:3, lineHeight:1.4 }}>
              Gilt als Vorgabe für jede neu angelegte Kalkulation. Der Fremdleistungs-Satz wird zusätzlich automatisch auf den Mutter-LV-Preis angewendet, wenn aus einer Ausschreibung ein Angebot generiert wird.
            </div>
          </div>

          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:7 }}>
            <div style={{ color:"var(--muted)", fontSize:12 }}>
              {kalkulationspreise.length} Preise
            </div>
            <button onClick={() => setNeuKalkPreis({ kategorie:"lohn", bezeichnung:"", einheit:"h", preis:0 })}
              style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
                borderRadius:10, padding:"7px 14px", fontWeight:700,
                cursor:"pointer", fontSize:12, fontFamily:"inherit",
                display:"flex", alignItems:"center", gap:5 }}>
              <Plus size={13} /> Preis
            </button>
          </div>

          {kalkulationspreise.length === 0 && (
            <div style={{ color:"var(--muted)", fontSize:13, textAlign:"center", padding:"20px 0" }}>
              Noch keine Kalkulationspreise angelegt.
            </div>
          )}

          {KALKULATIONSPREIS_KATEGORIEN.map(([kKey, kLabel]) => {
            const gruppe = kalkulationspreise.filter(p => p.kategorie === kKey);
            if (gruppe.length === 0) return null;
            return (
              <div key={kKey} style={{ marginBottom:14 }}>
                <div style={{ color:"var(--muted)", fontSize:11.5, fontWeight:700,
                  textTransform:"uppercase", letterSpacing:0.3, marginBottom:6 }}>{kLabel}</div>
                {gruppe.map(p => (
                  <div key={p.id} style={{ background:"var(--surface)", borderRadius:12,
                    padding:"9px 14px", marginBottom:6,
                    border:"1.5px solid var(--border)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"flex-start" }}>
                      <div style={{ flex:1 }}>
                        <div style={{ color:"var(--text)", fontWeight:700, fontSize:13 }}>
                          {p.bezeichnung}
                        </div>
                        <div style={{ color:"var(--muted)", fontSize:12, marginTop:2 }}>
                          {p.preis.toLocaleString("de-DE")} €/{p.einheit}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => setEditKalkPreis(p)}
                          style={{ background:"var(--surface2)", border:"1px solid var(--border)",
                            color:"var(--muted)", borderRadius:8, padding:"4px 10px",
                            cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}><Pencil size={13} /></button>
                        <button onClick={() => kalkPreisLoeschen(p.id)}
                          style={{ background:"var(--rbg)", border:"1px solid var(--red)",
                            color:"var(--red)", borderRadius:8, padding:"4px 10px",
                            cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}><X size={13} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* LV-VORLAGEN */}
      {aktiv === "vorlagen" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:7 }}>
            <div style={{ color:"var(--muted)", fontSize:12 }}>
              {lvVorlagen.length} Vorlagen
            </div>
            <button onClick={() => setNeuVorlage({ name:"", gewerk:"", positionen:[] })}
              style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
                borderRadius:10, padding:"7px 14px", fontWeight:700,
                cursor:"pointer", fontSize:12, fontFamily:"inherit",
                display:"flex", alignItems:"center", gap:5 }}>
              <Plus size={13} /> Vorlage
            </button>
          </div>

          {/* Mutter-LV: fertiges GAEB-LV (z.B. von einem früheren, ähnlichen
              Projekt) direkt als dauerhafte Preisquelle hochladen, statt
              jede Position manuell abzutippen — Grundlage für den
              automatischen Preisvorschlag bei neuen Ausschreibungen
              ("Aus Ausschreibung generieren" in Angebote). */}
          <div style={{ background:"var(--surface2)", border:"1px dashed var(--border)",
            borderRadius:12, padding:"10px 12px", marginBottom:10 }}>
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700,
              textTransform:"uppercase", marginBottom:7 }}>Mutter-LV hochladen</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
              <button onClick={() => mutterLvStructInputRef.current?.click()}
                style={{ background:"var(--surface)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:"8px 0",
                  cursor:"pointer", fontSize:11.5, fontWeight:700, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                <Upload size={12} /> GAEB90 (D81/D83)
              </button>
              <button onClick={() => mutterLvXmlInputRef.current?.click()}
                style={{ background:"var(--surface)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:"8px 0",
                  cursor:"pointer", fontSize:11.5, fontWeight:700, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                <Upload size={12} /> GAEB-XML (X83)
              </button>
            </div>
            <input ref={mutterLvStructInputRef} type="file" onChange={mutterLvStrukturImportieren}
              accept=".d81,.d83,.d85,.d86,.D81,.D83,.D85,.D86,.p81,.p83,.p85,.p86" style={{ display:"none" }} />
            <input ref={mutterLvXmlInputRef} type="file" onChange={mutterLvXmlImportieren}
              accept=".x83,.X83" style={{ display:"none" }} />
            <input ref={mutterLvPreiseInputRef} type="file" onChange={mutterLvPreiseImportieren}
              accept=".d84,.d86,.D84,.D86,.p84,.p86" style={{ display:"none" }} />
            {mutterLvFehler && (
              <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:8,
                padding:"7px 10px", marginTop:8, fontSize:11.5 }}>{mutterLvFehler}</div>
            )}
            {mutterLvInfo && (
              <div style={{ background:"var(--gbg)", color:"var(--green)", borderRadius:8,
                padding:"7px 10px", marginTop:8, fontSize:11.5 }}>
                {mutterLvInfo.preise
                  ? <>✓ {mutterLvInfo.treffer} Preise in „{mutterLvInfo.name}" eingespielt{mutterLvInfo.fehlend > 0 && <> — {mutterLvInfo.fehlend} ohne passende Position</>}.</>
                  : <>✓ „{mutterLvInfo.name}" mit {mutterLvInfo.anzahl} Positionen angelegt{mutterLvInfo.warnungen > 0 && <> ({mutterLvInfo.warnungen} Zeile(n) nicht erkannt)</>} — Preise fehlen noch, siehe „Preise einspielen" unten.</>}
              </div>
            )}
          </div>

          {lvVorlagen.map(v => (
            <div key={v.id} style={{ background:"var(--surface)", borderRadius:12,
              padding:"9px 14px", marginBottom:6,
              border:"1.5px solid var(--border)" }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:6 }}>
                <div style={{ color:"var(--text)", fontWeight:700, fontSize:13 }}>
                  {v.name}
                </div>
                <div style={{ display:"flex", gap:5 }}>
                  <button onClick={() => { setPreiseZielVorlageId(v.id); mutterLvPreiseInputRef.current?.click(); }}
                    title="GAEB-Preise einspielen (D84/D86)"
                    style={{ background:"var(--surface2)", border:"1px solid var(--border)",
                      color:"var(--text)", borderRadius:8, padding:"4px 8px",
                      cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}><Coins size={13} /></button>
                  <button onClick={() => setLvVorlagen(prev => prev.filter(x=>x.id!==v.id))}
                    style={{ background:"var(--rbg)", border:"1px solid var(--red)",
                      color:"var(--red)", borderRadius:8, padding:"4px 10px",
                      cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}><X size={13} /></button>
                </div>
              </div>
              {v.positionen.map((pos,i) => (
                <div key={i} style={{ color:"var(--muted)", fontSize:11,
                  padding:"3px 0", borderBottom:"1px solid var(--border)",
                  display:"flex", justifyContent:"space-between", gap:8 }}>
                  <span>{pos.bez} · {pos.einheit}</span>
                  {pos.ep > 0 && <span style={{ flexShrink:0 }}>{pos.ep.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ANGEBOTS-VORLAGE */}
      {aktiv === "angebotsvorlage" && (
        <VorlagenUploadPanel
          beschreibung="Word-Dokument (.docx) mit eurem gewohnten Angebotstext hochladen — die KI schlägt daraus Einleitungs-/Schlusstext und Spaltenbeschriftungen vor. Jedes künftige Angebot wird damit als eigenes, sauber generiertes Word-Dokument exportierbar, nicht als Bearbeitung der hochgeladenen Datei selbst."
          analysiereFn={kiAngebotVorlageAnalysieren}
          session={session}
          vorlage={angebotVorlage}
          setVorlage={setAngebotVorlage}
          textFelder={[
            ["Einleitungstext","intro_text"],
            ["Schlusstext","footer_text"],
          ]}
          kurzFelder={[
            ["Spalte Bezeichnung","spalte_bez","Bezeichnung"],
            ["Spalte Menge","spalte_menge","Menge"],
            ["Spalte Einheit","spalte_einheit","Einheit"],
            ["Spalte EP","spalte_ep","EP (€)"],
            ["Spalte GP","spalte_gp","GP (€)"],
          ]}
        />
      )}

      {/* BAUTAGEBUCH-VORLAGE */}
      {aktiv === "tagebuchvorlage" && (
        <VorlagenUploadPanel
          beschreibung="Word-Dokument (.docx) mit eurem gewohnten Bautagebuch-Text hochladen — die KI schlägt daraus Einleitungs-/Schlusstext und Abschnittsbeschriftungen vor. Jeder künftige Tagesbericht wird damit als eigenes, sauber generiertes Word-Dokument exportierbar, nicht als Bearbeitung der hochgeladenen Datei selbst."
          analysiereFn={kiTagebuchVorlageAnalysieren}
          session={session}
          vorlage={tagebuchVorlage}
          setVorlage={setTagebuchVorlage}
          textFelder={[
            ["Einleitungstext","intro_text"],
            ["Schlusstext","footer_text"],
          ]}
          kurzFelder={[
            ["Abschnitt Tätigkeiten","label_taetigkeit","Tätigkeiten"],
            ["Abschnitt Besonderheiten","label_besonderheiten","Besonderheiten / Mängel"],
            ["Abschnitt Material","label_material","Materiallieferungen"],
            ["Abschnitt Personal","label_personal","Personal & Stunden"],
          ]}
        />
      )}

      {/* Preis-Formular — als Portal gerendert, sonst derselbe
          nested-position:fixed-Bug wie beim Aufgabenformular */}
      {(neuPreis || editPreis) && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:600, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0",
            padding:16,
            width:"100%", maxWidth:480 }}>
            <PreisFormular
              initial={editPreis || neuPreis}
              onSave={preisSpeichern}
              onClose={() => { setNeuPreis(null); setEditPreis(null); }}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Kalkulationspreis-Formular */}
      {(neuKalkPreis || editKalkPreis) && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:600, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0",
            padding:16,
            width:"100%", maxWidth:480 }}>
            <KalkulationspreisFormular
              initial={editKalkPreis || neuKalkPreis}
              onSave={kalkPreisSpeichern}
              onClose={() => { setNeuKalkPreis(null); setEditKalkPreis(null); }}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Vorlagen-Formular */}
      {neuVorlage && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:600, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0",
            padding:16,
            width:"100%", maxWidth:480 }}>
            <VorlageFormular
              initial={neuVorlage}
              einheitspreise={einheitspreise}
              onSave={v => { setLvVorlagen(prev=>[...prev,{...v,id:Date.now()}]); setNeuVorlage(null); }}
              onClose={() => setNeuVorlage(null)}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
