import { useState } from "react";
import { CircleX, ArrowRight, PartyPopper, Rocket, Check } from "lucide-react";
import { supabase, sbClientMitToken } from "../lib/supabase.js";
import { Label, inputStyle } from "../components/Label.jsx";
import { PLAN_CONFIG } from "../config/konstanten.js";

export function RegistrierungScreen({ auth, onZurueck }) {
  const [schritt,     setSchritt]     = useState(0); // 0=Konto 1=Firma 2=Fertig
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [firmaName,   setFirmaName]   = useState("");
  const [laden,       setLaden]       = useState(false);
  const [fehler,      setFehler]      = useState("");
  // Session aus kontoAnlegen(), falls signUp() sie direkt liefert (kein
  // "Confirm email" im Supabase-Projekt aktiv) — dann muss firmaAnlegen()
  // sich nicht separat einloggen, siehe dortiger Kommentar.
  const [kontoSession, setKontoSession] = useState(null);

  async function kontoAnlegen() {
    if (!email || !password || password.length < 8) {
      setFehler("Passwort muss mindestens 8 Zeichen haben."); return;
    }
    setLaden(true); setFehler("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setFehler(error.message); setLaden(false); return; }
    if (data.session) {
      setKontoSession({
        access_token:  data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in:    data.session.expires_in,
        user:          data.session.user,
      });
    }
    setSchritt(1);
    setLaden(false);
  }

  async function firmaAnlegen() {
    if (!firmaName.trim()) { setFehler("Firmenname ist Pflicht."); return; }
    setLaden(true); setFehler("");

    let session = kontoSession;
    if (!session) {
      // signUp() hat keine Session geliefert — das Projekt verlangt eine
      // E-Mail-Bestätigung. Vorher wurde hier ungeprüft signInWithPassword()
      // versucht, was in diesem Fall immer mit "Email not confirmed"
      // fehlschlägt und fälschlich als generischer Login-Fehler erschien.
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        if (loginError.message?.toLowerCase().includes("email not confirmed")) {
          setFehler("Bitte bestätige zuerst deine E-Mail-Adresse (Link in deinem Postfach), bevor du fortfährst.");
        } else {
          setFehler("Login fehlgeschlagen.");
        }
        setLaden(false); return;
      }
      session = {
        access_token:  loginData.session.access_token,
        refresh_token: loginData.session.refresh_token,
        expires_in:    loginData.session.expires_in,
        user:          loginData.user,
      };
    }

    // Firma registrieren via RPC
    const client = sbClientMitToken(session);
    const { error: rpcError } = await client.rpc("firma_registrieren", {
      p_user_id:    session.user?.id,
      p_firma_name: firmaName,
      p_email:      email,
    });

    if (!rpcError) {
      localStorage.setItem("polaris-session", JSON.stringify(session));
      setSchritt(2);
    } else {
      setFehler("Firma konnte nicht angelegt werden.");
    }
    setLaden(false);
  }

  return (
    <div style={{ background:"var(--bg)", minHeight:"100dvh",
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"17px 20px",
      paddingTop:"calc(17px + env(safe-area-inset-top))",
      paddingBottom:"calc(17px + env(safe-area-inset-bottom))" }}>

      {/* Logo */}
      <div style={{ textAlign:"center", marginBottom:23 }}>
        <div style={{ fontWeight:900, fontSize:28, letterSpacing:-1.5,
          color:"var(--text)" }}>
          <span style={{ color:"var(--yellow)" }}>★</span> POLARIS
        </div>
        <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600,
          letterSpacing:3, textTransform:"uppercase", marginTop:2 }}>
          Baustellenmanagement
        </div>
      </div>

      {/* Fortschritt */}
      <div style={{ display:"flex", gap:8, marginBottom:17, alignItems:"center" }}>
        {["Konto", "Firma", "Fertig"].map((s, i) => (
          <div key={s} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:14,
              background: i < schritt ? "var(--green)"
                : i === schritt ? "var(--yellow)" : "var(--surface2)",
              border: `2px solid ${i <= schritt ? (i < schritt ? "var(--green)" : "var(--yellow)") : "var(--border)"}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:12, fontWeight:700,
              color: i < schritt ? "#fff" : i === schritt ? "#1a1200" : "var(--muted)" }}>
              {i < schritt ? <Check size={14} /> : i + 1}
            </div>
            <span style={{ fontSize:12, color: i === schritt ? "var(--text)" : "var(--muted)",
              fontWeight: i === schritt ? 700 : 400 }}>{s}</span>
            {i < 2 && <div style={{ width:24, height:1, background:"var(--border)" }} />}
          </div>
        ))}
      </div>

      <div style={{ background:"var(--surface)", borderRadius:20, padding:20,
        width:"100%", maxWidth:400, border:"1.5px solid var(--border)" }}>

        {fehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)",
            borderRadius:10, padding:"7px 14px", marginBottom:12,
            fontSize:13, border:"1px solid var(--red)",
            display:"flex", alignItems:"center", gap:6 }}>
            <CircleX size={14} /> {fehler}
          </div>
        )}

        {/* Schritt 0: Konto */}
        {schritt === 0 && (
          <div>
            <div style={{ fontWeight:800, fontSize:18, color:"var(--text)",
              marginBottom:4 }}>Konto erstellen</div>
            <div style={{ color:"var(--muted)", fontSize:13, marginBottom:14 }}>
              14 Tage kostenlos testen — keine Kreditkarte nötig.
            </div>
            <div style={{ marginBottom:10 }}>
              <Label>E-Mail</Label>
              <input type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="chef@bauunternehmen.de"
                style={inputStyle()} />
            </div>
            <div style={{ marginBottom:14 }}>
              <Label>Passwort (min. 8 Zeichen)</Label>
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle()} />
            </div>
            <button onClick={kontoAnlegen} disabled={laden}
              style={{ width:"100%", background:"var(--yellow)", color:"#1a1200",
                border:"none", borderRadius:12, padding:15, fontWeight:800,
                fontSize:15, cursor:"pointer", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              {laden ? "Wird angelegt…" : <>Konto erstellen <ArrowRight size={15} /></>}
            </button>
            <div style={{ textAlign:"center", marginTop:16 }}>
              <span style={{ color:"var(--muted)", fontSize:13 }}>
                Bereits registriert?{" "}
              </span>
              <button onClick={onZurueck}
                style={{ background:"none", border:"none", color:"var(--blue)",
                  cursor:"pointer", fontSize:13, fontWeight:600,
                  fontFamily:"inherit" }}>
                Anmelden
              </button>
            </div>
          </div>
        )}

        {/* Schritt 1: Firma */}
        {schritt === 1 && (
          <div>
            <div style={{ fontWeight:800, fontSize:18, color:"var(--text)",
              marginBottom:4 }}>Dein Unternehmen</div>
            <div style={{ color:"var(--muted)", fontSize:13, marginBottom:14 }}>
              Wie heißt dein Bauunternehmen?
            </div>
            <div style={{ marginBottom:14 }}>
              <Label>Firmenname *</Label>
              <input value={firmaName}
                onChange={e => setFirmaName(e.target.value)}
                placeholder="Koeven Bau GmbH"
                style={inputStyle()} />
            </div>

            {/* Plan Auswahl */}
            <Label>Plan (nach Testphase)</Label>
            <div style={{ display:"flex", flexDirection:"column", gap:8,
              marginTop:6, marginBottom:14 }}>
              {Object.entries(PLAN_CONFIG).filter(([key]) => key !== "enterprise").map(([key, p]) => (
                <div key={key} style={{ background:"var(--surface2)",
                  borderRadius:12, padding:"9px 16px",
                  border:`1.5px solid ${key === "starter" ? "var(--blue)" : "var(--border)"}`,
                  display:"flex", justifyContent:"space-between",
                  alignItems:"center" }}>
                  <div>
                    <div style={{ color:"var(--text)", fontWeight:700,
                      fontSize:13 }}>{p.icon} {p.label}</div>
                    <div style={{ color:"var(--muted)", fontSize:11 }}>
                      {key === "trial" ? "Automatisch aktiv" : p.preis}
                    </div>
                  </div>
                  {key === "starter" && (
                    <div style={{ background:"var(--bbg)", color:"var(--blue)",
                      borderRadius:20, padding:"2px 8px", fontSize:10,
                      fontWeight:700 }}>Empfohlen</div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={firmaAnlegen} disabled={laden || !firmaName.trim()}
              style={{ width:"100%",
                background: firmaName.trim() ? "var(--yellow)" : "var(--surface2)",
                color: firmaName.trim() ? "#1a1200" : "var(--muted)",
                border:"none", borderRadius:12, padding:15, fontWeight:800,
                fontSize:15, cursor: firmaName.trim() ? "pointer" : "default",
                fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              {laden ? "Wird eingerichtet…" : <>Polaris einrichten <Rocket size={15} /></>}
            </button>
          </div>
        )}

        {/* Schritt 2: Fertig */}
        {schritt === 2 && (
          <div style={{ textAlign:"center" }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:9, color:"var(--green)" }}><PartyPopper size={48} /></div>
            <div style={{ fontWeight:800, fontSize:20, color:"var(--green)",
              marginBottom:6 }}>Willkommen bei Polaris!</div>
            <div style={{ color:"var(--text2)", fontSize:14, lineHeight:1.6,
              marginBottom:17 }}>
              Dein Unternehmen <strong>{firmaName}</strong> wurde eingerichtet.
              Du hast 14 Tage kostenlos zum Testen.
            </div>
            <button onClick={() => window.location.reload()}
              style={{ width:"100%", background:"var(--yellow)", color:"#1a1200",
                border:"none", borderRadius:12, padding:15, fontWeight:800,
                fontSize:15, cursor:"pointer", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              Los geht's <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
