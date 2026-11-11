import { useMemo, useState } from "react";
import { Leaf, Copy } from "lucide-react";
import { co2Bilanz, co2AlsText } from "../lib/co2.js";

const t = kg => (kg / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 });

// CO₂-Bilanz eines Angebots (lib/co2.js), aufklappbar im Angebotseditor.
export function Co2Panel({ positionen = [], kalkulationspreise = [], eigeneFaktoren = [] }) {
  const [offen, setOffen] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const b = useMemo(() => co2Bilanz(positionen, { kalkulationspreise, eigeneFaktoren }), [positionen, kalkulationspreise, eigeneFaktoren]);
  if (!b.zeilen.length) return null;
  const mit = b.zeilen.filter(z => z.quelle).sort((x, y) => Math.abs(y.kg) - Math.abs(x.kg));
  return (
    <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 12px", marginBottom:12 }}>
      <button onClick={() => setOffen(o => !o)} style={{ all:"unset", cursor:"pointer", width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase", display:"flex", alignItems:"center", gap:5 }}>
          <Leaf size={12} /> CO₂-Bilanz (Herstellung)
        </span>
        <b style={{ fontSize:13 }}>{t(b.summe)} t CO₂-Äq.</b>
      </button>
      {offen && (
        <div style={{ marginTop:8, fontSize:12 }}>
          {mit.map((z, i) => (
            <div key={i} style={{ borderTop:"1px solid var(--border)", padding:"5px 0" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                <span>{z.oz ? `${z.oz} ` : ""}{z.bez}</span><b style={{ whiteSpace:"nowrap" }}>{t(z.kg)} t</b>
              </div>
              <div style={{ color:"var(--muted)", fontSize:11 }}>
                {z.details.map(d => `${d.menge.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${d.einheit} ${d.faktor.name} × ${d.faktor.faktor.toLocaleString("de-DE")} kg/${d.faktor.einheit}`).join(" · ")}
                {z.quelle === "position" && " (aus Positionstext)"}
              </div>
            </div>
          ))}
          {b.ohne > 0 && <div style={{ color:"var(--muted)", marginTop:4 }}>{b.ohne} Position(en) ohne zuordenbaren Baustoff (Lohn, Schalung, Geräte …).</div>}
          <div style={{ color:"var(--muted)", fontSize:11, marginTop:4 }}>
            Richtwerte = Branchendurchschnitt. Für Nachweise die EPD des Lieferanten unter Admin → CO₂ eintragen.
          </div>
          <button onClick={() => navigator.clipboard?.writeText(co2AlsText(b)).then(() => setKopiert(true))}
            style={{ marginTop:6, background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:9, padding:"6px 10px",
              fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:5 }}>
            <Copy size={12} /> {kopiert ? "Kopiert" : "Als Text kopieren"}
          </button>
        </div>
      )}
    </div>
  );
}
