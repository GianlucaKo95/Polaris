import { useState, useEffect } from "react";
import { Archive, MapPin, Hash } from "lucide-react";
import { sbArchivListe } from "../lib/supabase.js";

// Zeigt abgeschlossene (archivierte) Baustellen der Firma — Klick auf eine
// öffnet sie wie gewohnt (setAktivId), aber direkt im Abschluss-Tab, da die
// übrigen Tabs (Aufgaben, Kosten, ...) für eine bereits archivierte
// Baustelle keinen Bearbeitungs-Sinn mehr ergeben, siehe App.jsx.
export function ArchivView({ firmaId, session, onOeffnen }) {
  const [projekte, setProjekte] = useState([]);
  const [laedt,    setLaedt]    = useState(true);
  const [fehler,   setFehler]   = useState("");

  useEffect(() => { laden(); }, [firmaId]);

  async function laden() {
    if (!firmaId) return;
    setLaedt(true); setFehler("");
    const daten = await sbArchivListe(firmaId, session);
    setProjekte(daten);
    setLaedt(false);
  }

  if (laedt) {
    return <div style={{ textAlign:"center", color:"var(--muted)", padding:20, fontSize:13 }}>Laden…</div>;
  }

  if (fehler) {
    return (
      <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
        padding:"9px 14px", fontSize:12 }}>{fehler}</div>
    );
  }

  if (projekte.length === 0) {
    return (
      <div style={{ textAlign:"center", padding:"29px 20px", color:"var(--muted)", fontSize:14 }}>
        <Archive size={44} style={{ marginBottom:12, opacity:0.5 }} />
        <div style={{ fontWeight:700, color:"var(--text)", marginBottom:6 }}>
          Noch keine abgeschlossenen Baustellen
        </div>
        <div>Abgeschlossene Baustellen samt Abschlussakte erscheinen hier.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ color:"var(--text)", fontWeight:800, fontSize:13, marginBottom:9 }}>
        Abgeschlossene Baustellen
      </div>
      {projekte.map(p => (
        <div key={p.id} onClick={() => onOeffnen(p.id)}
          style={{ background:"var(--surface)", border:"1px solid var(--border)",
            marginBottom:9, cursor:"pointer", padding:"12px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ minWidth:0 }}>
              <div style={{ color:"var(--text)", fontWeight:700, fontSize:15.5 }}>{p.name}</div>
              <div style={{ display:"flex", alignItems:"center", gap:5, color:"var(--muted)",
                fontSize:12, marginTop:4 }}>
                <MapPin size={12} />
                {[p.adresse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
              </div>
            </div>
            <div style={{ textAlign:"right", flexShrink:0, maxWidth:120 }}>
              <div style={{ color:"var(--muted)", fontSize:11 }}>
                {p.abschluss_datum ? new Date(p.abschluss_datum).toLocaleDateString("de-DE") : "—"}
              </div>
              {p.abschluss_dokument_id && (
                <div style={{ color:"var(--muted)", fontSize:10, fontFamily:"monospace",
                  display:"flex", alignItems:"center", gap:3, justifyContent:"flex-end", marginTop:2,
                  wordBreak:"break-all" }}>
                  <Hash size={9} style={{ flexShrink:0 }} />{p.abschluss_dokument_id}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
