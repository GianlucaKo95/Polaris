import { useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, Plus, Trash2, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { anhangAusDatei } from "../lib/anhaenge.js";
import { nuAngebotEinlesen } from "../lib/angebotEinlesen.js";
import { submissionAuswerten, positionsVergleich, bestbieterAusEinlesung } from "../lib/submission.js";

// Submissionsergebnis eines Angebots: Mitbieter, Rang, optional Bestbieter-
// Preise je Position aus dem Preisspiegel des Auftraggebers.

const eur = n => n == null ? "–" : (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pz = n => n == null ? "–" : `${n > 0 ? "+" : ""}${(Math.round(n * 1000) / 10).toLocaleString("de-DE")} %`;
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 34, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const feld = { boxSizing: "border-box", height: 34, padding: "0 10px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 14 };

export function SubmissionPanel({ angebot, stammpositionen = [], session, gesperrt, onAendern, onClose }) {
  const s = { datum: new Date().toISOString().slice(0, 10), rang: "", bieter: [], bestbieterEp: {}, notiz: "", ...(angebot.submission || {}) };
  const setze = teil => onAendern({ ...s, ...teil });
  const [lauf, setLauf] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [mail, setMail] = useState("");
  const r = submissionAuswerten({ ...angebot, submission: s });
  const vergleich = positionsVergleich({ ...angebot, submission: s }, stammpositionen).sort((x, y) => Math.abs(y.gpDiff) - Math.abs(x.gpDiff));

  async function preisspiegel(datei) {
    setFehler(null); setLauf(true);
    try {
      const anhang = datei ? await anhangAusDatei(datei) : null;
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 6000 }, session);
      const e = await nuAngebotEinlesen({ anhang, text: datei ? "" : mail, positionen: angebot.positionen, rufeKi });
      const best = bestbieterAusEinlesung(e);
      setze({ bestbieterEp: best, ...(s.bieter.length ? {} : { bieter: [{ name: e.name, summe: e.summe.angegeben ?? e.summe.berechnet }] }) });
      if (!Object.keys(best).length) setFehler("Keine Positionspreise erkannt");
      setMail("");
    } catch (err) { setFehler(err.message); }
    setLauf(false);
  }

  return createPortal(
    <div className="voll-overlay" role="dialog" aria-label="Submissionsergebnis" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>Submissionsergebnis</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 34, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {gesperrt && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>Das Angebot ist angenommen und gesperrt; das Ergebnis lässt sich nur noch ansehen</div>}
        <div style={{ display: "flex", gap: 24, paddingBottom: 16, borderBottom: "1px solid var(--border)", marginBottom: 16, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Eigenes Angebot</div><div style={{ ...zahl, fontSize: 20 }}>{eur(r.eigen)}</div></div>
          <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Rang</div><div style={{ ...zahl, fontSize: 20 }}>{r.rang ? `${r.rang} von ${r.bieter}` : "–"}</div></div>
          <div><div style={{ fontSize: 13, color: "var(--text2)" }}>{r.bester ? "Vorsprung zum Zweiten" : "Abstand zum Besten"}</div>
            <div style={{ ...zahl, fontSize: 20, color: r.abstand == null ? "var(--text)" : r.bester ? "var(--green)" : "var(--red)" }}>{r.abstand == null ? "–" : r.bester ? pz(-r.abstand) : pz(r.abstand)}</div></div>
        </div>

        <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 8px" }}>Mitbieter</h2>
        {s.bieter.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input value={b.name || ""} disabled={gesperrt} placeholder="Bieter" aria-label="Bieter" onChange={e => setze({ bieter: s.bieter.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} style={{ ...feld, flex: 1 }} />
            <input value={b.summe != null ? String(b.summe).replace(".", ",") : ""} disabled={gesperrt} inputMode="decimal" placeholder="Summe netto" aria-label="Summe netto"
              onChange={e => setze({ bieter: s.bieter.map((x, j) => j === i ? { ...x, summe: Number(e.target.value.replace(/\./g, "").replace(",", ".")) || null } : x) })} style={{ ...feld, ...zahl, width: 160, textAlign: "right" }} />
            {!gesperrt && <button aria-label="Entfernen" onClick={() => setze({ bieter: s.bieter.filter((_, j) => j !== i) })} style={{ ...knopf(), width: 34, padding: 0, justifyContent: "center" }}><Trash2 size={14} strokeWidth={1.5} /></button>}
          </div>
        ))}
        {!gesperrt && <button onClick={() => setze({ bieter: [...s.bieter, { name: "", summe: null }] })} style={knopf()}><Plus size={14} strokeWidth={1.5} /> Bieter</button>}

        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, color: "var(--text2)" }}>Submission am<br /><input type="date" value={s.datum} disabled={gesperrt} onChange={e => setze({ datum: e.target.value })} style={{ ...feld, marginTop: 4 }} /></label>
          <label style={{ fontSize: 13, color: "var(--text2)" }}>Rang (falls abweichend)<br /><input value={s.rang} disabled={gesperrt} inputMode="numeric" onChange={e => setze({ rang: e.target.value.replace(/\D/g, "") })} style={{ ...feld, ...zahl, width: 80, marginTop: 4 }} /></label>
        </div>

        <h2 style={{ fontSize: 15, fontWeight: 500, margin: "24px 0 4px" }}>Preise des Bestbieters</h2>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8, lineHeight: 1.5 }}>Gibt der Auftraggeber einen Preisspiegel heraus, liest die KI die Einheitspreise des Bestbieters je Position</div>
        {!gesperrt && (<>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ ...knopf(), cursor: "pointer" }}>{lauf ? <Spinner size={13} /> : <Paperclip size={14} strokeWidth={1.5} />} Preisspiegel (PDF, Foto)
              <input type="file" hidden disabled={lauf || !session?.access_token} accept="application/pdf,image/*" onChange={e => e.target.files?.[0] && preisspiegel(e.target.files[0])} /></label>
          </div>
          <textarea value={mail} onChange={e => setMail(e.target.value)} rows={3} placeholder="oder Preise aus Mail/Text einfügen"
            style={{ ...feld, width: "100%", height: "auto", padding: "8px 10px", marginTop: 8, resize: "vertical" }} />
          {mail.trim() && <button onClick={() => preisspiegel(null)} disabled={lauf} style={{ ...knopf(), marginTop: 6 }}>Einlesen</button>}
        </>)}
        {fehler && <div role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{fehler}</div>}
        {vergleich.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr>{["Position", "Gewerk", "Eigener EP", "Bestbieter", "Abw.", "Wirkung"].map((t, i) => <th key={t} style={{ textAlign: i >= 2 ? "right" : "left", fontWeight: 400, fontSize: 13, color: "var(--text2)", padding: "8px", borderBottom: "1px solid var(--border2)" }}>{t}</th>)}</tr></thead>
              <tbody>{vergleich.map(z => (
                <tr key={z.pos.id}>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)" }}>{z.pos.oz && <span style={{ ...zahl, color: "var(--text2)" }}>{z.pos.oz} </span>}{z.pos.bez}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)", color: "var(--text2)", fontSize: 13 }}>{z.gewerk}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)", ...zahl, textAlign: "right" }}>{eur(z.ep)}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)", ...zahl, textAlign: "right" }}>{eur(z.best)}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)", ...zahl, textAlign: "right", color: z.abweichung > 0.1 ? "var(--red)" : z.abweichung < -0.1 ? "var(--akzent)" : "var(--text2)" }}>{pz(z.abweichung)}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid var(--border)", ...zahl, textAlign: "right" }}>{eur(z.gpDiff)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <h2 style={{ fontSize: 15, fontWeight: 500, margin: "24px 0 8px" }}>Notiz</h2>
        <textarea value={s.notiz} disabled={gesperrt} rows={3} onChange={e => setze({ notiz: e.target.value })} placeholder="z.B. Bestbieter mit Nebenangebot, Vergabe nach Wertung"
          style={{ ...feld, width: "100%", height: "auto", padding: "8px 10px", resize: "vertical" }} />
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 16 }}>Die Auswertung über alle Angebote steht unter Stammdaten → Submissionen</div>
      </div>
    </div>,
    document.body,
  );
}
