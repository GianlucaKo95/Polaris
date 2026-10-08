import { useState, useEffect } from "react";
import { MapPin, Users, Cloud, Camera, Building2 } from "lucide-react";
import { sbKundenportalDaten } from "../lib/supabase.js";
import { PROJEKTTYPEN } from "../config/konstanten.js";

// Öffentliche, read-only Seite für den Bauherrn — kein Login, kein Zugriff
// auf den Rest der App. Erreicht über ?kunde=<token> (siehe App.jsx), lädt
// ausschließlich über die kuratierte kundenportal_daten-RPC (kein Session-
// Token, kein Zugriff auf interne Daten wie Kosten/Mängel/Kommentare).
export function KundenportalScreen({ token }) {
  const [daten,  setDaten]  = useState(null);
  const [laden,  setLaden]  = useState(true);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let aktiv = true;
    sbKundenportalDaten(token).then(d => {
      if (!aktiv) return;
      if (!d) setFehler(true); else setDaten(d);
      setLaden(false);
    });
    return () => { aktiv = false; };
  }, [token]);

  if (laden) {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center",
        background:"var(--bg)", color:"var(--muted)", fontFamily:"inherit" }}>
        Lädt…
      </div>
    );
  }

  if (fehler || !daten) {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", background:"var(--bg)", color:"var(--text)", padding:24, textAlign:"center" }}>
        <Building2 size={40} style={{ opacity:0.4, marginBottom:12 }} />
        <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>Link nicht gültig</div>
        <div style={{ color:"var(--muted)", fontSize:13.5 }}>
          Dieser Freigabe-Link ist abgelaufen oder wurde deaktiviert.
          Bitte beim Bauleiter einen neuen Link anfordern.
        </div>
      </div>
    );
  }

  const pct = daten.aufgaben_gesamt > 0
    ? Math.round((daten.aufgaben_fertig / daten.aufgaben_gesamt) * 100)
    : 0;
  const typInfo = PROJEKTTYPEN[daten.projekt_typ];

  return (
    <div style={{ minHeight:"100dvh", background:"var(--bg)", color:"var(--text)", fontFamily:"inherit" }}>
      <div style={{ background:"var(--ink)", color:"#fff", padding:"20px 18px",
        paddingTop:"calc(20px + env(safe-area-inset-top))" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          {daten.firma_logo_url
            ? <img src={daten.firma_logo_url} alt="" style={{ width:34, height:34, borderRadius:8, objectFit:"cover" }} />
            : <div style={{ width:34, height:34, borderRadius:8, background:"rgba(255,255,255,.1)",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Building2 size={18} />
              </div>}
          <div style={{ fontSize:13, fontWeight:700, color:"var(--yellow)" }}>{daten.firma_name}</div>
        </div>
        <div style={{ fontSize:22, fontWeight:800, letterSpacing:-0.5, lineHeight:1.2 }}>
          {typInfo?.icon} {daten.projekt_name}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5, color:"var(--ink-text2)",
          fontSize:12.5, marginTop:6 }}>
          <MapPin size={13} />
          {[daten.projekt_adresse, [daten.projekt_plz, daten.projekt_ort].filter(Boolean).join(" ")]
            .filter(Boolean).join(", ")}
        </div>
        {daten.bauleiter && (
          <div style={{ display:"flex", alignItems:"center", gap:5, color:"var(--ink-text2)",
            fontSize:12.5, marginTop:4 }}>
            <Users size={13} />Bauleiter: {daten.bauleiter}
          </div>
        )}
      </div>

      <div style={{ padding:"18px 16px 40px" }}>
        {/* Fortschritt */}
        <div style={{ background:"var(--ink)", color:"#fff", padding:"16px 18px", marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
            <div className="num" style={{ fontSize:38, fontWeight:800, color:"var(--yellow)", lineHeight:1 }}>
              {pct}%
            </div>
            <div style={{ fontSize:12, color:"var(--ink-text2)" }}>Baufortschritt</div>
          </div>
          <div style={{ height:8, background:"rgba(255,255,255,.12)", marginTop:12 }}>
            <div style={{ height:"100%", width:`${pct}%`, background:"var(--yellow)", transition:"width .5s" }} />
          </div>
          <div style={{ fontSize:11.5, color:"var(--ink-text2)", marginTop:8 }}>
            {daten.aufgaben_fertig} von {daten.aufgaben_gesamt} Positionen abgeschlossen
          </div>
        </div>

        {/* Tagesberichte */}
        <div style={{ fontWeight:800, fontSize:13, marginBottom:10 }}>Baustellenberichte</div>
        {daten.tagesberichte.length === 0 && (
          <div style={{ color:"var(--muted)", fontSize:13, textAlign:"center", padding:"20px 0" }}>
            Noch keine Berichte veröffentlicht.
          </div>
        )}
        {daten.tagesberichte.map((b, i) => (
          <div key={i} style={{ background:"var(--surface)", border:"1px solid var(--border)",
            padding:"12px 14px", marginBottom:9 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <div style={{ fontWeight:700, fontSize:13.5 }}>
                {new Date(b.datum).toLocaleDateString("de-DE", { weekday:"short", day:"2-digit", month:"2-digit" })}
              </div>
              <div style={{ display:"flex", gap:10, color:"var(--muted)", fontSize:11.5 }}>
                {b.wetter && <span style={{ display:"flex", alignItems:"center", gap:4 }}><Cloud size={12} />{b.wetter}</span>}
                {b.arbeiter > 0 && <span style={{ display:"flex", alignItems:"center", gap:4 }}><Users size={12} />{b.arbeiter}</span>}
              </div>
            </div>
            {b.besonderheiten && (
              <div style={{ fontSize:12.5, color:"var(--text2)", lineHeight:1.4, marginBottom: b.bilder?.length ? 8 : 0 }}>
                {b.besonderheiten}
              </div>
            )}
            {b.bilder?.length > 0 && (
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {b.bilder.slice(0, 6).map((url, j) => (
                  <img key={j} src={url} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:"cover" }} />
                ))}
                {b.bilder.length > 6 && (
                  <div style={{ width:56, height:56, borderRadius:8, background:"var(--surface2)",
                    color:"var(--muted)", fontSize:11, fontWeight:700,
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Camera size={11} style={{ marginRight:3 }} />+{b.bilder.length - 6}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div style={{ textAlign:"center", color:"var(--muted)", fontSize:11, marginTop:24 }}>
          Bereitgestellt über Polaris
        </div>
      </div>
    </div>
  );
}
