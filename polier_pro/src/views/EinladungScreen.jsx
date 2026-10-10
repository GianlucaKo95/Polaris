import { useState, useEffect } from "react";
import { CircleX, ArrowRight, CircleCheckBig, PartyPopper, AtSign } from "lucide-react";
import { supabase, sbClientMitToken, sbSignIn, sbEinladungBenutzernameRegistrieren } from "../lib/supabase.js";
import { ROLLEN } from "../config/konstanten.js";
import { Label, inputStyle } from "../components/Label.jsx";

export function EinladungScreen({ token, onErfolg }) {
  const [einladung,    setEinladung]    = useState(null);
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [laden,        setLaden]        = useState(true);
  const [fehler,       setFehler]       = useState("");
  const [schritt,      setSchritt]      = useState(0); // 0=laden 1=registrieren 2=fertig

  useEffect(() => { pruefeToken(); }, [token]);

  async function pruefeToken() {
    // Läuft über eine SECURITY DEFINER-RPC (nicht mehr über eine offene
    // SELECT-Policy): so kann ein anonymer Client nur genau die Einladung
    // zu einem bekannten Token abrufen, statt alle aktiven Einladungen
    // aller Firmen auflisten zu können. _v3 liefert zusätzlich zugangsart
    // und benutzername (den der Admin in EinladungGenerieren.jsx festgelegt
    // hat) — v1/v2 bleiben unverändert bestehen (ungenutzt), weil eine
    // zusätzliche Rückgabespalte ein DROP FUNCTION vor dem Neuanlegen
    // verlangt hätte, das über das Migrations-Tool dieser Session nie
    // durchlief (Timeout, vermutlich eine nie beantwortete
    // Bestätigungs-Hürde für destruktive Statements).
    const { data, error } = await supabase.rpc("einladung_pruefen_v3", { p_token: token });
    const row = data?.[0];
    if (!error && row) {
      setEinladung({
        token: row.token, email: row.email, benutzername: row.benutzername, rolle: row.rolle,
        firma_id: row.firma_id, kolonne_id: row.kolonne_id,
        zugangsart: row.zugangsart || "email",
        firmen: { name: row.firma_name, logo_url: row.firma_logo_url },
      });
      setEmail(row.email || "");
      setSchritt(1);
    } else {
      setFehler("Diese Einladung ist ungültig oder abgelaufen.");
    }
    setLaden(false);
  }

  async function registrierenUndEinloesen() {
    if (!email || !password || password.length < 6) {
      setFehler("Bitte E-Mail und Passwort eingeben (min. 6 Zeichen)."); return;
    }
    setLaden(true); setFehler("");

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });

    // Wenn das Supabase-Projekt "Confirm email" verlangt (Standardeinstellung),
    // liefert signUp() keinen sofort nutzbaren Session zurück — der Account
    // existiert, kann sich aber erst nach Bestätigung einloggen. Vorher
    // versuchte der Code hier direkt signInWithPassword(), was in diesem Fall
    // mit "Email not confirmed" fehlschlägt und fälschlich als falsches
    // Passwort angezeigt wurde. Deshalb: signUp()-Session direkt verwenden,
    // wenn vorhanden — sonst erst dann signInWithPassword versuchen (deckt
    // den Fall ab, dass der Account schon vorher bestand) und bei einem
    // "email not confirmed"-Fehler die tatsächliche Ursache benennen.
    let loginSession = signUpData?.session || null;

    if (!loginSession) {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        if (loginError.message?.toLowerCase().includes("email not confirmed")) {
          setFehler("Bitte bestätige zuerst deine E-Mail-Adresse (Link in deinem Postfach) und öffne diesen Einladungslink danach erneut.");
        } else if (signUpError) {
          setFehler(signUpError.message || "Registrierung fehlgeschlagen.");
        } else {
          setFehler("Anmeldung fehlgeschlagen. Passwort korrekt?");
        }
        setLaden(false); return;
      }
      loginSession = loginData.session;
    }

    if (!loginSession?.access_token) {
      setFehler("Anmeldung fehlgeschlagen.");
      setLaden(false); return;
    }

    const session = {
      access_token:  loginSession.access_token,
      refresh_token: loginSession.refresh_token,
      expires_in:    loginSession.expires_in,
      user:          loginSession.user,
    };

    // Einladung einlösen
    const client = sbClientMitToken(session);
    const { data: result, error: rpcError } = await client.rpc("einladung_einloesen_v2", {
      p_token: token, p_user_id: session.user?.id, p_benutzername: null,
    });

    if (!rpcError && result?.ok) {
      erfolgreichAngemeldet(session);
    } else {
      setFehler(result?.fehler || "Einladung konnte nicht eingelöst werden.");
    }
    setLaden(false);
  }

  function erfolgreichAngemeldet(session) {
    localStorage.setItem("polaris-session", JSON.stringify(session));
    setSchritt(2);
    setTimeout(() => onErfolg?.(), 2000);
  }

  // Zugangsart="benutzername": der Benutzername steht schon fest (vom
  // Administrator in EinladungGenerieren.jsx vergeben, siehe einladung.
  // benutzername) — hier wird nur noch ein Passwort gewählt. Kein
  // signUp()/signInWithPassword() im Client wie oben — die Edge Function
  // legt das Konto bereits sofort bestätigt an (siehe
  // sbEinladungBenutzernameRegistrieren) und löst die Einladung gleich
  // mit ein. Der Client muss sich danach nur noch mit der zurückgegebenen
  // synthetischen Adresse ganz normal einloggen.
  async function benutzernameRegistrierenUndEinloesen() {
    if (!password || password.length < 6) {
      setFehler("Bitte ein Passwort mit mindestens 6 Zeichen eingeben.");
      return;
    }
    setLaden(true); setFehler("");

    const reg = await sbEinladungBenutzernameRegistrieren(token, password);
    if (!reg.ok) {
      setFehler(reg.fehler || "Registrierung fehlgeschlagen.");
      setLaden(false);
      return;
    }

    const login = await sbSignIn(reg.email, password);
    if (login.error) {
      setFehler("Konto wurde angelegt, Anmeldung ist aber fehlgeschlagen. Bitte erneut versuchen.");
      setLaden(false);
      return;
    }

    erfolgreichAngemeldet({
      access_token: login.access_token, refresh_token: login.refresh_token,
      expires_in: login.expires_in, user: login.user,
    });
    setLaden(false);
  }

  if (laden && schritt === 0) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      minHeight:"100dvh", background:"var(--bg)", color:"var(--muted)",
      fontFamily:"inherit",
      paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)" }}>
      Einladung wird geprüft…
    </div>
  );

  return (
    <div style={{ background:"var(--bg)", minHeight:"100dvh",
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"17px 20px",
      paddingTop:"calc(17px + env(safe-area-inset-top))",
      paddingBottom:"calc(17px + env(safe-area-inset-bottom))" }}>

      <div style={{ fontWeight:900, fontSize:24, letterSpacing:-1,
        color:"var(--text)", marginBottom:17, textAlign:"center" }}>
        <span style={{ color:"var(--yellow)" }}>★</span> POLARIS
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

        {schritt === 1 && einladung && (
          <div>
            <div style={{ textAlign:"center", marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:6, color:"var(--yellow)" }}><PartyPopper size={34} /></div>
              <div style={{ fontWeight:800, fontSize:18, color:"var(--text)" }}>
                Du wurdest eingeladen!
              </div>
              <div style={{ color:"var(--text2)", fontSize:13, marginTop:6 }}>
                Tritt <strong>{einladung.firmen?.name}</strong> als{" "}
                <strong>{ROLLEN[einladung.rolle]?.label}</strong> bei.
              </div>
            </div>

            {einladung.zugangsart === "benutzername" ? (
              <>
                <div style={{ marginBottom:10 }}>
                  <Label>Dein Benutzername</Label>
                  <div style={{ ...inputStyle(), display:"flex", alignItems:"center", gap:7,
                    color:"var(--text2)", background:"var(--surface2)" }}>
                    <AtSign size={14} /> {einladung.benutzername || "—"}
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <Label>Passwort wählen</Label>
                  <input type="password" value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" style={inputStyle()} />
                </div>
                <button onClick={benutzernameRegistrierenUndEinloesen} disabled={laden}
                  style={{ width:"100%", background:"var(--yellow)", color:"#1a1200",
                    border:"none", borderRadius:12, padding:15, fontWeight:800,
                    fontSize:15, cursor:"pointer", fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                  {laden ? "…" : <>Einladung annehmen <ArrowRight size={15} /></>}
                </button>
              </>
            ) : (
              <>
                <div style={{ marginBottom:10 }}>
                  <Label>E-Mail</Label>
                  <input type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="deine@email.de" style={inputStyle()} />
                </div>
                <div style={{ marginBottom:14 }}>
                  <Label>Passwort wählen</Label>
                  <input type="password" value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" style={inputStyle()} />
                </div>
                <button onClick={registrierenUndEinloesen} disabled={laden}
                  style={{ width:"100%", background:"var(--yellow)", color:"#1a1200",
                    border:"none", borderRadius:12, padding:15, fontWeight:800,
                    fontSize:15, cursor:"pointer", fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                  {laden ? "…" : <>Einladung annehmen <ArrowRight size={15} /></>}
                </button>
              </>
            )}
          </div>
        )}

        {schritt === 2 && (
          <div style={{ textAlign:"center" }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:9, color:"var(--green)" }}><CircleCheckBig size={40} /></div>
            <div style={{ fontWeight:800, fontSize:18, color:"var(--green)" }}>
              Willkommen im Team!
            </div>
            <div style={{ color:"var(--muted)", fontSize:13, marginTop:8 }}>
              Du wirst weitergeleitet…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
