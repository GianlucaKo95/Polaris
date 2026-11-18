// Befehle an die Kalkulation in Klartext oder per Sprache, z. B.
// „Lohn in Titel 03 um 5 % runter“ oder „Beton auf 118 €“. Die KI übersetzt,
// die Software rechnet; vor dem Übernehmen steht eine Vorschau.
import { useEffect, useRef, useState } from "react";
import { Mic, Square, CornerDownLeft } from "lucide-react";
import { Knopf, euro } from "./ui.jsx";
import { useStammdaten } from "./stammdaten.js";
import { befehlAuswertenKalk, befehleKalkAnwenden, nettoNach } from "../lib/kalk/kiKalk.js";
import { summen } from "../lib/kalk/lvBaum.js";

export function BefehlZeile({ knoten, ansaetze, z, anwenden, onZuschlaege, onStandFelder }) {
  const sd = useStammdaten();
  const [text, setText] = useState("");
  const [lauf, setLauf] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [hoert, setHoert] = useState(false);
  const eingabe = useRef(null);
  const erkenner = useRef(null);
  const Erkenner = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

  useEffect(() => {
    const t = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); eingabe.current?.focus(); } };
    window.addEventListener("keydown", t);
    return () => { window.removeEventListener("keydown", t); erkenner.current?.abort?.(); };
  }, []);

  if (!sd.rufeKi) return null;

  const ausfuehren = async (befehl = text) => {
    if (!befehl.trim()) return;
    setLauf(true); setFehler(null); setErgebnis(null);
    try {
      const r = await befehlAuswertenKalk({ text: befehl, knoten, ansaetze, z, rufeKi: sd.rufeKi });
      const e = befehleKalkAnwenden(knoten, ansaetze, z, r.aenderungen);
      setErgebnis({ ...e, rueckfrage: r.rueckfrage, vorher: summen(knoten).gesamt, nachher: nettoNach(knoten, ansaetze, z, e), befehl });
    } catch (e) { setFehler(e.message); }
    setLauf(false);
  };

  const diktieren = () => {
    if (hoert) { erkenner.current?.stop(); return; }
    const e = new Erkenner();
    e.lang = "de-DE"; e.interimResults = true; e.continuous = false;
    e.onresult = ev => {
      const t = Array.from(ev.results).map(r => r[0].transcript).join(" ");
      setText(t);
      if (ev.results[ev.results.length - 1].isFinal) ausfuehren(t);
    };
    e.onend = () => setHoert(false);
    e.onerror = () => setHoert(false);
    erkenner.current = e;
    setHoert(true);
    e.start();
  };

  const uebernehmen = async () => {
    const e = ergebnis;
    if (e.paket.aendern.length || e.paket.ansaetze.aendern.length) anwenden(e.paket);
    if (e.zuschlaege) await onZuschlaege(e.zuschlaege);
    if (Object.keys(e.stand).length) await onStandFelder(e.stand);
    setErgebnis(null);
    setText("");
  };

  const hatAenderung = ergebnis && (ergebnis.paket.aendern.length || ergebnis.paket.ansaetze.aendern.length || ergebnis.zuschlaege || Object.keys(ergebnis.stand).length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 6px 0 10px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface)" }}>
        <input ref={eingabe} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ausfuehren(); if (e.key === "Escape") { setErgebnis(null); e.currentTarget.blur(); } }}
          placeholder="Befehl an die Kalkulation, z. B. „Lohn in Titel 03 um 5 % runter“" aria-label="Befehl an die Kalkulation"
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 13.5, color: "var(--text)" }} />
        {lauf && <span style={{ fontSize: 12, color: "var(--muted)" }}>KI denkt …</span>}
        <span className="kb-taste">Strg K</span>
        {Erkenner && <button className="kb-symbol" onClick={diktieren} aria-label={hoert ? "Diktat beenden" : "Befehl diktieren"} style={{ color: hoert ? "var(--red)" : undefined }}>{hoert ? <Square size={14} /> : <Mic size={15} />}</button>}
        <button className="kb-symbol" onClick={() => ausfuehren()} disabled={lauf || !text.trim()} aria-label="Befehl ausführen"><CornerDownLeft size={15} /></button>
      </div>
      {(ergebnis || fehler) && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: "var(--surface)", fontSize: 13, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            {fehler && <div style={{ color: "var(--red)" }}>{fehler}</div>}
            {ergebnis?.rueckfrage && <div style={{ color: "var(--akzent)" }}>{ergebnis.rueckfrage}</div>}
            {ergebnis?.protokoll.map((p, i) => <div key={i}>{p}</div>)}
            {ergebnis?.fehler.map((f, i) => <div key={`f${i}`} style={{ color: "var(--red)" }}>{f}</div>)}
            {ergebnis && !hatAenderung && !ergebnis.rueckfrage && !ergebnis.fehler.length && <div style={{ color: "var(--text2)" }}>Keine Änderung erkannt.</div>}
            {hatAenderung && (
              <div className="kb-zahl" style={{ color: "var(--text2)", marginTop: 4 }}>
                Netto {euro(ergebnis.vorher)} → {euro(ergebnis.nachher)} ({ergebnis.nachher - ergebnis.vorher >= 0 ? "+" : ""}{euro(ergebnis.nachher - ergebnis.vorher)})
              </div>
            )}
          </div>
          {hatAenderung ? <Knopf klein haupt onClick={uebernehmen}>Übernehmen</Knopf> : null}
          <Knopf klein leise onClick={() => { setErgebnis(null); setFehler(null); }}>Verwerfen</Knopf>
        </div>
      )}
    </div>
  );
}
