import React, { useState, useEffect, useRef } from "react";
import { Bell, LogOut, Plus, MapPin, Hash, TriangleAlert, LayoutGrid,
  CircleCheckBig, NotebookPen, Users, Clock, Ellipsis, ChevronRight,
  Building2, Calendar, Euro, CloudSun, ChartColumn, FileText, Settings,
  UserCog, RefreshCw, User, Sparkles, FlaskConical, Check } from "lucide-react";
import { useTheme } from "./hooks/useTheme.js";
import { useAuth } from "./hooks/useAuth.js";
import { useBackButton } from "./hooks/useBackButton.js";
import { DEFAULT_EINHEITSPREISE, DEFAULT_LV_VORLAGEN, ONBOARDING_KEY, ROLLEN, PROJEKTTYPEN } from "./config/konstanten.js";
import { usePWA } from "./hooks/usePWA.js";
import { usePushNotifications } from "./hooks/usePushNotifications.js";
import { useOfflineSync } from "./hooks/useOfflineSync.js";
import { sbClientMitToken, SUPABASE_URL, sbAufgabeSpeichern, sbAufgabeLoeschen, sbAufgabeVorschlagen, sbAufgabeVorschlagEntscheiden, sbBerichtSpeichern, sbKolonneSpeichern, sbKolonneLoeschen, sbFirmaParameterSpeichern, sbAngebotSpeichern } from "./lib/supabase.js";
import { PasswortSetzenScreen } from "./views/PasswortSetzenScreen.jsx";
import { ErstePinAbfrageScreen } from "./views/ErstePinAbfrageScreen.jsx";
import { EinladungScreen } from "./views/EinladungScreen.jsx";
import { KundenportalScreen } from "./views/KundenportalScreen.jsx";
import { RegistrierungScreen } from "./views/RegistrierungScreen.jsx";
import { LoginScreen } from "./views/LoginScreen.jsx";
import { PinSperreScreen } from "./views/PinSperreScreen.jsx";
import { RollenBadge } from "./components/RollenBadge.jsx";
import { ThemeToggle } from "./components/ThemeToggle.jsx";
import { StempeluhrView } from "./views/StempeluhrView.jsx";
import { OnboardingFlow } from "./views/OnboardingFlow.jsx";
import { ProjektFormular } from "./views/ProjektFormular.jsx";
import { Chip } from "./components/Chip.jsx";
import { FirmenView } from "./views/FirmenView.jsx";
import { SupervisorShell } from "./views/SupervisorShell.jsx";
import { FirmaGesperrtScreen } from "./views/FirmaGesperrtScreen.jsx";
import { Aktenregister } from "./components/Aktenregister.jsx";
import { ProjektInfoStrip } from "./components/ProjektInfoStrip.jsx";
import { PlanGuard } from "./views/PlanGuard.jsx";
import { DashboardView } from "./views/DashboardView.jsx";
import { GanttView } from "./views/GanttView.jsx";
import { WeatherView } from "./views/WeatherView.jsx";
import { KolonnenView } from "./views/KolonnenView.jsx";
import { TagesbuchView } from "./views/TagesbuchView.jsx";
import { AufgabenView } from "./views/AufgabenView.jsx";
import { KiFrageView } from "./views/KiFrageView.jsx";
import { SimulationView } from "./views/SimulationView.jsx";
import { KostenView } from "./views/KostenView.jsx";
import { StundenExportView } from "./views/StundenExportView.jsx";
import { AngebotView } from "./views/AngebotView.jsx";
import { AdminParameterView } from "./views/AdminParameterView.jsx";
import { NutzerVerwaltungView } from "./views/NutzerVerwaltungView.jsx";
import { MeinProfilView } from "./views/MeinProfilView.jsx";
import { PWABanner } from "./components/PWABanner.jsx";
import { PushBanner } from "./components/PushBanner.jsx";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { fehler: null };
  }
  static getDerivedStateFromError(fehler) {
    return { fehler };
  }
  componentDidCatch(fehler, info) {
    // In Produktion könnte hier ein Fehler-Tracking-Dienst angebunden werden.
    // Aktuell bewusst ohne externen Dienst — nur Konsole für lokales Debugging.
    console.error("Polaris Rendering-Fehler:", fehler, info?.componentStack);
  }
  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <div style={{ background:"var(--bg, #0B1120)", minHeight:"100dvh",
        display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", padding:17, textAlign:"center" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:"#F5C400" }}><TriangleAlert size={40} /></div>
        <div style={{ color:"#fff", fontWeight:800, fontSize:18,
          marginBottom:6 }}>
          Etwas ist schiefgelaufen
        </div>
        <div style={{ color:"#8B9EC8", fontSize:13, marginBottom:17,
          maxWidth:340, lineHeight:1.5 }}>
          Ein unerwarteter Fehler ist aufgetreten. Deine Daten sind sicher
          gespeichert — ein Neuladen behebt das Problem meistens.
        </div>
        <button onClick={() => window.location.reload()}
          style={{ background:"#F5C400", color:"#1a1200", border:"none",
            borderRadius:12, padding:"14px 28px", fontWeight:800,
            fontSize:15, cursor:"pointer", fontFamily:"inherit",
            display:"flex", alignItems:"center", gap:8 }}>
          <RefreshCw size={15} /> Seite neu laden
        </button>
        {this.state.fehler?.message && (
          <div style={{ color:"#5A6B8C", fontSize:11, marginTop:20,
            maxWidth:320, wordBreak:"break-word" }}>
            {this.state.fehler.message}
          </div>
        )}
      </div>
    );
  }
}

// Sortier-Optionen für "Meine Baustellen" — "zuletzt" lässt die Reihenfolge
// unverändert, da projekte bereits mit created_at.desc von Supabase kommt.
const PROJEKT_SORT_OPTIONEN = [
  { id:"zuletzt", label:"Zuletzt" },
  { id:"name",    label:"Name (A–Z)" },
  { id:"nummer",  label:"Baustellen-Nr." },
];

export default function PolierApp() {
  const theme   = useTheme();
  const auth    = useAuth();
  const [projekte,      setProjekte]    = useState([]);
  const [projekteLaden, setProjekteLaden] = useState(false);
  const [projekteLadeFehler, setProjekteLadeFehler] = useState("");
  const [speicherFehler, setSpeicherFehler] = useState("");

  // ── App-Sperre (PIN) ── Hooks müssen vor jedem bedingten return stehen
  // (Rules of Hooks), deshalb hier ganz oben statt erst beim eigentlichen
  // Einsatz weiter unten.
  const [gesperrt,        setGesperrt]        = useState(false);
  const [pinGeprueftFuer, setPinGeprueftFuer]  = useState(null);
  const versteckSeit = useRef(null);

  const [aktivId,       setAktivId]     = useState(null);
  const [tab,           setTab]         = useState("dashboard");

  // Browser-Zurück mit Baustellen-/Tab-Navigation verbinden — bisher gab es
  // gar kein history.pushState() in der App, ein Klick auf den Browser-
  // Zurück-Pfeil verließ deshalb sofort die Seite statt einen Tab oder die
  // Baustelle zurückzuwechseln. Jede Änderung von aktivId/tab legt jetzt
  // einen Verlaufseintrag an; popstate (Browser-Zurück, Android-Geste)
  // stellt den vorherigen Stand direkt wieder her, ohne die App zu verlassen.
  const historyBereitRef = useRef(false);
  const historySkipRef   = useRef(false);

  useEffect(() => {
    function aufPopState(e) {
      const s = e.state || {};
      historySkipRef.current = true;
      setAktivId(s.aktivId ?? null);
      setTab(s.tab ?? "dashboard");
    }
    window.addEventListener("popstate", aufPopState);
    return () => window.removeEventListener("popstate", aufPopState);
  }, []);

  useEffect(() => {
    if (!historyBereitRef.current) {
      // Erster Lauf: aktuellen Stand ersetzen statt einen Eintrag anlegen —
      // sonst wäre der allererste Zurück-Klick wirkungslos.
      window.history.replaceState({ aktivId, tab }, "");
      historyBereitRef.current = true;
      return;
    }
    if (historySkipRef.current) { historySkipRef.current = false; return; }
    window.history.pushState({ aktivId, tab }, "");
  }, [aktivId, tab]);

  const [aufgabenFilter,setAufgabenFilter] = useState("alle"); // für Dashboard-Sprungziele
  const [aufgabenEditId,setAufgabenEditId] = useState(null);   // Sprung aus Terminplan direkt in eine Aufgabe
  const [zeigeMehr,     setZeigeMehr]    = useState(false);
  const [mehrDragY,     setMehrDragY]    = useState(0);
  const [mehrDragging,  setMehrDragging] = useState(false);
  const mehrDragStartY  = useRef(null);
  const [sbConnected,   setSbConn]      = useState(false);
  const [neuProjekt,    setNeuProjekt]  = useState(false);
  const [editProjekt,   setEditProjekt] = useState(false);
  useBackButton(neuProjekt,  () => setNeuProjekt(false));
  useBackButton(editProjekt, () => setEditProjekt(false));
  const [eigeneFirma,   setEigeneFirma] = useState({ name:"", strasse:"", plz:"", ort:"", telefon:"", email:"", geschaeftsfuehrer:"", steuernummer:"", gewerke:[], logo:null, pin_pflicht:false });
  const [subs,          setSubs]        = useState([]);
  const [homeTab,       setHomeTab]     = useState("projekte");
  const [projektSort,       setProjektSort]       = useState("zuletzt");
  const [projektSortOffen,  setProjektSortOffen]  = useState(false);
  const projektSortRef = useRef(null);
  // Dropdown bei Klick außerhalb schließen — muss vor jedem bedingten
  // return stehen (Rules of Hooks), auch wenn das Dropdown selbst nur auf
  // dem Dashboard ohne aktives Projekt sichtbar ist.
  useEffect(() => {
    if (!projektSortOffen) return;
    function handleClick(e) {
      if (projektSortRef.current && !projektSortRef.current.contains(e.target)) {
        setProjektSortOffen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [projektSortOffen]);
  const [zeitbuchungen, setZeitbuchungen] = useState([]);
  const [einheitspreise,setEinheitspreise]= useState(DEFAULT_EINHEITSPREISE);
  const [lvVorlagen,    setLvVorlagen]    = useState(DEFAULT_LV_VORLAGEN);
  const [angebotVorlage,setAngebotVorlage]= useState(null);
  const [tagebuchVorlage,setTagebuchVorlage]= useState(null);
  // Verhindert, dass der initiale Ladevorgang der Parameter aus Supabase
  // (setzt dieselben Werte, die gerade erst von dort kamen) sie sofort
  // wieder zurückschreibt, bevor der Nutzer überhaupt etwas geändert hat.
  const [parameterGeladen, setParameterGeladen] = useState(false);
  const pwa  = usePWA();
  const push = usePushNotifications(projekte, eigeneFirma);
  const offline = useOfflineSync(pwa.online === false ? false : true, sbConnected);

  // Onboarding: gilt als abgeschlossen wenn entweder localStorage es sagt
  // ODER der eingeloggte Nutzer in Supabase bereits einer Firma zugeordnet ist.
  // localStorage allein reicht nicht — bei neuem Gerät/Browser/gelöschtem Cache
  // würde die App sonst fälschlich erneut das Onboarding zeigen, obwohl in der
  // Datenbank längst eine Firma für diesen Nutzer existiert (führt zu
  // wiederholt angelegten Firmen für denselben Account).
  const [onboardingLocal, setOnboardingLocal] = useState(
    () => !!localStorage.getItem(ONBOARDING_KEY)
  );
  const onboardingDone = onboardingLocal || !!auth.profil?.firma_id;

  function setOnboardingDone(val) {
    if (val) localStorage.setItem(ONBOARDING_KEY, "1");
    else localStorage.removeItem(ONBOARDING_KEY);
    setOnboardingLocal(val);
  }

  const [zeigeRegistrierung, setZeigeRegistrierung] = useState(false);
  const [firma,              setFirma]              = useState(null);

  // Einladungs-Token aus URL erkennen (sicher)
  const einladungsToken = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("einladung")
    : null;

  // Kundenportal-Token aus URL erkennen — komplett unabhängig von Login/
  // Session, da der Bauherr keinen Account hat.
  const kundenportalToken = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("kunde")
    : null;

  // Firma laden wenn eingeloggt — und lokalen eigeneFirma-State (der für
  // PDFs, Onboarding-Anzeige etc. verwendet wird) mit den echten Daten
  // aus der firmen-Tabelle synchronisieren. Ohne dieses Mapping blieb
  // eigeneFirma dauerhaft leer und die App zeigte "Firma hinterlegen"
  // trotz bereits vorhandener Firma in der Datenbank.
  const [firmaLadeFehler, setFirmaLadeFehler] = useState("");
  useEffect(() => {
    // ist_supervisor lädt bewusst keine Firmendaten, selbst wenn das Profil
    // (wie gk@koeven.de) daneben noch firma_id/rolle für die eigene Firma
    // trägt — firma/projekte/subs usw. bleiben dadurch durchgängig leer,
    // nicht nur die SupervisorShell-Weiche in der Render-Logik unten.
    if (auth.profil?.ist_supervisor) return;
    if (auth.profil?.firma_id && auth.session?.access_token) {
      setFirmaLadeFehler("");
      const client = sbClientMitToken(auth.session);
      // Explizite Spaltenliste statt select("*") — anthropic_api_key bewusst
      // ausgeschlossen, damit der KI-Key nie in den Client-State (firma/
      // eigeneFirma) gelangt. Er wird ausschließlich serverseitig in der
      // ki-proxy Edge Function gelesen (siehe supabase/functions/ki-proxy).
      //
      // plan/plan_status/trial_ends_at/plan_ends_at fehlten hier bisher
      // komplett — PlanGuard.jsx weiter unten liest exakt diese vier Felder
      // von firma, um eine abgelaufene Testphase oder ein inaktives Abo zu
      // sperren. Ohne sie war firma.plan im Client immer undefined, die
      // Sperr-Bedingung (firma.plan === "trial" && trial_ends_at < jetzt)
      // also nie erfüllbar — eine abgelaufene Testphase (z.B. Musterbau
      // GmbH (Demo), trial_ends_at 24.09.) sperrte dadurch nie tatsächlich,
      // unabhängig vom echten Datenbankstand.
      client.from("firmen").select("id, name, adresse, plz, ort, telefon, email, steuernummer, logo_url, geschaeftsfuehrer, gewerke, einheitspreise, lv_vorlagen, angebot_vorlage, tagebuch_vorlage, pin_pflicht, gesperrt, plan, plan_status, trial_ends_at, plan_ends_at, max_baustellen, stripe_customer_id, stripe_subscription_id")
        .eq("id", auth.profil.firma_id)
        .then(({ data: d, error, status }) => {
          if (error) {
            setFirmaLadeFehler(`Firma konnte nicht geladen werden (HTTP ${status}): ${error.message?.slice(0,200) || ""}`);
            return;
          }
          if (d?.[0]) {
            setFirma(d[0]);
            setEigeneFirma(prev => ({
              ...prev,
              name:              d[0].name || "",
              strasse:           d[0].adresse || "",
              plz:               d[0].plz || "",
              ort:               d[0].ort || "",
              telefon:           d[0].telefon || "",
              email:             d[0].email || "",
              steuernummer:      d[0].steuernummer || "",
              logo:              d[0].logo_url || null,
              geschaeftsfuehrer: d[0].geschaeftsfuehrer || "",
              gewerke:           d[0].gewerke || [],
              pin_pflicht:       d[0].pin_pflicht || false,
            }));
            // Leere Liste = neue Firma, die noch nie eigene Parameter
            // gespeichert hat → sinnvolle Beispieldaten statt leerer Liste.
            setEinheitspreise(d[0].einheitspreise?.length ? d[0].einheitspreise : DEFAULT_EINHEITSPREISE);
            setLvVorlagen(d[0].lv_vorlagen?.length ? d[0].lv_vorlagen : DEFAULT_LV_VORLAGEN);
            setAngebotVorlage(d[0].angebot_vorlage || null);
            setTagebuchVorlage(d[0].tagebuch_vorlage || null);
            setParameterGeladen(true);
          } else {
            setFirmaLadeFehler(`Keine Firma mit ID ${auth.profil.firma_id} gefunden — profile.firma_id zeigt ins Leere.`);
          }
        }).catch(e => {
          setFirmaLadeFehler("Netzwerkfehler beim Laden der Firma: " + e.message);
        });
    }
  }, [auth.profil?.firma_id, auth.session?.access_token]);

  // Subunternehmer aus Supabase laden, sobald die Firma bekannt ist — vorher
  // existierten sie nur im Browser-State (setSubs wurde nie mit der DB
  // verbunden, obwohl die Tabelle längst existierte).
  useEffect(() => {
    if (!firma?.id || !auth.session?.access_token) return;
    const client = sbClientMitToken(auth.session);
    client.from("subunternehmer").select("*").eq("firma_id", firma.id)
      .then(({ data }) => { if (Array.isArray(data)) setSubs(data); });
  }, [firma?.id, auth.session?.access_token]);

  // Einheitspreise/LV-Vorlagen nach jeder Änderung in der Firma persistieren.
  useEffect(() => {
    if (!parameterGeladen || !firma?.id || !auth.session?.access_token) return;
    sbFirmaParameterSpeichern(firma.id, einheitspreise, lvVorlagen, angebotVorlage, tagebuchVorlage, auth.session);
  }, [einheitspreise, lvVorlagen, angebotVorlage, tagebuchVorlage]);

  // Projekte aus Supabase laden, sobald die Firma bekannt ist.
  // Ohne dies existierten Baustellen nur im Browser-Speicher — Neuladen,
  // Gerätewechsel oder Cache-Verlust hätte alle Baustellen gelöscht.
  useEffect(() => {
    if (!firma?.id || !auth.session?.access_token) return;
    setProjekteLaden(true);
    setProjekteLadeFehler("");
    const client = sbClientMitToken(auth.session);
    client.from("projekte").select("*").eq("firma_id", firma.id)
      .eq("archiviert", false).order("created_at", { ascending: false })
      .then(({ data, error, status }) => {
        if (error) {
          setProjekteLadeFehler(`Baustellen konnten nicht geladen werden (HTTP ${status}): ${error.message?.slice(0,200) || ""}`);
          setProjekteLaden(false);
          return;
        }
        if (Array.isArray(data)) {
          setProjekte(data.map(p => ({
            id: p.id, name: p.name, adresse: p.adresse, plz: p.plz, ort: p.ort,
            projektnummer: p.projektnummer, bauleiter: p.bauleiter,
            auftraggeber: p.auftraggeber, typ: p.typ, farbe: p.farbe,
            firma_id: p.firma_id, budget_positionen: p.budget_positionen, stundensatz: p.stundensatz,
          })));
        }
        setProjekteLaden(false);
      }).catch(e => {
        setProjekteLadeFehler("Netzwerkfehler beim Laden der Baustellen: " + e.message);
        setProjekteLaden(false);
      });
  }, [firma?.id, auth.session?.access_token]);

  // Supabase-Verbindungsstatus — MUSS vor allen early returns stehen (Rules of Hooks)
  useEffect(() => {
    if (SUPABASE_URL.includes("DEIN")) { setSbConn(false); return; }
    setSbConn(true);
  }, []);

  // Aufgaben, Kolonnen und Berichte sind normalisierte, eigenständige
  // Tabellen (nicht mehr im Projekt-Objekt verschachtelt) — bei jedem
  // Wechsel der aktiven Baustelle neu aus Supabase laden.
  const [aktProjektAufgaben,  setAktProjektAufgaben]  = useState([]);
  const [aktProjektKolonnen,  setAktProjektKolonnen]  = useState([]);
  const [aktProjektBerichte,  setAktProjektBerichte]  = useState([]);
  const [aktProjektKommentare, setAktProjektKommentare] = useState([]);
  const [aktProjektAngebote,  setAktProjektAngebote]  = useState([]);
  const [projektDatenLaden,   setProjektDatenLaden]   = useState(false);
  const [projektDatenFehler,  setProjektDatenFehler]  = useState("");

  useEffect(() => {
    if (!aktivId || !auth.session?.access_token) {
      setAktProjektAufgaben([]); setAktProjektKolonnen([]); setAktProjektBerichte([]);
      setAktProjektAngebote([]); setAktProjektKommentare([]);
      setZeitbuchungen([]);
      return;
    }
    let abgebrochen = false;
    setProjektDatenLaden(true);
    setProjektDatenFehler("");

    const client = sbClientMitToken(auth.session);

    Promise.all([
      client.from("aufgaben").select("*").eq("projekt_id", aktivId).order("created_at", { ascending: false }),
      client.from("kolonnen").select("*").eq("projekt_id", aktivId).order("created_at", { ascending: true }),
      client.from("tagesberichte").select("*").eq("projekt_id", aktivId).order("datum", { ascending: false }),
      client.from("zeitbuchungen").select("*").eq("projekt_id", aktivId),
      client.from("angebote").select("*").eq("projekt_id", aktivId).order("created_at", { ascending: false }),
      // Für den KI-Projektkontext (baueProjektKontext in lib/ai.js) — nur die
      // letzten 40, sonst wächst der Prompt mit jedem weiteren Kommentar
      // unbegrenzt. aufgaben!inner filtert serverseitig auf diese Baustelle,
      // statt erst alle Kommentare der Firma zu laden und clientseitig zu sieben.
      client.from("aufgaben_kommentare")
        .select("*, aufgaben!inner(projekt_id, titel), autor:erstellt_von(vorname, nachname)")
        .eq("aufgaben.projekt_id", aktivId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]).then(([aRes, kRes, bRes, zRes, anRes, koRes]) => {
      if (abgebrochen) return;
      const fehler = [];
      if (aRes.error) fehler.push(`Aufgaben: ${aRes.error.message}`);
      if (kRes.error) fehler.push(`Kolonnen: ${kRes.error.message}`);
      if (bRes.error) fehler.push(`Berichte: ${bRes.error.message}`);
      if (zRes.error) fehler.push(`Zeiterfassung: ${zRes.error.message}`);
      if (anRes.error) fehler.push(`Angebote: ${anRes.error.message}`);
      if (fehler.length) {
        setProjektDatenFehler("Projektdaten konnten nicht vollständig geladen werden: " + fehler.join(", "));
      }

      setAktProjektAufgaben(aRes.data || []);
      setAktProjektKolonnen(kRes.data || []);
      setAktProjektBerichte(bRes.data || []);
      setZeitbuchungen(zRes.data || []);
      setAktProjektAngebote(anRes.data || []);
      // Kommentar-Query bewusst nicht in die fehler-Liste oben aufgenommen und
      // bei Fehler einfach als leer behandelt — sie füttert nur den optionalen
      // KI-Kontext, ein Fehlschlag dort darf das Laden der Kernprojektdaten
      // (Aufgaben/Kolonnen/Berichte) nicht als Fehler anzeigen.
      setAktProjektKommentare(koRes.error ? [] : (koRes.data || []));
      setProjektDatenLaden(false);
    }).catch(e => {
      if (abgebrochen) return;
      setProjektDatenFehler("Netzwerkfehler beim Laden der Projektdaten: " + e.message);
      setProjektDatenLaden(false);
    });

    return () => { abgebrochen = true; };
  }, [aktivId, auth.session?.access_token]);

  // ── Demo-Rolle (ohne Supabase) ──
  const demoRolle = localStorage.getItem("polaris-demo-rolle");
  const aktiveProfil = auth.profil || (demoRolle ? {
    id: "demo", vorname: "Demo",
    nachname: ROLLEN[demoRolle]?.label || demoRolle,
    rolle: demoRolle, kolonne_id: demoRolle === "vorarbeiter" ? 1 : null,
  } : null);
  const aktiveRolle  = aktiveProfil?.rolle || null;
  const rolleConfig  = aktiveRolle ? ROLLEN[aktiveRolle] : null;

  // Erstmaliges Sperren nach Login/App-Start, sobald ein Profil mit
  // hinterlegter PIN feststeht (pro Profil nur einmal, nicht bei jedem
  // Re-Render).
  useEffect(() => {
    if (!aktiveProfil?.pin) return;
    if (pinGeprueftFuer === aktiveProfil.id) return;
    setGesperrt(true);
    setPinGeprueftFuer(aktiveProfil.id);
  }, [aktiveProfil?.id, aktiveProfil?.pin, pinGeprueftFuer]);

  // Erneut sperren, wenn die App länger im Hintergrund war (Tab/App
  // gewechselt, Bildschirm gesperrt) — kurze Wechsel (z.B. eine
  // Berechtigungs-Abfrage) lösen bewusst keine Sperre aus.
  useEffect(() => {
    function beiSichtbarkeitswechsel() {
      if (document.hidden) {
        versteckSeit.current = Date.now();
      } else if (versteckSeit.current) {
        const dauerMs = Date.now() - versteckSeit.current;
        versteckSeit.current = null;
        if (dauerMs > 30000 && aktiveProfil?.pin) setGesperrt(true);
      }
    }
    document.addEventListener("visibilitychange", beiSichtbarkeitswechsel);
    return () => document.removeEventListener("visibilitychange", beiSichtbarkeitswechsel);
  }, [aktiveProfil?.pin]);

  // ── Kundenportal (öffentlich, ohne Login) ──
  if (kundenportalToken) {
    return <KundenportalScreen token={kundenportalToken} />;
  }

  // ── Passwort-Setzen nach Einladung ──
  if (auth.inviteToken) {
    return <PasswortSetzenScreen auth={auth} type={auth.inviteType} />;
  }

  // ── Einladungs-Screen ──
  // Läuft IMMER wenn ein Einladungs-Token in der URL steht — auch wenn im
  // selben Browser noch eine andere Sitzung (z.B. der Admin, der die
  // Einladung erstellt hat) aktiv ist. Vorher wurde der Screen mit
  // "&& !aktiveProfil" übersprungen, sobald jemand eingeloggt war: der
  // Einladungslink öffnete dann einfach die normale App im Kontext des
  // bereits eingeloggten Nutzers, statt das Registrierungsformular zu
  // zeigen — der neue Nutzer wurde nie angelegt.
  if (einladungsToken) {
    return <EinladungScreen
      token={einladungsToken}
      onErfolg={() => {
        window.history.replaceState({}, "", window.location.pathname);
        window.location.reload();
      }}
    />;
  }

  // ── Registrierungs-Screen ──
  if (zeigeRegistrierung) {
    return <RegistrierungScreen
      auth={auth}
      onZurueck={() => setZeigeRegistrierung(false)}
    />;
  }

  // ── Login Screen ──
  if (!aktiveProfil) {
    return <LoginScreen
      auth={auth}
      onDemoLogin={rolle => {
        localStorage.setItem("polaris-demo-rolle", rolle);
        window.location.reload();
      }}
      onRegistrieren={() => setZeigeRegistrierung(true)}
    />;
  }

  async function abmelden() {
    localStorage.removeItem("polaris-demo-rolle");
    // WICHTIG: auth.abmelden() ist async (wartet auf sbSignOut + löscht
    // localStorage danach). Ohne await läuft window.location.reload()
    // bereits BEVOR die Session aus dem localStorage entfernt wurde —
    // die neu geladene Seite findet die alte Session dann sofort wieder
    // und meldet automatisch erneut an.
    await auth.abmelden?.();
    window.location.reload();
  }

  // ── Supervisor: komplett eigene, isolierte Ansicht ──
  // "Der Supervisor soll Zugriff auf keine Unternehmen haben. Er ist nur
  // zur Verwaltung da. Er soll auch nur diese Fenster sehen." — kommt
  // deshalb bewusst VOR jeder firma-/projekt-bezogenen Weiche (PIN-Abfrage,
  // Onboarding, Gesperrt-Screen, PlanGuard, normale Baustellen-Ansicht).
  // gk@koeven.de bleibt dabei weiterhin administrator mit firma_id 1 in der
  // profile-Zeile (für den Fall, dass ist_supervisor je zurückgenommen
  // wird), aber SOLANGE ist_supervisor true ist, wird keine dieser anderen
  // Ansichten je erreicht — unabhängig von rolle/firma_id auf dem Profil.
  if (auth.profil?.ist_supervisor) {
    return <SupervisorShell session={auth.session} onAbmelden={abmelden} />;
  }

  // ── App-Sperre ── vor allem anderen (auch vor der Facharbeiter-Ansicht),
  // damit eine hinterlegte PIN wirklich jede Ansicht abdeckt.
  if (gesperrt && aktiveProfil?.pin) {
    return <PinSperreScreen profil={aktiveProfil}
      onEntsperrt={() => setGesperrt(false)}
      onAbmelden={abmelden} />;
  }

  // ── Erste PIN-Abfrage ── einmalig direkt nach der ersten Anmeldung (echter
  // Login, kein Demo-Modus) für alle Rollen außer Administrator. War die
  // PIN-Pflicht vom Administrator aktiviert, wird der Screen bei jedem Login
  // erneut gezeigt, bis eine PIN gesetzt ist — sonst nur einmal (Feld
  // pin_abgefragt merkt sich das dauerhaft). Wartet auf firma?.id, damit
  // pin_pflicht sicher bekannt ist, bevor entschieden wird ob übersprungen
  // werden darf.
  if (auth.profil && auth.profil.rolle !== "administrator" && !auth.profil.pin && firma?.id
      && (firma.pin_pflicht || !auth.profil.pin_abgefragt)) {
    return <ErstePinAbfrageScreen profil={auth.profil} session={auth.session}
      pflicht={!!firma.pin_pflicht}
      onFertig={felder => auth.profilAktualisieren(felder)} />;
  }

  // ── Facharbeiter → nur Stempeluhr ──
  async function handleOnboardingComplete(firmaDaten, ersterPolier) {
    setEigeneFirma(prev => ({ ...prev, ...firmaDaten }));

    // Falls echter Supabase-Login vorliegt (kein Demo-Modus): Firma jetzt
    // WIRKLICH in der Datenbank anlegen, sonst geht die Zuordnung beim
    // nächsten Login verloren und das Onboarding beginnt erneut von vorn.
    if (auth.session?.access_token && !auth.profil?.firma_id) {
      try {
        const client = sbClientMitToken(auth.session);
        const { data: neueFirmaId, error } = await client.rpc("firma_registrieren", {
          p_user_id:    auth.session.user?.id,
          p_firma_name: firmaDaten?.name || "Meine Firma",
          p_email:      auth.session.user?.email || "",
        });
        // firma_registrieren speichert absichtlich nur Name/E-Mail (schlanke
        // RPC-Signatur) — alles andere, was der Onboarding-Assistent erfragt
        // hat (Adresse, Gewerke, KI-Recherche-Ergebnisse …), sonst wortlos
        // verloren ginge es hier per Update nach, statt nur lokal im State
        // zu stehen und beim gleich folgenden Reload zu verschwinden.
        if (!error && neueFirmaId) {
          await client.from("firmen").update({
            name:              firmaDaten?.name || "",
            adresse:           firmaDaten?.strasse || "",
            plz:               firmaDaten?.plz || "",
            ort:               firmaDaten?.ort || "",
            telefon:           firmaDaten?.telefon || "",
            email:             firmaDaten?.email || "",
            steuernummer:      firmaDaten?.steuernummer || "",
            logo_url:          firmaDaten?.logo || null,
            geschaeftsfuehrer: firmaDaten?.geschaeftsfuehrer || "",
            gewerke:           firmaDaten?.gewerke || [],
          }).eq("id", neueFirmaId);
        }
        if (!error) {
          setOnboardingDone(true);
          // auth.profil kennt die neue firma_id erst nach einem frischen
          // Profil-Fetch. useAuth lädt das Profil beim Mounten anhand des
          // Tokens neu — ein Reload ist der zuverlässigste Weg, damit
          // auth.profil.firma_id ab sofort korrekt gesetzt ist.
          window.location.reload();
          return;
        }
      } catch {
        // Bei Netzwerkfehler bleibt Onboarding zumindest lokal abgeschlossen;
        // die Firma kann bei Bedarf später über den Registrierungs-Flow nachgeholt werden.
      }
    }

    setOnboardingDone(true);
    // neuProjekt wird im Home-Screen durch leere Projektliste gezeigt
  }

  // Onboarding anzeigen wenn noch nicht abgeschlossen

  if (!onboardingDone) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} session={auth.session} onAbmelden={abmelden} />;
  }

  // Zugangssperre durch den Supervisor (firmen.gesperrt) — siehe
  // FirmaGesperrtScreen.jsx für die Begründung, warum das hier aktiv
  // abgefangen wird statt die App einfach mit leeren Projekt-/Aufgaben-
  // listen weiterlaufen zu lassen.
  if (firma?.gesperrt) {
    return <FirmaGesperrtScreen onAbmelden={abmelden} rolle={aktiveRolle} />;
  }

  const projekt = projekte.find(p => p.id === aktivId) || null;

  // Projekt-Daten updaten
  function updateProjekt(id, changes) {
    setProjekte(prev => prev.map(p => p.id===id ? { ...p, ...changes } : p));
  }


  const felder    = aktProjektAufgaben;
  const berichte  = aktProjektBerichte;
  const kolonnen  = aktProjektKolonnen;
  const angebote  = aktProjektAngebote;

  // Angebot speichern (neu oder Änderung) — direkt gegen Supabase, dann
  // lokalen State nachziehen. Analog zu setFelder/sbAufgabeSpeichern unten,
  // nur ohne Offline-Queue, da Angebote (anders als Aufgaben) admin-only
  // und nicht baustellen-typisch offline erfasst werden.
  async function angebotSpeichern(a, istNeu) {
    const gespeichert = await sbAngebotSpeichern(a, aktivId, auth.session, istNeu);
    if (!gespeichert) return null;
    setAktProjektAngebote(prev => istNeu
      ? [gespeichert, ...prev]
      : prev.map(x => x.id === gespeichert.id ? gespeichert : x));
    return gespeichert;
  }

  // ── Aufgaben: laden + speichern direkt gegen Supabase ──
  async function setFelder(fn) {
    const neu = typeof fn === "function" ? fn(felder) : fn;
    // Diff bestimmen: was ist neu, was geändert, was gelöscht
    const alteIds = new Set(felder.map(a => a.id));
    const neueIds = new Set(neu.map(a => a.id));

    setSpeicherFehler("");
    let fehlermeldung = "";
    const gespeichert = [];
    for (const a of neu) {
      const istNeu = !alteIds.has(a.id) || typeof a.id !== "number" || a.id > 1e12;
      const { daten, fehler } = await sbAufgabeSpeichern(a, aktivId, auth.session, istNeu);
      if (!daten) { fehlermeldung = fehlermeldung || fehler; gespeichert.push(a); continue; }
      // Nach einem Insert die client-seitige Date.now()-ID durch die echte
      // Server-ID ersetzen — sonst hält sie jede Folge-Bearbeitung weiter
      // für "neu" (id > 1e12) und erzeugt bei jedem Speichern einen neuen
      // Datensatz statt eines Updates (genau der Kolonnen-Vervielfachungs-Bug).
      gespeichert.push(istNeu ? { ...a, id: daten.id } : a);
    }
    for (const alteId of alteIds) {
      if (!neueIds.has(alteId)) await sbAufgabeLoeschen(alteId, auth.session);
    }
    setAktProjektAufgaben(gespeichert);
    // Die lokale Ansicht wird trotzdem aktualisiert (kein Datenverlust in der
    // UI), aber der Nutzer erfährt, dass die Änderung nicht auf dem Server
    // angekommen ist — vorher wurde ein fehlgeschlagenes Speichern still als
    // Erfolg behandelt. Die Meldung kommt jetzt konkret vom Server (z.B.
    // "Keine Berechtigung für diese Aktion"), statt pauschal auf die
    // Verbindung zu verweisen — das war bei RLS-Ablehnungen irreführend.
    if (fehlermeldung) setSpeicherFehler(`Eine Aufgabe konnte nicht gespeichert werden: ${fehlermeldung}`);
  }

  // Facharbeiter schlagen eine Aufgabe nur als erledigt vor (Status
  // "zur_pruefung"); Vorarbeiter/Polier/Administrator bestätigen oder lehnen
  // ab. Läuft über eigene RPCs statt sbAufgabeSpeichern — ein Facharbeiter
  // hat kein UPDATE-Recht auf die aufgaben-Tabelle, und ein normaler
  // Full-Row-Save würde an der RLS scheitern.
  async function aufgabeVorschlagen(a, behebungFotos = null) {
    setSpeicherFehler("");
    const { ok, fehler } = await sbAufgabeVorschlagen(a.id, auth.session, behebungFotos);
    if (!ok) { setSpeicherFehler(fehler || "Vorschlag konnte nicht gespeichert werden."); return; }
    setAktProjektAufgaben(prev => prev.map(x => x.id === a.id
      ? { ...x, status:"zur_pruefung", vorschlag_von: auth.session?.user?.id, vorschlag_am: new Date().toISOString(),
          behebung_fotos: behebungFotos ?? x.behebung_fotos }
      : x));
  }

  async function aufgabeEntscheiden(a, akzeptiert) {
    setSpeicherFehler("");
    const { ok, fehler } = await sbAufgabeVorschlagEntscheiden(a.id, akzeptiert, auth.session);
    if (!ok) { setSpeicherFehler(fehler || "Entscheidung konnte nicht gespeichert werden."); return; }
    setAktProjektAufgaben(prev => prev.map(x => x.id === a.id
      ? { ...x, status: akzeptiert ? "abgeschlossen" : "offen", vorschlag_von:null, vorschlag_am:null }
      : x));
  }

  // ── Berichte: laden + speichern direkt gegen Supabase ──
  async function setBerichte(fn) {
    const neu = typeof fn === "function" ? fn(berichte) : fn;
    const alteIds = new Set(berichte.map(b => b.id));
    setSpeicherFehler("");
    let fehlermeldung = "";
    for (const b of neu) {
      if (!alteIds.has(b.id)) {
        const { daten, fehler } = await sbBerichtSpeichern(b, aktivId, auth.session);
        if (!daten) fehlermeldung = fehlermeldung || fehler;
      }
    }
    setAktProjektBerichte(neu);
    if (fehlermeldung) setSpeicherFehler(`Der Tagesbericht konnte nicht gespeichert werden: ${fehlermeldung}`);
  }

  // ── Kolonnen: laden + speichern direkt gegen Supabase ──
  async function setKolonnen(fn) {
    const neu = typeof fn === "function" ? fn(kolonnen) : fn;
    const alteIds = new Set(kolonnen.map(k => k.id));
    const neueIds = new Set(neu.map(k => k.id));

    setSpeicherFehler("");
    let fehlermeldung = "";
    const gespeichert = [];
    for (const k of neu) {
      const istNeu = !alteIds.has(k.id) || typeof k.id !== "number" || k.id > 1e12;
      const { daten, fehler } = await sbKolonneSpeichern(k, aktivId, auth.session, istNeu);
      if (!daten) { fehlermeldung = fehlermeldung || fehler; gespeichert.push(k); continue; }
      // Nach einem Insert die client-seitige Date.now()-ID durch die echte
      // Server-ID ersetzen — sonst hält sie jede Folge-Bearbeitung (z.B.
      // "Mitarbeiter hinzufügen") weiter für "neu" (id > 1e12) und erzeugt
      // bei jedem Speichern einen weiteren Datensatz statt eines Updates.
      // Das war der Grund für die Kolonnen-Vervielfachung im UI.
      gespeichert.push(istNeu ? { ...k, id: daten.id } : k);
    }
    if (fehlermeldung) setSpeicherFehler(`Eine Kolonne konnte nicht gespeichert werden: ${fehlermeldung}`);
    for (const alteId of alteIds) {
      if (!neueIds.has(alteId)) await sbKolonneLoeschen(alteId, auth.session);
    }
    setAktProjektKolonnen(gespeichert);
  }

  async function handleSaveProjekt(p) {
    const istNeu = !projekte.find(x => x.id === p.id);
    const payload = {
      firma_id:      firma?.id,
      name:          p.name || "",
      adresse:       p.adresse || "",
      plz:           p.plz || "",
      ort:           p.ort || "",
      projektnummer: p.projektnummer || "",
      bauleiter:     p.bauleiter || "",
      auftraggeber:  p.auftraggeber || "",
      typ:           p.typ || "hochbau",
      farbe:         p.farbe || "#F5C400",
    };

    // Ohne Firma (z.B. Demo-Modus ohne echten Login, ODER weil die Firma
    // noch nicht fertig geladen wurde) NICHT lautlos nur lokal speichern —
    // das sah für den Nutzer aus wie ein erfolgreiches Speichern, obwohl
    // in Supabase nichts ankam. Bei echtem Login mit fehlender firma?.id
    // ist das ein klarer Fehlerfall, kein Demo-Fallback.
    if (!auth.session?.access_token) {
      // Wirklich kein Login (Demo-Modus) → lokal ist hier korrekt und erwartet
      if (istNeu) setProjekte(prev => [...prev, p]);
      else setProjekte(prev => prev.map(x => x.id===p.id ? p : x));
      setNeuProjekt(false); setEditProjekt(false);
      if (!aktivId) setAktivId(p.id);
      return;
    }
    if (!firma?.id) {
      // Echter Login, aber Firma ist noch nicht geladen — häufigste Ursache:
      // direkt nach Firmenregistrierung ist der firma-State im Root-App
      // noch nicht synchronisiert (der Lade-Effect braucht einen Moment).
      setProjekteLadeFehler(
        "Deine Firma wurde noch nicht vollständig geladen. Bitte warte einen Moment und versuche es erneut — falls das Problem bestehen bleibt, lade die Seite neu."
      );
      return;
    }

    try {
      const client = sbClientMitToken(auth.session);
      const query = istNeu
        ? client.from("projekte").insert(payload).select()
        : client.from("projekte").update(payload).eq("id", p.id).select();
      const { data, error, status } = await query;
      if (error) {
        setProjekteLadeFehler(`Baustelle konnte nicht gespeichert werden (HTTP ${status}): ${error.message?.slice(0,200) || ""}`);
        return;
      }
      const gespeichert = data?.[0];
      if (gespeichert) {
        const normalisiert = {
          id: gespeichert.id, name: gespeichert.name, adresse: gespeichert.adresse,
          plz: gespeichert.plz, ort: gespeichert.ort, projektnummer: gespeichert.projektnummer,
          bauleiter: gespeichert.bauleiter, auftraggeber: gespeichert.auftraggeber,
          typ: gespeichert.typ, farbe: gespeichert.farbe,
        };
        if (istNeu) setProjekte(prev => [...prev, normalisiert]);
        else setProjekte(prev => prev.map(x => x.id===p.id ? normalisiert : x));
        setNeuProjekt(false); setEditProjekt(false);
        if (!aktivId) setAktivId(normalisiert.id);

        // Im Formular ausgewählte Polier-Zuweisung in projekt_zugriff
        // übernehmen — auf polierOptionenIds eingegrenzt (die im Formular
        // geladene Liste aller Polier-Nutzer), damit hier nie versehentlich
        // ein Zugriff einer anderen Rolle auf dieses Projekt entfernt wird.
        if (Array.isArray(p.polierIds) && Array.isArray(p.polierOptionenIds)) {
          try {
            const sollIds = new Set(p.polierIds);
            const { data: bestehend } = await client.from("projekt_zugriff")
              .select("profil_id").eq("projekt_id", gespeichert.id)
              .in("profil_id", p.polierOptionenIds);
            const bestehendeIds = new Set((bestehend || []).map(z => z.profil_id));
            const hinzuzufuegen = p.polierOptionenIds.filter(id => sollIds.has(id) && !bestehendeIds.has(id));
            const zuEntfernen   = [...bestehendeIds].filter(id => !sollIds.has(id));
            await Promise.all([
              ...(hinzuzufuegen.length
                ? [client.from("projekt_zugriff").insert(hinzuzufuegen.map(id => ({ profil_id:id, projekt_id:gespeichert.id })))]
                : []),
              ...zuEntfernen.map(id => client.from("projekt_zugriff").delete().eq("profil_id", id).eq("projekt_id", gespeichert.id)),
            ]);
          } catch (e) {
            // Baustelle ist bereits gespeichert — nur die Zugriffsvergabe
            // separat melden, statt das als kompletten Speicherfehler
            // darzustellen (das würde einen erfolgreichen Save verschleiern).
            setProjekteLadeFehler("Baustelle gespeichert, aber Polier-Zugriff konnte nicht aktualisiert werden: " + e.message);
          }
        }
      }
    } catch (e) {
      setProjekteLadeFehler("Netzwerkfehler beim Speichern der Baustelle: " + e.message);
    }
  }

  // ── Home Screen (Baustellen + Firmen) ──
  if (!aktivId) {

    // Baustelle anlegen → direkt Formular zeigen
    if (neuProjekt) {
      return (
        <ProjektFormular
          subs={subs}
          onSave={handleSaveProjekt}
          onClose={() => setNeuProjekt(false)}
          speicherFehler={projekteLadeFehler}
          session={auth.session}
          istAdmin={aktiveRolle === "administrator"}
        />
      );
    }

    const verzugGesamt = projekte.reduce((s,p) => {
      const eltern = (p.felder||[]).filter(f=>!f.parentId);
      return s + eltern.filter(f=>f.status!=="done" && f.geplant && new Date(f.geplant)<new Date()).length;
    }, 0);

    // Nur für die Anzeige sortieren, "projekte" selbst bleibt unangetastet
    // (andere Stellen wie der Stempeln-Tab verlassen sich auf projekte[0]
    // als Default-Auswahl). .sort() ist stabil, "zuletzt" behält also die
    // von Supabase gelieferte created_at.desc-Reihenfolge einfach bei.
    const projekteSortiert = [...projekte].sort((a, b) => {
      if (projektSort === "name")   return (a.name||"").localeCompare(b.name||"", "de");
      if (projektSort === "nummer") return (a.projektnummer||"").localeCompare(b.projektnummer||"", "de", { numeric:true });
      return 0;
    });

    return (
      <>
        <div style={{ background:"var(--bg)", minHeight:"100dvh", color:"var(--text)" }}>

          {/* Header — dunkler Anker */}
          <div style={{ background:"var(--ink)", color:"#fff", padding:"20px 18px 0",
            paddingTop:"calc(20px + env(safe-area-inset-top))" }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:2.4,
                  textTransform:"uppercase", color:"var(--yellow)" }}>Polaris</div>
                <div style={{ fontSize:25, fontWeight:800, letterSpacing:-0.8,
                  marginTop:6, lineHeight:1.1 }}>
                  Moin{aktiveProfil?.vorname ? `, ${aktiveProfil.vorname}` : ""}
                </div>
                <div style={{ fontSize:12.5, color:"var(--ink-text2)", marginTop:2 }}>
                  {new Date().toLocaleDateString("de-DE", { weekday:"long", day:"2-digit", month:"long" })}
                </div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <ThemeToggle dark={theme.dark} toggle={theme.toggle} />
                <div style={{ width:40, height:40, background:"rgba(255,255,255,.08)",
                  display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
                  <Bell size={18} />
                  {(firmaLadeFehler || projekteLadeFehler) && (
                    <div style={{ position:"absolute", top:9, right:10, width:7, height:7,
                      background:"var(--yellow)", borderRadius:"50%" }} />
                  )}
                </div>
                <button onClick={abmelden} title="Abmelden"
                  style={{ width:40, height:40, background:"rgba(255,255,255,.08)", border:"none",
                    color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                  <LogOut size={17} />
                </button>
              </div>
            </div>

            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <RollenBadge rolle={aktiveRolle} />
            </div>

            {/* Stat-Streifen */}
            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <div style={{ flex:1, background:"rgba(255,255,255,.07)", padding:"9px 14px",
                borderLeft:"3px solid var(--yellow)" }}>
                <div className="num" style={{ fontSize:24, fontWeight:800, lineHeight:1 }}>{projekte.length}</div>
                <div style={{ fontSize:10.5, color:"var(--ink-text2)", fontWeight:700, marginTop:3 }}>
                  {projekte.length === 1 ? "Baustelle" : "Baustellen"}
                </div>
              </div>
              <div style={{ flex:1, background:"rgba(255,255,255,.07)", padding:"9px 14px",
                borderLeft:`3px solid ${verzugGesamt > 0 ? "#EF4444" : "#22C55E"}` }}>
                <div className="num" style={{ fontSize:24, fontWeight:800, lineHeight:1 }}>{verzugGesamt}</div>
                <div style={{ fontSize:10.5, color:"var(--ink-text2)", fontWeight:700, marginTop:3 }}>Verzug</div>
              </div>
            </div>

            {/* Home Tabs — kein "Supervisor"-Tab mehr hier: ein
                ist_supervisor-Profil erreicht diese Ansicht serverseitig gar
                nicht mehr, siehe SupervisorShell-Weiche weiter oben in
                App.jsx ("Der Supervisor soll Zugriff auf keine Unternehmen
                haben, nur diese Fenster sehen"). */}
            <div style={{ display:"flex", gap:22, marginTop:18 }}>
              {[["projekte","Baustellen"],["firmen","Unternehmen"]]
                .map(([id,label]) => (
                <button key={id} onClick={() => setHomeTab(id)}
                  style={{ background:"none", border:"none", cursor:"pointer",
                    padding:"0 0 10px", fontFamily:"inherit", fontSize:13, fontWeight:700,
                    color: homeTab===id ? "#fff" : "var(--ink-text2)",
                    borderBottom:`3px solid ${homeTab===id ? "var(--yellow)" : "transparent"}` }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding:"18px 14px 100px" }}>
            {firmaLadeFehler && (
              <div style={{ background:"var(--rbg)", color:"var(--red)",
                padding:"9px 16px", marginBottom:10, fontSize:12,
                border:"1px solid var(--red)" }}>
                {firmaLadeFehler}
              </div>
            )}

            {projekteLadeFehler && (
              <div style={{ background:"var(--rbg)", color:"var(--red)",
                padding:"9px 16px", marginBottom:10, fontSize:12,
                border:"1px solid var(--red)" }}>
                {projekteLadeFehler}
              </div>
            )}

            {homeTab === "projekte" && (
              <>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:9 }}>
                  <div style={{ color:"var(--text)", fontWeight:800, fontSize:13 }}>
                    Meine Baustellen
                  </div>
                  <div style={{ position:"relative" }} ref={projektSortRef}>
                    <button onClick={() => setProjektSortOffen(o => !o)}
                      style={{ display:"flex", alignItems:"center", gap:5, color:"var(--muted)",
                        fontSize:12, fontWeight:600, background:"none", border:"none",
                        padding:0, cursor:"pointer", fontFamily:"inherit" }}>
                      <Ellipsis size={14} />
                      {PROJEKT_SORT_OPTIONEN.find(o => o.id===projektSort)?.label}
                    </button>
                    {projektSortOffen && (
                      <div style={{ position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:20,
                        background:"var(--surface)", border:"1px solid var(--border)",
                        minWidth:160, boxShadow:"0 4px 16px rgba(0,0,0,.18)" }}>
                        {PROJEKT_SORT_OPTIONEN.map(o => (
                          <div key={o.id}
                            onClick={() => { setProjektSort(o.id); setProjektSortOffen(false); }}
                            style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                              gap:10, padding:"10px 12px", cursor:"pointer", fontSize:12.5,
                              fontWeight: projektSort===o.id ? 700 : 500,
                              color: projektSort===o.id ? "var(--text)" : "var(--muted)" }}>
                            {o.label}
                            {projektSort===o.id && <Check size={13} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {projekte.length === 0 && (
                  <div style={{ textAlign:"center", padding:"29px 20px",
                    color:"var(--muted)", fontSize:14 }}>
                    <Building2 size={44} style={{ marginBottom:12, opacity:0.5 }} />
                    <div style={{ fontWeight:700, color:"var(--text)", marginBottom:6 }}>
                      Noch keine Baustellen
                    </div>
                    <div style={{ marginBottom:14 }}>Leg deine erste Baustelle an um loszulegen.</div>
                    {auth.session?.access_token && !firma?.id ? (
                      <div style={{ color:"var(--muted)", fontSize:13 }}>
                        Firmendaten werden geladen…
                      </div>
                    ) : (
                      <button onClick={() => setNeuProjekt(true)}
                        style={{ background:"var(--yellow)", color:"#1a1200",
                          border:"none", padding:"14px 28px",
                          fontWeight:800, fontSize:16, cursor:"pointer",
                          fontFamily:"inherit" }}>
                        Erste Baustelle anlegen
                      </button>
                    )}
                  </div>
                )}

                {projekteSortiert.map(p => {
                  const eltern  = (p.felder||[]).filter(f=>!f.parentId);
                  const done    = eltern.filter(f=>f.status==="done").length;
                  const total   = eltern.length;
                  const pct     = total > 0 ? Math.round(done/total*100) : 0;
                  const delayed = eltern.filter(f=>f.status!=="done" && f.geplant && new Date(f.geplant)<new Date()).length;
                  return (
                    <div key={p.id} onClick={() => { setAktivId(p.id); setTab("dashboard"); }}
                      style={{ background:"var(--surface)",
                        border:"1px solid var(--border)", marginBottom:9, cursor:"pointer" }}>
                      <div style={{ height:4, background:p.farbe }} />
                      <div style={{ padding:"12px 18px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between",
                          alignItems:"flex-start", gap:10 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ color:"var(--text)", fontWeight:700,
                              fontSize:16.5, letterSpacing:-0.3 }}>{p.name}</div>
                            <div style={{ display:"flex", alignItems:"center", gap:5,
                              color:"var(--muted)", fontSize:12, marginTop:4 }}>
                              <MapPin size={13} />
                              {[p.adresse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                            </div>
                          </div>
                          {total > 0 && (
                            <div className="num" style={{ fontSize:22, fontWeight:800, color:"var(--text)", lineHeight:1 }}>
                              {pct}<span style={{ fontSize:13, color:"var(--muted)" }}>%</span>
                            </div>
                          )}
                        </div>

                        {total > 0 && (
                          <div style={{ height:6, background:"var(--surface2)", marginTop:12 }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:p.farbe,
                              transition:"width 0.5s" }} />
                          </div>
                        )}

                        <div style={{ display:"flex", gap:6, marginTop:12, flexWrap:"wrap" }}>
                          <Chip icon={PROJEKTTYPEN[p.typ]?.icon||"🏗️"} label={PROJEKTTYPEN[p.typ]?.label||p.typ} />
                          {p.projektnummer && <Chip icon={<Hash size={11} />} label={p.projektnummer} />}
                          {delayed > 0 && (
                            <div style={{ display:"flex", alignItems:"center", gap:5,
                              background:"var(--rbg)", color:"var(--red)", padding:"5px 9px",
                              fontSize:11, fontWeight:700 }}>
                              <TriangleAlert size={13} />{delayed} Verzug
                            </div>
                          )}
                        </div>
                        {total === 0 && (
                          <div style={{ color:"var(--muted)", fontSize:12,
                            marginTop:10 }}>Noch keine Felder angelegt</div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Neue Baustelle */}
                <div onClick={() => setNeuProjekt(true)}
                  style={{ border:"2px dashed var(--yellow)",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    padding:"12px", textAlign:"center", cursor:"pointer",
                    background:"var(--ybg)", color:"var(--ydark)",
                    fontWeight:700, fontSize:14 }}>
                  <Plus size={18} />Neue Baustelle
                </div>
              </>
            )}

            {homeTab === "firmen" && (
              <FirmenView
                owneFirma={eigeneFirma}
                setEigeneFirma={setEigeneFirma}
                subs={subs}
                setSubs={setSubs}
                onOnboardingReset={() => setOnboardingDone(false)}
                session={auth.session}
                firmaId={firma?.id}
              />
            )}
          </div>
        </div>

      </>
    );
  }

  // ── Projekt bearbeiten ──
  if (editProjekt && projekt) {
    return (
      <ProjektFormular
        initial={projekt}
        subs={subs}
        onSave={handleSaveProjekt}
        onClose={() => setEditProjekt(false)}
        speicherFehler={projekteLadeFehler}
        session={auth.session}
        istAdmin={aktiveRolle === "administrator"}
        firmaId={firma?.id}
        profil={aktiveProfil}
      />
    );
  }

  // ── Neue Baustelle (aus dem Aktenregister heraus aufrufbar) ──
  if (neuProjekt) {
    return (
      <ProjektFormular
        subs={subs}
        onSave={handleSaveProjekt}
        onClose={() => setNeuProjekt(false)}
        speicherFehler={projekteLadeFehler}
        session={auth.session}
        istAdmin={aktiveRolle === "administrator"}
      />
    );
  }

  // ── Baustellen-Ansicht ──
  // Rollenbasierte Tabs
  const ALLE_TABS = [
    { id:"dashboard",     icon:"📊",  label:"Übersicht",   rollen:["administrator","geschaeftsfuehrer","bauleiter","polier","vorarbeiter"] },
    { id:"aufgaben",      icon:"✅",  label:"Aufgaben",    rollen:["administrator","geschaeftsfuehrer","bauleiter","polier","vorarbeiter","facharbeiter"] },
    { id:"gantt",         icon:"📅",  label:"Zeitplan",    rollen:["administrator","geschaeftsfuehrer","bauleiter","polier"] },
    { id:"kosten",        icon:"💰",  label:"Kosten",      rollen:["administrator","geschaeftsfuehrer"] },
    { id:"wetter",        icon:"🌤️", label:"Wetter",      rollen:["administrator","geschaeftsfuehrer","bauleiter","polier","vorarbeiter"] },
    { id:"kolonnen",      icon:"👷",  label:"Kolonnen",    rollen:["administrator","geschaeftsfuehrer","bauleiter","polier","vorarbeiter"] },
    { id:"tagebuch",      icon:"📋",  label:"Tagebuch",    rollen:["administrator","geschaeftsfuehrer","polier"] },
    { id:"stempeln",      icon:"⏱️",  label:"Stempeln",    rollen:["administrator","polier","vorarbeiter","facharbeiter"] },
    { id:"stunden",       icon:"📊",  label:"Stunden",     rollen:["administrator","geschaeftsfuehrer","bauleiter","polier","vorarbeiter"] },
    { id:"ki_frage",      icon:"💬",  label:"KI fragen",   rollen:["administrator","geschaeftsfuehrer","bauleiter","polier"] },
    { id:"simulation",    icon:"🧪",  label:"Simulation",  rollen:["administrator","geschaeftsfuehrer","bauleiter","polier"] },
    { id:"angebot",       icon:"📄",  label:"Angebot",     rollen:["administrator","geschaeftsfuehrer"] },
    { id:"admin_params",  icon:"⚙️",  label:"Parameter",   rollen:["administrator"] },
    { id:"nutzer",        icon:"👥",  label:"Nutzer",      rollen:["administrator"] },
    // Fehlte bisher komplett in dieser Liste, obwohl ROLLEN.administrator.tabs
    // (konstanten.js) "firmen" längst als vorgesehenen Tab führt — dadurch
    // gab es innerhalb einer Baustelle überhaupt keinen Weg zu "Unternehmen"
    // mehr: homeTab==="firmen" (FirmenView) ist nur auf dem Übersicht-Screen
    // sichtbar (!aktivId), und nirgends in der App wird aktivId je wieder auf
    // null gesetzt, um dorthin zurückzukommen — nur der native Zurück-Button
    // (Browser/Android) tat das zufällig mit, in einer installierten iOS-PWA
    // ganz ohne Browser-Chrome also faktisch nie.
    { id:"firmen",        icon:"🏢",  label:"Unternehmen", rollen:["administrator"] },
    { id:"profil",        icon:"👤",  label:"Mein Profil", rollen:["geschaeftsfuehrer","bauleiter","polier","vorarbeiter","facharbeiter"] },
  ];
  const TABS = ALLE_TABS.filter(t => !aktiveRolle || t.rollen.includes(aktiveRolle));

  // ── Navigation gruppieren: Hauptfunktionen sichtbar, Rest unter "Mehr" ──
  const HAUPT_TAB_IDS = ["dashboard", "aufgaben", "tagebuch", "kolonnen", "stempeln"];
  let hauptTabs = TABS.filter(t => HAUPT_TAB_IDS.includes(t.id))
    .sort((a,b) => HAUPT_TAB_IDS.indexOf(a.id) - HAUPT_TAB_IDS.indexOf(b.id));
  let mehrTabs  = TABS.filter(t => !HAUPT_TAB_IDS.includes(t.id));
  // Ein "Mehr"-Menü mit nur einem Eintrag ist ein unnötiger Umweg (z.B.
  // Facharbeiter: dahinter versteckte sich bislang nur "Mein Profil") —
  // dann direkt in die Hauptleiste zeigen statt hinter einem Tippschritt.
  if (mehrTabs.length === 1) {
    hauptTabs = [...hauptTabs, ...mehrTabs];
    mehrTabs = [];
  }
  const aktivInMehr = mehrTabs.some(t => t.id === tab);
  const TAB_ICONS = { dashboard:LayoutGrid, aufgaben:CircleCheckBig, tagebuch:NotebookPen,
    kolonnen:Users, stempeln:Clock, gantt:Calendar, kosten:Euro, wetter:CloudSun,
    stunden:ChartColumn, angebot:FileText, admin_params:Settings, nutzer:UserCog, firmen:Building2, profil:User, ki_frage:Sparkles, simulation:FlaskConical };

  return (
    // position:fixed auf html/body war der Bug (siehe theme.css) — aber
    // eine weitere Lücke zur Referenz-PWA blieb: die hat zusätzlich
    // #root { height:100dvh } in ihrem globalen CSS, wir hatten height
    // bisher nur auf diesem Shell-Div selbst gesetzt, nie auf #root
    // (siehe theme.css). Jetzt exakt nachgezogen, statt auf einen anderen
    // Mechanismus (window.screen.height) auszuweichen.
    // Scroll-Eindämmung kommt allein über overscroll-behavior (html/body,
    // siehe theme.css) plus das eigene overflow:"hidden" hier.
    <div style={{ height:"100dvh", width:"100%",
      display:"flex", flexDirection:"column", overflow:"hidden",
      background:"var(--bg)", color:"var(--text)" }}>

      {/* ── TOP BAR — dunkler Anker ──
          Kein zusätzlicher Abstand über den Notch/Dynamic-Island-Bereich
          hinaus — jeder Pixel Platz zählt auf dem kleinen Bildschirm. */}
      <div style={{ background:"var(--ink)", padding:"13px 16px 0",
        paddingTop:"env(safe-area-inset-top)",
        flexShrink:0, zIndex:60 }}>
        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:7 }}>
          <div style={{ minWidth:0, flexShrink:1, overflow:"hidden" }}>
            <div style={{ fontWeight:800, fontSize:18, letterSpacing:-0.6,
              color:"#fff", lineHeight:1, whiteSpace:"nowrap" }}>
              <span style={{ color:"var(--yellow)" }}>★</span> POLARIS
            </div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
            <div style={{ width:8, height:8, borderRadius:4, flexShrink:0,
              background: sbConnected ? "#22C55E" : "var(--ink-text2)" }} />
            <RollenBadge rolle={aktiveRolle} />
            <ThemeToggle dark={theme.dark} toggle={theme.toggle} />
            <button onClick={abmelden}
              style={{ width:34, height:34, flexShrink:0,
                background:"rgba(255,255,255,.08)", border:"none", color:"#fff",
                cursor:"pointer", display:"flex",
                alignItems:"center", justifyContent:"center" }}
              title="Abmelden">
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* ── AKTENREGISTER ── */}
        <Aktenregister
          projekte={projekte}
          aktivId={aktivId}
          onSelect={id => { setAktivId(id); setTab("dashboard"); }}
          onNeu={() => setNeuProjekt(true)}
        />
      </div>

      {/* ── PROJEKT INFO STRIP — nur auf dem Dashboard, stört sonst nur ── */}
      {tab === "dashboard" && <ProjektInfoStrip projekt={projekt} aufgaben={felder}
        onEdit={rolleConfig?.kannBearbeiten !== false ? () => setEditProjekt(true) : undefined} />}

      {/* ── CONTENT — einziger scrollender Bereich ── */}
      <PlanGuard firma={firma} ressource="app" rolle={aktiveRolle} session={auth.session}>
      <div style={{ padding:"16px 14px 20px", background:"var(--bg)",
        flex:"1 1 0", minHeight:0, overflowY:"auto", WebkitOverflowScrolling:"touch",
        overscrollBehaviorY:"contain" }}>
        {tab === "dashboard" && (
          <PushBanner erlaubt={push.erlaubt} berechtigung={() => push.berechtigung(auth.session)} />
        )}
        {speicherFehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)",
            padding:"9px 16px", marginBottom:10, fontSize:12,
            border:"1px solid var(--red)", display:"flex",
            justifyContent:"space-between", alignItems:"center", gap:10 }}>
            <span>{speicherFehler}</span>
            <button onClick={() => setSpeicherFehler("")}
              style={{ background:"none", border:"none", color:"var(--red)",
                cursor:"pointer", fontSize:15, fontFamily:"inherit", flexShrink:0 }}>✕</button>
          </div>
        )}
        {tab === "dashboard" && <DashboardView aufgaben={felder} kolonnen={kolonnen} sbConnected={sbConnected} projekt={projekt}
            onNavigate={(tabId, filter) => {
              if (filter) setAufgabenFilter(filter);
              else setAufgabenFilter("alle");
              setTab(tabId);
            }} />}
        {tab === "gantt"     && <GanttView felder={felder}
            onAufgabeKlick={id => { setAufgabenEditId(id); setAufgabenFilter("alle"); setTab("aufgaben"); }} />}
        {tab === "wetter"    && <WeatherView ort={projekt?.ort} plz={projekt?.plz} projektId={projekt?.id} />}
        {tab === "kolonnen"  && <KolonnenView kolonnen={kolonnen} projekt={projekt} setKolonnen={setKolonnen}
            darfBearbeiten={rolleConfig?.kannBearbeiten !== false}
            kannKolonneLoeschen={rolleConfig?.kannKolonneLoeschen === true}
            profil={aktiveProfil} session={auth.session} />}
        {tab === "tagebuch"  && <TagesbuchView
            berichte={berichte} setBerichte={setBerichte} sbConnected={sbConnected}
            projekt={projekt} eigeneFirma={eigeneFirma} kolonnen={kolonnen}
            tagebuchVorlage={tagebuchVorlage}
            offlineSpeichern={offline.speichereOffline}
            aufgaben={felder} setAufgaben={setFelder}
            session={auth.session}
            onNavigate={(tabId, filter) => {
              if (filter) setAufgabenFilter(filter);
              else setAufgabenFilter("alle");
              setTab(tabId);
            }}
          />}
        {tab === "aufgaben"      && <AufgabenView aufgaben={felder} setAufgaben={setFelder} kolonnen={kolonnen} sbConnected={sbConnected} darfBearbeiten={rolleConfig?.kannAufgabenBearbeiten !== false} initialFilter={aufgabenFilter}
            initialEditId={aufgabenEditId}
            kannVorschlagen={["facharbeiter","vorarbeiter"].includes(aktiveRolle)}
            darfEntscheiden={["administrator","polier","bauleiter"].includes(aktiveRolle)}
            onVorschlagen={aufgabeVorschlagen} onEntscheiden={aufgabeEntscheiden}
            zeitbuchungen={zeitbuchungen} projekt={projekt}
            session={auth.session} firmaId={firma?.id} profil={aktiveProfil} />}
        {tab === "kosten"        && <KostenView projekt={projekt} aufgaben={felder} kolonnen={kolonnen} zeitbuchungen={zeitbuchungen} session={auth.session} onKostenGespeichert={changes => updateProjekt(projekt.id, changes)} />}
        {tab === "stempeln"      && <StempeluhrView profil={aktiveProfil}
            projekte={aktiveProfil?.kolonne_id
              ? projekte.filter(p => (p.kolonnen||[]).some(k => k.id === aktiveProfil.kolonne_id)).length > 0
                ? projekte.filter(p => (p.kolonnen||[]).some(k => k.id === aktiveProfil.kolonne_id))
                : projekte
              : projekte}
            session={auth.session} kolonnen={kolonnen} aufgaben={felder} />}
        {tab === "stunden"       && <StundenExportView profil={aktiveProfil} session={auth.session} projekte={projekte}
            // darfAlleSehen steuert hier nur die Mitarbeiter-Filter-Anzeige
            // innerhalb der bereits per RLS eingeschränkten Treffermenge —
            // bei Vorarbeiter ist das durch die zeitbuchungen-Policy schon
            // auf die eigene Kolonne begrenzt, "alle" heißt für ihn also
            // "alle aus seiner Kolonne", nicht firmenweit.
            darfAlleSehen={["administrator","geschaeftsfuehrer","polier","vorarbeiter"].includes(aktiveRolle)} />}
        {tab === "ki_frage"      && <KiFrageView projekt={projekt} aufgaben={felder} kolonnen={kolonnen} tagesberichte={aktProjektBerichte} kommentare={aktProjektKommentare} session={auth.session} />}
        {tab === "simulation"    && <SimulationView aufgaben={felder} kolonnen={kolonnen} projekt={projekt} projekte={projekte} session={auth.session} />}
        {tab === "angebot"       && <AngebotView projekt={projekt} aufgaben={felder} einheitspreise={einheitspreise} lvVorlagen={lvVorlagen} angebotVorlage={angebotVorlage} eigeneFirma={eigeneFirma} angebote={angebote} onAngebotSpeichern={angebotSpeichern} session={auth.session} />}
        {tab === "admin_params" && <AdminParameterView einheitspreise={einheitspreise} setEinheitspreise={setEinheitspreise} lvVorlagen={lvVorlagen} setLvVorlagen={setLvVorlagen} angebotVorlage={angebotVorlage} setAngebotVorlage={setAngebotVorlage} tagebuchVorlage={tagebuchVorlage} setTagebuchVorlage={setTagebuchVorlage} session={auth.session} />}
        {tab === "nutzer"       && <NutzerVerwaltungView session={auth.session} kolonnen={kolonnen} firmaId={firma?.id} projekte={projekte} />}
        {tab === "firmen"       && <FirmenView owneFirma={eigeneFirma} setEigeneFirma={setEigeneFirma} subs={subs} setSubs={setSubs}
            onOnboardingReset={() => setOnboardingDone(false)} session={auth.session} firmaId={firma?.id} firma={firma} />}
        {tab === "profil"       && <MeinProfilView profil={aktiveProfil} session={auth.session} onProfilAktualisiert={auth.profilAktualisieren} pinPflicht={!!firma?.pin_pflicht} />}
      </div>
      </PlanGuard>

      {/* ── BOTTOM NAV — Flex-Geschwister statt position:fixed, siehe Kommentar oben ──
          Der Home-Indicator-Sicherheitsabstand bleibt (Labels/Buttons sollen
          nicht unter der Wisch-Geste liegen), aber so knapp wie möglich —
          14px weniger als der volle Sicherheitsabstand, nie unter 4px. */}
      <div style={{ flexShrink:0,
        background:"var(--surface)", borderTop:"1px solid var(--border)",
        display:"flex", padding:"6px 6px",
        paddingBottom:"max(4px, calc(env(safe-area-inset-bottom) - 14px))" }}>
        {hauptTabs.map(t => {
          const Icon = TAB_ICONS[t.id];
          const aktiv = tab===t.id;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setZeigeMehr(false); }}
              style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", alignItems:"center",
                gap:4, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit",
                color: aktiv ? "var(--ink)" : "var(--muted)" }}>
              <div style={{ background: aktiv ? "var(--yellow)" : "transparent",
                padding:"7px 12px", display:"flex" }}>
                {Icon ? <Icon size={20} /> : <span style={{ fontSize:20 }}>{t.icon}</span>}
              </div>
              <div style={{ fontSize:10, fontWeight: aktiv ? 700 : 600 }}>{t.label}</div>
            </button>
          );
        })}
        {mehrTabs.length > 0 && (
          <button onClick={() => setZeigeMehr(m => !m)}
            style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", alignItems:"center",
              gap:4, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit",
              color: (aktivInMehr || zeigeMehr) ? "var(--ink)" : "var(--muted)" }}>
            <div style={{ background: (aktivInMehr || zeigeMehr) ? "var(--yellow)" : "transparent",
              padding:"7px 12px", display:"flex" }}>
              <Ellipsis size={20} />
            </div>
            <div style={{ fontSize:10, fontWeight: (aktivInMehr || zeigeMehr) ? 700 : 600 }}>Mehr</div>
          </button>
        )}
      </div>

      {/* ── MEHR-MENÜ (Bottom Sheet) ── */}
      {zeigeMehr && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
          background:"rgba(11,17,32,0.55)", zIndex:60 }}
          onClick={() => setZeigeMehr(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:"absolute", bottom:0, left:0, right:0,
              background:"var(--surface)", transform:`translateY(${mehrDragY}px)`,
              transition: mehrDragging ? "none" : "transform 0.25s ease",
              padding:"14px 16px", paddingBottom:"calc(20px + env(safe-area-inset-bottom))" }}>
            <div
              onTouchStart={e => { mehrDragStartY.current = e.touches[0].clientY; setMehrDragging(true); }}
              onTouchMove={e => {
                if (mehrDragStartY.current == null) return;
                const delta = e.touches[0].clientY - mehrDragStartY.current;
                if (delta > 0) setMehrDragY(delta);
              }}
              onTouchEnd={() => {
                if (mehrDragY > 80) setZeigeMehr(false);
                setMehrDragY(0);
                mehrDragStartY.current = null;
                setMehrDragging(false);
              }}
              style={{ width:40, height:4, background:"rgba(0,0,0,.15)",
                margin:"0 auto 18px", touchAction:"none" }} />
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ color:"var(--text)", fontWeight:800, fontSize:15 }}>Weitere Funktionen</div>
              <button onClick={() => setZeigeMehr(false)}
                style={{ width:30, height:30, background:"var(--surface2)", border:"none",
                  color:"var(--text2)", cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {mehrTabs.map(t => {
                const Icon = TAB_ICONS[t.id];
                return (
                <button key={t.id} onClick={() => { setTab(t.id); setZeigeMehr(false); }}
                  style={{ background: tab===t.id ? "var(--ybg)" : "var(--surface2)",
                    border:`1px solid ${tab===t.id ? "var(--yellow)" : "var(--border)"}`,
                    padding:"14px 8px", cursor:"pointer",
                    display:"flex", flexDirection:"column", alignItems:"center",
                    gap:6, fontFamily:"inherit" }}>
                  <span style={{ display:"flex", color: tab===t.id ? "var(--ydark)" : "var(--text2)" }}>
                    {Icon ? <Icon size={20} /> : <span style={{ fontSize:22 }}>{t.icon}</span>}
                  </span>
                  <span style={{ color: tab===t.id ? "var(--ydark)" : "var(--text2)",
                    fontSize:11, fontWeight:600, textAlign:"center" }}>{t.label}</span>
                </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <PWABanner pwa={pwa} />
    </div>
  );
}
