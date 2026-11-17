import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { katalogBauen } from "../lib/katalog.js";
import {
  zuKalkulieren, bloecke, blockVorkalkulieren, vorschlagVorschau, rezepturText, zusammenfassung,
} from "../lib/kiVorkalkulation.js";

// KI-Vorkalkulation eines LV: Positionen ohne Preis blockweise an die KI,
// Vorschläge mit Sicherheit und Begründung prüfen, ausgewählte übernehmen.
// Logik in lib/kiVorkalkulation.js.

const eur = n => n == null ? "–" : (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const zahlFmt = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 36, padding: "0 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const SICHERHEIT_FARBE = { hoch: "var(--green)", mittel: "var(--akzent)", niedrig: "var(--red)" };
const th = { textAlign: "left", fontWeight: 400, fontSize: 13, color: "var(--text2)", padding: "8px", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--surface)" };
const td = { padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top" };

function Sicherheit({ wert }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: SICHERHEIT_FARBE[wert] || "var(--border2)" }} />{wert}
  </span>;
}

export function KiVorkalkulation({ positionen, projekt, eigeneFirma, stammpositionen = [], einheitspreise = [], lvVorlagen = [],
  kalkulationspreise = [], standardZuschlaege = null, nachtragZu = null, session, darfStammpositionen = false, onUebernehmen, onClose }) {
  const [alle, setAlle] = useState(false);
  const [lauf, setLauf] = useState(null);          // { block, bloecke }
  const [vorschlaege, setVorschlaege] = useState(null); // Map pos.id → Vorschlag
  const [auswahl, setAuswahl] = useState(new Set());
  const [merken, setMerken] = useState(new Set());
  const [filter, setFilter] = useState("alle");
  const [fehler, setFehler] = useState(null);
  const abbruch = useRef(false);

  const ziel = useMemo(() => zuKalkulieren(positionen, { alle }), [positionen, alle]);
  const katalog = useMemo(() => katalogBauen({ stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege, urkalkulation: nachtragZu }),
    [stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege, nachtragZu]);
  const ctx = { stammpositionen, kalkulationspreise, standardZuschlaege };

  async function starten() {
    setFehler(null); abbruch.current = false;
    const teile = bloecke(ziel);
    const gesammelt = new Map();
    const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 8000 }, session);
    for (let i = 0; i < teile.length; i++) {
      if (abbruch.current) break;
      setLauf({ block: i + 1, bloecke: teile.length });
      try {
        const erg = await blockVorkalkulieren({ block: teile[i], katalog, kalkulationspreise,
          kontext: { projekt, gewerke: eigeneFirma?.gewerke || [] }, rufeKi });
        for (const [id, v] of erg) gesammelt.set(id, v);
        setVorschlaege(new Map(gesammelt));
        // Sichere Vorschläge sind vorausgewählt, offene nie
        setAuswahl(a => new Set([...a, ...[...erg].filter(([, v]) => v.art !== "offen" && v.sicherheit !== "niedrig").map(([id]) => id)]));
      } catch (e) {
        setFehler(`Block ${i + 1}: ${e.message}`);
        break;
      }
    }
    setLauf(null);
  }

  const zeilen = ziel.filter(p => vorschlaege?.has(p.id)).map(p => {
    const v = vorschlaege.get(p.id);
    return { pos: p, v, vorschau: vorschlagVorschau(v, p, ctx) };
  }).filter(z => filter === "alle" || (filter === "offen" ? z.v.art === "offen" : z.v.art !== "offen" && z.v.sicherheit === filter));
  const s = vorschlaege ? zusammenfassung(vorschlaege) : null;
  const gewaehlt = ziel.filter(p => auswahl.has(p.id) && vorschlaege?.get(p.id)?.art !== "offen");
  const summe = gewaehlt.reduce((sum, p) => sum + (vorschlagVorschau(vorschlaege.get(p.id), p, ctx).ep || 0) * (Number(p.menge) || 0), 0);
  const umschalten = (setter, id) => setter(m => { const n = new Set(m); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return createPortal(
    <div className="voll-overlay breit" role="dialog" aria-label="LV vorkalkulieren" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "var(--bg)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>LV vorkalkulieren</div>
        <button onClick={() => { abbruch.current = true; onClose(); }} aria-label="Schließen" style={{ ...knopf(), width: 36, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {!vorschlaege && !lauf && (
          <div style={{ maxWidth: 640 }}>
            <p style={{ margin: "0 0 16px", lineHeight: 1.55, color: "var(--text2)" }}>
              Die KI schlägt für jede Position eine Kalkulation vor: eine passende Stammposition aus deinem Katalog oder einen Aufbau aus deinen Kostenbausteinen mit Zeitansatz.
              Preise kommen immer aus deinen Stammdaten, nie von der KI. Du prüfst jeden Vorschlag, bevor er übernommen wird
            </p>
            <div style={{ display: "flex", gap: 24, padding: "16px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
              <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Positionen</div><div style={{ ...zahl, fontSize: 20 }}>{ziel.length}</div></div>
              <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Katalog</div><div style={{ ...zahl, fontSize: 20 }}>{katalog.length}</div></div>
              <div><div style={{ fontSize: 13, color: "var(--text2)" }}>Kostenbausteine</div><div style={{ ...zahl, fontSize: 20 }}>{kalkulationspreise.length}</div></div>
            </div>
            {!kalkulationspreise.length && <p style={{ color: "var(--text2)", fontSize: 14 }}>Ohne Kostenbausteine (Stammdaten → Kalkulationspreise) kann die KI nur Katalogtreffer vorschlagen</p>}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 16 }}>
              <input type="checkbox" checked={alle} onChange={e => setAlle(e.target.checked)} /> Auch Positionen mit Preis neu vorschlagen
            </label>
            <button onClick={starten} disabled={!ziel.length || !session?.access_token} style={{ ...knopf(true), opacity: ziel.length && session?.access_token ? 1 : 0.5 }}>
              {ziel.length} Positionen vorkalkulieren
            </button>
            {!session?.access_token && <p style={{ color: "var(--text2)", fontSize: 13 }}>Die KI braucht eine Anmeldung</p>}
          </div>
        )}

        {(lauf || vorschlaege) && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            {lauf && <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text2)" }}><Spinner size={14} /> Block {lauf.block} von {lauf.bloecke}</span>}
            {s && <span style={{ color: "var(--text2)", fontSize: 14 }}>
              <span style={zahl}>{s.katalog}</span> aus dem Katalog · <span style={zahl}>{s.rezeptur}</span> neu aufgebaut · <span style={zahl}>{s.offen}</span> offen
            </span>}
            <div role="radiogroup" aria-label="Filter" style={{ display: "inline-flex", border: "1px solid var(--border2)", borderRadius: 8, padding: 2, marginLeft: "auto" }}>
              {[["alle", "Alle"], ["hoch", "Sicher"], ["mittel", "Prüfen"], ["niedrig", "Unsicher"], ["offen", "Offen"]].map(([k, l]) => (
                <button key={k} role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}
                  style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 6, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
                    background: filter === k ? "var(--bg)" : "transparent", color: filter === k ? "var(--text)" : "var(--text2)", boxShadow: filter === k ? "inset 0 0 0 1px var(--border2)" : "none" }}>{l}</button>
              ))}
            </div>
          </div>
          {fehler && <div role="alert" style={{ color: "var(--red)", background: "var(--rbg)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>{fehler}</div>}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 860 }}>
              <thead><tr>
                <th style={{ ...th, width: 32 }} />
                <th style={{ ...th, width: 88 }}>OZ</th>
                <th style={th}>Position</th>
                <th style={th}>Vorschlag</th>
                <th style={{ ...th, textAlign: "right" }}>h/E</th>
                <th style={{ ...th, textAlign: "right" }}>EP</th>
                <th style={th}>Sicherheit</th>
              </tr></thead>
              <tbody>
                {zeilen.map(({ pos, v, vorschau }) => {
                  const offen = v.art === "offen";
                  return (
                    <tr key={pos.id} style={{ opacity: offen ? 0.75 : 1 }}>
                      <td style={td}>{!offen && <input type="checkbox" aria-label={`${pos.bez} übernehmen`} checked={auswahl.has(pos.id)} onChange={() => umschalten(setAuswahl, pos.id)} />}</td>
                      <td style={{ ...td, ...zahl, fontSize: 13, color: "var(--text2)" }}>{pos.oz || ""}</td>
                      <td style={{ ...td, maxWidth: 320 }}>
                        <div>{pos.bez}</div>
                        <div style={{ ...zahl, fontSize: 13, color: "var(--muted)" }}>{zahlFmt(pos.menge)} {pos.einheit}</div>
                      </td>
                      <td style={{ ...td, maxWidth: 380 }}>
                        <div>{offen ? <span style={{ color: "var(--text2)" }}>Offen</span> : v.art === "katalog" ? <>{vorschau.quelle} <span style={{ color: "var(--muted)", fontSize: 13 }}>{v.ref}</span></> : rezepturText(v.rezeptur, kalkulationspreise)}</div>
                        <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2, lineHeight: 1.45 }}>{v.begruendung}</div>
                        {v.fehlt?.length > 0 && <div style={{ fontSize: 13, color: "var(--akzent)", marginTop: 2 }}>Fehlt: {v.fehlt.join(", ")}</div>}
                        {v.art === "rezeptur" && darfStammpositionen && (
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)", marginTop: 6 }}>
                            <input type="checkbox" checked={merken.has(pos.id)} onChange={() => umschalten(setMerken, pos.id)} /> Als Stammposition merken
                          </label>
                        )}
                      </td>
                      <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap" }}>{vorschau.stunden != null ? zahlFmt(vorschau.stunden) : "–"}</td>
                      <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap" }}>{offen ? "–" : eur(vorschau.ep)}</td>
                      <td style={td}>{offen ? <span style={{ fontSize: 13, color: "var(--muted)" }}>–</span> : <Sicherheit wert={v.sicherheit} />}</td>
                    </tr>
                  );
                })}
                {!zeilen.length && <tr><td colSpan={7} style={{ ...td, color: "var(--text2)", padding: 24 }}>{lauf ? "Die ersten Vorschläge kommen gleich" : "Keine Positionen in diesem Filter"}</td></tr>}
              </tbody>
            </table>
          </div>
        </>)}
      </div>

      {vorschlaege && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
          <span style={{ flex: 1, color: "var(--text2)", fontSize: 14 }}>
            <span style={zahl}>{gewaehlt.length}</span> ausgewählt · <span style={zahl}>{eur(summe)}</span> netto
          </span>
          {lauf && <button onClick={() => { abbruch.current = true; }} style={knopf()}>Anhalten</button>}
          <button onClick={() => onUebernehmen(new Map(gewaehlt.map(p => [p.id, vorschlaege.get(p.id)])), merken)} disabled={!gewaehlt.length || !!lauf}
            style={{ ...knopf(true), opacity: gewaehlt.length && !lauf ? 1 : 0.5 }}>Übernehmen</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
