import { Lock, Zap } from "lucide-react";
import { PLAN_CONFIG } from "../config/konstanten.js";

// Nur Administrator/Geschäftsführer können einen Plan wählen oder ein Abo
// verlängern — ein Facharbeiter, der hier auf "Pro wählen, 99 €/Monat"
// stieße, könnte damit nichts anfangen (und sollte vermutlich auch keine
// Preise seiner Firma sehen). Die bekommen deshalb nur den Hinweis, sich an
// ihren Administrator/Geschäftsführer zu wenden, statt der vollen
// Upgrade-Auswahl.
export function PlanGuard({ firma, children, ressource, rolle }) {
  if (!firma) return children;

  const trial_abgelaufen = firma.plan === "trial" &&
    firma.trial_ends_at && new Date(firma.trial_ends_at) < new Date();
  const abo_inaktiv = firma.plan_status === "cancelled" ||
    firma.plan_status === "expired";

  if (!trial_abgelaufen && !abo_inaktiv) return children;

  const kannHandeln = rolle === "administrator" || rolle === "geschaeftsfuehrer";

  if (!kannHandeln) {
    return (
      <div style={{ background:"var(--bg)", minHeight:"100dvh",
        display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", padding:17,
        paddingTop:"calc(17px + env(safe-area-inset-top))",
        paddingBottom:"calc(17px + env(safe-area-inset-bottom))" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:"var(--muted)" }}><Lock size={40} /></div>
        <div style={{ fontWeight:800, fontSize:22, color:"var(--text)",
          marginBottom:6, textAlign:"center" }}>
          {trial_abgelaufen ? "Testphase abgelaufen" : "Abo inaktiv"}
        </div>
        <div style={{ color:"var(--text2)", fontSize:14, textAlign:"center",
          maxWidth:320, lineHeight:1.6 }}>
          Bitte wende dich an deinen Administrator oder Geschäftsführer, um das zu klären.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:"var(--bg)", minHeight:"100dvh",
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:17,
      paddingTop:"calc(17px + env(safe-area-inset-top))",
      paddingBottom:"calc(17px + env(safe-area-inset-bottom))" }}>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:"var(--muted)" }}><Lock size={40} /></div>
      <div style={{ fontWeight:800, fontSize:22, color:"var(--text)",
        marginBottom:6, textAlign:"center" }}>
        {trial_abgelaufen ? "Testphase abgelaufen" : "Abo inaktiv"}
      </div>
      <div style={{ color:"var(--text2)", fontSize:14, textAlign:"center",
        maxWidth:320, marginBottom:20, lineHeight:1.6 }}>
        {trial_abgelaufen
          ? "Deine 14-tägige Testphase ist beendet. Wähle einen Plan um weiterzumachen."
          : "Dein Abo ist nicht mehr aktiv. Bitte erneuere dein Abonnement."}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10,
        width:"100%", maxWidth:340 }}>
        {[
          { key:"starter",    label:PLAN_CONFIG.starter.label,    preis:PLAN_CONFIG.starter.preis,
            features:`${PLAN_CONFIG.starter.inklusiveBaustellen} Baustellen inklusive, je weitere ${PLAN_CONFIG.starter.preisJeWeitere}` },
          { key:"pro",        label:PLAN_CONFIG.pro.label,        preis:PLAN_CONFIG.pro.preis,
            features:`${PLAN_CONFIG.pro.inklusiveBaustellen} Baustellen inklusive, je weitere ${PLAN_CONFIG.pro.preisJeWeitere}, + KI-Features & Kundenportal` },
          { key:"enterprise", label:PLAN_CONFIG.enterprise.label, preis:PLAN_CONFIG.enterprise.preis,
            features:"Unbegrenzte Baustellen, individuelle Vereinbarung" },
        ].map(p => (
          <div key={p.key} style={{ background:"var(--surface)", borderRadius:14,
            padding:"12px 20px", border:`2px solid ${p.key === "pro" ? "var(--yellow)" : "var(--border)"}` }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:6 }}>
              <div style={{ fontWeight:800, fontSize:16, color:"var(--text)" }}>
                {p.label}
              </div>
              <div style={{ fontWeight:700, color:"var(--yellow)" }}>{p.preis}</div>
            </div>
            <div style={{ color:"var(--muted)", fontSize:12, marginBottom:9 }}>
              {p.features}
            </div>
            <button
              onClick={() => window.location.href = "mailto:support@polaris-app.de?subject=Plan%20Upgrade&body=Ich%20möchte%20auf%20den%20" + p.label + "-Plan%20wechseln."}
              style={{ width:"100%",
                background: p.key === "pro" ? "var(--yellow)" : "var(--surface2)",
                color: p.key === "pro" ? "#1a1200" : "var(--text)",
                border:"none", borderRadius:10, padding:12, fontWeight:700,
                cursor:"pointer", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              {p.key === "pro" ? <><Zap size={14} /> Pro wählen</> : `${p.label} wählen`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
