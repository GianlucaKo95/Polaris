// Arbeitsfläche eines Kalkulationsprojekts: Übersicht, LV & Kalkulation, Protokoll.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, FolderPlus, MessageSquareText, Trash2, Undo2, Redo2, ListOrdered, Upload, Download, Lock, Copy, Search, AlertTriangle, ChevronLeft,
} from "lucide-react";
import { useLvStand } from "./useLvStand.js";
import { LvEditor } from "./LvEditor.jsx";
import { Knopf, Feld, Dialog, Meldung, StatusPunkt, PROJEKT_STATUS, STAND_ARTEN, STAND_LABEL, euro, datum, zeitpunkt, zahlLesen, Taste } from "./ui.jsx";
import { baumIndex, ozNeuVergeben, ozFehlendeVergeben, aenderungenAnwenden, pruefen, summen, ARTEN } from "../lib/kalk/lvBaum.js";
import { gaebZuKnoten, knotenZuFlach } from "../lib/kalk/lvFlach.js";
import { parseGaebXml, gaebXmlDateiLesen } from "../lib/gaebXml.js";
import { parseGaeb90, gaeb90DateiLesen, gaeb90Schreiben, gaeb90AlsWindows1252 } from "../lib/gaeb90.js";
import { gaebX84Schreiben } from "../lib/gaebX84.js";

const REITER = [["uebersicht", "Übersicht"], ["lv", "LV & Kalkulation"], ["protokoll", "Protokoll"]];

function herunterladen(name, inhalt, typ = "application/xml") {
  const blob = inhalt instanceof Blob ? inhalt : new Blob([inhalt], { type: typ });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const dateiName = s => String(s || "LV").replace(/[^\wäöüÄÖÜß.-]+/g, "_").slice(0, 60);

export function ProjektArbeitsflaeche({ speicher, projektId, onZurueck, onProjektGeaendert, recht }) {
  const [projekt, setProjekt] = useState(null);
  const [staende, setStaende] = useState([]);
  const [standId, setStandId] = useState(null);
  const [reiter, setReiter] = useState("lv");
  const [fehler, setFehler] = useState(null);

  const ladeProjekt = useCallback(async () => {
    try {
      const alle = await speicher.projekteLaden();
      const p = alle.find(x => x.id === projektId);
      setProjekt(p || null);
      const st = await speicher.staendeLaden(projektId);
      setStaende(st);
      setStandId(id => (id && st.some(s => s.id === id) ? id : (p?.aktueller_stand && st.some(s => s.id === p.aktueller_stand) ? p.aktueller_stand : st.at(-1)?.id || null)));
    } catch (e) { setFehler(e.nutzerText || e.message); }
  }, [speicher, projektId]);

  useEffect(() => { ladeProjekt(); }, [ladeProjekt]);

  const stand = staende.find(s => s.id === standId) || null;

  if (!projekt) {
    return <div style={{ padding: 32, color: "var(--text2)" }}>{fehler ? <Meldung art="fehler">{fehler}</Meldung> : "Lädt …"}</div>;
  }

  const projektAendern = async felder => {
    try { const p = await speicher.projektAendern(projekt.id, felder); setProjekt(x => ({ ...x, ...p })); onProjektGeaendert?.(); }
    catch (e) { setFehler(e.nutzerText || e.message); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <header style={{ padding: "16px 24px 0", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <button onClick={onZurueck} className="kb-knopf leise klein" style={{ marginLeft: -10 }}><ChevronLeft size={14} /> Projekte</button>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 500 }}>{projekt.name}</h1>
            <div style={{ color: "var(--text2)", fontSize: 13, marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <StatusPunkt status={projekt.status} />
              {[projekt.nummer, projekt.auftraggeber, projekt.ort, projekt.abgabe_am && `Abgabe ${datum(projekt.abgabe_am)}`].filter(Boolean).map(t => <span key={t}>{t}</span>)}
            </div>
          </div>
          {stand && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text2)" }}>
              Stand
              <select className="kb-eingabe" value={standId || ""} onChange={e => setStandId(e.target.value)} style={{ height: 32, width: "auto" }} aria-label="Stand wählen">
                {staende.map(s => <option key={s.id} value={s.id}>{s.nummer} · {s.bezeichnung || STAND_LABEL[s.art]}{s.gesperrt ? " (gesperrt)" : ""}</option>)}
              </select>
            </label>
          )}
        </div>
        <div role="tablist" style={{ display: "flex", gap: 4, marginTop: 12 }}>
          {REITER.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={reiter === id} onClick={() => setReiter(id)} className="desk-reiter"
              style={{ height: 40, padding: "0 12px", border: "none", background: "none", font: "inherit", fontSize: 14, cursor: "pointer", marginBottom: -1,
                color: reiter === id ? "var(--text)" : "var(--text2)", fontWeight: reiter === id ? 500 : 400, boxShadow: reiter === id ? "inset 0 -2px 0 var(--text)" : "none" }}>{label}</button>
          ))}
        </div>
      </header>
      {fehler && <div style={{ padding: "12px 24px 0" }}><Meldung art="fehler" onSchliessen={() => setFehler(null)}>{fehler}</Meldung></div>}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {reiter === "uebersicht" && <Uebersicht projekt={projekt} staende={staende} onAendern={projektAendern} darf={recht >= 2} onStand={id => { setStandId(id); setReiter("lv"); }} />}
        {reiter === "lv" && stand && (
          <LvBereich key={stand.id} speicher={speicher} projekt={projekt} stand={stand} darf={recht >= 2}
            onStandGeaendert={async neuId => { await ladeProjekt(); if (neuId) setStandId(neuId); onProjektGeaendert?.(); }} onFehler={setFehler} />
        )}
        {reiter === "protokoll" && <Protokoll speicher={speicher} projektId={projekt.id} staende={staende} />}
      </div>
    </div>
  );
}

// ── Übersicht ──────────────────────────────────────────────────────────────
function Uebersicht({ projekt, staende, onAendern, darf, onStand }) {
  const [f, setF] = useState({ name: projekt.name, nummer: projekt.nummer || "", auftraggeber: projekt.auftraggeber || "", ort: projekt.ort || "",
    status: projekt.status, abgabe_am: projekt.abgabe_am || "", notiz: projekt.notiz || "" });
  const geaendert = Object.keys(f).some(k => (f[k] || "") !== (projekt[k] || ""));
  return (
    <div style={{ padding: 24, overflowY: "auto", display: "grid", gridTemplateColumns: "minmax(320px, 480px) 1fr", gap: 32, alignItems: "start" }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Projekt</h2>
        <Feld label="Name"><input className="kb-eingabe" value={f.name} disabled={!darf} onChange={e => setF({ ...f, name: e.target.value })} /></Feld>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Feld label="Nummer"><input className="kb-eingabe" value={f.nummer} disabled={!darf} onChange={e => setF({ ...f, nummer: e.target.value })} /></Feld>
          <Feld label="Status">
            <select className="kb-eingabe" value={f.status} disabled={!darf} onChange={e => setF({ ...f, status: e.target.value })}>
              {PROJEKT_STATUS.map(([w, l]) => <option key={w} value={w}>{l}</option>)}
            </select>
          </Feld>
        </div>
        <Feld label="Auftraggeber"><input className="kb-eingabe" value={f.auftraggeber} disabled={!darf} onChange={e => setF({ ...f, auftraggeber: e.target.value })} /></Feld>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Feld label="Ort"><input className="kb-eingabe" value={f.ort} disabled={!darf} onChange={e => setF({ ...f, ort: e.target.value })} /></Feld>
          <Feld label="Abgabe am"><input type="date" className="kb-eingabe" value={f.abgabe_am || ""} disabled={!darf} onChange={e => setF({ ...f, abgabe_am: e.target.value })} /></Feld>
        </div>
        <Feld label="Notiz"><textarea className="kb-eingabe" rows={4} value={f.notiz} disabled={!darf} onChange={e => setF({ ...f, notiz: e.target.value })} /></Feld>
        {darf && <div><Knopf haupt disabled={!geaendert || !f.name.trim()} onClick={() => onAendern({ ...f, abgabe_am: f.abgabe_am || null })}>Speichern</Knopf></div>}
      </section>
      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 500 }}>Stände</h2>
        <table className="kb-tabelle">
          <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Art</th><th>Status</th><th>Angelegt</th><th className="r">Netto</th></tr></thead>
          <tbody>
            {staende.map(s => (
              <tr key={s.id} onClick={() => onStand(s.id)}>
                <td className="kb-zahl">{s.nummer}</td>
                <td>{s.bezeichnung || STAND_LABEL[s.art]}</td>
                <td>{STAND_LABEL[s.art]}</td>
                <td>{s.gesperrt ? <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Lock size={13} /> gesperrt {datum(s.gesperrt_am)}</span> : "in Arbeit"}</td>
                <td>{datum(s.created_at)}</td>
                <td className="r kb-zahl">{euro(s.summe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ── LV & Kalkulation ───────────────────────────────────────────────────────
function LvBereich({ speicher, projekt, stand, darf, onStandGeaendert, onFehler }) {
  const lv = useLvStand(speicher, stand.id);
  const gesperrt = stand.gesperrt || !darf;
  const [fokusId, setFokusId] = useState(null);
  const [suche, setSuche] = useState("");
  const [pruefungOffen, setPruefungOffen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [gaebMenue, setGaebMenue] = useState(false);
  const [auswahl, setAuswahl] = useState(null);
  const datei = useRef(null);

  useEffect(() => {
    const h = e => setAuswahl(e.detail?.knoten?.id || null);
    window.addEventListener("lv-auswahl", h);
    return () => window.removeEventListener("lv-auswahl", h);
  }, []);
  useEffect(() => { if (lv.fehler) onFehler(lv.fehler); }, [lv.fehler]); // eslint-disable-line react-hooks/exhaustive-deps

  const knoten = lv.knoten;
  const index = useMemo(() => (knoten ? baumIndex(knoten) : null), [knoten]);
  const hinweise = useMemo(() => (knoten ? pruefen(knoten) : []), [knoten]);

  if (lv.ladeFehler) return <div style={{ padding: 24 }}><Meldung art="fehler">{lv.ladeFehler}</Meldung></div>;
  if (!knoten) return <div style={{ padding: 24, color: "var(--text2)" }}>LV wird geladen …</div>;

  const aktion = (a, felder) => window.dispatchEvent(new CustomEvent("lv-aktion", { detail: { aktion: a, felder } }));
  const gewaehlt = auswahl ? index.nachId.get(auswahl) : null;

  const sucheWeiter = () => {
    const q = suche.trim().toLowerCase();
    if (!q) return;
    const liste = knoten.filter(k => `${k.oz} ${k.kurztext} ${k.langtext}`.toLowerCase().includes(q));
    if (!liste.length) return;
    const reihenfolge = [];
    const lauf = p => { for (const k of index.kinderVon(p)) { reihenfolge.push(k.id); lauf(k.id); } };
    lauf(null);
    const treffer = reihenfolge.filter(id => liste.some(k => k.id === id));
    const ab = treffer.findIndex(id => reihenfolge.indexOf(id) > reihenfolge.indexOf(auswahl));
    setFokusId(treffer[ab >= 0 ? ab : 0]);
  };

  const importieren = async file => {
    if (!file) return;
    try {
      const name = file.name.toLowerCase();
      let parsed;
      if (/\.(x8\d|xml)$/.test(name)) parsed = parseGaebXml(await gaebXmlDateiLesen(file));
      else if (/\.(d8\d|p8\d)$/.test(name)) parsed = parseGaeb90(await gaeb90DateiLesen(file));
      else { onFehler("Bitte eine GAEB-Datei wählen (X81–X86, D81–D86)."); return; }
      let neu = gaebZuKnoten(parsed);
      if (!neu.length) { onFehler("In der Datei wurden keine Positionen gefunden."); return; }
      if (knoten.length) {
        if (!window.confirm(`Das LV enthält schon ${knoten.length} Zeilen. Die ${neu.length} importierten Zeilen werden am Ende angehängt.`)) return;
        const max = Math.max(0, ...index.kinderVon(null).map(k => k.sort));
        neu = neu.map(k => (k.parent_id ? k : { ...k, sort: k.sort + max }));
      }
      await lv.importieren(neu, `GAEB-Import ${file.name}`);
      setDialog({ art: "info", text: `${neu.filter(k => k.typ === "position").length} Positionen und ${neu.filter(k => k.typ === "titel").length} Titel importiert.${parsed.warnungen?.length ? ` ${parsed.warnungen.length} Hinweise beim Einlesen.` : ""}` });
      onStandGeaendert();
    } catch (e) { onFehler(e.nutzerText || `Import fehlgeschlagen: ${e.message}`); }
    finally { if (datei.current) datei.current.value = ""; }
  };

  const exportieren = art => {
    setGaebMenue(false);
    // GAEB braucht für jede Position eine OZ: fehlende vorher vergeben (im offenen Stand dauerhaft)
    const fehlend = ozFehlendeVergeben(knoten);
    let exportKnoten = knoten;
    if (fehlend.aendern.length) {
      exportKnoten = aenderungenAnwenden(knoten, fehlend);
      if (!gesperrt) lv.anwenden(fehlend);
    }
    const flach = knotenZuFlach(exportKnoten);
    const titel = projekt.name;
    if (art === "x84") {
      const r = gaebX84Schreiben(flach, { projektTitel: titel });
      herunterladen(`${dateiName(titel)}_Stand${stand.nummer}.X84`, r.text);
      const teile = [];
      if (fehlend.aendern.length) teile.push(`${fehlend.aendern.length} Positionen ohne OZ ${gesperrt ? "wurden für den Export nummeriert" : "haben eine OZ bekommen"}.`);
      if (r.warnungen.length) teile.push(`${r.warnungen.length} Hinweise: ${r.warnungen.slice(0, 3).join(" · ")}`);
      if (teile.length) setDialog({ art: "info", text: `${r.anzahl} Positionen exportiert. ${teile.join(" ")}` });
    } else {
      const text = gaeb90Schreiben(flach.map(p => ({ ...p, ep: 0 })), { projektTitel: titel });
      herunterladen(`${dateiName(titel)}_Stand${stand.nummer}.D83`, new Blob([gaeb90AlsWindows1252(typeof text === "string" ? text : text.text)], { type: "text/plain" }));
    }
  };

  const sperren = async () => {
    await lv.speichernJetzt();
    if (!window.confirm(`Stand ${stand.nummer} sperren? Danach ist er unveränderlich; Änderungen gehen nur noch über einen neuen Stand. Die Summe ${euro(summen(knoten).gesamt)} wird eingefroren.`)) return;
    try { await speicher.standSperren(stand.id); onStandGeaendert(); } catch (e) { onFehler(e.nutzerText || e.message); }
  };

  const neuerStand = async (art, bezeichnung) => {
    await lv.speichernJetzt();
    try { const s = await speicher.standKopieren(stand.id, art, bezeichnung); setDialog(null); onStandGeaendert(s.id); }
    catch (e) { onFehler(e.nutzerText || e.message); }
  };

  const statusText = { gespeichert: "Gespeichert", offen: "Nicht gespeichert", speichert: "Speichert …", fehler: "Nicht gespeichert" }[lv.status];
  const titelListe = knoten.filter(k => k.typ === "titel");

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "12px 24px 16px", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {!gesperrt && <>
          <Knopf klein leise Icon={Plus} onClick={() => aktion("position")} title="Neue Position (Strg+Enter)">Position</Knopf>
          <Knopf klein leise Icon={FolderPlus} onClick={() => aktion("titel")} title="Neuer Titel (Strg+Umschalt+Enter)">Titel</Knopf>
          <Knopf klein leise Icon={MessageSquareText} onClick={() => aktion("hinweis")}>Hinweis</Knopf>
          <Knopf klein leise Icon={Trash2} onClick={() => aktion("loeschen")} title="Löschen (Strg+Entf)" disabled={!auswahl}>Löschen</Knopf>
          <span style={{ width: 1, height: 20, background: "var(--border2)", margin: "0 4px" }} />
          <button className="kb-symbol" onClick={lv.rueckgaengig} disabled={!lv.kannZurueck} aria-label="Rückgängig" title="Rückgängig (Strg+Z)"><Undo2 size={16} /></button>
          <button className="kb-symbol" onClick={lv.wiederholen} disabled={!lv.kannVor} aria-label="Wiederholen" title="Wiederholen (Strg+Y)"><Redo2 size={16} /></button>
          <Knopf klein leise Icon={ListOrdered} onClick={() => { if (window.confirm("Alle Ordnungszahlen nach der Reihenfolge neu vergeben?")) lv.anwenden(ozNeuVergeben(knoten)); }}>OZ neu</Knopf>
        </>}
        <div style={{ position: "relative" }}>
          <Knopf klein leise Icon={Download} onClick={() => setGaebMenue(m => !m)} aria-expanded={gaebMenue}>GAEB</Knopf>
          {gaebMenue && (
            <div role="menu" style={{ position: "absolute", top: 32, left: 0, zIndex: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(22,24,29,0.12)", padding: 4, width: 260 }}>
              {!gesperrt && <button role="menuitem" className="kb-knopf leise" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => { setGaebMenue(false); datei.current?.click(); }}><Upload size={16} /> Importieren (X81–X86, D81–D86)</button>}
              <button role="menuitem" className="kb-knopf leise" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => exportieren("x84")}><Download size={16} /> X84 mit Preisen exportieren</button>
              <button role="menuitem" className="kb-knopf leise" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => exportieren("d83")}><Download size={16} /> D83 ohne Preise exportieren</button>
            </div>
          )}
          <input ref={datei} type="file" hidden accept=".x81,.x82,.x83,.x84,.x85,.x86,.d81,.d83,.d84,.d86,.p83,.p84,.xml" onChange={e => importieren(e.target.files?.[0])} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8, height: 28, padding: "0 8px", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)" }}>
          <Search size={14} />
          <input value={suche} onChange={e => setSuche(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sucheWeiter(); }} placeholder="Im LV suchen" aria-label="Im LV suchen"
            style={{ border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 13, width: 128, color: "var(--text)" }} />
        </label>
        <div style={{ position: "relative" }}>
          <Knopf klein leise Icon={AlertTriangle} onClick={() => setPruefungOffen(o => !o)} disabled={!hinweise.length}
            style={{ color: hinweise.length ? "var(--akzent)" : undefined }}>{hinweise.length ? `${hinweise.length} Prüfhinweise` : "Keine Prüfhinweise"}</Knopf>
          {pruefungOffen && hinweise.length > 0 && (
            <div style={{ position: "absolute", top: 32, left: 0, zIndex: 20, width: 380, maxHeight: 360, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(22,24,29,0.12)", padding: 4 }}>
              {hinweise.slice(0, 200).map((h, i) => (
                <button key={i} className="kb-knopf leise klein" style={{ width: "100%", justifyContent: "flex-start", fontWeight: 400 }} onClick={() => { setFokusId(h.id); setPruefungOffen(false); }}>{h.text}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <span role="status" style={{ fontSize: 13, color: lv.status === "fehler" ? "var(--red)" : "var(--muted)", marginRight: 8 }}>
          {stand.gesperrt ? <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Lock size={13} /> Gesperrt am {datum(stand.gesperrt_am)}</span> : statusText}
          {lv.status === "fehler" && <button className="kb-knopf leise klein" onClick={lv.erneutSpeichern}>Erneut versuchen</button>}
        </span>
        {darf && <Knopf klein Icon={Copy} onClick={() => setDialog({ art: "stand" })}>Neuer Stand</Knopf>}
        {darf && !stand.gesperrt && <Knopf klein Icon={Lock} onClick={sperren}>Sperren</Knopf>}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "clamp(160px, 13vw, 220px) minmax(0, 1fr) clamp(232px, 18vw, 300px)", gap: 16 }}>
        <nav aria-label="Titel" style={{ overflowY: "auto", minHeight: 0 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 8px" }}>Titel</div>
          {titelListe.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", padding: "4px 8px" }}>Noch keine Titel</div>}
          <TitelBaum index={index} parent={null} tiefe={0} aktiv={auswahl} onWahl={setFokusId} />
        </nav>
        <LvEditor stand={stand} knoten={knoten} gesperrt={gesperrt} anwenden={lv.anwenden} rueckgaengig={lv.rueckgaengig} wiederholen={lv.wiederholen}
          fokusId={fokusId} onFokusErledigt={() => setFokusId(null)} sucheText={suche.trim()} />
        <Details k={gewaehlt} gesperrt={gesperrt} anwenden={lv.anwenden} hinweise={hinweise.filter(h => h.id === gewaehlt?.id)} stand={stand}
          speicher={speicher} onStandGeaendert={onStandGeaendert} onFehler={onFehler} darf={darf} />
      </div>

      {dialog?.art === "info" && <Dialog titel="Hinweis" onSchliessen={() => setDialog(null)} fuss={<Knopf haupt onClick={() => setDialog(null)}>OK</Knopf>}>{dialog.text}</Dialog>}
      {dialog?.art === "stand" && <NeuerStandDialog stand={stand} onSchliessen={() => setDialog(null)} onAnlegen={neuerStand} />}
    </div>
  );
}

function TitelBaum({ index, parent, tiefe, aktiv, onWahl }) {
  return index.kinderVon(parent).filter(k => k.typ === "titel").map(k => (
    <div key={k.id}>
      <div className={`lv-baum-eintrag${aktiv === k.id ? " aktiv" : ""}`} style={{ paddingLeft: 8 + tiefe * 14 }} onClick={() => onWahl(k.id)} title={`${k.oz} ${k.kurztext}`}>
        <span className="kb-zahl" style={{ color: "var(--muted)", fontSize: 12 }}>{k.oz}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{k.kurztext || "Titel"}</span>
      </div>
      <TitelBaum index={index} parent={k.id} tiefe={tiefe + 1} aktiv={aktiv} onWahl={onWahl} />
    </div>
  ));
}

function Details({ k, gesperrt, anwenden, hinweise, stand, speicher, onStandGeaendert, onFehler, darf }) {
  const [lang, setLang] = useState("");
  const [kurz, setKurz] = useState("");
  useEffect(() => { setLang(k?.langtext || ""); }, [k?.id, k?.langtext]);
  useEffect(() => { setKurz(k?.kurztext || ""); }, [k?.id, k?.kurztext]);
  const setze = felder => anwenden({ aendern: [{ id: k.id, felder }] });
  const standFeld = async (feld, text) => {
    const n = zahlLesen(text);
    if (n == null || n === Number(stand[feld])) return;
    try { await speicher.standAendern(stand.id, { [feld]: n }); onStandGeaendert(); } catch (e) { onFehler(e.nutzerText || e.message); }
  };
  return (
    <aside style={{ overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 16, paddingRight: 2 }}>
      {k ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{k.typ === "titel" ? "Titel" : k.typ === "hinweis" ? "Hinweistext" : "Position"} {k.oz}</div>
          <Feld label="Kurztext">
            <input className="kb-eingabe" value={kurz} disabled={gesperrt} onChange={e => setKurz(e.target.value)}
              onBlur={() => { if (kurz.trim() !== (k.kurztext || "")) setze({ kurztext: kurz.trim() }); }}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          </Feld>
          {k.typ !== "titel" && (
            <Feld label="Langtext">
              <textarea className="kb-eingabe" rows={8} value={lang} disabled={gesperrt} onChange={e => setLang(e.target.value)}
                onBlur={() => { if (lang !== (k.langtext || "")) setze({ langtext: lang }); }} />
            </Feld>
          )}
          {k.typ === "position" && (
            <>
              <Feld label="Positionsart">
                <select className="kb-eingabe" value={k.art} disabled={gesperrt} onChange={e => setze({ art: e.target.value })}>
                  {ARTEN.map(([w, l]) => <option key={w} value={w}>{l}</option>)}
                </select>
              </Feld>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Feld label="Rabatt %"><ZahlFeld wert={k.rabatt} disabled={gesperrt} onWert={n => setze({ rabatt: n })} /></Feld>
                <Feld label="STLK"><input className="kb-eingabe" defaultValue={k.stlk || ""} key={k.id} disabled={gesperrt} onBlur={e => { const v = e.target.value.trim() || null; if (v !== (k.stlk || null)) setze({ stlk: v }); }} /></Feld>
              </div>
              {k.extra?.altKalk && <div style={{ fontSize: 12, color: "var(--muted)" }}>Aus der alten Angebotskalkulation übernommen. Die Ansätze folgen in Phase 2.</div>}
            </>
          )}
          {hinweise.map((h, i) => <Meldung key={i}>{h.text}</Meldung>)}
        </section>
      ) : (
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: "20px" }}>
          Eine Zeile wählen, um Details zu sehen.
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", alignItems: "center" }}>
            <span><Taste>Enter</Taste></span><span>Zelle bearbeiten</span>
            <span><Taste>Strg</Taste> <Taste>Enter</Taste></span><span>Neue Position</span>
            <span><Taste>Alt</Taste> <Taste>→</Taste> / <Taste>←</Taste></span><span>Ein- und ausrücken</span>
            <span><Taste>Alt</Taste> <Taste>↑</Taste> / <Taste>↓</Taste></span><span>Zeile verschieben</span>
            <span><Taste>Umschalt</Taste> <Taste>↓</Taste></span><span>Mehrere Zeilen wählen</span>
            <span><Taste>Strg</Taste> <Taste>C</Taste> / <Taste>V</Taste></span><span>Kopieren, auch aus Excel</span>
            <span><Taste>Strg</Taste> <Taste>Z</Taste></span><span>Rückgängig</span>
          </div>
        </div>
      )}
      <section style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Stand {stand.nummer}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Feld label="Nachlass %"><ZahlFeld wert={stand.nachlass} disabled={stand.gesperrt || !darf} onWert={n => standFeld("nachlass", String(n))} /></Feld>
          <Feld label="MwSt %"><ZahlFeld wert={stand.mwst} disabled={stand.gesperrt || !darf} onWert={n => standFeld("mwst", String(n))} /></Feld>
        </div>
      </section>
    </aside>
  );
}

function ZahlFeld({ wert, onWert, disabled }) {
  const [t, setT] = useState(String(wert ?? 0).replace(".", ","));
  useEffect(() => { setT(String(wert ?? 0).replace(".", ",")); }, [wert]);
  return <input className="kb-eingabe kb-zahl" value={t} disabled={disabled} onChange={e => setT(e.target.value)} style={{ textAlign: "right" }}
    onBlur={() => { const n = zahlLesen(t); if (n == null) setT(String(wert ?? 0).replace(".", ",")); else if (n !== Number(wert)) onWert(n); }}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

function NeuerStandDialog({ stand, onSchliessen, onAnlegen }) {
  const [art, setArt] = useState(stand.art === "angebot" && stand.gesperrt ? "verhandlung" : stand.art);
  const [bez, setBez] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  return (
    <Dialog titel="Neuer Stand" onSchliessen={onSchliessen} fuss={<>
      <Knopf onClick={onSchliessen}>Abbrechen</Knopf>
      <Knopf haupt disabled={laeuft} onClick={async () => { setLaeuft(true); await onAnlegen(art, bez.trim() || STAND_LABEL[art]); setLaeuft(false); }}>Anlegen</Knopf>
    </>}>
      <div style={{ color: "var(--text2)", fontSize: 13 }}>Der neue Stand ist eine Kopie von Stand {stand.nummer} mit allen Positionen. Stand {stand.nummer} bleibt unverändert.</div>
      <Feld label="Art">
        <select className="kb-eingabe" value={art} onChange={e => setArt(e.target.value)}>
          {STAND_ARTEN.map(([w, l]) => <option key={w} value={w}>{l}</option>)}
        </select>
      </Feld>
      <Feld label="Bezeichnung"><input className="kb-eingabe" value={bez} placeholder={STAND_LABEL[art]} onChange={e => setBez(e.target.value)} /></Feld>
    </Dialog>
  );
}

// ── Protokoll ──────────────────────────────────────────────────────────────
const FELD_LABEL = { kurztext: "Kurztext", langtext: "Langtext", menge: "Menge", ep: "EP", einheit: "ME", oz: "OZ", art: "Art", rabatt: "Rabatt", sort: "Reihenfolge",
  parent_id: "Gliederung", gesperrt: "Gesperrt", nachlass: "Nachlass", mwst: "MwSt", status: "Status", name: "Name", stlk: "STLK", aktueller_stand: "Aktueller Stand" };
const kurzWert = v => (v == null ? "leer" : typeof v === "object" ? "…" : String(v).length > 40 ? String(v).slice(0, 40) + " …" : String(v));

function Protokoll({ speicher, projektId, staende }) {
  const [eintraege, setEintraege] = useState(null);
  const [fehler, setFehler] = useState(null);
  useEffect(() => { speicher.protokollLaden(projektId).then(setEintraege).catch(e => setFehler(e.nutzerText || e.message)); }, [speicher, projektId]);
  const standNr = id => staende.find(s => s.id === id)?.nummer;
  if (fehler) return <div style={{ padding: 24 }}><Meldung art="fehler">{fehler}</Meldung></div>;
  if (!eintraege) return <div style={{ padding: 24, color: "var(--text2)" }}>Lädt …</div>;
  return (
    <div style={{ padding: 24, overflowY: "auto" }}>
      <div style={{ color: "var(--text2)", fontSize: 13, marginBottom: 12 }}>Jede Änderung mit Zeitpunkt. Die letzten {eintraege.length} Einträge, neueste zuerst.</div>
      <table className="kb-tabelle">
        <thead><tr><th>Zeit</th><th>Stand</th><th>Was</th><th>Änderung</th></tr></thead>
        <tbody>
          {eintraege.map(e => (
            <tr key={e.id} style={{ cursor: "default" }}>
              <td className="kb-zahl" style={{ whiteSpace: "nowrap" }}>{zeitpunkt(e.zeit)}</td>
              <td className="kb-zahl">{standNr(e.stand_id) ?? ""}</td>
              <td>{{ kalk_projekte: "Projekt", kalk_staende: "Stand", lv_knoten: "LV-Zeile", kalk_ansaetze: "Ansatz" }[e.tabelle] || e.tabelle} {{ anlegen: "angelegt", aendern: "geändert", loeschen: "gelöscht" }[e.aktion]}</td>
              <td style={{ color: "var(--text2)" }}>
                {e.aenderung?.kurz != null ? e.aenderung.kurz
                  : Object.entries(e.aenderung || {}).filter(([f]) => f !== "kurz").map(([f, [a, n]]) => `${FELD_LABEL[f] || f}: ${kurzWert(a)} → ${kurzWert(n)}`).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!eintraege.length && <div style={{ color: "var(--muted)", padding: 16 }}>Noch keine Einträge.</div>}
    </div>
  );
}
