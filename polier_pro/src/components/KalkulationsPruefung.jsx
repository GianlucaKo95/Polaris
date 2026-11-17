import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { regelPruefung, kiPruefen, sortieren, zaehlen, posLabel } from "../lib/kalkulationsPruefung.js";

// Zweiter Kalkulator: Regeln sofort, KI-Prüfung auf Knopfdruck. Ergebnis und
// „erledigt“ liegen im Editor, damit sie beim erneuten Öffnen bleiben.

const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const FARBE = { hoch: "var(--red)", mittel: "var(--akzent)", hinweis: "var(--muted)" };
const SCHWERE_TEXT = { hoch: "Kritisch", mittel: "Prüfen", hinweis: "Hinweis" };
const knopf = (haupt = false) => ({ height: 36, padding: "0 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });

export function KalkulationsPruefung({ positionen, kalkulationspreise, standardZuschlaege, preispruefung, projekt, angebotTitel, session,
  kiErgebnis, setKiErgebnis, erledigt, setErledigt, onZurPosition, onClose }) {
  const [lauf, setLauf] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [zeigeErledigt, setZeigeErledigt] = useState(false);

  const regeln = useMemo(() => regelPruefung(positionen, { kalkulationspreise, standardZuschlaege, preispruefung }),
    [positionen, kalkulationspreise, standardZuschlaege, preispruefung]);
  // KI-Befunde zu gelöschten Positionen fallen weg
  const ki = (kiErgebnis?.befunde || []).filter(b => positionen.some(p => p.id === b.posId));
  const alle = sortieren([...regeln, ...ki]);
  const offen = alle.filter(b => !erledigt.has(b.id));
  const sichtbar = zeigeErledigt ? alle : offen;
  const z = zaehlen(offen);
  const posVon = id => positionen.find(p => p.id === id);
  const veraltet = kiErgebnis && kiErgebnis.stand !== JSON.stringify(positionen.map(p => [p.id, p.ep, p.menge]));

  async function kiStarten() {
    setFehler(null);
    setLauf({ teil: 1, von: 1 });
    try {
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 6000 }, session);
      const r = await kiPruefen({ positionen, kalkulationspreise, kontext: { projekt, angebotTitel }, rufeKi,
        onFortschritt: (teil, von) => setLauf({ teil, von }) });
      setKiErgebnis({ ...r, am: new Date().toISOString(), stand: JSON.stringify(positionen.map(p => [p.id, p.ep, p.menge])) });
    } catch (e) { setFehler(e.message); }
    setLauf(null);
  }
  const umschalten = id => setErledigt(m => { const n = new Set(m); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return createPortal(
    <div className="voll-overlay" role="dialog" aria-label="Kalkulation prüfen" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "var(--bg)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>Kalkulation prüfen</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 36, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", gap: 24, paddingBottom: 16, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          {["hoch", "mittel", "hinweis"].map(s => (
            <div key={s}>
              <div style={{ fontSize: 13, color: "var(--text2)", display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: FARBE[s] }} />{SCHWERE_TEXT[s]}
              </div>
              <div style={{ ...zahl, fontSize: 22 }}>{z[s]}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          {lauf ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text2)" }}>
              <Spinner size={14} /> KI liest die Positionen{lauf.von > 1 ? ` (Teil ${lauf.teil} von ${lauf.von})` : ""}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240, fontSize: 14, color: "var(--text2)", lineHeight: 1.5 }}>
                {kiErgebnis
                  ? <>KI-Prüfung vom {new Date(kiErgebnis.am).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}{veraltet ? ", seitdem wurde kalkuliert" : ""}</>
                  : "Die KI liest Text und Aufbau jeder Position wie ein Kollege: vergessene Nebenleistungen, unplausible Zeitansätze, Materialmengen und Lücken im LV"}
              </div>
              <button onClick={kiStarten} disabled={!session?.access_token || !positionen.length}
                style={{ ...knopf(!kiErgebnis || veraltet), opacity: session?.access_token ? 1 : 0.5 }}>{kiErgebnis ? "Erneut prüfen" : "KI-Prüfung starten"}</button>
            </div>
          )}
          {!session?.access_token && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Die KI braucht eine Anmeldung</div>}
          {fehler && <div role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{fehler}</div>}
        </div>

        {kiErgebnis?.fehlend?.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 8px" }}>Möglicherweise fehlende Leistungen</h2>
            {kiErgebnis.fehlend.map(f => (
              <div key={f.text} style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                <div>{f.text}</div>
                {f.begruendung && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>{f.begruendung}</div>}
              </div>
            ))}
          </section>
        )}

        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
          <h2 style={{ flex: 1, fontSize: 15, fontWeight: 500, margin: 0 }}>Befunde</h2>
          {alle.length > offen.length && (
            <button onClick={() => setZeigeErledigt(v => !v)} style={{ background: "none", border: "none", color: "var(--text2)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
              {zeigeErledigt ? "Erledigte ausblenden" : `${alle.length - offen.length} erledigt anzeigen`}
            </button>
          )}
        </div>
        {!sichtbar.length && <div style={{ color: "var(--text2)", padding: "16px 0" }}>{alle.length ? "Alles erledigt" : "Keine Auffälligkeiten"}</div>}
        {sichtbar.map(b => {
          const pos = b.posId != null ? posVon(b.posId) : null;
          const fertig = erledigt.has(b.id);
          return (
            <div key={b.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)", opacity: fertig ? 0.5 : 1 }}>
              <span aria-label={SCHWERE_TEXT[b.schwere]} style={{ width: 6, height: 6, borderRadius: 3, background: FARBE[b.schwere], marginTop: 8, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {pos && (
                  <button onClick={() => onZurPosition(pos.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
                    fontSize: 13, color: "var(--text2)", textAlign: "left", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={zahl}>{posLabel(pos, positionen)}</span> · {pos.bez}
                  </button>
                )}
                <div style={{ textDecoration: fertig ? "line-through" : "none", lineHeight: 1.45 }}>{b.text}</div>
                {b.vorschlag && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2, lineHeight: 1.45 }}>{b.vorschlag}</div>}
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{b.quelle === "ki" ? "KI" : "Regel"}</div>
              </div>
              <button onClick={() => umschalten(b.id)} aria-pressed={fertig} title={fertig ? "Wieder offen" : "Erledigt"}
                style={{ ...knopf(), height: 32, padding: "0 10px", fontSize: 13, alignSelf: "flex-start" }}>
                <Check size={14} strokeWidth={1.5} /> {fertig ? "Offen" : "Erledigt"}
              </button>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
