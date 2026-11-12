import { useState } from "react";
import { Eye, EyeOff, CircleX, ArrowRight, ArrowLeft, Mail } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { ROLLEN } from "../config/konstanten.js";
import { useIstDesktop } from "../hooks/useIstDesktop.js";
import { PolarisMarke } from "../components/PolarisMarke.jsx";
import { AnmeldePlan } from "../components/AnmeldePlan.jsx";

// ── Desktop: Formular links auf ruhiger Fläche, rechts ein Grundriss mit
// Achsraster als Bild. Die Handy-Ansicht weiter unten bleibt unverändert.
const feld = { boxSizing: "border-box", width: "100%", height: 40, padding: "0 12px", background: "var(--surface)", color: "var(--text)",
  border: "1px solid var(--border2)", borderRadius: 8, fontFamily: "inherit", fontSize: 14, outline: "none" };
const feldLabel = { display: "block", fontSize: 13, color: "var(--text2)", marginBottom: 4 };

function DesktopRahmen({ children }) {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", gridTemplateColumns: "minmax(440px, 520px) 1fr", background: "var(--bg)", color: "var(--text)",
      fontSize: 14, lineHeight: "20px" }}>
      <main style={{ background: "var(--surface)", borderRight: "1px solid var(--border)", padding: "32px 56px", display: "flex", flexDirection: "column" }}>
        <PolarisMarke />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 360, width: "100%", padding: "48px 0" }}>
          {children}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Zugangsdaten vergibt der Administrator deiner Firma</div>
      </main>
      <aside aria-hidden="false" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "48px 64px", gap: 24 }}>
        <AnmeldePlan />
        <div style={{ maxWidth: 560, textAlign: "center", color: "var(--text2)" }}>
          Leistungsstand nach Achsabschnitt, direkt aus dem Plan gelesen
        </div>
      </aside>
    </div>
  );
}

function Fehler({ text }) {
  if (!text) return null;
  return (
    <div role="alert" style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--red)", background: "var(--rbg)", borderRadius: 8,
      padding: "8px 12px", marginBottom: 16, fontSize: 13 }}>
      <CircleX size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} /> {text}
    </div>
  );
}

function Hauptknopf({ aktiv, onClick, children }) {
  return (
    <button onClick={onClick} disabled={!aktiv}
      style={{ width: "100%", height: 40, marginTop: 24, background: aktiv ? "var(--text)" : "var(--surface2)", color: aktiv ? "var(--surface)" : "var(--muted)",
        border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 500, cursor: aktiv ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background-color 120ms ease-out" }}>
      {children}
    </button>
  );
}

function DesktopAnmeldung({ auth, onDemoLogin, email, setEmail, password, setPassword, showPw, setShowPw, onReset }) {
  const bereit = !!email && !!password && !auth.loading;
  const senden = () => bereit && auth.anmelden(email, password);
  return (
    <DesktopRahmen>
      <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 500 }}>Anmelden</h1>
      <p style={{ margin: "8px 0 32px", color: "var(--text2)" }}>Baustellen, Angebote und Abrechnung deiner Firma</p>
      <Fehler text={auth.fehler} />
      <label style={feldLabel} htmlFor="anmelde-name">E-Mail oder Benutzername</label>
      <input id="anmelde-name" className="anmelde-feld" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" autoFocus
        value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && senden()} style={feld} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 16 }}>
        <label style={{ ...feldLabel, marginBottom: 4 }} htmlFor="anmelde-pw">Passwort</label>
        <button onClick={onReset} style={{ background: "none", border: "none", padding: 0, color: "var(--text2)", fontFamily: "inherit", fontSize: 13,
          cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>Vergessen</button>
      </div>
      <div style={{ position: "relative" }}>
        <input id="anmelde-pw" className="anmelde-feld" type={showPw ? "text" : "password"} autoComplete="current-password"
          value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && senden()}
          style={{ ...feld, paddingRight: 44 }} />
        <button onClick={() => setShowPw(p => !p)} aria-label={showPw ? "Passwort verbergen" : "Passwort zeigen"}
          style={{ position: "absolute", right: 4, top: 4, width: 32, height: 32, background: "none", border: "none", borderRadius: 6,
            color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {showPw ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
        </button>
      </div>
      <Hauptknopf aktiv={bereit} onClick={senden}>
        {auth.loading ? "Wird angemeldet" : <>Anmelden <ArrowRight size={16} strokeWidth={1.5} /></>}
      </Hauptknopf>

      {!auth.supabaseKonfiguriert && (
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>Ohne Server ansehen als</div>
          {Object.entries(ROLLEN).map(([key, r]) => (
            <button key={key} onClick={() => onDemoLogin(key)} className="desk-nav"
              style={{ width: "100%", height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginLeft: -8,
                boxSizing: "content-box", background: "none", border: "none", borderRadius: 6, color: "var(--text)", fontFamily: "inherit", fontSize: 14,
                cursor: "pointer", textAlign: "left" }}>
              {r.label}<ArrowRight size={16} strokeWidth={1.5} style={{ color: "var(--muted)" }} />
            </button>
          ))}
        </div>
      )}
    </DesktopRahmen>
  );
}

function DesktopReset({ auth, email, setEmail, gesendet, onSenden, onZurueck }) {
  return (
    <DesktopRahmen>
      <button onClick={onZurueck} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 24, marginLeft: -4,
        padding: "0 4px", height: 28, background: "none", border: "none", color: "var(--text2)", fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>
        <ArrowLeft size={16} strokeWidth={1.5} /> Zur Anmeldung
      </button>
      <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 500 }}>Passwort zurücksetzen</h1>
      {gesendet ? (
        <p style={{ margin: "8px 0 0", color: "var(--text2)" }}>
          Falls zu {email} ein Konto existiert, kommt gleich eine E-Mail mit einem Link zum Zurücksetzen.
        </p>
      ) : (
        <>
          <p style={{ margin: "8px 0 32px", color: "var(--text2)" }}>Wir schicken dir einen Link an deine E-Mail-Adresse.</p>
          <Fehler text={auth.fehler} />
          <label style={feldLabel} htmlFor="reset-mail">E-Mail</label>
          <input id="reset-mail" className="anmelde-feld" type="email" autoComplete="email" autoFocus value={email}
            onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && onSenden()} style={feld} />
          <Hauptknopf aktiv={!!email && !auth.loading} onClick={onSenden}>
            {auth.loading ? "Wird gesendet" : <>Link senden <ArrowRight size={16} strokeWidth={1.5} /></>}
          </Hauptknopf>
        </>
      )}
    </DesktopRahmen>
  );
}

export function LoginScreen({ auth, onDemoLogin, onRegistrieren }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [zeigeReset, setZeigeReset] = useState(false);
  const [resetGesendet, setResetGesendet] = useState(false);
  const istDesktop = useIstDesktop();

  async function resetAnfordern() {
    if (!email) return;
    const ok = await auth.passwortVergessen(email);
    if (ok) setResetGesendet(true);
  }

  if (istDesktop && zeigeReset) return (
    <DesktopReset auth={auth} email={email} setEmail={setEmail} gesendet={resetGesendet} onSenden={resetAnfordern}
      onZurueck={() => { setZeigeReset(false); setResetGesendet(false); }} />
  );
  if (istDesktop) return (
    <DesktopAnmeldung auth={auth} onDemoLogin={onDemoLogin} email={email} setEmail={setEmail} password={password} setPassword={setPassword}
      showPw={showPw} setShowPw={setShowPw} onReset={() => setZeigeReset(true)} />
  );

  if (zeigeReset) {
    return (
      <div style={{ background:"var(--bg)", minHeight:"100dvh", display:"flex",
        flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"17px 20px",
        paddingTop:"calc(17px + env(safe-area-inset-top))",
        paddingBottom:"calc(17px + env(safe-area-inset-bottom))" }}>
        <div style={{ textAlign:"center", marginBottom:23 }}>
          <div style={{ fontWeight:900, fontSize:24, letterSpacing:-1, color:"var(--text)" }}>
            <span style={{ color:"var(--yellow)" }}>★</span> POLARIS
          </div>
        </div>
        <div style={{ background:"var(--surface)", borderRadius:20, padding:20,
          width:"100%", maxWidth:380, border:"1.5px solid var(--border)" }}>
          {!resetGesendet ? (
            <>
              <div style={{ color:"var(--text)", fontWeight:800, fontSize:18,
                marginBottom:6 }}>Passwort zurücksetzen</div>
              <div style={{ color:"var(--muted)", fontSize:13, marginBottom:14 }}>
                Gib deine E-Mail-Adresse ein — wir schicken dir einen Link zum
                Zurücksetzen deines Passworts.
              </div>
              {auth.fehler && (
                <div style={{ background:"var(--rbg)", color:"var(--red)",
                  borderRadius:10, padding:"7px 14px", marginBottom:12,
                  fontSize:13, border:"1px solid var(--red)",
                  display:"flex", alignItems:"center", gap:6 }}>
                  <CircleX size={14} /> {auth.fehler}
                </div>
              )}
              <div style={{ marginBottom:14 }}>
                <Label>E-Mail</Label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@firma.de" style={inputStyle()}
                  onKeyDown={e => e.key==="Enter" && resetAnfordern()} />
              </div>
              <button onClick={resetAnfordern} disabled={auth.loading || !email}
                style={{ width:"100%", background: email ? "var(--yellow)" : "var(--surface2)",
                  color: email ? "#1a1200" : "var(--muted)",
                  border:"none", borderRadius:12, padding:15, fontWeight:800,
                  fontSize:15, cursor: email ? "pointer" : "default", fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                {auth.loading ? "Wird gesendet…" : <>Link senden <ArrowRight size={15} /></>}
              </button>
            </>
          ) : (
            <div style={{ textAlign:"center" }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:9, color:"var(--muted)" }}><Mail size={40} /></div>
              <div style={{ color:"var(--text)", fontWeight:800, fontSize:16,
                marginBottom:6 }}>E-Mail gesendet!</div>
              <div style={{ color:"var(--muted)", fontSize:13, lineHeight:1.6 }}>
                Falls ein Konto mit dieser E-Mail existiert, erhältst du in
                Kürze einen Link zum Zurücksetzen deines Passworts.
              </div>
            </div>
          )}
          <div style={{ textAlign:"center", marginTop:16 }}>
            <button onClick={() => { setZeigeReset(false); setResetGesendet(false); }}
              style={{ background:"none", border:"none", color:"var(--muted)",
                cursor:"pointer", fontSize:13, fontFamily:"inherit",
                display:"inline-flex", alignItems:"center", gap:5 }}>
              <ArrowLeft size={13} /> Zurück zur Anmeldung
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:"var(--bg)", minHeight:"100dvh", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center",
      paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)",
      padding:"17px 20px" }}>

      {/* Logo */}
      <div style={{ textAlign:"center", marginBottom:29 }}>
        <div style={{ fontSize:56, marginBottom:9 }}>★</div>
        <div style={{ fontWeight:900, fontSize:32, letterSpacing:-2, color:"var(--text)" }}>
          <span style={{ color:"var(--yellow)" }}>★</span> POLARIS
        </div>
        <div style={{ fontSize:12, color:"var(--muted)", fontWeight:600,
          letterSpacing:3, textTransform:"uppercase", marginTop:4 }}>
          Baustellenmanagement
        </div>
      </div>

      {/* Login Card */}
      <div style={{ background:"var(--surface)", borderRadius:20, padding:20,
        width:"100%", maxWidth:380, border:"1.5px solid var(--border)",
        boxShadow:"0 8px 32px rgba(0,0,0,0.12)" }}>
        <div style={{ color:"var(--text)", fontWeight:800, fontSize:18,
          marginBottom:14 }}>Anmelden</div>

        {auth.fehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)",
            borderRadius:10, padding:"7px 14px", marginBottom:12,
            fontSize:13, border:"1px solid var(--red)",
            display:"flex", alignItems:"center", gap:6 }}>
            <CircleX size={14} /> {auth.fehler}
          </div>
        )}

        <div style={{ marginBottom:10 }}>
          <Label>E-Mail oder Benutzername</Label>
          <input type="text" autoCapitalize="none" autoCorrect="off" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="name@firma.de oder Benutzername" style={inputStyle()}
            onKeyDown={e => e.key==="Enter" && auth.anmelden(email, password)} />
        </div>

        <div style={{ marginBottom:7 }}>
          <Label>Passwort</Label>
          <div style={{ position:"relative" }}>
            <input type={showPw ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" style={{ ...inputStyle(), paddingRight:44 }}
              onKeyDown={e => e.key==="Enter" && auth.anmelden(email, password)} />
            <button onClick={() => setShowPw(p=>!p)}
              style={{ position:"absolute", right:12, top:"50%",
                transform:"translateY(-50%)", background:"none", border:"none",
                cursor:"pointer", color:"var(--muted)", display:"flex" }}>
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div style={{ textAlign:"right", marginBottom:14 }}>
          <button onClick={() => setZeigeReset(true)}
            style={{ background:"none", border:"none", color:"var(--muted)",
              cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
            Passwort vergessen?
          </button>
        </div>

        <button onClick={() => auth.anmelden(email, password)}
          disabled={auth.loading || !email || !password}
          style={{ width:"100%", background: email && password ? "var(--yellow)" : "var(--surface2)",
            color: email && password ? "#1a1200" : "var(--muted)",
            border:"none", borderRadius:12, padding:16, fontWeight:800,
            fontSize:16, cursor: email && password ? "pointer" : "default",
            fontFamily:"inherit",
            display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
          {auth.loading ? "Anmelden…" : <>Anmelden <ArrowRight size={16} /></>}
        </button>

        {/* Demo-Modus wenn Supabase nicht konfiguriert */}
        {!auth.supabaseKonfiguriert && (
          <div style={{ marginTop:20, borderTop:"1px solid var(--border)", paddingTop:16 }}>
            <div style={{ color:"var(--muted)", fontSize:12, marginBottom:7, textAlign:"center" }}>
              Supabase nicht konfiguriert — Demo-Modus:
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {Object.entries(ROLLEN).map(([key, r]) => (
                <button key={key} onClick={() => onDemoLogin(key)}
                  style={{ background:"var(--surface2)", color:"var(--text)",
                    border:"1.5px solid var(--border)", borderRadius:10,
                    padding:"8px 10px", cursor:"pointer", fontFamily:"inherit",
                    fontSize:11, fontWeight:700, textAlign:"left" }}>
                  {r.icon} {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop:20, fontSize:12, color:"var(--muted)", textAlign:"center" }}>
        Zugangsdaten beim Administrator anfragen
      </div>
    </div>
  );
}
