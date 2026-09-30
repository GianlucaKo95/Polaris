import { PROJEKTTYPEN } from "../config/konstanten.js";

export function Aktenregister({ projekte, aktivId, onSelect, onNeu }) {
  return (
    <div style={{ background:"var(--surface)", borderBottom:"3px solid var(--yellow)",
      flexShrink:0 }}>
      {/* overflowY:"hidden" + touchAction:"pan-x": ohne das ließ eine diagonale
          Wischgeste hier die ganze Seite mit nach oben/unten scrollen, statt
          die Geste auf horizontales Blättern zwischen Baustellen zu beschränken. */}
      <div style={{ display:"flex", overflowX:"auto", overflowY:"hidden", padding:"0 12px",
        scrollbarWidth:"none", msOverflowStyle:"none",
        touchAction:"pan-x", WebkitOverflowScrolling:"touch" }}>
        {projekte.map((p, i) => {
          const aktiv   = p.id === aktivId;
          return (
            <div key={p.id} style={{ display:"flex", alignItems:"stretch" }}>
              {i > 0 && (
                <div style={{ width:1, background:"var(--border)", margin:"8px 0",
                  flexShrink:0 }} />
              )}
              <button onClick={() => onSelect(p.id)}
                style={{ flexShrink:0, padding:"10px 14px 0", cursor:"pointer",
                  background:"none", border:"none", borderBottom:`3px solid ${aktiv ? "var(--yellow)" : "transparent"}`,
                  marginBottom:-3, display:"flex", flexDirection:"column",
                  alignItems:"flex-start", gap:2, transition:"all 0.15s",
                  fontFamily:"inherit" }}>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:7, height:7, borderRadius:4, background:p.farbe, flexShrink:0 }} />
                  <span style={{ fontSize:12, fontWeight:700,
                    color: aktiv ? "var(--text)" : "var(--muted)",
                    whiteSpace:"nowrap" }}>
                    {p.name.split(" ").slice(0,2).join(" ")}
                  </span>
                </div>
                <span style={{ fontSize:10, color: aktiv ? "var(--text2)" : "var(--muted)",
                  paddingBottom:8, whiteSpace:"nowrap" }}>
                  {PROJEKTTYPEN[p.typ]?.icon || "🏗️"} {PROJEKTTYPEN[p.typ]?.label || p.typ}
                </span>
              </button>
            </div>
          );
        })}
        {/* + Neue Baustelle */}
        <div style={{ width:1, background:"var(--border)", margin:"8px 0", flexShrink:0 }} />
        <button onClick={onNeu}
          style={{ flexShrink:0, padding:"10px 16px 14px", cursor:"pointer",
            background:"none", border:"none", color:"var(--muted)", fontSize:20,
            fontFamily:"inherit", lineHeight:1 }}>
          ＋
        </button>
      </div>
    </div>
  );
}
