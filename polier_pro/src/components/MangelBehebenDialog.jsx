import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";

// Erzwingt ein Nachweis-Foto, bevor ein Mangel zur Bestätigung vorgeschlagen
// wird — vorher lief die Bestätigung durch eine leitende Rolle komplett
// blind auf Zuruf, ohne jeden visuellen Beleg, dass der Mangel tatsächlich
// behoben wurde.
export function MangelBehebenDialog({ onBestaetigen, onAbbrechen }) {
  const [fotos, setFotos] = useState([]);
  const fileRef = useRef(null);

  function handleBild(e) {
    Array.from(e.target.files).forEach(file => {
      const r = new FileReader();
      r.onload = ev => setFotos(p => [...p, ev.target.result]);
      r.readAsDataURL(file);
    });
  }

  return createPortal(
    <div onClick={onAbbrechen}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:600,
        display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:"var(--bg)", width:"100%", maxWidth:480,
          borderRadius:"16px 16px 0 0", padding:"18px 16px",
          paddingBottom:"calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
          <div style={{ fontWeight:800, fontSize:16, color:"var(--text)" }}>Mangel als behoben melden</div>
          <button onClick={onAbbrechen}
            style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", padding:4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ color:"var(--muted)", fontSize:12.5, marginBottom:12, lineHeight:1.4 }}>
          Bitte mindestens ein Foto als Nachweis hinzufügen, bevor die Bestätigung angefragt wird.
        </div>

        <input ref={fileRef} type="file" accept="image/*" multiple
          style={{ display:"none" }} onChange={handleBild} />
        <button onClick={() => fileRef.current.click()}
          style={{ background:"var(--surface2)", color:"var(--muted)",
            border:"1.5px dashed var(--border)", borderRadius:10,
            padding:"8px 16px", cursor:"pointer", fontSize:12,
            fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>
          <Camera size={14} />Nachweisfoto hinzufügen
        </button>

        {fotos.length > 0 && (
          <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
            {fotos.map((url, i) => (
              <div key={i} style={{ position:"relative" }}>
                <img src={url} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:"cover" }} />
                <button onClick={() => setFotos(p => p.filter((_, j) => j !== i))}
                  style={{ position:"absolute", top:-4, right:-4, width:18, height:18, borderRadius:9,
                    background:"var(--red)", color:"#fff", border:"none", cursor:"pointer", fontSize:10, padding:0 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display:"flex", gap:10, marginTop:16 }}>
          <button onClick={onAbbrechen}
            style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
              border:"1.5px solid var(--border)", padding:14, cursor:"pointer",
              fontFamily:"inherit", fontWeight:600 }}>Abbrechen</button>
          <button onClick={() => fotos.length > 0 && onBestaetigen(fotos)} disabled={fotos.length === 0}
            style={{ flex:2, background: fotos.length > 0 ? "var(--yellow)" : "var(--surface2)",
              color: fotos.length > 0 ? "#1a1200" : "var(--muted)",
              border:"none", padding:14, fontWeight:800,
              cursor: fotos.length > 0 ? "pointer" : "default", fontSize:14, fontFamily:"inherit" }}>
            Als behoben melden
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
