import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { befehlAuswerten, befehleAnwenden, netto } from "../lib/kiBefehle.js";

// Befehlsleiste über dem LV: tippen oder diktieren, Vorschau, übernehmen.
// Strg+K setzt den Cursor hinein. Logik in lib/kiBefehle.js.

const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 32, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });

export function BefehlsLeiste({ positionen, kalkulationspreise, session, mengeSetzen, onAnwenden }) {
  const [text, setText] = useState("");
  const [lauf, setLauf] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);   // { positionen, protokoll, fehler, rueckfrage, befehl }
  const [fehler, setFehler] = useState(null);
  const [hoert, setHoert] = useState(false);
  const eingabeRef = useRef(null);
  const erkennerRef = useRef(null);
  const Erkenner = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

  useEffect(() => {
    const taste = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); eingabeRef.current?.focus(); } };
    window.addEventListener("keydown", taste);
    return () => { window.removeEventListener("keydown", taste); erkennerRef.current?.abort?.(); };
  }, []);

  async function ausfuehren(befehl = text) {
    if (!befehl.trim()) return;
    setFehler(null); setLauf(true); setErgebnis(null);
    try {
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 2000 }, session);
      const r = await befehlAuswerten({ text: befehl, positionen, kalkulationspreise, rufeKi });
      const angewendet = befehleAnwenden(positionen, r.aenderungen, { kalkulationspreise, mengeSetzen });
      setErgebnis({ ...angewendet, rueckfrage: r.rueckfrage, befehl });
    } catch (e) { setFehler(e.message); }
    setLauf(false);
  }

  function diktieren() {
    if (hoert) { erkennerRef.current?.stop(); return; }
    const e = new Erkenner();
    e.lang = "de-DE"; e.interimResults = true; e.continuous = false;
    e.onresult = ev => {
      const t = Array.from(ev.results).map(r => r[0].transcript).join(" ");
      setText(t);
      if (ev.results[ev.results.length - 1].isFinal) ausfuehren(t);
    };
    e.onend = () => setHoert(false);
    e.onerror = () => setHoert(false);
    erkennerRef.current = e;
    setHoert(true);
    e.start();
  }

  const vorher = netto(positionen), nachher = ergebnis ? netto(ergebnis.positionen) : 0;
  const ohneSitzung = !session?.access_token;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input ref={eingabeRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && ausfuehren()}
          disabled={ohneSitzung} aria-label="Befehl an die Kalkulation"
          placeholder={ohneSitzung ? "Befehle brauchen eine Anmeldung" : "Befehl, z.B. Pos. 3 Zeitansatz 0,4 und Material plus 5 %   (Strg+K)"}
          style={{ flex: 1, minWidth: 0, height: 36, padding: "0 12px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface)",
            color: "var(--text)", fontFamily: "inherit", fontSize: 14 }} />
        {Erkenner && !ohneSitzung && (
          <button onClick={diktieren} aria-label={hoert ? "Diktat beenden" : "Befehl diktieren"} aria-pressed={hoert}
            style={{ ...knopf(hoert), width: 36, height: 36, padding: 0, justifyContent: "center" }}>
            {hoert ? <Square size={14} strokeWidth={1.5} /> : <Mic size={16} strokeWidth={1.5} />}
          </button>
        )}
        <button onClick={() => ausfuehren()} disabled={lauf || !text.trim() || ohneSitzung} style={{ ...knopf(), height: 36, opacity: text.trim() && !ohneSitzung ? 1 : 0.5 }}>
          {lauf ? <Spinner size={13} /> : null} Ausführen
        </button>
      </div>
      {fehler && <div role="alert" style={{ fontSize: 13, color: "var(--red)", marginTop: 6 }}>{fehler}</div>}
      {ergebnis && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginTop: 8 }}>
          {ergebnis.rueckfrage && <div style={{ marginBottom: 8 }}>{ergebnis.rueckfrage}</div>}
          {ergebnis.protokoll.map((p, i) => <div key={i} style={{ fontSize: 14, padding: "4px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>{p.text}</div>)}
          {ergebnis.fehler.map((f, i) => <div key={i} style={{ fontSize: 13, color: "var(--akzent)", padding: "4px 0" }}>Nicht ausgeführt: {f}</div>)}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {ergebnis.protokoll.length > 0 && (
              <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>
                Netto <span style={zahl}>{eur(vorher)}</span> → <span style={{ ...zahl, color: "var(--text)" }}>{eur(nachher)}</span>
                {" "}<span style={zahl}>({nachher - vorher >= 0 ? "+" : ""}{eur(nachher - vorher)})</span>
              </span>
            )}
            {!ergebnis.protokoll.length && <span style={{ flex: 1 }} />}
            <button onClick={() => setErgebnis(null)} style={knopf()}>Verwerfen</button>
            {ergebnis.protokoll.length > 0 && <button onClick={() => { onAnwenden(ergebnis.positionen); setErgebnis(null); setText(""); }} style={knopf(true)}>Übernehmen</button>}
          </div>
        </div>
      )}
    </div>
  );
}
