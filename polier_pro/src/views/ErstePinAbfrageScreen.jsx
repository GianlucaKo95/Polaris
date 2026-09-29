import { useState } from "react";
import { Lock, ArrowRight, CircleX } from "lucide-react";
import { sbFetch } from "../lib/supabase.js";
import { sha256Hex } from "../lib/utils.js";

// Wird EINMALIG direkt nach der ersten Anmeldung (Passwort-Vergabe per
// Einladung oder Supabase-Invite-Link) für alle Nicht-Admin-Rollen gezeigt —
// noch bevor die eigentliche App sichtbar wird (siehe App.jsx-Gate). Ohne
// pflicht kann der Nutzer die PIN-Einrichtung einmalig überspringen
// (pin_abgefragt wird gesetzt, das Popup erscheint dann nie wieder von
// selbst); mit pflicht (vom Administrator erzwungen) gibt es keinen
// Überspringen-Button — die App bleibt gesperrt, bis eine PIN gesetzt ist.
export function ErstePinAbfrageScreen({ profil, session, pflicht, onFertig }) {
  const [pin,      setPin]      = useState("");
  const [pin2,     setPin2]     = useState("");
  const [speichert,setSpeichert]= useState(false);
  const [uebersp,  setUebersp]  = useState(false);
  const [fehler,   setFehler]   = useState("");

  const valid = /^\d{4}$/.test(pin) && pin === pin2;

  async function pinEinrichten() {
    if (!valid || speichert) return;
    setFehler("");
    setSpeichert(true);
    const hash = await sha256Hex(pin);
    const ok = await sbFetch(`profile?id=eq.${profil.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ pin: hash, pin_abgefragt: true }),
    });
    setSpeichert(false);
    if (!ok?.length) { setFehler("PIN konnte nicht gespeichert werden. Bitte erneut versuchen."); return; }
    onFertig({ pin: hash, pin_abgefragt: true });
  }

  async function ueberspringen() {
    if (pflicht || uebersp) return;
    setUebersp(true);
    setFehler("");
    const ok = await sbFetch(`profile?id=eq.${profil.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ pin_abgefragt: true }),
    });
    setUebersp(false);
    if (!ok?.length) { setFehler("Aktion konnte nicht gespeichert werden. Bitte erneut versuchen."); return; }
    onFertig({ pin_abgefragt: true });
  }

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
      <div style={{ background:"var(--surface)", borderRadius:20, padding:20,
        width:"100%", maxWidth:380, border:"1.5px solid var(--border)" }}>
        <div style={{ width:44, height:44, borderRadius:22, background:"var(--ybg)",
          display:"flex", alignItems:"center", justifyContent:"center", marginBottom:12 }}>
          <Lock size={20} color="var(--ydark)" />
        </div>
        <div style={{ fontWeight:800, fontSize:18, color:"var(--text)", marginBottom:6 }}>
          App-Sperre einrichten
        </div>
        <div style={{ color:"var(--muted)", fontSize:13, marginBottom:14, lineHeight:1.5 }}>
          {pflicht
            ? "Dein Unternehmen verlangt einen 4-stelligen Code, damit niemand sonst die App auf diesem Gerät öffnen kann."
            : "Schütze die App mit einem 4-stelligen Code, falls das Handy in fremde Hände gerät. Du kannst das auch später jederzeit in \"Mein Profil\" einrichten."}
        </div>

        {fehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
            padding:"7px 14px", marginBottom:12, fontSize:13,
            border:"1px solid var(--red)",
            display:"flex", alignItems:"center", gap:6 }}><CircleX size={14} /> {fehler}</div>
        )}

        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))}
            placeholder="Neue PIN" type="password" inputMode="numeric" maxLength={4}
            style={{ flex:1, textAlign:"center", letterSpacing:6, background:"var(--surface2)",
              color:"var(--text)", border:"1.5px solid var(--border)", borderRadius:10,
              padding:"12px 14px", fontSize:16, boxSizing:"border-box", fontFamily:"inherit" }} />
          <input value={pin2} onChange={e=>setPin2(e.target.value.replace(/\D/g,"").slice(0,4))}
            placeholder="Wiederholen" type="password" inputMode="numeric" maxLength={4}
            onKeyDown={e => e.key==="Enter" && pinEinrichten()}
            style={{ flex:1, textAlign:"center", letterSpacing:6, background:"var(--surface2)",
              color:"var(--text)", border:`1.5px solid ${pin2 && pin !== pin2 ? "var(--red)" : "var(--border)"}`,
              borderRadius:10, padding:"12px 14px", fontSize:16, boxSizing:"border-box", fontFamily:"inherit" }} />
        </div>

        <button onClick={pinEinrichten} disabled={!valid || speichert}
          style={{ width:"100%", background: valid ? "var(--yellow)" : "var(--surface2)",
            color: valid ? "#1a1200" : "var(--muted)", border:"none",
            borderRadius:12, padding:15, fontWeight:800, fontSize:15,
            cursor: valid ? "pointer" : "default", fontFamily:"inherit",
            display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
          {speichert ? "Wird eingerichtet…" : <>PIN einrichten <ArrowRight size={15} /></>}
        </button>

        {!pflicht && (
          <button onClick={ueberspringen} disabled={uebersp}
            style={{ width:"100%", background:"none", border:"none", color:"var(--muted)",
              cursor:"pointer", fontSize:12, marginTop:12, fontFamily:"inherit",
              textDecoration:"underline" }}>
            {uebersp ? "…" : "Später einrichten"}
          </button>
        )}
      </div>
    </div>
  );
}
