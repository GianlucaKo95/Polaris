import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { katalogBauen } from "../lib/katalog.js";
import { rezepturText } from "../lib/kiVorkalkulation.js";
import { NEBEN_WERKZEUG, nebenPrompt, nebenKontext, vorschlaegeAuswerten, vorschlagBepreisen, vergleich, alsNebenangebot } from "../lib/nebenangebote.js";

// Nebenangebote: KI schlägt gleichwertige Alternativen vor, die Vorkalkulation
// bepreist sie mit den eigenen Bausteinen, übernommen als Alternativpositionen.

const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 34, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });

export function Nebenangebote({ positionen, projekt, eigeneFirma, stammpositionen = [], einheitspreise = [], lvVorlagen = [], kalkulationspreise = [], standardZuschlaege = null,
  session, stand, setStand, onUebernehmen, onClose }) {
  const vorschlaege = stand?.vorschlaege || null;
  const [lauf, setLauf] = useState(null);
  const [fehler, setFehler] = useState(null);
  const katalog = useMemo(() => katalogBauen({ stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege }),
    [stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege]);
  const bisher = positionen.filter(p => String(p.bez).startsWith("── Nebenangebot")).length;

  async function suchen() {
    setFehler(null); setLauf("Die KI sucht gleichwertige Alternativen");
    try {
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 6000 }, session);
      const { text, map } = nebenKontext(positionen, kalkulationspreise);
      const antwort = await rufeKi(nebenPrompt(), [{ role: "user", content: text }], [NEBEN_WERKZEUG], { type: "tool", name: NEBEN_WERKZEUG.name });
      const roh = vorschlaegeAuswerten((antwort?.content || []).find(b => b.type === "tool_use")?.input, map);
      const bepreist = [];
      for (let i = 0; i < roh.length; i++) {
        setLauf(`Vorschlag ${i + 1} von ${roh.length} wird mit deinen Bausteinen gerechnet`);
        bepreist.push(await vorschlagBepreisen(roh[i], { katalog, stammpositionen, kalkulationspreise, standardZuschlaege, kontext: { projekt, gewerke: eigeneFirma?.gewerke || [] }, rufeKi }));
      }
      setStand({ vorschlaege: bepreist, uebernommen: [] });
      if (!bepreist.length) setFehler("Keine sinnvollen Alternativen gefunden");
    } catch (e) { setFehler(e.message); }
    setLauf(null);
  }

  return createPortal(
    <div className="voll-overlay breit" role="dialog" aria-label="Nebenangebote" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>Nebenangebote</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 34, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <p style={{ margin: "0 0 12px", color: "var(--text2)", lineHeight: 1.55, maxWidth: 820 }}>
          Technisch gleichwertige Ausführungen, gerechnet mit deinen Bausteinen. Übernommen werden sie als eigener Abschnitt mit Alternativpositionen, nicht in der Angebotssumme.
          Bei öffentlichen Vergaben nur, wenn der Auftraggeber Nebenangebote zugelassen hat
        </p>
        <button onClick={suchen} disabled={!!lauf || !session?.access_token} style={{ ...knopf(!vorschlaege), opacity: session?.access_token ? 1 : 0.5 }}>
          {lauf ? <Spinner size={13} /> : <Sparkles size={14} strokeWidth={1.5} />} {lauf || (vorschlaege ? "Neu suchen" : "Alternativen suchen")}
        </button>
        {!session?.access_token && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Die KI braucht eine Anmeldung</div>}
        {fehler && <div role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{fehler}</div>}

        {(vorschlaege || []).map((v, idx) => {
          const vg = vergleich(v, positionen);
          const ersetzt = positionen.filter(p => v.ersetztIds.includes(p.id));
          const uebernommen = (stand?.uebernommen || []).includes(v.id);
          return (
            <div key={v.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{v.titel}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ ...zahl, fontSize: 18, color: vg.ersparnis > 0 ? "var(--green)" : "var(--red)" }}>{vg.ersparnis > 0 ? "−" : "+"}{eur(Math.abs(vg.ersparnis))}</div>
                  <div style={{ ...zahl, fontSize: 12, color: "var(--text2)" }}>{eur(vg.alt)} → {eur(vg.neu)}{vg.alt > 0 ? ` (${vg.anteil > 0 ? "−" : "+"}${Math.abs(Math.round(vg.anteil * 100))} %)` : ""}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, lineHeight: 1.5 }}>{v.idee}</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 6, lineHeight: 1.5 }}><span style={{ color: "var(--text)" }}>Gleichwertig: </span>{v.gleichwertigkeit}</div>
              {v.voraussetzungen && <div style={{ fontSize: 13, color: "var(--akzent)", marginTop: 4, lineHeight: 1.5 }}>Voraussetzung: {v.voraussetzungen}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12, fontSize: 13 }}>
                <div>
                  <div style={{ color: "var(--text2)", marginBottom: 4 }}>Ersetzt</div>
                  {ersetzt.map(p => <div key={p.id} style={{ padding: "4px 0", borderTop: "1px solid var(--border)" }}>{p.oz && <span style={{ ...zahl, color: "var(--text2)" }}>{p.oz} </span>}{p.bez} <span style={{ ...zahl, color: "var(--muted)" }}>· {eur(p.ep)}</span></div>)}
                </div>
                <div>
                  <div style={{ color: "var(--text2)", marginBottom: 4 }}>Neu</div>
                  {v.positionen.map(p => (
                    <div key={p.id} style={{ padding: "4px 0", borderTop: "1px solid var(--border)" }}>
                      {p.bez} <span style={{ ...zahl, color: p.ep > 0 ? "var(--muted)" : "var(--red)" }}>· {p.ep > 0 ? eur(p.ep) : "ohne Preis"}</span>
                      {p.kiKalkulation?.rezeptur && <div style={{ color: "var(--muted)" }}>{rezepturText(p.kiKalkulation.rezeptur, kalkulationspreise)}</div>}
                    </div>
                  ))}
                </div>
              </div>
              {vg.offen > 0 && <div style={{ fontSize: 13, color: "var(--red)", marginTop: 8 }}>{vg.offen} Position{vg.offen === 1 ? "" : "en"} ohne Preis: Vergleich unvollständig</div>}
              <div style={{ marginTop: 12 }}>
                <button disabled={uebernommen} onClick={() => { onUebernehmen(alsNebenangebot(positionen, v, bisher + 1)); setStand({ ...stand, uebernommen: [...(stand?.uebernommen || []), v.id] }); }}
                  style={{ ...knopf(!uebernommen), opacity: uebernommen ? 0.6 : 1 }}>{uebernommen ? "Im Angebot" : `Als Nebenangebot ${bisher + 1} übernehmen`}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
