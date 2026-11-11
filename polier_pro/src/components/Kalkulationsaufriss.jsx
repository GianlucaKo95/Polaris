// Aufriss eines Preises in Lohn / Material / Gerät / Fremdleistung /
// Zuschläge als ein gestapelter Balken mit Legende (Werte aus
// kalkulationAufriss in lib/kalkulation.js). Lohn trägt den Akzent, weil
// er in der Nachkalkulation die Größe ist, die am stärksten schwankt.
const TEILE = [
  ["lohn", "Lohn", "var(--akzent)"],
  ["material", "Material", "#4A4D55"],
  ["geraet", "Gerät", "#8C8F96"],
  ["fremdleistung", "Fremdleistung", "#B8BBC2"],
  ["zuschlag", "Zuschläge", "#DCDDD8"],
  ["direkt", "Ohne Aufschlüsselung", "repeating-linear-gradient(135deg, #DCDDD8 0 4px, transparent 4px 8px)"],
];

const eur = n => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function Kalkulationsaufriss({ aufriss, teiler = 1, einheit = null, kompakt = false }) {
  const summe = aufriss?.summe || 0;
  if (!summe) return null;
  const sichtbar = TEILE.filter(([k]) => aufriss[k] > 0.005);
  return (
    <div>
      <div role="img" aria-label={sichtbar.map(([k, l]) => `${l} ${Math.round(aufriss[k] / summe * 100)} %`).join(", ")}
        style={{ display: "flex", height: kompakt ? 8 : 12, borderRadius: 3, overflow: "hidden", gap: 1, background: "var(--surface2)" }}>
        {sichtbar.map(([k, , farbe]) => (
          <div key={k} style={{ flex: `${aufriss[k]} 0 0`, background: farbe, border: k === "direkt" ? "1px solid #DCDDD8" : "none", boxSizing: "border-box" }} />
        ))}
      </div>
      {!kompakt && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
          <tbody>
            {sichtbar.map(([k, l, farbe]) => (
              <tr key={k}>
                <td style={{ padding: "4px 0", color: "var(--text2)" }}>
                  <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: farbe, border: k === "direkt" ? "1px solid #B8BBC2" : "none", marginRight: 8, verticalAlign: "middle" }} />{l}
                </td>
                <td style={{ padding: "4px 0", textAlign: "right", fontFamily: "var(--font-zahl)", fontVariantNumeric: "tabular-nums" }}>
                  {eur(aufriss[k] / teiler)}{einheit && <span style={{ color: "var(--muted)" }}> /{einheit}</span>}
                </td>
                <td style={{ padding: "4px 0 4px 12px", width: 44, textAlign: "right", fontFamily: "var(--font-zahl)", color: "var(--muted)" }}>
                  {Math.round(aufriss[k] / summe * 100)} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {kompakt && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 8, fontSize: 12, color: "var(--text2)" }}>
          {sichtbar.map(([k, l, farbe]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: farbe, border: k === "direkt" ? "1px solid #B8BBC2" : "none" }} />
              {l} <span style={{ fontFamily: "var(--font-zahl)", color: "var(--muted)" }}>{Math.round(aufriss[k] / summe * 100)} %</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
