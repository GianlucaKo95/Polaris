import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { preisSetzen } from "../lib/preisstand.js";
import { materialJeGruppe, risikoBewerten, aufschlagAnwenden, vorbehaltText, bausteineZuordnen, stoffgruppeVon } from "../lib/materialrisiko.js";

// Materialpreisrisiko je Stoffgruppe mit Empfehlung: Gleitklausel,
// Risikoaufschlag (als Projektpreis im Preisstand) oder nichts.

const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pz = n => `${(Math.round(n * 1000) / 10).toLocaleString("de-DE")} %`;
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 32, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const klein = { boxSizing: "border-box", height: 30, width: 64, padding: "0 8px", border: "1px solid var(--border2)", borderRadius: 6, background: "var(--surface)", color: "var(--text)", fontSize: 14, textAlign: "right", ...zahl };
const th = { textAlign: "left", fontWeight: 400, fontSize: 13, color: "var(--text2)", padding: "10px 8px", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap" };
const td = { padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top" };
const EMPF = { gleitklausel: "Stoffpreisgleitklausel", aufschlag: "Risikoaufschlag", keine: "Kein Handlungsbedarf" };

export function MaterialRisiko({ positionen, preisstand, kalkulationspreise, session, gesperrt, stand, setStand, onPreisstand, onVorbehalt, onClose }) {
  const s = { monateBisBeginn: 3, dauerMonate: 3, schwankung: {}, zuordnung: {}, ...(stand || {}) };
  const setze = teil => setStand({ ...s, ...teil });
  const [lauf, setLauf] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [meldung, setMeldung] = useState(null);
  const daten = useMemo(() => materialJeGruppe(positionen, kalkulationspreise, s.zuordnung), [positionen, kalkulationspreise, s.zuordnung]);
  const bewertung = risikoBewerten(daten, s);
  const material = daten.gruppen.reduce((x, g) => x + g.kosten, 0);
  const gesamtRisiko = bewertung.reduce((x, b) => x + b.risiko, 0);
  const unbekannt = (kalkulationspreise || []).filter(k => k.kategorie === "material" && stoffgruppeVon(k, s.zuordnung) === "sonstige" && !s.zuordnung[String(k.id)]);

  async function zuordnen() {
    setFehler(null); setLauf(true);
    try {
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 2000 }, session);
      const z = await bausteineZuordnen(unbekannt, rufeKi);
      setze({ zuordnung: { ...s.zuordnung, ...Object.fromEntries(unbekannt.map(k => [String(k.id), z[String(k.id)] || "sonstige"])) } });
    } catch (e) { setFehler(e.message); }
    setLauf(false);
  }

  return createPortal(
    <div className="voll-overlay breit" role="dialog" aria-label="Materialpreisrisiko" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>Materialpreisrisiko</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 32, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <p style={{ margin: "0 0 16px", color: "var(--text2)", lineHeight: 1.55, maxWidth: 860 }}>
          Wie viel Materialkosten je Stoffgruppe im Angebot stecken und welche Preisbewegung bis zum Einkauf denkbar ist. Die Schwankungen je Jahr sind Annahmen, keine Prognose; passe sie an deine Erfahrung an.
          Bei öffentlichen Aufträgen sieht das VHB Stoffpreisgleitklauseln für bestimmte Stoffe vor (Formblatt 225), privat sind sie frei vereinbar
        </p>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-end", flexWrap: "wrap", paddingBottom: 16, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "var(--text2)" }}>Monate bis Baubeginn<br />
            <input value={s.monateBisBeginn} inputMode="numeric" onChange={e => setze({ monateBisBeginn: Number(e.target.value) || 0 })} style={{ ...klein, marginTop: 4 }} /></label>
          <label style={{ fontSize: 13, color: "var(--text2)" }}>Bauzeit in Monaten<br />
            <input value={s.dauerMonate} inputMode="numeric" onChange={e => setze({ dauerMonate: Number(e.target.value) || 0 })} style={{ ...klein, marginTop: 4 }} /></label>
          <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Material im Angebot</div><div style={{ ...zahl, fontSize: 20 }}>{eur(material)}</div></div>
          <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Denkbare Bewegung</div><div style={{ ...zahl, fontSize: 20 }}>± {eur(gesamtRisiko)}</div></div>
          {unbekannt.length > 0 && (
            <button onClick={zuordnen} disabled={lauf || !session?.access_token} style={{ ...knopf(), marginLeft: "auto", opacity: session?.access_token ? 1 : 0.5 }}>
              {lauf ? <Spinner size={13} /> : <Sparkles size={14} strokeWidth={1.5} />} {unbekannt.length} Bausteine per KI zuordnen
            </button>
          )}
        </div>
        {fehler && <div role="alert" style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>{fehler}</div>}
        {meldung && <div role="status" style={{ color: "var(--text2)", fontSize: 13, marginBottom: 8 }}>{meldung}</div>}
        {!bewertung.length ? <div style={{ color: "var(--text2)" }}>Keine kalkulierten Materialkosten im Angebot</div> : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 900 }}>
              <thead><tr>
                <th style={th}>Stoffgruppe</th><th style={{ ...th, textAlign: "right" }}>Materialkosten</th><th style={{ ...th, textAlign: "right" }}>Anteil</th>
                <th style={{ ...th, textAlign: "right" }}>Schwankung/Jahr</th><th style={{ ...th, textAlign: "right" }}>Bis Einkauf</th><th style={{ ...th, textAlign: "right" }}>Risiko</th><th style={th}>Empfehlung</th>
              </tr></thead>
              <tbody>
                {bewertung.map(b => (
                  <tr key={b.gruppe}>
                    <td style={td}>{b.label}<div style={{ fontSize: 12, color: "var(--muted)" }}>{b.positionen.size} Position{b.positionen.size === 1 ? "" : "en"}</div></td>
                    <td style={{ ...td, ...zahl, textAlign: "right" }}>{eur(b.kosten)}</td>
                    <td style={{ ...td, ...zahl, textAlign: "right" }}>{pz(b.anteil)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <input value={Math.round(b.schwankung * 100)} inputMode="numeric" aria-label={`Schwankung ${b.label}`} onChange={e => setze({ schwankung: { ...s.schwankung, [b.gruppe]: (Number(e.target.value) || 0) / 100 } })} style={klein} /> %
                    </td>
                    <td style={{ ...td, ...zahl, textAlign: "right" }}>± {pz(b.bewegung)}</td>
                    <td style={{ ...td, ...zahl, textAlign: "right", color: b.empfehlung === "gleitklausel" ? "var(--red)" : b.empfehlung === "aufschlag" ? "var(--akzent)" : "var(--text2)" }}>± {eur(b.risiko)}</td>
                    <td style={{ ...td, fontSize: 13 }}>
                      <div>{EMPF[b.empfehlung]}</div>
                      {b.empfehlung !== "keine" && !gesperrt && (
                        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                          <button onClick={() => { onVorbehalt(vorbehaltText(b)); setMeldung(`Vorbehalt zu ${b.label} steht im Angebotsschreiben`); }} style={knopf()}>Vorbehalt ins Anschreiben</button>
                          {preisstand && <button onClick={() => { onPreisstand(aufschlagAnwenden(preisstand, b, preisSetzen)); setMeldung(`${b.label}: Preise im Preisstand um ${b.aufschlagProzent.toLocaleString("de-DE")} % erhöht, EP neu gerechnet`); }} style={knopf()}>
                            +{b.aufschlagProzent.toLocaleString("de-DE")} % Aufschlag</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!preisstand && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 8 }}>Für einen Risikoaufschlag braucht das Angebot einen eigenen Preisstand (einmal speichern)</div>}
      </div>
    </div>,
    document.body,
  );
}
