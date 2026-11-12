import { useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { useFormularSchutz } from "../hooks/useUngespeichert.js";

export function VorlageFormular({ initial, einheitspreise, onSave, onClose }) {
  const [v, setV] = useState(initial || { name:"", gewerk:"", positionen:[] });
  // Rückfrage beim Schließen mit ungespeicherten Änderungen (lib/ungespeichert.js)
  const schutz = useFormularSchutz(v, { titel: "Die LV-Vorlage" });

  function addPosition() {
    setV(x => ({ ...x, positionen:[...x.positionen,
      { bez:"", einheit:"m²", menge:0, ep_id:null }] }));
  }
  function updatePos(i, key, val) {
    setV(x => ({ ...x, positionen:x.positionen.map((p,j) =>
      j===i ? { ...p, [key]:val } : p) }));
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        marginBottom:12, paddingTop:"calc(6px + env(safe-area-inset-top))",
        position:"sticky", top:0, background:"var(--surface)", zIndex:5 }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:16,
          display:"flex", alignItems:"center", gap:7 }}><ClipboardList size={15} /> Neue LV-Vorlage</div>
        <button onClick={async () => { if (await schutz.pruefen()) onClose(); }} style={{ background:"none", border:"none",
          color:"var(--muted)", fontSize:24, cursor:"pointer" }}>✕</button>
      </div>
      <div style={{ marginBottom:9 }}>
        <Label>Vorlagenname</Label>
        <input value={v.name} onChange={e=>setV(x=>({...x,name:e.target.value}))}
          placeholder="z.B. Bodenplatte Standard" style={inputStyle()} />
      </div>
      <div style={{ marginBottom:12 }}>
        <Label>Gewerk</Label>
        <input value={v.gewerk} onChange={e=>setV(x=>({...x,gewerk:e.target.value}))}
          placeholder="z.B. Betonage" style={inputStyle()} />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <Label>Positionen</Label>
        <button onClick={addPosition}
          style={{ background:"var(--surface2)", color:"var(--text)",
            border:"1px solid var(--border)", borderRadius:8, padding:"4px 10px",
            cursor:"pointer", fontSize:12, fontFamily:"inherit",
            display:"flex", alignItems:"center", gap:4 }}><Plus size={12} /> Position</button>
      </div>
      {v.positionen.map((pos,i) => (
        <div key={i} style={{ background:"var(--surface2)", borderRadius:10,
          padding:7, marginBottom:6, border:"1px solid var(--border)" }}>
          <input value={pos.bez} onChange={e=>updatePos(i,"bez",e.target.value)}
            placeholder="Bezeichnung" style={{ ...inputStyle(), marginBottom:6 }} />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            <select value={pos.einheit} onChange={e=>updatePos(i,"einheit",e.target.value)}
              style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }}>
              {["m²","m³","m","t","h","Stk","pau"].map(u=><option key={u}>{u}</option>)}
            </select>
            <select value={pos.ep_id||""} onChange={e=>updatePos(i,"ep_id",Number(e.target.value))}
              style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }}>
              <option value="">Kein EP</option>
              {einheitspreise.map(ep=>(
                <option key={ep.id} value={ep.id}>{ep.gewerk}: {ep.preis}€/{ep.einheit}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <div style={{ display:"flex", gap:10, marginTop:16 }}>
        <button onClick={async () => { if (await schutz.pruefen()) onClose(); }} style={{ flex:1, background:"var(--surface2)",
          color:"var(--muted)", border:"1.5px solid var(--border)", borderRadius:12,
          padding:13, cursor:"pointer", fontFamily:"inherit" }}>Abbrechen</button>
        <button onClick={() => v.name && onSave(v)}
          style={{ flex:2, background:"var(--yellow)", color:"#1a1200",
            border:"none", borderRadius:12, padding:13, fontWeight:800,
            cursor:"pointer", fontFamily:"inherit" }}>Vorlage speichern</button>
      </div>
    </div>
  );
}
