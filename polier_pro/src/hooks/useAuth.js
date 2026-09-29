import { useState, useEffect } from "react";
import { sbGetProfile, supabase, sbSignIn, sbSignOut, SUPABASE_URL } from "../lib/supabase.js";
import { ROLLEN } from "../config/konstanten.js";

export function useAuth() {
  const [session, setSession]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("polaris-session") || "null"); } catch { return null; }
  });
  const [profil,      setProfil]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [fehler,      setFehler]      = useState("");
  const [inviteToken,        setInviteToken]        = useState(null);
  const [inviteRefreshToken, setInviteRefreshToken] = useState(null);
  const [inviteType,         setInviteType]         = useState(null);

  // Supabase Invite/Recovery Token aus URL Hash lesen
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.replace("#", "?"));
    const token   = params.get("access_token");
    const refresh = params.get("refresh_token");
    const type    = params.get("type"); // invite | recovery | signup
    if (token && (type === "invite" || type === "recovery" || type === "signup")) {
      setInviteToken(token);
      setInviteRefreshToken(refresh || null);
      setInviteType(type);
      // Hash aus URL entfernen
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Lädt das Profil zur aktuellen Session. Schlägt der Check nur wegen eines
  // Netzwerkfehlers/Timeouts fehl (sessionUngueltig:false), wird die Session
  // NICHT beendet — stattdessen in Kürze erneut versucht. Nur ein vom Server
  // bestätigtes 401 (Token wirklich abgelehnt) führt zum Abmelden. Ohne diese
  // Unterscheidung würde jedes Funkloch auf der Baustelle wie ein Logout wirken.
  useEffect(() => {
    if (!session?.access_token) return;
    let abgebrochen = false;
    let retryTimer;

    async function ladeProfil() {
      const { profil: p, sessionUngueltig } = await sbGetProfile(session.access_token, session.user?.id);
      if (abgebrochen) return;
      if (p) { setProfil(p); return; }
      if (sessionUngueltig) {
        localStorage.removeItem("polaris-session");
        setSession(null);
        return;
      }
      retryTimer = setTimeout(ladeProfil, 5000);
    }
    ladeProfil();

    return () => { abgebrochen = true; clearTimeout(retryTimer); };
  }, [session?.access_token]);

  // Automatischer Token-Refresh vor Ablauf (Supabase Tokens laufen nach 1h ab)
  useEffect(() => {
    if (!session?.refresh_token) return;
    let abgebrochen = false;
    let timer;

    async function refreshSession() {
      try {
        const { data, error } = await supabase.auth.refreshSession({
          refresh_token: session.refresh_token,
        });
        if (abgebrochen) return;
        if (!error && data.session?.access_token) {
          const neueSession = {
            access_token:  data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in:    data.session.expires_in,
            user:          data.user,
          };
          localStorage.setItem("polaris-session", JSON.stringify(neueSession));
          setSession(neueSession);
          return;
        }
        if (error?.status === 400 || error?.status === 401) {
          // Refresh-Token vom Server wirklich abgelehnt (widerrufen/ungültig) — abmelden.
          localStorage.removeItem("polaris-session");
          setSession(null);
          setProfil(null);
          return;
        }
        // Sonstiger Fehler (Netzwerk, 5xx) — Session behalten, in Kürze erneut
        // versuchen statt den Nutzer bei einer vorübergehenden Störung auszuloggen.
        timer = setTimeout(refreshSession, 30 * 1000);
      } catch {
        if (!abgebrochen) timer = setTimeout(refreshSession, 30 * 1000);
      }
    }

    // Supabase Tokens laufen typischerweise nach 3600s ab.
    // expires_in gibt die Gültigkeitsdauer in Sekunden an; wir erneuern 5 Minuten vorher.
    const expiresInMs = (session.expires_in || 3600) * 1000;
    const refreshInMs = Math.max(expiresInMs - 5 * 60 * 1000, 30 * 1000);
    timer = setTimeout(refreshSession, refreshInMs);
    return () => { abgebrochen = true; clearTimeout(timer); };
  }, [session?.access_token, session?.refresh_token]);

  // Bei Wiederherstellung des Tabs (App aus Hintergrund geholt): Session prüfen —
  // aber nur bei einem bestätigten 401 abmelden, nicht bei einem bloßen
  // Netzwerkfehler direkt nach dem Aufwecken (z.B. WLAN noch nicht reconnected).
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible" && session?.access_token) {
        sbGetProfile(session.access_token, session.user?.id).then(({ sessionUngueltig }) => {
          if (sessionUngueltig) {
            localStorage.removeItem("polaris-session");
            setSession(null);
            setProfil(null);
          }
        });
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [session?.access_token]);

  // 401-Handler: bei ungültigem Token die Session verifizieren bevor abgemeldet wird.
  // Ein einzelner fehlgeschlagener Request (z.B. RLS-Policy verweigert Zugriff auf
  // eine bestimmte Tabelle) ist kein Beweis dass die gesamte Session ungültig ist —
  // nur ein vom Server bestätigtes 401 beim Profil-Check rechtfertigt den Logout;
  // ein Netzwerkfehler beim Check selbst führt zu keiner Aktion.
  useEffect(() => {
    async function handleAuthInvalid() {
      if (!session?.access_token) return;
      const { sessionUngueltig } = await sbGetProfile(session.access_token, session.user?.id);
      if (sessionUngueltig) {
        localStorage.removeItem("polaris-session");
        setSession(null);
        setProfil(null);
        setFehler("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
      }
    }
    window.addEventListener("polaris-auth-invalid", handleAuthInvalid);
    return () => window.removeEventListener("polaris-auth-invalid", handleAuthInvalid);
  }, [session?.access_token]);

  async function anmelden(email, password) {
    setLoading(true); setFehler("");
    const data = await sbSignIn(email, password);
    if (data.access_token) {
      localStorage.setItem("polaris-session", JSON.stringify(data));
      setSession(data);
    } else {
      setFehler(data.error_description || data.msg || "Anmeldung fehlgeschlagen");
    }
    setLoading(false);
  }

  async function passwortVergessen(email) {
    setLoading(true); setFehler("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      setLoading(false);
      return !error;
    } catch {
      setFehler("Passwort-Reset konnte nicht angefordert werden.");
      setLoading(false);
      return false;
    }
  }

  async function passwortSetzen(password) {
    if (!inviteToken) return;
    setLoading(true); setFehler("");
    // auth.updateUser() braucht eine echte GoTrue-Session, nicht nur einen
    // REST-Authorization-Header wie ihn sbClientMitToken setzt — ohne
    // vorheriges setSession() kennt der Auth-Client keine Session und wirft
    // AuthSessionMissingError, das Passwort wird nie gesetzt.
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: inviteToken,
      refresh_token: inviteRefreshToken || "",
    });
    if (sessionError || !sessionData.session) {
      setFehler("Der Link ist abgelaufen oder ungültig. Bitte fordere einen neuen an.");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.auth.updateUser({ password });
    if (!error && data.user?.id) {
      const session = {
        access_token:  sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_in:    sessionData.session.expires_in,
        user:          data.user,
      };
      localStorage.setItem("polaris-session", JSON.stringify(session));
      setSession(session);
      setInviteToken(null);
      setInviteRefreshToken(null);
    } else {
      setFehler("Passwort konnte nicht gesetzt werden.");
    }
    setLoading(false);
  }

  async function abmelden() {
    if (session?.access_token) await sbSignOut(session.access_token);
    localStorage.removeItem("polaris-session");
    setSession(null); setProfil(null);
  }

  // Merged Felder direkt in den lokalen Profil-State, z.B. nachdem die PIN
  // oder pin_abgefragt serverseitig gespeichert wurde — ohne das würden
  // Änderungen aus MeinProfilView/ErstePinAbfrageScreen erst nach einem
  // Seiten-Reload sichtbar (App.jsx prüft z.B. profil.pin für die Sperre).
  function profilAktualisieren(felder) {
    setProfil(p => p ? { ...p, ...felder } : p);
  }

  const rolle = profil?.rolle || null;
  const rolleConfig = rolle ? ROLLEN[rolle] : null;

  // Fallback: wenn Supabase nicht konfiguriert → Demo-Modus
  const supabaseKonfiguriert = !SUPABASE_URL.includes("DEIN");

  return { session, profil, rolle, rolleConfig, loading, fehler,
    anmelden, abmelden, profilAktualisieren, supabaseKonfiguriert,
    inviteToken, inviteType, passwortSetzen, passwortVergessen };
}
