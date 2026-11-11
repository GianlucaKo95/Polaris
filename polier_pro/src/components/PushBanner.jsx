import { Bell } from "lucide-react";
import { PUSH_VAPID_PUBLIC } from "../lib/push.js";
import { useIstDesktop } from "../hooks/useIstDesktop.js";

export function PushBanner({ erlaubt, berechtigung }) {
  const istDesktop = useIstDesktop();
  if (erlaubt) return null;
  if (istDesktop) return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"12px 16px", marginBottom:16,
      display:"flex", alignItems:"center", gap:12 }}>
      <Bell size={16} strokeWidth={1.5} style={{ color:"var(--text2)", flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ color:"var(--text)" }}>Erinnerungen aktivieren</div>
        <div style={{ color:"var(--text2)", fontSize:13 }}>
          Wetterwarnung, Verzug und Tagesbericht{!PUSH_VAPID_PUBLIC && ", solange Polaris geöffnet ist"}
        </div>
      </div>
      <button onClick={berechtigung} className="desk-nav"
        style={{ height:32, padding:"0 12px", background:"var(--surface)", color:"var(--text)", border:"1px solid var(--border2)",
          borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:14 }}>Aktivieren</button>
    </div>
  );
  return (
    <div style={{ background: "var(--bbg)", borderRadius:12, padding:"9px 16px", marginBottom:9,
      border:`1.5px solid ${'var(--blue)'}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div>
        <div style={{ color: "var(--text)", fontSize:13, fontWeight:700,
          display:"flex", alignItems:"center", gap:6 }}><Bell size={14} /> Erinnerungen aktivieren</div>
        <div style={{ color: "var(--muted)", fontSize:11 }}>
          Wetterwarnung, Verzug &amp; Tagesbericht
          {!PUSH_VAPID_PUBLIC && " — nur während Polaris geöffnet ist"}
        </div>
      </div>
      <button onClick={berechtigung}
        style={{ background: "var(--blue)", color:"#fff", border:"none", borderRadius:8,
          padding:"6px 12px", cursor:"pointer", fontWeight:700, fontSize:12 }}>
        Aktivieren
      </button>
    </div>
  );
}
