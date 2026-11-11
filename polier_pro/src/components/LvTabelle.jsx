import { istTitel, titelName, inSumme, positionsart, ART_LABEL } from "../lib/lv.js";
import { QUELLEN_LABEL } from "../lib/katalog.js";
import { useState } from "react";

// Leistungsverzeichnis als Tabelle für den Desktop-Angebotseditor. Kurztext,
// Menge, Einheit und EP werden direkt in der Zeile bearbeitet; alles weitere
// (Langtext, Kalkulation, Rabatt, Positionsart) steht im Seitenfeld der
// ausgewählten Zeile.
const EINHEITEN = ["m²", "m³", "m", "t", "h", "Stk", "pau"];
const zahl = { fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" };
const eur = n => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Nur Auffälliges bekommt einen Punkt; Gelb nicht über --yellow, das auf dem Desktop Tinte ist
const AMPEL = { rot: "var(--red)", gelb: "var(--akzent)" };

// Zahl im deutschen Format anzeigen, beim Bearbeiten roh; übernommen wird beim
// Verlassen oder mit Enter, damit halbe Eingaben wie „12,“ nicht springen.
function ZahlFeld({ wert, onAendern, nachkomma, disabled, label, title }) {
  const [text, setText] = useState(null);
  const anzeige = wert ? Number(wert).toLocaleString("de-DE", { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma === 2 ? 2 : 3 }) : "";
  const uebernehmen = () => {
    if (text === null) return;
    const roh = text.trim().replace(/\./g, "").replace(",", ".");
    const n = roh === "" ? 0 : Number(roh);
    if (Number.isFinite(n) && n !== Number(wert || 0)) onAendern(n);
    setText(null);
  };
  return (
    <input className="desk-feld" inputMode="decimal" aria-label={label} title={title} disabled={disabled}
      value={text ?? anzeige}
      onFocus={e => { setText(wert ? String(wert).replace(".", ",") : ""); requestAnimationFrame(() => e.target.select()); }}
      onChange={e => setText(e.target.value)}
      onBlur={uebernehmen}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setText(null); e.currentTarget.blur(); } }}
      style={{ width: "100%", textAlign: "right", ...zahl }} />
  );
}

export function LvTabelle({ positionen, pruefung, tSummen, gpOf, auswahlId, onAuswahl, updatePos, gesperrt }) {
  let lfd = 0;
  const kopf = { padding: "10px 8px", fontWeight: 400, position: "sticky", top: 0, background: "var(--surface)", zIndex: 1, borderBottom: "1px solid var(--border2)" };

  return (
    <table className="lv-tabelle" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <colgroup>
        <col style={{ width: 88 }} /><col /><col style={{ width: 96 }} /><col style={{ width: 72 }} />
        <col style={{ width: 112 }} /><col style={{ width: 128 }} /><col style={{ width: 112 }} />
      </colgroup>
      <thead>
        <tr style={{ textAlign: "left", color: "var(--text2)", fontSize: 13 }}>
          <th style={{ ...kopf, paddingLeft: 16 }}>OZ</th>
          <th style={kopf}>Kurztext</th>
          <th style={{ ...kopf, textAlign: "right" }}>Menge</th>
          <th style={kopf}>ME</th>
          <th style={{ ...kopf, textAlign: "right" }}>EP</th>
          <th style={{ ...kopf, textAlign: "right" }}>GP</th>
          <th style={{ ...kopf, paddingRight: 16 }}>Preisquelle</th>
        </tr>
      </thead>
      <tbody>
        {positionen.map(pos => {
          const gewaehlt = pos.id === auswahlId;
          const zeile = {
            borderTop: "1px solid var(--border)", cursor: "pointer",
            background: gewaehlt ? "var(--bg)" : undefined,
            boxShadow: gewaehlt ? "inset 2px 0 0 var(--akzent)" : undefined,
          };
          if (istTitel(pos)) {
            return (
              <tr key={pos.id} className="desk-zeile" onClick={() => onAuswahl(pos.id)} style={zeile}>
                <td colSpan={5} style={{ padding: "12px 8px 12px 16px" }}>
                  <input className="desk-feld" value={titelName(pos)} disabled={gesperrt} aria-label="Titel"
                    onChange={e => updatePos(pos.id, "bez", `── ${e.target.value} ──`)}
                    style={{ fontWeight: 500, width: "100%" }} />
                </td>
                <td style={{ padding: "12px 8px", textAlign: "right", ...zahl, fontWeight: 500 }}>{eur(tSummen[pos.id] || 0)}</td>
                <td />
              </tr>
            );
          }
          lfd += 1;
          const ampel = pruefung.jePosition[pos.id];
          const zaehlt = inSumme(pos);
          const art = positionsart(pos);
          return (
            <tr key={pos.id} className="desk-zeile" onClick={() => onAuswahl(pos.id)} style={zeile}>
              <td style={{ padding: "6px 8px 6px 16px", ...zahl, fontSize: 13, color: "var(--text2)", whiteSpace: "nowrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span role={AMPEL[ampel?.ampel] ? "img" : undefined} aria-label={AMPEL[ampel?.ampel] ? ampel.text : undefined} title={AMPEL[ampel?.ampel] ? ampel.text : undefined}
                    style={{ width: 6, height: 6, borderRadius: 3, background: AMPEL[ampel?.ampel] || "transparent" }} />
                  {pos.oz || lfd}
                </span>
              </td>
              <td style={{ padding: "6px 8px" }}>
                <textarea className="desk-feld" rows={1} value={pos.bez} disabled={gesperrt} placeholder="Kurztext" aria-label="Kurztext"
                  onChange={e => updatePos(pos.id, "bez", e.target.value)}
                  style={{ width: "100%", height: "auto", minHeight: 32, padding: "5px 6px", lineHeight: "20px", resize: "none", fieldSizing: "content", display: "block" }} />
                {art !== "normal" && <div style={{ fontSize: 12, color: "var(--muted)", padding: "0 6px" }}>{ART_LABEL[art] || art}</div>}
              </td>
              <td style={{ padding: "6px 8px" }}>
                <ZahlFeld wert={pos.menge} nachkomma={0} disabled={gesperrt} label="Menge" onAendern={n => updatePos(pos.id, "menge", n)} />
              </td>
              <td style={{ padding: "6px 8px" }}>
                <select className="desk-feld" value={pos.einheit} disabled={gesperrt} aria-label="Einheit"
                  onChange={e => updatePos(pos.id, "einheit", e.target.value)} style={{ width: "100%" }}>
                  {(EINHEITEN.includes(pos.einheit) ? EINHEITEN : [pos.einheit, ...EINHEITEN]).map(u => <option key={u}>{u}</option>)}
                </select>
              </td>
              <td style={{ padding: "6px 8px" }}>
                <ZahlFeld wert={pos.ep} nachkomma={2} disabled={gesperrt || !!pos.kalk} label="Einheitspreis"
                  title={pos.kalk ? "Aus der Kalkulation" : undefined} onAendern={n => updatePos(pos.id, "ep", n)} />
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right", ...zahl, color: zaehlt ? "var(--text)" : "var(--muted)" }}>
                {eur(gpOf(pos))}
              </td>
              <td style={{ padding: "6px 16px 6px 8px", fontSize: 13, color: "var(--text2)", whiteSpace: "nowrap" }}>
                {pos.kalk ? "Kalkuliert" : pos.preisquelle ? (QUELLEN_LABEL[pos.preisquelle.art] || pos.preisquelle.art) : "–"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
