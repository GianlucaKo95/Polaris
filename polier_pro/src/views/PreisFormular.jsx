import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { useFormularSchutz } from "../hooks/useUngespeichert.js";

function parsePreis(wert) {
  // Deutsche Eingabe mit Komma statt Punkt zulassen (z.B. "12,50").
  const n = Number(String(wert).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function PreisFormular({ initial, onSave, onClose }) {
  const [p, setP] = useState(initial || { gewerk:"", einheit:"m²", preis:0, beschreibung:"" });
  // Rückfrage beim Schließen mit ungespeicherten Änderungen (lib/ungespeichert.js)
  const schutz = useFormularSchutz(p, { titel: "Der Einheitspreis" });
  const gueltig = p.gewerk?.trim() && p.beschreibung?.trim()
    && Number.isFinite(p.preis) && p.preis >= 0;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        marginBottom:12, paddingTop:"calc(6px + env(safe-area-inset-top))",
        position:"sticky", top:0, background:"var(--surface)", zIndex:5 }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:16,
          display:"flex", alignItems:"center", gap:7 }}>
          {initial?.id ? <><Pencil size={15} /> Preis bearbeiten</> : <><Plus size={15} /> Neuer Einheitspreis</>}
        </div>
        <button onClick={async () => { if (await schutz.pruefen()) onClose(); }} style={{ background:"none", border:"none",
          color:"var(--muted)", fontSize:24, cursor:"pointer" }}>✕</button>
      </div>
      {[["Gewerk","gewerk","z.B. Betonage"],["Beschreibung","beschreibung","z.B. Beton C25/30 inkl. Einbau"]].map(([l,k,ph]) => (
        <div key={k} style={{ marginBottom:9 }}>
          <Label>{l}</Label>
          <input value={p[k]||""} onChange={e=>setP(x=>({...x,[k]:e.target.value}))}
            placeholder={ph} style={inputStyle()} />
        </div>
      ))}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
        <div>
          <Label>Einheit</Label>
          <select value={p.einheit} onChange={e=>setP(x=>({...x,einheit:e.target.value}))}
            style={{ ...inputStyle(), padding:"11px 12px" }}>
            {["m²","m³","m","t","h","Stk","pau"].map(u=><option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <Label>Einheitspreis (€)</Label>
          <input type="number" min="0" step="0.01" value={p.preis||""}
            onChange={e=>setP(x=>({...x,preis:parsePreis(e.target.value)}))}
            placeholder="0" style={inputStyle()} />
        </div>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={async () => { if (await schutz.pruefen()) onClose(); }} style={{ flex:1, background:"var(--surface2)",
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
