import { useState, useEffect } from "react";
import { Link2, Copy, Check, Ban } from "lucide-react";
import { sbKundenportalLaden, sbKundenportalErstellen, sbKundenportalDeaktivieren } from "../lib/supabase.js";

// Verwaltung des Bauherren-Freigabe-Links — nur für Rollen, die laut RLS
// (kundenportal_freigaben_schreiben) überhaupt einen Link anlegen dürfen.
export function KundenportalFreigabe({ projektId, firmaId, session, profil }) {
  const [freigabe, setFreigabe] = useState(null);
  const [laden,    setLaden]    = useState(true);
  const [kopiert,  setKopiert]  = useState(false);
  const [fehler,   setFehler]   = useState("");

  useEffect(() => {
    let aktiv = true;
    sbKundenportalLaden(projektId, session).then(f => { if (aktiv) { setFreigabe(f); setLaden(false); } });
    return () => { aktiv = false; };
  }, [projektId]);

  async function erstellen() {
    setFehler("");
    const { daten, fehler: err } = await sbKundenportalErstellen(projektId, firmaId, profil?.id, session);
    if (err) { setFehler(err); return; }
    setFreigabe(daten);
  }

  async function deaktivieren() {
    if (!freigabe) return;
    setFehler("");
    const { ok, fehler: err } = await sbKundenportalDeaktivieren(freigabe.id, session);
    if (!ok) { setFehler(err || "Konnte nicht deaktiviert werden."); return; }
    setFreigabe(null);
  }

  function kopieren(url) {
    navigator.clipboard?.writeText(url).then(() => {
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    });
  }

  if (laden) return null;

  const url = freigabe ? `${window.location.origin}${window.location.pathname}?kunde=${freigabe.token}` : null;

  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12,
      padding:14, marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, fontWeight:700, fontSize:13, marginBottom:8 }}>
        <Link2 size={15} />Kundenportal
      </div>

      {!freigabe ? (
        <>
          <div style={{ color:"var(--muted)", fontSize:12, lineHeight:1.5, marginBottom:10 }}>
            Erstellt einen Link, über den der Bauherr Baufortschritt und Baustellenberichte
            ohne Login einsehen kann — ohne Kosten, Mängel oder interne Kommentare.
          </div>
          <button onClick={erstellen}
            style={{ background:"var(--yellow)", color:"#1a1200", border:"none", borderRadius:8,
              padding:"9px 16px", cursor:"pointer", fontWeight:700, fontSize:12.5, fontFamily:"inherit" }}>
            Link erstellen
          </button>
        </>
      ) : (
        <>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input readOnly value={url}
              style={{ flex:1, minWidth:0, background:"var(--surface2)", color:"var(--text)",
                border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px",
                fontSize:11.5, fontFamily:"monospace" }} />
            <button onClick={() => kopieren(url)} title="Kopieren"
              style={{ background: kopiert ? "var(--green)" : "var(--surface2)",
                color: kopiert ? "#fff" : "var(--muted)", border:"1px solid var(--border)",
                borderRadius:8, width:34, height:34, flexShrink:0, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
              {kopiert ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={deaktivieren}
            style={{ marginTop:9, background:"none", color:"var(--red)", border:"none",
              cursor:"pointer", fontSize:11.5, fontWeight:600, fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:5, padding:0 }}>
            <Ban size={12} />Link deaktivieren
          </button>
        </>
      )}

      {fehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:8,
          padding:"8px 12px", fontSize:11.5, marginTop:10 }}>{fehler}</div>
      )}
    </div>
  );
}
