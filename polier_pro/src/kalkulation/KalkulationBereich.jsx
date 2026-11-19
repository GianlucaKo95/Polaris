// Polaris Kalkulation: eigener Bereich mit eigener Navigation und
// Arbeitsfläche. Gemeinsam mit Polaris sind Anmeldung, Firma, Rollen und
// Baustellen. Nur Desktop.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderKanban, ArrowDownToLine, Building, ArrowLeft, Moon, Sun, BarChart3 } from "lucide-react";
import { lokalSpeicher } from "../lib/kalk/speicherLokal.js";
import { supabaseSpeicher } from "../lib/kalk/speicherSupabase.js";
import { ProjektListe } from "./ProjektListe.jsx";
import { ProjektArbeitsflaeche } from "./ProjektArbeitsflaeche.jsx";
import { Uebernahme } from "./Uebernahme.jsx";
import { Gesellschaften } from "./Gesellschaften.jsx";
import { KonzernBereich } from "./Konzern.jsx";
import { Meldung } from "./ui.jsx";
import { StammdatenKontext } from "./stammdaten.js";
import { kiToolAufruf } from "../lib/ai.js";
import { migrationsPlan, planZusammenfassung } from "../lib/kalk/migration.js";

function ortAusHash() {
  const m = (typeof location !== "undefined" ? location.hash : "").match(/^#kalkulation(?:\/(projekt|uebernahme|gesellschaften|konzern))?(?:\/([\w-]+))?/);
  if (!m) return { seite: "projekte", projektId: null };
  if (m[1] === "projekt" && m[2]) return { seite: "projekt", projektId: m[2] };
  return { seite: m[1] || "projekte", projektId: null };
}

export function KalkulationBereich({ session, firmaId, rolle, firmenName, baustellen = [], alteAngebote = [], onZurueck, dark, onThemeWechsel, speicherVorgabe = null, stammdaten = {} }) {
  const speicher = useMemo(() => speicherVorgabe
    || (session?.access_token && firmaId ? supabaseSpeicher({ session, firmaId }) : lokalSpeicher({ speicher: typeof localStorage !== "undefined" ? localStorage : null })),
  [speicherVorgabe, session?.access_token, firmaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [ort, setOrt] = useState(ortAusHash);
  const [projekte, setProjekte] = useState(null);
  const [gesellschaften, setGesellschaften] = useState([]);
  const [rechte, setRechte] = useState({});
  const [offeneUebernahme, setOffeneUebernahme] = useState(0);
  const [fehler, setFehler] = useState(null);
  // App reicht bei jedem Neuzeichnen neue Arrays herein; Laden soll davon nicht neu ausgelöst werden
  const eingaben = useRef({ baustellen, alteAngebote, stammdaten });
  eingaben.current = { baustellen, alteAngebote, stammdaten };
  const istVerwalter = ["administrator", "geschaeftsfuehrer"].includes(rolle) || speicher.art === "lokal";

  const gehe = (seite, projektId = null) => {
    setOrt({ seite, projektId });
    const hash = seite === "projekt" ? `#kalkulation/projekt/${projektId}` : seite === "projekte" ? "#kalkulation" : `#kalkulation/${seite}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  };

  const laden = useCallback(async () => {
    try {
      const [p, g] = await Promise.all([speicher.projekteLaden(), speicher.gesellschaftenLaden()]);
      setProjekte(p);
      setGesellschaften(g);
      const r = {};
      for (const x of g) r[x.id] = await speicher.meinRecht(x.id).catch(() => 0);
      setRechte(r);
      const alt = speicher.alteAngeboteLaden ? await speicher.alteAngeboteLaden().catch(() => []) : eingaben.current.alteAngebote;
      const schon = await speicher.bereitsMigriert();
      setOffeneUebernahme(planZusammenfassung(migrationsPlan(alt, eingaben.current.baustellen, { bereitsMigriert: schon, kalkulationspreise: eingaben.current.stammdaten.kalkulationspreise })).staende);
      setFehler(null);
    } catch (e) { setFehler(e.nutzerText || e.message); setProjekte(p => p || []); }
  }, [speicher]);

  useEffect(() => { laden(); }, [laden]);
  useEffect(() => {
    if (!location.hash.startsWith("#kalkulation")) history.replaceState(null, "", "#kalkulation");
    const h = () => setOrt(ortAusHash());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  const darfAnlegen = Object.values(rechte).some(r => r >= 2);
  const projektRecht = id => rechte[projekte?.find(p => p.id === id)?.gesellschaft_id] ?? (speicher.art === "lokal" ? 4 : 0);

  const nav = [
    { id: "projekte", label: "Projekte", Icon: FolderKanban, zahl: projekte?.length || null },
    offeneUebernahme > 0 && { id: "uebernahme", label: "Angebote übernehmen", Icon: ArrowDownToLine, zahl: offeneUebernahme },
    { id: "konzern", label: "Konzern", Icon: BarChart3 },
    istVerwalter && { id: "gesellschaften", label: "Gesellschaften & Rechte", Icon: Building },
  ].filter(Boolean);
  const aktivNav = ort.seite === "projekt" ? "projekte" : ort.seite;

  let inhalt;
  if (!projekte) inhalt = <div style={{ padding: 32, color: "var(--text2)" }}>Lädt …</div>;
  else if (ort.seite === "projekt") {
    const gesId = projekte.find(p => p.id === ort.projektId)?.gesellschaft_id;
    inhalt = <ProjektArbeitsflaeche key={ort.projektId} speicher={speicher} projektId={ort.projektId} recht={projektRecht(ort.projektId)}
      kiAktiv={gesellschaften.find(g => g.id === gesId)?.ki_aktiv !== false}
      onZurueck={() => { gehe("projekte"); laden(); }} onProjektGeaendert={laden} />;
  } else if (ort.seite === "uebernahme") {
    inhalt = <Uebernahme speicher={speicher} alteAngebote={alteAngebote} baustellen={baustellen} onAbbrechen={() => gehe("projekte")}
      onFertig={() => { gehe("projekte"); laden(); }} />;
  } else if (ort.seite === "konzern") {
    inhalt = <KonzernBereich speicher={speicher} projekte={projekte} gesellschaften={gesellschaften} onOeffnen={id => gehe("projekt", id)} />;
  } else if (ort.seite === "gesellschaften" && istVerwalter) {
    inhalt = <Gesellschaften speicher={speicher} gesellschaften={gesellschaften} onGeaendert={laden} />;
  } else {
    inhalt = <ProjektListe projekte={projekte} gesellschaften={gesellschaften} darfAnlegen={darfAnlegen} baustellen={baustellen}
      uebernahmeOffen={offeneUebernahme} onUebernahme={() => gehe("uebernahme")}
      onOeffnen={id => gehe("projekt", id)}
      onAnlegen={async f => { const p = await speicher.projektAnlegen(f); await laden(); gehe("projekt", p.id); }} />;
  }

  const zeile = aktiv => ({
    display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 8px", borderRadius: 8, width: "100%", border: "none", cursor: "pointer",
    font: "inherit", fontSize: 14, textAlign: "left", background: aktiv ? "var(--surface2)" : "transparent", color: aktiv ? "var(--text)" : "var(--text2)",
    fontWeight: aktiv ? 500 : 400, boxShadow: aktiv ? "inset 0 0 0 1px var(--border)" : "none",
  });

  const kontext = useMemo(() => ({
    kalkulationspreise: stammdaten.kalkulationspreise || [], stammpositionen: stammdaten.stammpositionen || [],
    kalkulationsgrundlagen: stammdaten.kalkulationsgrundlagen || null, standardZuschlaege: stammdaten.standardZuschlaege || null,
    eigeneFirma: stammdaten.eigeneFirma || null, onStammpositionenAendern: stammdaten.onStammpositionenAendern || null,
    einheitspreise: stammdaten.einheitspreise || [], lvVorlagen: stammdaten.lvVorlagen || [],
    session: session?.access_token ? session : null,
    rufeKi: session?.access_token ? (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 8000 }, session) : null,
  }), [stammdaten.kalkulationspreise, stammdaten.stammpositionen, stammdaten.kalkulationsgrundlagen, stammdaten.standardZuschlaege, stammdaten.eigeneFirma,
    stammdaten.onStammpositionenAendern, stammdaten.einheitspreise, stammdaten.lvVorlagen, session?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <StammdatenKontext.Provider value={kontext}>
    <div style={{ height: "100dvh", display: "flex", background: "var(--bg)", color: "var(--text)", fontSize: 14, lineHeight: "20px" }}>
      <nav aria-label="Kalkulation" data-navigation className="desk-leiste" style={{ width: 232, flexShrink: 0, boxSizing: "border-box", padding: "20px 12px 16px",
        background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 8px", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Polaris <span style={{ color: "var(--akzent)" }}>Kalkulation</span></div>
          <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firmenName || (speicher.art === "lokal" ? "Demo, lokal gespeichert" : "")}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {nav.map(n => (
            <button key={n.id} className="desk-nav" style={zeile(aktivNav === n.id)} aria-current={aktivNav === n.id ? "page" : undefined}
              onClick={() => { gehe(n.id); if (n.id === "projekte") laden(); }}>
              <n.Icon size={18} strokeWidth={1.5} aria-hidden="true" />
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.zahl != null && <span className="kb-zahl" style={{ fontSize: 12, color: "var(--muted)" }}>{n.zahl}</span>}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button className="desk-nav" style={{ ...zeile(false), flex: 1 }} onClick={() => { history.replaceState(null, "", location.pathname + location.search); onZurueck(); }}>
            <ArrowLeft size={18} strokeWidth={1.5} aria-hidden="true" /> Zurück zu Polaris
          </button>
          {onThemeWechsel && <button className="kb-symbol" style={{ width: 32, height: 32 }} onClick={onThemeWechsel} aria-label={dark ? "Helles Design" : "Dunkles Design"}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>}
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100dvh" }}>
        {fehler && <div style={{ padding: "16px 32px 0" }}><Meldung art="fehler" onSchliessen={() => setFehler(null)}>{fehler}</Meldung></div>}
        <div style={{ flex: 1, minHeight: 0 }}>{inhalt}</div>
      </main>
    </div>
    </StammdatenKontext.Provider>
  );
}

export function kalkulationImHash() {
  return typeof location !== "undefined" && location.hash.startsWith("#kalkulation");
}
