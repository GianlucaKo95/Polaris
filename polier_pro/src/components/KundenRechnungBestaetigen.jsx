import { useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheckBig, Ban, PenLine, X, Check } from "lucide-react";
import { UnterschriftPad } from "./UnterschriftPad.jsx";
import { sbKundenportalRechnungBestaetigen } from "../lib/supabase.js";
import { rechnungGesamt } from "../lib/rechnung.js";

const EUR = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Bestätigung des Leistungsstands EINER Rechnung über den bestehenden
// Kundenportal-Token — gleiches Unterschrift-/Nachweis-Muster wie die
// Bauabnahme (KundenAbnahme.jsx), nur pro Rechnung statt einmal pro Projekt:
// eine Abschlagsrechnung braucht bei jeder neuen Teilleistung eine eigene
// Bestätigung, nicht nur eine einmalige Gesamt-Abnahme am Ende.
export function KundenRechnungBestaetigen({ rechnung: r, token, onClose, onEntschieden }) {
  const [formular,  setFormular]  = useState(null); // null | "bestaetigen" | "beanstanden"
  const [name,       setName]       = useState("");
  const [grund,      setGrund]      = useState("");
  const [signatur,   setSignatur]   = useState(null);
  const [sendet,     setSendet]     = useState(false);
  const [fehler,     setFehler]     = useState("");

  const g = rechnungGesamt(r.netto_betrag, { sicherheitseinbehaltProzent: r.sicherheitseinbehalt_prozent, mwstProzent: r.mwst });

  async function absenden(entscheidung) {
    setFehler("");
    if (!name.trim()) { setFehler("Bitte einen Namen angeben."); return; }
    if (entscheidung === "bestaetigt" && !signatur) { setFehler("Bitte zum Bestätigen unterschreiben."); return; }
    setSendet(true);
    const { ok, hash, fehler: err } = await sbKundenportalRechnungBestaetigen(token, {
      rechnungId: r.id, entscheidung, name, signatur, grund,
    });
    setSendet(false);
    if (!ok) { setFehler(err || "Senden fehlgeschlagen."); return; }
    onEntschieden({ entscheidung, entschieden_name: name, beanstandungsgrund: grund, hash, entschieden_am: new Date().toISOString() });
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
          <div style={{ fontWeight:800, fontSize:16, color:"var(--text)" }}>
            {r.typ === "schluss" ? "Schlussrechnung" : "Abschlagsrechnung"} {r.nummer}
          </div>
          <button onClick={onClose}
            style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", padding:4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ color:"var(--muted)", fontSize:12, marginBottom:10 }}>
          Zahlbetrag {EUR(g.zahlbetrag)} €
        </div>

        <div style={{ background:"var(--surface)", borderRadius:10, marginBottom:14, overflow:"hidden",
          border:"1px solid var(--border)" }}>
          {(r.positionen_snapshot || []).map((p, i) => (
            <div key={p.id} style={{ display:"flex", justifyContent:"space-between", gap:8,
              padding:"8px 11px", fontSize:12, borderTop: i>0 ? "1px solid var(--border)" : "none" }}>
              <span style={{ color:"var(--text)" }}>{p.bez}</span>
              <span style={{ color:"var(--muted)", flexShrink:0 }}>{p.prozent}%</span>
            </div>
          ))}
        </div>

        {formular === null && (
          <>
            <div style={{ color:"var(--muted)", fontSize:12.5, marginBottom:16, lineHeight:1.4 }}>
              Mit der Bestätigung erklärst du, dass der oben ausgewiesene Leistungsstand zutrifft.
              Du kannst ihn auch beanstanden und einen Grund angeben.
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { setFormular("beanstanden"); setFehler(""); }}
                style={{ flex:1, background:"var(--rbg)", color:"var(--red)", border:"1.5px solid var(--red)",
                  borderRadius:12, padding:13, fontWeight:700, cursor:"pointer", fontSize:13.5, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                <Ban size={15} /> Beanstanden
              </button>
              <button onClick={() => { setFormular("bestaetigen"); setFehler(""); }}
                style={{ flex:1, background:"var(--green)", color:"#fff", border:"none",
                  borderRadius:12, padding:13, fontWeight:700, cursor:"pointer", fontSize:13.5, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                <CircleCheckBig size={15} /> Bestätigen
              </button>
            </div>
          </>
        )}

        {formular === "beanstanden" && (
          <div>
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600, marginBottom:6 }}>Ihr Name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname"
              style={{ width:"100%", background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
                borderRadius:8, padding:"11px 12px", fontSize:14, boxSizing:"border-box", marginBottom:12, fontFamily:"inherit" }} />
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600, marginBottom:6 }}>Grund der Beanstandung</div>
            <textarea value={grund} onChange={e=>setGrund(e.target.value)} placeholder="z.B. abweichender Leistungsstand bei Position …"
              rows={3}
              style={{ width:"100%", background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
                borderRadius:8, padding:"11px 12px", fontSize:13.5, boxSizing:"border-box", marginBottom:12,
                fontFamily:"inherit", resize:"vertical" }} />
            {fehler && <div style={{ color:"var(--red)", fontSize:12, marginBottom:10 }}>{fehler}</div>}
            <button onClick={() => absenden("beanstandet")} disabled={sendet}
              style={{ width:"100%", background:"var(--red)", color:"#fff", border:"none", borderRadius:10,
                padding:12, fontWeight:700, cursor: sendet ? "default" : "pointer", fontSize:13.5, fontFamily:"inherit" }}>
              {sendet ? "Wird gesendet…" : "Leistungsstand beanstanden"}
            </button>
          </div>
        )}

        {formular === "bestaetigen" && (
          <div>
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600, marginBottom:6 }}>Ihr Name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname"
              style={{ width:"100%", background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
                borderRadius:8, padding:"11px 12px", fontSize:14, boxSizing:"border-box", marginBottom:12, fontFamily:"inherit" }} />
            <UnterschriftPad label="Unterschrift" onSave={setSignatur} />
            {signatur && <div style={{ color:"var(--green)", fontSize:11.5, marginTop:-6, marginBottom:10,
              display:"flex", alignItems:"center", gap:5 }}><Check size={12} /> Unterschrift übernommen</div>}
            {fehler && <div style={{ color:"var(--red)", fontSize:12, marginBottom:10 }}>{fehler}</div>}
            <button onClick={() => absenden("bestaetigt")} disabled={sendet}
              style={{ width:"100%", background:"var(--green)", color:"#fff", border:"none", borderRadius:10,
                padding:12, fontWeight:700, cursor: sendet ? "default" : "pointer", fontSize:13.5, fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              <PenLine size={14} />{sendet ? "Wird gesendet…" : "Leistungsstand bestätigen"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
