import { useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Mail, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { lvPruefen, bieterfragenText, RISIKO_ART } from "../lib/lvRisiken.js";

// LV-Risiken und Bieterfragen. Ergebnis, Vorbemerkungen und Auswahl liegen im
// Editor (stand/setStand), damit sie beim erneuten Öffnen bleiben.

const FARBE = { hoch: "var(--red)", mittel: "var(--akzent)", hinweis: "var(--muted)" };
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 36, padding: "0 14px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400, textDecoration: "none",
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });

export function LvRisiken({ positionen, projekt, angebotTitel, eigeneFirma, session, stand, setStand, onZurPosition, onClose }) {
  const { vorbemerkungen = "", ergebnis = null, gewaehlt = null } = stand || {};
  const setze = teil => setStand(s => ({ ...(s || {}), ...teil }));
  const [lauf, setLauf] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [kopiert, setKopiert] = useState(false);
  const [reiter, setReiter] = useState("risiken");

  async function starten() {
    setFehler(null); setLauf({ teil: 1, von: 1 });
    try {
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 6000 }, session);
      const r = await lvPruefen({ positionen, vorbemerkungen, kontext: { projekt, angebotTitel }, rufeKi, onFortschritt: (teil, von) => setLauf({ teil, von }) });
      setze({ ergebnis: { ...r, am: new Date().toISOString() }, gewaehlt: r.fragen.map(f => f.id) });
    } catch (e) { setFehler(e.message); }
    setLauf(null);
  }

  const fragen = ergebnis?.fragen || [];
  const auswahl = new Set(gewaehlt || []);
  const ausgewaehlt = fragen.filter(f => auswahl.has(f.id));
  const text = bieterfragenText(ausgewaehlt, { projekt, angebotTitel, firma: eigeneFirma });
  const umschalten = id => setze({ gewaehlt: auswahl.has(id) ? [...auswahl].filter(x => x !== id) : [...auswahl, id] });
  const posVon = id => positionen.find(p => p.id === id);
  const kopieren = async () => {
    try { await navigator.clipboard.writeText(text); setKopiert(true); setTimeout(() => setKopiert(false), 2000); }
    catch { setFehler("Kopieren nicht möglich"); }
  };

  return createPortal(
    <div className="voll-overlay" role="dialog" aria-label="LV-Risiken und Bieterfragen" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "var(--bg)", zIndex: 700, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>LV-Risiken und Bieterfragen</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 36, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <label htmlFor="lv-vorbemerkungen" style={{ display: "block", fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>Vorbemerkungen und Vertragsbedingungen (optional)</label>
        <textarea id="lv-vorbemerkungen" value={vorbemerkungen} onChange={e => setze({ vorbemerkungen: e.target.value })} rows={ergebnis ? 3 : 7}
          placeholder="Text aus den Vorbemerkungen, ZVB oder BVB einfügen. Hier stehen oft Vertragsstrafen, Sicherheiten und abweichende Fristen"
          style={{ boxSizing: "border-box", width: "100%", padding: "10px 12px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface)",
            color: "var(--text)", fontFamily: "inherit", fontSize: 14, lineHeight: 1.45, resize: "vertical" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0 24px", flexWrap: "wrap" }}>
          {lauf ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text2)" }}><Spinner size={14} /> KI liest das LV{lauf.von > 1 ? ` (Teil ${lauf.teil} von ${lauf.von})` : ""}</span>
            : <button onClick={starten} disabled={!session?.access_token} style={{ ...knopf(!ergebnis), opacity: session?.access_token ? 1 : 0.5 }}>{ergebnis ? "Erneut prüfen" : "LV prüfen"}</button>}
          {!session?.access_token && <span style={{ fontSize: 13, color: "var(--muted)" }}>Die KI braucht eine Anmeldung</span>}
          {ergebnis && !lauf && <span style={{ fontSize: 13, color: "var(--text2)" }}>Stand {new Date(ergebnis.am).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
        {fehler && <div role="alert" style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{fehler}</div>}

        {ergebnis && (<>
          <div role="tablist" style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
            {[["risiken", "Risiken", ergebnis.risiken.length], ["fragen", "Bieterfragen", fragen.length]].map(([k, l, n]) => (
              <button key={k} role="tab" aria-selected={reiter === k} onClick={() => setReiter(k)}
                style={{ background: "none", border: "none", borderBottom: `2px solid ${reiter === k ? "var(--text)" : "transparent"}`, padding: "8px 0", marginBottom: -1,
                  fontFamily: "inherit", fontSize: 14, cursor: "pointer", color: reiter === k ? "var(--text)" : "var(--text2)" }}>
                {l} <span style={{ ...zahl, color: "var(--muted)" }}>{n}</span>
              </button>
            ))}
          </div>

          {reiter === "risiken" && (ergebnis.risiken.length ? ergebnis.risiken.map(r => {
            const pos = r.posId != null ? posVon(r.posId) : null;
            return (
              <div key={r.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: FARBE[r.schwere], marginTop: 8, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--text2)" }}>
                    {RISIKO_ART[r.art]}
                    {pos ? <> · <button onClick={() => onZurPosition(pos.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: "var(--text2)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                      Pos. <span style={zahl}>{pos.oz || ""}</span> {pos.bez}</button></> : r.posId == null ? " · Vorbemerkungen / ganzes LV" : ""}
                  </div>
                  <div style={{ lineHeight: 1.45 }}>{r.text}</div>
                  {r.empfehlung && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2, lineHeight: 1.45 }}>{r.empfehlung}</div>}
                </div>
              </div>
            );
          }) : <div style={{ color: "var(--text2)" }}>Keine Risiken gefunden</div>)}

          {reiter === "fragen" && (<>
            {fragen.map(f => (
              <label key={f.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)", cursor: "pointer" }}>
                <input type="checkbox" checked={auswahl.has(f.id)} onChange={() => umschalten(f.id)} style={{ marginTop: 4 }} />
                <div style={{ flex: 1 }}>
                  {f.oz && <div style={{ fontSize: 13, color: "var(--text2)" }}>Pos. <span style={zahl}>{f.oz}</span> {f.bez}</div>}
                  <div style={{ lineHeight: 1.45 }}>{f.frage}</div>
                  {f.grund && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Wofür: {f.grund}</div>}
                </div>
              </label>
            ))}
            {!fragen.length && <div style={{ color: "var(--text2)" }}>Keine offenen Fragen</div>}
          </>)}
        </>)}
      </div>

      {ergebnis && reiter === "fragen" && fragen.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
          <span style={{ flex: 1, fontSize: 14, color: "var(--text2)" }}><span style={zahl}>{ausgewaehlt.length}</span> von <span style={zahl}>{fragen.length}</span> ausgewählt</span>
          <button onClick={kopieren} disabled={!ausgewaehlt.length} style={knopf()}><Copy size={16} strokeWidth={1.5} /> {kopiert ? "Kopiert" : "Kopieren"}</button>
          <a href={ausgewaehlt.length ? `mailto:?subject=${encodeURIComponent(text.split("\n")[0])}&body=${encodeURIComponent(text.split("\n").slice(2).join("\n"))}` : undefined}
            style={{ ...knopf(true), opacity: ausgewaehlt.length ? 1 : 0.5 }}><Mail size={16} strokeWidth={1.5} /> Per E-Mail</a>
        </div>
      )}
    </div>,
    document.body,
  );
}
