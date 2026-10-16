import { useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheckBig, Ban, PenLine, X, Check } from "lucide-react";
import { UnterschriftPad } from "./UnterschriftPad.jsx";
import { sbKundenportalAbnahmeEntscheiden } from "../lib/supabase.js";

// Bauabnahme über den bestehenden Kundenportal-Token — gleiches Unterschrift-
// /Nachweis-Muster wie bei der Angebots-Annahme (AngebotAkzeptierenScreen.jsx),
// aber als Bottom-Sheet direkt im Portal statt als eigener Link/eigene Seite,
// da der Kunde den Portal-Link ohnehin schon dauerhaft hat.
export function KundenAbnahme({ token, onClose, onEntschieden }) {
  const [formular,  setFormular]  = useState(null); // null | "annehmen" | "ablehnen"
  const [name,       setName]       = useState("");
  const [grund,      setGrund]      = useState("");
  const [signatur,   setSignatur]   = useState(null);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [sendet,     setSendet]     = useState(false);
  const [fehler,     setFehler]     = useState("");

  async function absenden(entscheidung) {
    setFehler("");
    if (!name.trim()) { setFehler("Bitte einen Namen angeben."); return; }
    if (entscheidung === "angenommen" && !signatur) { setFehler("Bitte zum Abnehmen unterschreiben."); return; }
    if (entscheidung === "angenommen" && !bestaetigt) { setFehler("Bitte die Abnahme bestätigen."); return; }
    setSendet(true);
    const { ok, hash, fehler: err } = await sbKundenportalAbnahmeEntscheiden(token, { entscheidung, name, signatur, grund });
    setSendet(false);
    if (!ok) { setFehler(err || "Senden fehlgeschlagen."); return; }
    onEntschieden({ entscheidung, name, grund, hash, entschieden_am: new Date().toISOString() });
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

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
          <div style={{ fontWeight:800, fontSize:16, color:"var(--text)" }}>Bauabnahme</div>
          <button onClick={onClose}
            style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", padding:4 }}>
            <X size={18} />
          </button>
        </div>

        {formular === null && (
          <>
            <div style={{ color:"var(--muted)", fontSize:12.5, marginBottom:16, lineHeight:1.4 }}>
              Mit der Abnahme bestätigst du, dass die vereinbarten Bauleistungen erbracht wurden.
              Du kannst die Abnahme auch verweigern und einen Grund angeben.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { setFormular("ablehnen"); setFehler(""); }}
                style={{ flex:1, background:"var(--rbg)", color:"var(--red)", border:"1.5px solid var(--red)",
                  borderRadius:12, padding:13, fontWeight:700, cursor:"pointer", fontSize:13.5, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                <Ban size={15} /> Verweigern
              </button>
              <button onClick={() => { setFormular("annehmen"); setFehler(""); }}
                style={{ flex:1, background:"var(--green)", color:"#fff", border:"none",
                  borderRadius:12, padding:13, fontWeight:700, cursor:"pointer", fontSize:13.5, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                <CircleCheckBig size={15} /> Abnehmen
              </button>
            </div>
          </>
        )}

        {formular === "ablehnen" && (
          <div>
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600, marginBottom:6 }}>Ihr Name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname"
              style={{ width:"100%", background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
                borderRadius:8, padding:"11px 12px", fontSize:14, boxSizing:"border-box", marginBottom:12, fontFamily:"inherit" }} />
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600, marginBottom:6 }}>Grund der Verweigerung</div>
            <textarea value={grund} onChange={e=>setGrund(e.target.value)} placeholder="z.B. offene Mängel, unvollständige Leistung…"
              rows={3}
              style={{ width:"100%", background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
                borderRadius:8, padding:"11px 12px", fontSize:13.5, boxSizing:"border-box", marginBottom:12,
                fontFamily:"inherit", resize:"vertical" }} />
            {fehler && <div style={{ color:"var(--red)", fontSize:12, marginBottom:10 }}>{fehler}</div>}
            <button onClick={() => absenden("abgelehnt")} disabled={sendet}
              style={{ width:"100%", background:"var(--red)", color:"#fff", border:"none", borderRadius:10,
                padding:12, fontWeight:700, cursor: sendet ? "default" : "pointer", fontSize:13.5, fontFamily:"inherit" }}>
              {sendet ? "Wird gesendet…" : "Abnahme verweigern"}
            </button>
          </div>
        )}

        {formular === "annehmen" && (
          <div>
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600, marginBottom:6 }}>Ihr Name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname"
              style={{ width:"100%", background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
                borderRadius:8, padding:"11px 12px", fontSize:14, boxSizing:"border-box", marginBottom:12, fontFamily:"inherit" }} />
            <UnterschriftPad label="Unterschrift" onSave={setSignatur} />
            {signatur && <div style={{ color:"var(--green)", fontSize:11.5, marginTop:-6, marginBottom:10,
              display:"flex", alignItems:"center", gap:5 }}><Check size={12} /> Unterschrift übernommen</div>}
            <label style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:12, cursor:"pointer" }}>
              <input type="checkbox" checked={bestaetigt} onChange={e=>setBestaetigt(e.target.checked)}
                style={{ marginTop:2, flexShrink:0 }} />
              <span style={{ color:"var(--text2)", fontSize:12, lineHeight:1.4 }}>
                Mit Klick auf „Abnahme bestätigen" erkläre ich die Bauabnahme der erbrachten Leistungen.
              </span>
            </label>
            {fehler && <div style={{ color:"var(--red)", fontSize:12, marginBottom:10 }}>{fehler}</div>}
            <button onClick={() => absenden("angenommen")} disabled={sendet}
              style={{ width:"100%", background:"var(--green)", color:"#fff", border:"none", borderRadius:10,
                padding:12, fontWeight:700, cursor: sendet ? "default" : "pointer", fontSize:13.5, fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              <PenLine size={14} />{sendet ? "Wird gesendet…" : "Abnahme bestätigen"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
