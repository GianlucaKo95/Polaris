import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";

const KATEGORIEN = [
  ["lohn", "Lohn"],
  ["material", "Material"],
  ["geraet", "Gerät"],
  ["fremdleistung", "Fremdleistung"],
];

function parsePreis(wert) {
  const n = Number(String(wert).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Formular für Kalkulations-Stammdaten (Lohn-/Material-/Geräte-/
// Fremdleistungspreise) — anders als PreisFormular.jsx (fertige Verkaufs-
// Einheitspreise pro Gewerk) sind das Kostenbausteine, aus denen die
// EP-Kalkulation pro Position zusammengesetzt wird.
export function KalkulationspreisFormular({ initial, onSave, onClose }) {
  const [p, setP] = useState(initial || { kategorie:"lohn", bezeichnung:"", einheit:"h", preis:0 });
  const gueltig = p.bezeichnung?.trim() && Number.isFinite(p.preis) && p.preis >= 0;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        marginBottom:12, paddingTop:"calc(6px + env(safe-area-inset-top))",
        position:"sticky", top:0, background:"var(--surface)", zIndex:5 }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:16,
          display:"flex", alignItems:"center", gap:7 }}>
          {initial?.id ? <><Pencil size={15} /> Kalkulationspreis bearbeiten</> : <><Plus size={15} /> Neuer Kalkulationspreis</>}
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none",
          color:"var(--muted)", fontSize:24, cursor:"pointer" }}>✕</button>
      </div>

      <div style={{ marginBottom:9 }}>
        <Label>Kategorie</Label>
        <select value={p.kategorie} onChange={e=>setP(x=>({...x,kategorie:e.target.value}))}
          style={{ ...inputStyle(), padding:"11px 12px" }}>
          {KATEGORIEN.map(([k,l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      <div style={{ marginBottom:9 }}>
        <Label>Bezeichnung</Label>
        <input value={p.bezeichnung||""} onChange={e=>setP(x=>({...x,bezeichnung:e.target.value}))}
          placeholder="z.B. Facharbeiter, Zement CEM II, Bagger 5t" style={inputStyle()} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
        <div>
          <Label>Einheit</Label>
          <select value={p.einheit} onChange={e=>setP(x=>({...x,einheit:e.target.value}))}
            style={{ ...inputStyle(), padding:"11px 12px" }}>
            {["h","Tag","Stk","kg","t","m²","m³","m","pau"].map(u=><option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <Label>Preis (€)</Label>
          <input type="number" min="0" step="0.01" value={p.preis||""}
            onChange={e=>setP(x=>({...x,preis:parsePreis(e.target.value)}))}
            placeholder="0" style={inputStyle()} />
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={onClose} style={{ flex:1, background:"var(--surface2)",
          color:"var(--muted)", border:"1.5px solid var(--border)", borderRadius:12,
          padding:13, cursor:"pointer", fontFamily:"inherit" }}>Abbrechen</button>
        <button onClick={() => gueltig && onSave(p)} disabled={!gueltig}
          style={{ flex:2, background: gueltig ? "var(--yellow)" : "var(--surface2)",
            color: gueltig ? "#1a1200" : "var(--muted)",
            border:"none", borderRadius:12, padding:13, fontWeight:800,
            cursor: gueltig ? "pointer" : "default", fontFamily:"inherit" }}>Speichern</button>
      </div>
    </div>
  );
}

export { KATEGORIEN as KALKULATIONSPREIS_KATEGORIEN };
