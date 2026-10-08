import { useState } from "react";
import { Crown, UserPlus, TriangleAlert, CircleCheckBig } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { sbSupervisorNutzerEinladen } from "../lib/supabase.js";

// Nur erreichbar für profile.ist_supervisor = true (siehe App.jsx — der
// Home-Tab dafür wird nur dann überhaupt gerendert). Löst den einzigen
// Schritt, der bisher zwingend über das Supabase-Dashboard lief: das
// allererste Admin-Konto einer komplett neuen Kundenfirma anlegen, bevor
// dort irgendjemand eingeloggt ist, um eine normale Einladung zu
// generieren. Alles danach (Passwort setzen, Firma anlegen, Rolle
// "administrator") läuft bereits über bestehende App-Logik — siehe
// supabase/functions/supervisor-nutzer-einladen/index.ts.
export function SupervisorView({ session }) {
  const [email,  setEmail]  = useState("");
  const [laedt,  setLaedt]  = useState(false);
  const [fehler, setFehler] = useState("");
  const [erfolg, setErfolg] = useState("");

  async function einladen() {
    const adresse = email.trim();
    if (!adresse || laedt) return;
    setLaedt(true); setFehler(""); setErfolg("");
    const { ok, fehler: f } = await sbSupervisorNutzerEinladen(adresse, session);
    setLaedt(false);
    if (!ok) { setFehler(f); return; }
    setErfolg(`Einladung an ${adresse} gesendet — sobald die Person ihr Passwort setzt, richtet sie ihre eigene Firma im normalen Onboarding selbst ein.`);
    setEmail("");
  }

  return (
    <div>
      <div style={{ color:"var(--text)", fontWeight:800, fontSize:16,
        display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <Crown size={17} /> Supervisor
      </div>
      <div style={{ color:"var(--muted)", fontSize:12.5, lineHeight:1.5, marginBottom:16 }}>
        Legt für eine komplett neue Kundenfirma das allererste Administrator-Konto an.
        Die Person bekommt eine E-Mail mit einem Link zum Passwort-Setzen und richtet
        ihre Firma danach selbst im normalen Onboarding ein — hier wird nur das
        Auth-Konto erzeugt.
      </div>

      <div style={{ background:"var(--surface)", borderRadius:16, padding:14,
        border:"1.5px solid var(--border)" }}>
        <Label>E-Mail des neuen Administrators</Label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="kunde@firma.de" style={inputStyle()}
          onKeyDown={e => e.key === "Enter" && einladen()} />

        {fehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
            padding:"7px 14px", marginTop:10, fontSize:12,
            border:"1px solid var(--red)", display:"flex", alignItems:"center", gap:6 }}>
            <TriangleAlert size={13} /> {fehler}
          </div>
        )}
        {erfolg && (
          <div style={{ background:"var(--gbg)", color:"var(--green)", borderRadius:10,
            padding:"7px 14px", marginTop:10, fontSize:12, lineHeight:1.4,
            border:"1px solid var(--green)", display:"flex", alignItems:"flex-start", gap:6 }}>
            <CircleCheckBig size={13} style={{ marginTop:1, flexShrink:0 }} /> {erfolg}
          </div>
        )}

        <button onClick={einladen} disabled={!email.trim() || laedt}
          style={{ width:"100%", marginTop:12,
            background: email.trim() && !laedt ? "var(--yellow)" : "var(--surface2)",
            color: email.trim() && !laedt ? "#1a1200" : "var(--muted)",
            border:"none", borderRadius:10, padding:12, fontWeight:700,
            cursor: email.trim() && !laedt ? "pointer" : "default", fontSize:14,
            fontFamily:"inherit", display:"flex", alignItems:"center",
            justifyContent:"center", gap:7 }}>
          {laedt ? <><Spinner size={14} /> Sende Einladung…</> : <><UserPlus size={15} /> Einladen</>}
        </button>
      </div>
    </div>
  );
}
