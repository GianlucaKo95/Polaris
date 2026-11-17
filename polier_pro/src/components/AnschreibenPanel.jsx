import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { LEER, anschreibenKontext, anschreibenEntwerfen } from "../lib/anschreiben.js";

// Angebotsschreiben: Einleitung, Annahmen, Ausschlüsse, Zahlung, Schluss.
// Wert liegt in angebot.anschreiben und erscheint im Angebots-PDF.

const knopf = (haupt = false) => ({ height: 34, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const feld = { boxSizing: "border-box", width: "100%", padding: "8px 10px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface)",
  color: "var(--text)", fontFamily: "inherit", fontSize: 14, lineHeight: 1.5 };
const h2 = { fontSize: 15, fontWeight: 500, margin: "0 0 8px" };

function Liste({ titel, werte, onChange, gesperrt, platzhalter }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={h2}>{titel}</h2>
      {werte.map((w, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input value={w} disabled={gesperrt} onChange={e => onChange(werte.map((x, j) => j === i ? e.target.value : x))} aria-label={titel} style={{ ...feld, height: 34, padding: "0 10px" }} />
          {!gesperrt && <button aria-label="Entfernen" onClick={() => onChange(werte.filter((_, j) => j !== i))} style={{ ...knopf(), width: 34, padding: 0, justifyContent: "center" }}><Trash2 size={14} strokeWidth={1.5} /></button>}
        </div>
      ))}
      {!gesperrt && <button onClick={() => onChange([...werte, ""])} style={knopf()}><Plus size={14} strokeWidth={1.5} /> {platzhalter}</button>}
    </section>
  );
}

export function AnschreibenPanel({ angebot, projekt, eigeneFirma, annahmen = [], risiken = [], netto = 0, session, gesperrt, onAendern, onClose }) {
  const an = { ...LEER, ...(angebot.anschreiben || {}) };
  const setze = teil => onAendern({ ...an, ...teil });
  const [lauf, setLauf] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [vob, setVob] = useState(true);
  const leer = !an.einleitung && !an.annahmen.length && !an.ausschluesse.length && !an.zahlung && !an.schluss;

  async function entwerfen() {
    if (!leer && !window.confirm("Den bisherigen Text durch einen neuen Entwurf ersetzen?")) return;
    setFehler(null); setLauf(true);
    try {
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 3000 }, session);
      onAendern(await anschreibenEntwerfen({ kontext: anschreibenKontext({ angebot, projekt, firma: eigeneFirma, annahmen, risiken, netto }), vob, rufeKi }));
    } catch (e) { setFehler(e.message); }
    setLauf(false);
  }

  return createPortal(
    <div className="voll-overlay" role="dialog" aria-label="Angebotsschreiben" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>Angebotsschreiben</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 34, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {!gesperrt && (
            <button onClick={entwerfen} disabled={lauf || !session?.access_token} style={{ ...knopf(leer), opacity: session?.access_token ? 1 : 0.5 }}>
              {lauf ? <Spinner size={13} /> : <Sparkles size={14} strokeWidth={1.5} />} {lauf ? "KI schreibt" : leer ? "Mit KI entwerfen" : "Neu entwerfen"}
            </button>
          )}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)" }}>
            <input type="checkbox" checked={vob} onChange={e => setVob(e.target.checked)} /> VOB/B-Vertrag
          </label>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Nutzt {annahmen.length} {annahmen.length === 1 ? "Annahme" : "Annahmen"}{risiken.length ? ` und ${risiken.length} ${risiken.length === 1 ? "Risiko" : "Risiken"} aus der LV-Prüfung` : ""}. Erscheint im Angebots-PDF
          </span>
        </div>
        {fehler && <div role="alert" style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{fehler}</div>}
        <section style={{ marginBottom: 20 }}>
          <h2 style={h2}>Einleitung</h2>
          <textarea value={an.einleitung} disabled={gesperrt} rows={4} onChange={e => setze({ einleitung: e.target.value })} style={{ ...feld, resize: "vertical" }} />
        </section>
        <Liste titel="Grundlagen und Annahmen" werte={an.annahmen} gesperrt={gesperrt} platzhalter="Annahme" onChange={annahmen => setze({ annahmen })} />
        <Liste titel="Nicht im Angebot enthalten" werte={an.ausschluesse} gesperrt={gesperrt} platzhalter="Ausschluss" onChange={ausschluesse => setze({ ausschluesse })} />
        <section style={{ marginBottom: 20 }}>
          <h2 style={h2}>Zahlungsbedingungen</h2>
          <textarea value={an.zahlung} disabled={gesperrt} rows={3} placeholder="Leer: 14 Tage netto" onChange={e => setze({ zahlung: e.target.value })} style={{ ...feld, resize: "vertical" }} />
        </section>
        <section>
          <h2 style={h2}>Schluss</h2>
          <textarea value={an.schluss} disabled={gesperrt} rows={2} onChange={e => setze({ schluss: e.target.value })} style={{ ...feld, resize: "vertical" }} />
        </section>
      </div>
    </div>,
    document.body,
  );
}
