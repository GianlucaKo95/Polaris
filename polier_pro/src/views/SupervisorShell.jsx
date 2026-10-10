import { LogOut, Crown } from "lucide-react";
import { SupervisorView } from "./SupervisorView.jsx";

// Komplett eigenständige Ansicht für profile.ist_supervisor = true — siehe
// App.jsx, wo dieser Shell VOR jeder firma-/projekt-bezogenen Logik
// gerendert wird (PIN-Abfrage, Onboarding, Gesperrt-Screen, normale
// Baustellen-Ansicht). Der Supervisor sieht dadurch ausschließlich dieses
// Fenster, unabhängig davon, welche rolle/firma_id zusätzlich auf dem
// Profil stehen (bei gk@koeven.de z.B. weiterhin administrator/firma_id 1
// für die eigene Firma) — "Der Supervisor soll Zugriff auf keine
// Unternehmen haben. Er ist nur zur Verwaltung da."
export function SupervisorShell({ session, onAbmelden }) {
  return (
    <div style={{ minHeight:"100dvh", background:"var(--bg)", color:"var(--text)" }}>
      <div style={{ background:"var(--ink)", padding:"13px 16px",
        paddingTop:"calc(13px + env(safe-area-inset-top))" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ fontWeight:800, fontSize:18, letterSpacing:-0.6,
              color:"#fff", lineHeight:1 }}>
              <span style={{ color:"var(--yellow)" }}>★</span> POLARIS
            </div>
            <div style={{ background:"rgba(255,255,255,.1)", color:"var(--yellow)",
              borderRadius:20, padding:"2px 9px", fontSize:11, fontWeight:700,
              display:"flex", alignItems:"center", gap:4 }}>
              <Crown size={11} /> Supervisor
            </div>
          </div>
          <button onClick={onAbmelden} title="Abmelden"
            style={{ width:34, height:34, flexShrink:0,
              background:"rgba(255,255,255,.08)", border:"none", color:"#fff",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>

      <div style={{ padding:"18px 16px 40px" }}>
        <SupervisorView session={session} />
      </div>
    </div>
  );
}
