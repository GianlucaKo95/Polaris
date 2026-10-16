import { ShieldCheck, Ban } from "lucide-react";

// Zeigt GF/Admin den vollständigen Entscheidungs-Nachweis eines online
// über den Kunden-Link angenommenen/abgelehnten Angebots — Name, Zeitpunkt,
// IP, DOC-Hash und (bei Annahme) die tatsächlich gezeichnete Unterschrift.
// Rein darstellend: das Laden übernimmt AngebotEditor.jsx zentral (dieselbe
// nachweis-Zeile wird auch ins reguläre Angebots-PDF eingebettet, siehe
// dort — ein eigener, zweiter PDF-Export hier wäre dieselbe Information
// doppelt und könnte vom "echten" Angebots-PDF abweichen).
export function AngebotNachweis({ angebot, nachweis }) {
  if (!angebot?.entschieden_am || !nachweis) return null;

  const angenommen = nachweis.entscheidung === "angenommen";

  return (
    <div style={{ background:"var(--surface)", border:`1px solid ${angenommen ? "var(--green)" : "var(--red)"}`,
      borderRadius:12, padding:14, marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, fontWeight:700, fontSize:13, marginBottom:10,
        color: angenommen ? "var(--green)" : "var(--red)" }}>
        {angenommen ? <ShieldCheck size={15} /> : <Ban size={15} />}
        Signierter Nachweis
      </div>

      <div style={{ color:"var(--text)", fontSize:12.5, marginBottom:3 }}>
        <strong>{nachweis.entschieden_name}</strong> hat dieses Angebot {angenommen ? "angenommen" : "abgelehnt"}
      </div>
      <div style={{ color:"var(--muted)", fontSize:11.5, marginBottom:10 }}>
        {new Date(nachweis.entschieden_am).toLocaleString("de-DE")}
        {nachweis.entschieden_ip && <> · IP {nachweis.entschieden_ip}</>}
      </div>

      {nachweis.entschieden_signatur && (
        <div style={{ background:"#fff", border:"1px solid var(--border)", borderRadius:8,
          padding:8, marginBottom:10, display:"inline-block" }}>
          <img src={nachweis.entschieden_signatur} alt="Unterschrift" style={{ maxWidth:220, maxHeight:70, display:"block" }} />
        </div>
      )}

      <div style={{ fontFamily:"monospace", fontSize:11, color:"var(--muted)", background:"var(--surface2)",
        borderRadius:6, padding:"5px 9px", display:"inline-block", wordBreak:"break-all", marginBottom:10 }}>
        DOC-{nachweis.entschieden_hash}
      </div>

      <div style={{ color:"var(--muted)", fontSize:11 }}>
        Im Angebots-PDF (Button oben) ist diese Unterschrift bereits mit enthalten.
      </div>
    </div>
  );
}
