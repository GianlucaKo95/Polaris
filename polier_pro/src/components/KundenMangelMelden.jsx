import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Camera, X, TriangleAlert } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { sbKundenportalMangelMelden } from "../lib/supabase.js";

// Gleiches Bottom-Sheet-Muster wie MangelBehebenDialog.jsx, aber öffentlich
// erreichbar (kein Login, nur der Kundenportal-Token) — Absenden läuft über
// die SECURITY DEFINER-RPC kundenportal_mangel_melden, die Token+Rate-Limit
// serverseitig prüft (siehe lib/supabase.js). Nach erfolgreichem Absenden
// bleibt der Dialog offen und zeigt stattdessen eine Bestätigung, statt
// sofort zu schließen — sonst wirkt die Meldung ins Leere gesendet.
export function KundenMangelMelden({ token, onClose }) {
  const [titel,        setTitel]        = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [kontakt,      setKontakt]      = useState("");
  const [fotos,        setFotos]        = useState([]);
  const [laedt,        setLaedt]        = useState(false);
  const [fehler,       setFehler]       = useState("");
  const [gesendet,     setGesendet]     = useState(false);
  const fileRef = useRef(null);

  function handleBild(e) {
    Array.from(e.target.files).forEach(file => {
      const r = new FileReader();
      r.onload = ev => setFotos(p => [...p, ev.target.result]);
      r.readAsDataURL(file);
    });
  }

  async function absenden() {
    if (!titel.trim() || laedt) return;
    setLaedt(true);
    setFehler("");
    const { ok, fehler: f } = await sbKundenportalMangelMelden(token, {
      titel: titel.trim(), beschreibung: beschreibung.trim(), kontakt: kontakt.trim(), fotos,
    });
    setLaedt(false);
    if (!ok) { setFehler(f); return; }
    setGesendet(true);
  }

  return createPortal(
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:600,
        display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:"var(--bg)", width:"100%", maxWidth:480,
          borderRadius:"16px 16px 0 0", padding:"18px 16px",
          maxHeight:"85dvh", overflowY:"auto",
          paddingBottom:"calc(18px + env(safe-area-inset-bottom))" }}>

        {gesendet ? (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:34, marginBottom:10 }}>✅</div>
            <div style={{ fontWeight:800, fontSize:16, color:"var(--text)", marginBottom:6 }}>
              Danke für die Meldung
            </div>
            <div style={{ color:"var(--muted)", fontSize:13, lineHeight:1.4, marginBottom:18 }}>
              Der Bauleiter wurde über den Mangel informiert.
            </div>
            <button onClick={onClose}
              style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
                padding:14, fontWeight:800, cursor:"pointer", fontSize:14,
                fontFamily:"inherit", width:"100%" }}>Schließen</button>
          </div>
        ) : (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
              <div style={{ fontWeight:800, fontSize:16, color:"var(--text)" }}>Mangel melden</div>
              <button onClick={onClose}
                style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", padding:4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ color:"var(--muted)", fontSize:12.5, marginBottom:14, lineHeight:1.4 }}>
              Ist dir etwas aufgefallen (Riss, Schaden, fehlende Arbeit)? Kurz beschreiben, optional ein Foto —
              der Bauleiter sieht die Meldung in seiner Mängelliste.
            </div>

            <div style={{ marginBottom:10 }}>
              <label style={{ display:"block", fontSize:11.5, fontWeight:700, color:"var(--muted)",
                textTransform:"uppercase", letterSpacing:0.3, marginBottom:5 }}>Was ist los? *</label>
              <input value={titel} onChange={e=>setTitel(e.target.value)} maxLength={200}
                placeholder="z.B. Riss in der Wand im Flur" autoFocus
                style={{ width:"100%", background:"var(--surface2)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:11,
                  fontSize:14, boxSizing:"border-box", fontFamily:"inherit" }} />
            </div>

            <div style={{ marginBottom:10 }}>
              <label style={{ display:"block", fontSize:11.5, fontWeight:700, color:"var(--muted)",
                textTransform:"uppercase", letterSpacing:0.3, marginBottom:5 }}>Details (optional)</label>
              <textarea rows={3} value={beschreibung} onChange={e=>setBeschreibung(e.target.value)} maxLength={2000}
                placeholder="Wo genau, seit wann aufgefallen…"
                style={{ width:"100%", background:"var(--surface2)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:11,
                  fontSize:13, resize:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ display:"block", fontSize:11.5, fontWeight:700, color:"var(--muted)",
                textTransform:"uppercase", letterSpacing:0.3, marginBottom:5 }}>Name/Telefon (optional)</label>
              <input value={kontakt} onChange={e=>setKontakt(e.target.value)} maxLength={200}
                placeholder="Für Rückfragen"
                style={{ width:"100%", background:"var(--surface2)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:11,
                  fontSize:14, boxSizing:"border-box", fontFamily:"inherit" }} />
            </div>

            <input ref={fileRef} type="file" accept="image/*" multiple
              style={{ display:"none" }} onChange={handleBild} />
            <button onClick={() => fileRef.current.click()}
              style={{ background:"var(--surface2)", color:"var(--muted)",
                border:"1.5px dashed var(--border)", borderRadius:10,
                padding:"8px 16px", cursor:"pointer", fontSize:12,
                fontFamily:"inherit", display:"flex", alignItems:"center", gap:6 }}>
              <Camera size={14} />Foto hinzufügen
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

            {fehler && (
              <div style={{ background:"var(--rbg)", border:"1px solid var(--red)", borderRadius:10,
                color:"var(--red)", fontSize:12.5, padding:"8px 12px", marginTop:12,
                display:"flex", alignItems:"center", gap:6 }}>
                <TriangleAlert size={13} />{fehler}
              </div>
            )}

            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button onClick={onClose}
                style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
                  border:"1.5px solid var(--border)", padding:14, cursor:"pointer",
                  fontFamily:"inherit", fontWeight:600 }}>Abbrechen</button>
              <button onClick={absenden} disabled={!titel.trim() || laedt}
                style={{ flex:2, background: titel.trim() && !laedt ? "var(--yellow)" : "var(--surface2)",
                  color: titel.trim() && !laedt ? "#1a1200" : "var(--muted)",
                  border:"none", padding:14, fontWeight:800,
                  cursor: titel.trim() && !laedt ? "pointer" : "default", fontSize:14,
                  fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                {laedt ? <><Spinner size={14} /> Sende…</> : "Melden"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
