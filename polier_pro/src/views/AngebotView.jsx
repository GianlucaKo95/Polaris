import { useEffect, useState, useRef } from "react";
import { FileText, Plus, Link2, Upload, FilePlus2 } from "lucide-react";
import { AngebotEditor } from "./AngebotEditor.jsx";
import { nettoSumme } from "../lib/lv.js";
import { nachtragUebersicht, nachtragStatus, STATUS_LABEL } from "../lib/nachtrag.js";
import { useBackButton } from "../hooks/useBackButton.js";
import { parseGaeb90, gaeb90ZuPositionen, gaeb90DateiLesen } from "../lib/gaeb90.js";
import { parseGaebXml, gaebXmlDateiLesen } from "../lib/gaebXml.js";
import { mutterLvIndexBauen, angebotAusAusschreibungAbgleichen, positionenMitKalkulationVorbereiten } from "../lib/mutterlv.js";

export function AngebotView({ projekt, aufgaben, einheitspreise, lvVorlagen, angebotVorlage, kalkulationspreise, standardZuschlaege, stammpositionen = [], eigeneFirma, angebote = [], onAngebotSpeichern, firmaId, profil, rolle = null, angebotRegeln = null, kalkulationsgrundlagen = null, onTerminplanErzeugen, co2Faktoren = [], oeffneAngebotId = null, onGeoeffnet = null, session }) {
  const [aktAngebot,  setAktAngebot]  = useState(null);
  // Aus der Angebotsliste (Desktop) direkt ein bestimmtes Angebot öffnen
  useEffect(() => {
    if (oeffneAngebotId == null) return;
    const a = angebote.find(x => String(x.id) === String(oeffneAngebotId));
    if (a) { setAktAngebot(a); onGeoeffnet?.(); }
  }, [oeffneAngebotId, angebote]);
  const [fehler,      setFehler]      = useState("");
  const [info,        setInfo]        = useState(null); // { titel, treffer, gesamt, fehlend } — letztes aus Ausschreibung generiertes Angebot
  const [generiertLaedt, setGeneriertLaedt] = useState(false);
  const ausschreibungStructRef = useRef(null);
  const ausschreibungXmlRef    = useRef(null);
  useBackButton(aktAngebot, () => setAktAngebot(null));

  async function neuesAngebot() {
    setFehler(""); setInfo(null);
    const a = {
      titel:        `Angebot ${new Date().toLocaleDateString("de-DE")}`,
      empfaenger:   projekt?.auftraggeber || "",
      datum:        new Date().toISOString().slice(0,10),
      gueltig_bis:  new Date(Date.now()+30*864e5).toISOString().slice(0,10),
      positionen:   [],
      rabatt:       0,
      mwst:         19,
      status:       "entwurf",
    };
    const gespeichert = await onAngebotSpeichern?.(a, true);
    if (!gespeichert) { setFehler("Angebot konnte nicht angelegt werden."); return; }
    setAktAngebot(gespeichert);
  }

  // Nachtrag zu einem angenommenen Angebot (Auftrag): neues Angebot mit
  // Bezug (nachtrag_zu), dessen Positionen der KI-Assistent zuerst aus der
  // Urkalkulation des Auftrags bepreist (lib/katalog.js, Quelle "UK").
  async function nachtragAnlegen(auftrag) {
    setFehler(""); setInfo(null);
    const nr = angebote.filter(x => x.nachtrag_zu === auftrag.id).length + 1;
    const a = {
      titel:       `Nachtrag ${nr} zu ${auftrag.titel}`,
      empfaenger:  auftrag.empfaenger || "",
      datum:       new Date().toISOString().slice(0,10),
      gueltig_bis: new Date(Date.now()+30*864e5).toISOString().slice(0,10),
      positionen:  [], rabatt: 0, mwst: auftrag.mwst ?? 19, status: "entwurf",
      nachtrag_zu: auftrag.id,
    };
    const gespeichert = await onAngebotSpeichern?.(a, true);
    if (!gespeichert) { setFehler("Nachtrag konnte nicht angelegt werden."); return; }
    setAktAngebot(gespeichert);
  }

  // Aus einer hochgeladenen Ausschreibung/Anfrage (GAEB90 D81/D83 oder
  // GAEB-DA-XML X83, unbepreist) automatisch ein Angebot erzeugen: die
  // LV-Struktur wird wie beim normalen GAEB-Import übernommen, die
  // Einheitspreise aber direkt aus den gespeicherten Mutter-LVs (lvVorlagen,
  // siehe AdminParameterView "Mutter-LV hochladen") per StLK-Katalognummer
  // bzw. Bezeichnungstext vorbelegt (siehe lib/mutterlv.js). Positionen ohne
  // Treffer bleiben bewusst bei EP 0 — nichts wird geraten, der Nutzer prüft
  // und ergänzt sie wie jedes andere neue Angebot im Editor.
  //
  // Zuschläge: ein Mutter-LV-Preis ist i.d.R. schon ein fertiger
  // Verkaufspreis, kein reiner Kostenwert — ihn automatisch nochmal mit
  // einem Zuschlag zu belegen würde ihn stillschweigend verteuern. Jede
  // gematchte Position bekommt deshalb über positionenMitKalkulationVorbereiten()
  // direkt eine aktive Kalkulation (Mutter-LV-Preis als Fremdleistungs-
  // Kostenbasis, 0% Zuschlag — der EP bleibt unverändert), damit der Nutzer
  // im Angebot nur noch den für DIESES Projekt passenden Zuschlagssatz
  // einträgt, statt die Kalkulation von Grund auf selbst anzulegen.
  async function ausschreibungVerarbeiten(geparst, dateiname) {
    setFehler(""); setInfo(null);
    const positionenRoh = gaeb90ZuPositionen(geparst);
    if (positionenRoh.length === 0) {
      setFehler("Keine Positionen erkannt — ist das eine gültige GAEB-Ausschreibungsdatei?");
      return;
    }
    const index = mutterLvIndexBauen(lvVorlagen);
    const abgleich = angebotAusAusschreibungAbgleichen(positionenRoh, index);
    const { treffer, gesamt, fehlend } = abgleich;
    const positionen = positionenMitKalkulationVorbereiten(abgleich.positionen, standardZuschlaege);
    const titel = geparst.projektTitel || dateiname.replace(/\.[^.]+$/, "");
    const a = {
      titel:        `Angebot ${titel}`,
      empfaenger:   projekt?.auftraggeber || "",
      datum:        new Date().toISOString().slice(0,10),
      gueltig_bis:  new Date(Date.now()+30*864e5).toISOString().slice(0,10),
      positionen, rabatt: 0, mwst: 19, status: "entwurf",
    };
    setGeneriertLaedt(true);
    const gespeichert = await onAngebotSpeichern?.(a, true);
    setGeneriertLaedt(false);
    if (!gespeichert) { setFehler("Angebot konnte nicht angelegt werden."); return; }
    setInfo({ titel: a.titel, treffer, gesamt, fehlend });
  }

  async function ausschreibungStrukturImportieren(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    try {
      const text = await gaeb90DateiLesen(datei);
      await ausschreibungVerarbeiten(parseGaeb90(text), datei.name);
    } catch (err) {
      setFehler("Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      e.target.value = "";
    }
  }

  async function ausschreibungXmlImportieren(e) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    try {
      const text = await gaebXmlDateiLesen(datei);
      await ausschreibungVerarbeiten(parseGaebXml(text), datei.name);
    } catch (err) {
      setFehler("Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      e.target.value = "";
    }
  }

  if (aktAngebot) {
    return <AngebotEditor
      angebot={aktAngebot}
      onSave={async a => {
        const gespeichert = await onAngebotSpeichern?.(a, false);
        setAktAngebot(gespeichert || a);
      }}
      onClose={() => setAktAngebot(null)}
      aufgaben={aufgaben}
      einheitspreise={einheitspreise}
      lvVorlagen={lvVorlagen}
      angebotVorlage={angebotVorlage}
      kalkulationspreise={kalkulationspreise}
      stammpositionen={stammpositionen}
      standardZuschlaege={standardZuschlaege}
      angebote={angebote}
      nachtragZu={aktAngebot.nachtrag_zu ? angebote.find(x => x.id === aktAngebot.nachtrag_zu) || null : null}
      rolle={rolle}
      angebotRegeln={angebotRegeln}
      kalkulationsgrundlagen={kalkulationsgrundlagen}
      onTerminplanErzeugen={onTerminplanErzeugen}
      co2Faktoren={co2Faktoren}
      projekt={projekt}
      eigeneFirma={eigeneFirma}
      firmaId={firmaId}
      profil={profil}
      session={session}
    />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:10 }}>
        <div style={{ color:"var(--text)", fontWeight:700, fontSize:15,
          display:"flex", alignItems:"center", gap:7 }}>
          <FileText size={16} /> Angebote
        </div>
        <button onClick={neuesAngebot}
          style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
            borderRadius:10, padding:"8px 16px", fontWeight:700,
            cursor:"pointer", fontSize:13, fontFamily:"inherit",
            display:"flex", alignItems:"center", gap:5 }}>
          <Plus size={14} /> Angebot
        </button>
      </div>

      {/* Aus Ausschreibung/Anfrage generieren — siehe lib/mutterlv.js. */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:10 }}>
        <button onClick={() => ausschreibungStructRef.current?.click()} disabled={generiertLaedt}
          style={{ background:"var(--surface2)", color:"var(--text)",
            border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
            cursor: generiertLaedt ? "default" : "pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
            display:"flex", alignItems:"center", justifyContent:"center", gap:5,
            opacity: generiertLaedt ? 0.6 : 1 }}>
          <Upload size={12} /> Aus Ausschreibung (D81/D83)
        </button>
        <button onClick={() => ausschreibungXmlRef.current?.click()} disabled={generiertLaedt}
          style={{ background:"var(--surface2)", color:"var(--text)",
            border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
            cursor: generiertLaedt ? "default" : "pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
            display:"flex", alignItems:"center", justifyContent:"center", gap:5,
            opacity: generiertLaedt ? 0.6 : 1 }}>
          <Upload size={12} /> Aus Ausschreibung (X83)
        </button>
      </div>
      <input ref={ausschreibungStructRef} type="file" onChange={ausschreibungStrukturImportieren}
        accept=".d81,.d83,.d85,.d86,.D81,.D83,.D85,.D86,.p81,.p83,.p85,.p86" style={{ display:"none" }} />
      <input ref={ausschreibungXmlRef} type="file" onChange={ausschreibungXmlImportieren}
        accept=".x83,.X83" style={{ display:"none" }} />

      {fehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
          padding:"9px 14px", marginBottom:10, fontSize:12,
          border:"1px solid var(--red)" }}>
          {fehler}
        </div>
      )}
      {info && (
        <div style={{ background:"var(--gbg)", color:"var(--green)", borderRadius:10,
          padding:"9px 14px", marginBottom:10, fontSize:12,
          border:"1px solid var(--green)" }}>
          ✓ „{info.titel}" erstellt — {info.treffer} von {info.gesamt} Positionen automatisch aus der Mutter-LV bepreist (mit Kalkulation
          {standardZuschlaege?.zuschlagFremdleistung ? <>, {standardZuschlaege.zuschlagFremdleistung}% Standard-Zuschlag angewendet</> : <>, Zuschlag noch 0% — siehe Parameter &rsaquo; Standard-Zuschläge</>})
          {info.fehlend > 0 && <>, {info.fehlend} noch ohne Preis</>}. Bitte vor dem Versenden prüfen.
        </div>
      )}

      {angebote.length === 0 && (
        <div style={{ textAlign:"center", padding:"35px 20px", color:"var(--muted)" }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:9, color:"var(--muted)" }}><FileText size={40} /></div>
          <div style={{ fontWeight:700, color:"var(--text)", marginBottom:6 }}>
            Noch keine Angebote
          </div>
          <div style={{ fontSize:13 }}>
            Erstelle ein Angebot aus Aufgaben, LV-Vorlagen oder einer Ausschreibung.
          </div>
        </div>
      )}

      {angebote.map(a => {
        const netto   = nettoSumme(a.positionen);
        const gesamt  = netto * (1 - (a.rabatt||0)/100) * (1 + (a.mwst||19)/100);
        const STATUS  = {
          entwurf:    { label:"📝 Entwurf",    farbe:"var(--muted)", bg:"var(--surface2)" },
          versendet:  { label:"📤 Versendet",  farbe:"var(--blue)",  bg:"var(--bbg)" },
          angenommen: { label:"✅ Angenommen", farbe:"var(--green)", bg:"var(--gbg)" },
          abgelehnt:  { label:"❌ Abgelehnt",  farbe:"var(--red)",   bg:"var(--rbg)" },
        };
        const statusInfo = STATUS[a.status] || { label:a.status, farbe:"var(--muted)", bg:"var(--surface2)" };
        return (
          <div key={a.id} onClick={() => setAktAngebot(a)}
            style={{ background:"var(--surface)", borderRadius:14,
              padding:"12px 18px", marginBottom:7, cursor:"pointer",
              border:"1.5px solid var(--border)",
              boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"flex-start" }}>
              <div>
                <div style={{ color:"var(--text)", fontWeight:700, fontSize:14 }}>
                  {a.titel}
                </div>
                <div style={{ color:"var(--muted)", fontSize:12, marginTop:2 }}>
                  {a.empfaenger} · {new Date(a.datum).toLocaleDateString("de-DE")}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color:"var(--yellow)", fontWeight:800, fontSize:16 }}>
                  {gesamt.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €
                </div>
                <div style={{ display:"inline-block", background:statusInfo.bg, color:statusInfo.farbe,
                  fontWeight:700, fontSize:11, borderRadius:20, padding:"3px 9px", marginTop:4 }}>
                  {statusInfo.label}
                </div>
              </div>
            </div>
            <div style={{ color:"var(--muted)", fontSize:12, marginTop:6 }}>
              {a.positionen.length} Position{a.positionen.length!==1?"en":""}
              · Gültig bis {new Date(a.gueltig_bis).toLocaleDateString("de-DE")}
            </div>
            {a.interne_freigabe?.status && (
              <div style={{ fontSize:11.5, marginTop:4, fontWeight:700,
                color: a.interne_freigabe.status === "freigegeben" ? "var(--green)" : a.interne_freigabe.status === "zurueckgewiesen" ? "var(--red)" : "var(--ydark)" }}>
                {a.interne_freigabe.status === "angefragt" && "⏳ Wartet auf Freigabe durch die Geschäftsführung"}
                {a.interne_freigabe.status === "freigegeben" && `✔ Intern freigegeben von ${a.interne_freigabe.von || "GF"}`}
                {a.interne_freigabe.status === "zurueckgewiesen" && `↩ Zurückgewiesen: ${a.interne_freigabe.notiz || "bitte überarbeiten"}`}
              </div>
            )}
            {a.nachtrag_zu && (
              <div style={{ fontSize:11.5, marginTop:4, color:"var(--muted)" }}>Nachtrag · {STATUS_LABEL[nachtragStatus(a)]}</div>
            )}
            {a.status === "angenommen" && !a.nachtrag_zu && (() => {
              const u = nachtragUebersicht(a, angebote);
              if (!u.anzahl) return null;
              const eur = n => Math.round(n).toLocaleString("de-DE") + " €";
              return (
                <div style={{ fontSize:11.5, marginTop:6, color:"var(--text)", background:"var(--surface2)", borderRadius:8, padding:"6px 9px", lineHeight:1.5 }}>
                  {u.anzahl} Nachträge: beauftragt {eur(u.beauftragt)} ({u.quote.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %) · offen {eur(u.offen)} · abgelehnt {eur(u.abgelehnt)}
                  {u.ohneAnkuendigung > 0 && <div style={{ color:"var(--red)" }}>{u.ohneAnkuendigung} zusätzliche Leistung(en) ohne Mehrkostenankündigung</div>}
                </div>
              );
            })()}
            {a.status === "angenommen" && !a.nachtrag_zu && (
              <button onClick={e => { e.stopPropagation(); nachtragAnlegen(a); }}
                style={{ marginTop:8, background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
                  borderRadius:8, padding:"6px 10px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                  display:"flex", alignItems:"center", gap:5 }}>
                <FilePlus2 size={12} /> Nachtrag anlegen
              </button>
            )}
            {/* entschieden_am wird nur von der angebot_freigabe_entscheiden-RPC
                gesetzt (nie vom internen Status-Dropdown) — zeigt also
                zuverlässig "Kunde hat online über den Link entschieden" an. */}
            {a.entschieden_am && (
              <div style={{ color:statusInfo.farbe, fontSize:11.5, marginTop:4,
                display:"flex", alignItems:"center", gap:4 }}>
                <Link2 size={11} />
                Online {a.status === "angenommen" ? "angenommen" : "abgelehnt"} am{" "}
                {new Date(a.entschieden_am).toLocaleDateString("de-DE")} von {a.entschieden_von}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
