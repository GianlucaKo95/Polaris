import { useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { anhangAusDatei } from "../lib/anhaenge.js";
import { lieferantenangebotEinlesen, alsLieferantenangebote } from "../lib/angebotEinlesen.js";
import { lieferantWaehlen } from "../lib/preisstand.js";

// Lieferantenangebot (PDF, Foto, Mailtext) per KI lesen, Artikel den
// Kostenbausteinen zuordnen, ausgewählte Preise in den Preisstand übernehmen.

const eur = n => n == null ? "–" : (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const knopf = (haupt = false) => ({ height: 34, padding: "0 12px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: haupt ? 500 : 400,
  border: haupt ? "none" : "1px solid var(--border2)", background: haupt ? "var(--text)" : "var(--surface)", color: haupt ? "var(--surface)" : "var(--text)" });
const th = { textAlign: "left", fontWeight: 400, fontSize: 13, color: "var(--text2)", padding: "8px", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap" };
const td = { padding: "10px 8px", borderTop: "1px solid var(--border)", verticalAlign: "top" };

export function LieferantenangebotEinlesen({ preisstand: ps, session, onAendern, onClose }) {
  const [text, setText] = useState("");
  const [lauf, setLauf] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);
  const [auswahl, setAuswahl] = useState([]);
  const [guenstigerWaehlen, setGuenstigerWaehlen] = useState(true);

  async function lesen(datei) {
    setFehler(null); setLauf(true);
    try {
      const anhang = datei ? await anhangAusDatei(datei) : null;
      const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 6000 }, session);
      const r = await lieferantenangebotEinlesen({ anhang, text: datei ? "" : text, kalkulationspreise: ps.kalkulationspreise, rufeKi });
      setErgebnis(r);
      setAuswahl(r.artikel.filter(a => a.preisJeBaustein > 0).map(a => a.id));
    } catch (e) { setFehler(e.message); }
    setLauf(false);
  }

  function uebernehmen() {
    const heute = new Date().toLocaleDateString("sv-SE");
    let neu = { ...ps, kalkulationspreise: alsLieferantenangebote(ps.kalkulationspreise, ergebnis, auswahl, heute) };
    if (guenstigerWaehlen) {
      for (const a of ergebnis.artikel.filter(x => auswahl.includes(x.id) && x.preisJeBaustein > 0)) {
        const k = neu.kalkulationspreise.find(x => String(x.id) === String(a.bausteinId));
        const i = (k?.lieferantenangebote || []).findIndex(l => l.lieferant === ergebnis.lieferant);
        if (k && i >= 0 && a.preisJeBaustein < (Number(k.preis) || Infinity)) neu = lieferantWaehlen(neu, k.id, i, heute);
      }
    }
    onAendern(neu);
    onClose();
  }

  const zuordenbar = ergebnis?.artikel.filter(a => a.preisJeBaustein > 0) || [];
  return createPortal(
    <div className="voll-overlay breit" role="dialog" aria-label="Lieferantenangebot einlesen" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 760, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 500 }}>Lieferantenangebot einlesen</div>
        <button onClick={onClose} aria-label="Schließen" style={{ ...knopf(), width: 34, padding: 0, justifyContent: "center" }}><X size={16} strokeWidth={1.5} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {!ergebnis && (<>
          <p style={{ margin: "0 0 16px", color: "var(--text2)", lineHeight: 1.55 }}>
            Die KI liest das Angebot, ordnet die Artikel deinen Kostenbausteinen zu und rechnet auf deren Einheit um. Du prüfst, was übernommen wird
          </p>
          <label style={{ ...knopf(true), cursor: lauf ? "default" : "pointer" }}>
            {lauf ? <Spinner size={13} /> : <Paperclip size={14} strokeWidth={1.5} />} {lauf ? "KI liest" : "PDF oder Foto wählen"}
            <input type="file" hidden disabled={lauf || !session?.access_token} accept="application/pdf,image/*" onChange={e => e.target.files?.[0] && lesen(e.target.files[0])} />
          </label>
          <div style={{ margin: "24px 0 6px", fontSize: 13, color: "var(--text2)" }}>oder Mailtext einfügen</div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder="Text der Angebotsmail"
            style={{ boxSizing: "border-box", width: "100%", padding: "10px 12px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, resize: "vertical" }} />
          <button onClick={() => lesen(null)} disabled={!text.trim() || lauf || !session?.access_token} style={{ ...knopf(), marginTop: 8, opacity: text.trim() ? 1 : 0.5 }}>Mailtext einlesen</button>
          {!session?.access_token && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Die KI braucht eine Anmeldung</div>}
        </>)}
        {fehler && <div role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 12 }}>{fehler}</div>}
        {ergebnis && (<>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{ergebnis.lieferant}</div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>
            {[ergebnis.datum && `vom ${ergebnis.datum}`, ergebnis.gueltigBis && `gültig bis ${ergebnis.gueltigBis}`].filter(Boolean).join(" · ")}
          </div>
          {ergebnis.vorbehalte.length > 0 && <div style={{ fontSize: 13, color: "var(--akzent)", marginBottom: 12 }}>Vorbehalte: {ergebnis.vorbehalte.join(" · ")}</div>}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
              <thead><tr><th style={th} /><th style={th}>Artikel im Angebot</th><th style={{ ...th, textAlign: "right" }}>Preis</th><th style={th}>Baustein</th><th style={{ ...th, textAlign: "right" }}>Umgerechnet</th><th style={{ ...th, textAlign: "right" }}>Bisher</th></tr></thead>
              <tbody>
                {ergebnis.artikel.map(a => {
                  const ok = a.preisJeBaustein > 0;
                  const diff = ok && a.bisher ? (a.preisJeBaustein - a.bisher) / a.bisher : null;
                  return (
                    <tr key={a.id} style={{ opacity: ok ? 1 : 0.6 }}>
                      <td style={td}>{ok && <input type="checkbox" aria-label={`${a.text} übernehmen`} checked={auswahl.includes(a.id)} onChange={() => setAuswahl(s => s.includes(a.id) ? s.filter(x => x !== a.id) : [...s, a.id])} />}</td>
                      <td style={td}>{a.text}</td>
                      <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap" }}>{eur(a.preis)} / {a.einheit}</td>
                      <td style={td}>{a.bausteinBez || <span style={{ color: "var(--muted)" }}>Kein passender Baustein</span>}
                        {a.umrechnung && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{a.umrechnung}</div>}</td>
                      <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap" }}>{ok ? `${eur(a.preisJeBaustein)} / ${a.bausteinEinheit}` : "–"}</td>
                      <td style={{ ...td, ...zahl, textAlign: "right", whiteSpace: "nowrap" }}>
                        {a.bisher != null ? eur(a.bisher) : "–"}
                        {diff != null && <div style={{ fontSize: 12, color: diff < 0 ? "var(--green)" : "var(--red)" }}>{diff > 0 ? "+" : ""}{Math.round(diff * 100)} %</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ergebnis.artikel.length > zuordenbar.length && <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 8 }}>Artikel ohne Baustein lassen sich im Preisstand als Projektpreis anlegen</div>}
        </>)}
      </div>
      {ergebnis && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", background: "var(--surface)", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
          <label style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)" }}>
            <input type="checkbox" checked={guenstigerWaehlen} onChange={e => setGuenstigerWaehlen(e.target.checked)} /> Wenn günstiger, gleich als Preis wählen
          </label>
          <button onClick={() => { setErgebnis(null); setAuswahl([]); }} style={knopf()}>Anderes Angebot</button>
          <button onClick={uebernehmen} disabled={!auswahl.length} style={{ ...knopf(true), opacity: auswahl.length ? 1 : 0.5 }}>{auswahl.length} übernehmen</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
