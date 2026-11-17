import { useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, Ruler, Sparkles, Trash2, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { AufmassWerkzeug } from "./AufmassWerkzeug.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { anhangAusDatei } from "../lib/anhaenge.js";
import { ABZUGSREGELN } from "../lib/aufmass.js";
import { vergleich, summen, bewertungText, bieterfragenAusAbweichungen, eigeneMengeAusAufmass, kiMengenErmitteln } from "../lib/mengenpruefung.js";

// Mengenprüfung: LV-Mengen des Auftraggebers gegen eigene Mengen aus Aufmaß
// oder KI. Die eigene Menge liegt in pos.eigeneMenge, die LV-Menge bleibt.

const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const z3 = n => n == null ? "–" : (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 34, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const FARBE = { mehrmenge: "var(--green)", mindermenge: "var(--red)", passt: "var(--muted)", offen: "var(--border2)" };
const TEXT = { mehrmenge: "Mehrmenge", mindermenge: "Mindermenge", passt: "Im Rahmen", offen: "Offen" };
const th = { textAlign: "left", fontWeight: 400, fontSize: 13, color: "var(--text2)", padding: "10px 8px", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--surface)" };
const td = { padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top" };

export function MengenPruefung({ positionen, session, gesperrt, onPositionenAendern, onBieterfragen, onClose }) {
  const [anhaenge, setAnhaenge] = useState([]);
  const [lauf, setLauf] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [hinweise, setHinweise] = useState([]);
  const [messen, setMessen] = useState(null);
  const [filter, setFilter] = useState("alle");
  const zeilen = vergleich(positionen);
  const s = summen(zeilen);
  const sichtbar = zeilen.filter(z => filter === "alle" || (filter === "abw" ? z.bewertung === "mehrmenge" || z.bewertung === "mindermenge" : z.bewertung === filter));

  const eigeneSetzen = (id, eigeneMenge) => onPositionenAendern(positionen.map(p => p.id === id ? (eigeneMenge ? { ...p, eigeneMenge } : (({ eigeneMenge: _, ...rest }) => rest)(p)) : p));

  async function dateien(liste) {
    setFehler(null);
    for (const d of liste) {
      try { const a = await anhangAusDatei(d); setAnhaenge(x => [...x, a]); } catch (e) { setFehler(e.message); }
    }
  }
  async function kiStarten() {
    setFehler(null); setLauf({ teil: 1, von: 1 });
    try {
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 8000 }, session);
      const r = await kiMengenErmitteln({ positionen, anhangBloecke: anhaenge.flatMap(a => a.bloecke || [a.block]), rufeKi, onFortschritt: (teil, von) => setLauf({ teil, von }) });
      // Eigenes Aufmaß hat Vorrang vor der KI
      onPositionenAendern(positionen.map(p => r.ergebnis.has(p.id) && p.eigeneMenge?.quelle !== "aufmass" ? { ...p, eigeneMenge: r.ergebnis.get(p.id) } : p));
      setHinweise(r.hinweise);
      if (!r.ergebnis.size) setFehler("Die KI konnte aus den Anhängen keine Mengen ermitteln");
    } catch (e) { setFehler(e.message); }
    setLauf(null);
  }
  const messPos = messen != null ? positionen.find(p => p.id === messen) : null;

  return createPortal(
    <div className="voll-overlay breit" role="dialog" aria-label="Mengenprüfung" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>LV-Mengen prüfen</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 34, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <p style={{ margin: "0 0 16px", color: "var(--text2)", lineHeight: 1.55, maxWidth: 820 }}>
          Die LV-Mengen bleiben die Angebotsmengen. Deine eigenen Mengen zeigen, wo nach Aufmaß mehr oder weniger abgerechnet wird.
          Die KI ermittelt sie aus den Plänen, ohne die LV-Mengen zu kennen
        </p>

        <div style={{ display: "flex", gap: 24, padding: "16px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", marginBottom: 16, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Mehrerlös bei Mehrmengen</div><div style={{ ...zahl, fontSize: 22, color: s.mehrerloes > 0 ? "var(--green)" : "var(--text)" }}>{eur(s.mehrerloes)}</div></div>
          <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Fehlt bei Mindermengen</div><div style={{ ...zahl, fontSize: 22, color: s.deckungsluecke < 0 ? "var(--red)" : "var(--text)" }}>{eur(s.deckungsluecke)}</div></div>
          <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Geprüft</div><div style={{ ...zahl, fontSize: 22 }}>{zeilen.length - s.offen} von {zeilen.length}</div></div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <label style={{ ...knopf(), cursor: "pointer" }}>
            <Paperclip size={14} strokeWidth={1.5} /> Pläne
            <input type="file" multiple hidden accept="application/pdf,image/*,.ifc" onChange={e => { dateien([...e.target.files]); e.target.value = ""; }} />
          </label>
          {anhaenge.map((a, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text2)", padding: "0 4px" }}>
              {a.name}
              <button aria-label={`${a.name} entfernen`} onClick={() => setAnhaenge(x => x.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex" }}><X size={13} /></button>
            </span>
          ))}
          <button onClick={kiStarten} disabled={!anhaenge.length || !!lauf || !session?.access_token || gesperrt} style={{ ...knopf(true), opacity: anhaenge.length && session?.access_token && !gesperrt ? 1 : 0.5 }}>
            {lauf ? <Spinner size={13} /> : <Sparkles size={14} strokeWidth={1.5} />} {lauf ? `KI ermittelt Mengen${lauf.von > 1 ? ` (${lauf.teil}/${lauf.von})` : ""}` : "KI ermittelt eigene Mengen"}
          </button>
          <div role="radiogroup" aria-label="Filter" style={{ display: "inline-flex", border: "1px solid var(--border2)", borderRadius: 8, padding: 2, marginLeft: "auto" }}>
            {[["alle", "Alle"], ["abw", "Abweichungen"], ["offen", "Offen"]].map(([k, l]) => (
              <button key={k} role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 6, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
                background: filter === k ? "var(--bg)" : "transparent", color: filter === k ? "var(--text)" : "var(--text2)", boxShadow: filter === k ? "inset 0 0 0 1px var(--border2)" : "none" }}>{l}</button>
            ))}
          </div>
        </div>
        {!session?.access_token && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Die KI braucht eine Anmeldung; von Hand messen geht auch so</div>}
        {hinweise.length > 0 && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>{hinweise.join(" · ")}</div>}
        {fehler && <div role="alert" style={{ fontSize: 13, color: "var(--red)", marginBottom: 8 }}>{fehler}</div>}

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 920 }}>
            <thead><tr>
              <th style={th}>OZ</th><th style={th}>Position</th><th style={{ ...th, textAlign: "right" }}>LV-Menge</th><th style={{ ...th, textAlign: "right" }}>Eigene Menge</th>
              <th style={{ ...th, textAlign: "right" }}>Abw.</th><th style={{ ...th, textAlign: "right" }}>Wirkung</th><th style={th}>Bewertung</th><th style={th} />
            </tr></thead>
            <tbody>
              {sichtbar.map(z => {
                const p = z.pos, e = p.eigeneMenge;
                return (
                  <tr key={p.id}>
                    <td style={{ ...td, ...zahl, fontSize: 13, color: "var(--text2)", whiteSpace: "nowrap" }}>{p.oz || ""}</td>
                    <td style={{ ...td, maxWidth: 300 }}>{p.bez}</td>
                    <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap" }}>{z3(z.lv)} {p.einheit}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <input value={e ? String(e.menge).replace(".", ",") : ""} inputMode="decimal" disabled={gesperrt} placeholder="–" aria-label={`Eigene Menge ${p.bez}`}
                        onChange={ev => { const v = ev.target.value.trim(); eigeneSetzen(p.id, v ? { menge: Number(v.replace(",", ".")) || 0, quelle: "hand" } : null); }}
                        style={{ ...zahl, width: 88, height: 30, textAlign: "right", padding: "0 8px", border: "1px solid var(--border2)", borderRadius: 6, background: "var(--surface)", color: "var(--text)", fontSize: 14 }} />
                      {e && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, maxWidth: 220, whiteSpace: "normal", textAlign: "right" }}>
                        {{ ki: "KI", aufmass: "Aufmaß", hand: "Von Hand" }[e.quelle] || ""}{e.toleranz ? ` ± ${Math.round(e.toleranz * 100)} %` : ""}{e.formel ? ` · ${e.formel}` : ""}
                      </div>}
                    </td>
                    <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap", color: FARBE[z.bewertung] }}>{z.abw == null ? "–" : z.abw === Infinity ? "neu" : `${z.abw > 0 ? "+" : ""}${Math.round(z.abw * 100)} %`}</td>
                    <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap" }}>{z.eigen == null ? "–" : eur(z.wirkung)}</td>
                    <td style={{ ...td, fontSize: 13, maxWidth: 300 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: FARBE[z.bewertung] }} />{TEXT[z.bewertung]}{z.unsicher && z.bewertung === "passt" ? ", unsicher" : ""}</span>
                      {(z.bewertung === "mehrmenge" || z.bewertung === "mindermenge") && <div style={{ color: "var(--text2)", marginTop: 2, lineHeight: 1.45 }}>{bewertungText(z).replace(/^[^:]+: /, "")}</div>}
                      {e?.grundlage && <div style={{ color: "var(--muted)", marginTop: 2 }}>{e.grundlage}</div>}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {!gesperrt && <button onClick={() => setMessen(p.id)} aria-label={`${p.bez} messen`} title="Im Plan oder Foto messen" style={{ ...knopf(), width: 32, height: 30, padding: 0, justifyContent: "center" }}><Ruler size={14} strokeWidth={1.5} /></button>}
                      {e && !gesperrt && <button onClick={() => eigeneSetzen(p.id, null)} aria-label="Eigene Menge entfernen" style={{ ...knopf(), width: 32, height: 30, padding: 0, justifyContent: "center", marginLeft: 4 }}><Trash2 size={13} strokeWidth={1.5} /></button>}
                    </td>
                  </tr>
                );
              })}
              {!sichtbar.length && <tr><td colSpan={8} style={{ ...td, color: "var(--text2)", padding: 20 }}>Keine Positionen in diesem Filter</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {(s.mehrmenge + s.mindermenge) > 0 && onBieterfragen && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
          <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>Deutliche Abweichungen lassen sich vor der Abgabe als Bieterfrage klären</span>
          <button onClick={() => onBieterfragen(bieterfragenAusAbweichungen(zeilen))} style={knopf()}>{s.mehrmenge + s.mindermenge} als Bieterfragen übernehmen</button>
        </div>
      )}

      {messPos && (
        <AufmassWerkzeug ziel={{ bez: messPos.bez, einheit: messPos.einheit || "m²" }} initial={messPos.eigeneMenge?.quelle === "aufmass" ? { zeilen: messPos.eigeneMenge.zeilen } : null}
          session={session} onClose={() => setMessen(null)}
          onUebernehmen={({ zeilen: zl, abzugsregel }) => {
            eigeneSetzen(messPos.id, eigeneMengeAusAufmass({ zeilen: zl, einheit: messPos.einheit, abzugsregelGrenze: ABZUGSREGELN.find(r => r.key === abzugsregel)?.grenze || 0 }));
            setMessen(null);
          }} />
      )}
    </div>,
    document.body,
  );
}
