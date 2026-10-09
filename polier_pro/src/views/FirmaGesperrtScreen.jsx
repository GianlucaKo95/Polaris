import { LockKeyhole, LogOut } from "lucide-react";

// Wird gezeigt, sobald firma.gesperrt true ist (siehe App.jsx — der Lesezugriff
// auf die eigene firmen-Zeile bleibt laut firmen_eigen-Policy bewusst auch
// gesperrt möglich, siehe Migration firmen_sperre_durchsetzen). Ohne diesen
// Screen bekäme der Nutzer nur eine leere App zu sehen ("Noch keine
// Baustellen" o.ä.), weil eigene_firma_id() für jede andere Tabelle NULL
// liefert und projekte/aufgaben/kolonnen serverseitig einfach leer
// zurückkommen — das sähe nach einem Fehler oder einem leeren Konto aus,
// nicht nach einer bewussten Sperre.
export function FirmaGesperrtScreen({ onAbmelden }) {
  return (
    <div style={{ background:"var(--bg)", minHeight:"100dvh", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"17px 20px",
      paddingTop:"calc(17px + env(safe-area-inset-top))",
      paddingBottom:"calc(17px + env(safe-area-inset-bottom))" }}>
      <div style={{ textAlign:"center", marginBottom:23 }}>
        <div style={{ fontWeight:900, fontSize:28, letterSpacing:-1.5, color:"var(--text)" }}>
          <span style={{ color:"var(--yellow)" }}>★</span> POLARIS
        </div>
      </div>
      <div style={{ background:"var(--surface)", borderRadius:20, padding:24,
        width:"100%", maxWidth:380, border:"1.5px solid var(--red)", textAlign:"center" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:"var(--red)" }}>
          <LockKeyhole size={36} />
        </div>
        <div style={{ fontWeight:800, fontSize:18, color:"var(--text)", marginBottom:8 }}>
          Zugang gesperrt
        </div>
        <div style={{ color:"var(--muted)", fontSize:13.5, lineHeight:1.6, marginBottom:20 }}>
          Der Zugang deines Unternehmens zu Polaris wurde vorübergehend gesperrt.
          Bitte wende dich an deinen Administrator oder an den Polaris-Support,
          um das zu klären.
        </div>
        <button onClick={onAbmelden}
          style={{ width:"100%", background:"var(--surface2)", color:"var(--text)",
            border:"1.5px solid var(--border)", borderRadius:12, padding:14,
            fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit",
            display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
          <LogOut size={15} /> Abmelden
        </button>
      </div>
    </div>
  );
}
