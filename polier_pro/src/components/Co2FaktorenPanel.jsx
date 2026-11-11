import { Plus, X, TriangleAlert } from "lucide-react";
import { CO2_RICHTWERTE } from "../lib/co2.js";
import { inputStyle } from "./Label.jsx";

// Admin → CO₂: eigene Emissionsfaktoren (z.B. aus der EPD des Betonlieferanten)
// stehen vor den eingebauten Richtwerten. "Muster" = Suchbegriff(e) im
// Material-/Positionstext, mehrere mit | getrennt.
export function Co2FaktorenPanel({ faktoren = [], setFaktoren, status }) {
  const liste = Array.isArray(faktoren) ? faktoren : [];
  const aendern = (i, feld, wert) => setFaktoren(liste.map((f, k) => k === i ? { ...f, [feld]: wert } : f));
  const feld = { ...inputStyle(), padding:"6px 8px", fontSize:12 };
  return (
    <div>
      {status === "fehlt" && (
        <div style={{ background:"var(--ybg)", color:"var(--ydark)", borderRadius:10, padding:"9px 12px", fontSize:12, marginBottom:10, display:"flex", gap:7 }}>
          <TriangleAlert size={14} style={{ flexShrink:0, marginTop:1 }} /> Bitte supabase-kalkulation.sql ausführen — bis dahin werden eigene Faktoren nicht gespeichert.
        </div>
      )}
      <div style={{ background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:12, padding:"12px 14px", marginBottom:12 }}>
        <div style={{ fontWeight:700, fontSize:13.5, marginBottom:4 }}>Eigene CO₂-Faktoren</div>
        <div style={{ color:"var(--muted)", fontSize:12, marginBottom:8, lineHeight:1.45 }}>
          Wert „GWP-total A1–A3“ aus der EPD des Lieferanten oder aus der ÖKOBAUDAT. Eigene Faktoren haben Vorrang vor den Richtwerten.
        </div>
        {liste.map((f, i) => (
          <div key={i} style={{ display:"grid", gridTemplateColumns:"1.6fr 1.3fr 0.8fr 0.6fr 28px", gap:5, marginBottom:5 }}>
            <input value={f.name || ""} placeholder="Name" onChange={e => aendern(i, "name", e.target.value)} style={feld} />
            <input value={f.muster || ""} placeholder="Suchbegriff, z.B. c30/37" onChange={e => aendern(i, "muster", e.target.value)} style={feld} />
            <input inputMode="decimal" value={String(f.faktor ?? "").replace(".", ",")} placeholder="kg CO₂e"
              onChange={e => aendern(i, "faktor", Number(e.target.value.replace(",", ".")))} style={feld} />
            <select value={f.einheit || "m³"} onChange={e => aendern(i, "einheit", e.target.value)} style={feld}>
              {["m³", "kg", "t", "m²"].map(e => <option key={e}>{e}</option>)}
            </select>
            <button onClick={() => setFaktoren(liste.filter((_, k) => k !== i))} style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer" }}><X size={14} /></button>
          </div>
        ))}
        <button onClick={() => setFaktoren([...liste, { name: "", muster: "", faktor: 0, einheit: "m³", quelle: "EPD" }])}
          style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:9, padding:"7px 10px", fontSize:12,
            fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:5 }}>
          <Plus size={13} /> Faktor hinzufügen
        </button>
      </div>
      <div style={{ background:"var(--surface)", border:"1.5px solid var(--border)", borderRadius:12, padding:"12px 14px" }}>
        <div style={{ fontWeight:700, fontSize:13.5, marginBottom:6 }}>Eingebaute Richtwerte</div>
        {CO2_RICHTWERTE.map(r => (
          <div key={r.id} style={{ borderTop:"1px solid var(--border)", padding:"5px 0", fontSize:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
              <span>{r.name}</span><b style={{ whiteSpace:"nowrap" }}>{r.faktor.toLocaleString("de-DE")} kg/{r.einheit}</b>
            </div>
            <div style={{ color:"var(--muted)", fontSize:11 }}>{r.quelle}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
