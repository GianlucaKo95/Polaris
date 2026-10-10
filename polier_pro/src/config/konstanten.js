export const C = {
  bg:         "var(--bg)",
  bgMid:      "var(--surface)",
  bgLight:    "var(--surface2)",
  bgFaint:    "var(--border)",
  gelb:       "var(--yellow)",
  gelbDark:   "var(--ydark)",
  gelbLight:  "var(--ybg)",
  gruen:      "var(--green)",
  gruenLight: "var(--gbg)",
  rot:        "var(--red)",
  rotLight:   "var(--rbg)",
  rost:       "var(--orange)",
  rostLight:  "var(--obg)",
  blau:       "var(--blue)",
  blauLight:  "var(--bbg)",
  text:       "var(--text)",
  textMed:    "var(--text2)",
  muted:      "var(--muted)",
  betonLight: "var(--text2)",
  beton:      "var(--muted)",
  // Raw hex für spezifische Einsatzzwecke
  _yellow:    "#F5C400",
  _green:     "#15803D",
  _red:       "#B91C1C",
  _blue:      "#1D4ED8",
};

export const STATUS_COLOR = { done:"#16A34A", in_progress:"#F5C400", planned:"#64748B", blocked:"#DC2626" };

export const STATUS_BG    = { done:"#DCFCE7",  in_progress:"#FFF3CC",  planned:"#F1F5F9",   blocked:"#FEE2E2" };

export const STATUS_LABEL = { done:"✅ Fertig", in_progress:"🔄 Läuft", planned:"📅 Geplant", blocked:"🚫 Blockiert" };

export const HOCHBAU_GEWERKE = {
  rohbau: {
    label: "Rohbau / Beton",
    icon: "🏗️",
    einheitLabel: "Betonfeld",
    einheitenPl: "Felder",
    feldTypen: ["Fundament", "Bodenplatte", "Wand", "Stütze", "Decke", "Treppe", "Balkon", "Fertigteil"],
    bewehrung: ["BSt 500, Ø8, 20cm", "BSt 500, Ø10, 15cm", "BSt 500, Ø12, 15cm", "BSt 500, Ø14, 12cm", "BSt 500, Ø16, 10cm", "Keine / Unbewehrt"],
    extraFelder: [
      { key: "betonsorte", label: "Betonsorte", type: "select", optionen: ["C20/25 XC1", "C25/30 XC2", "C30/37 XC3", "C35/45 XC4", "Sonstige"] },
      { key: "festigkeit", label: "Festigkeit (%)", type: "number", placeholder: "0–100" },
    ],
    namePlaceholder: "z.B. A1 – Bodenplatte Nord",
    fortschrittLabel: "Felder betoniert",
    betonCheck: true,
  },
  elektro: {
    label: "Elektroinstallation",
    icon: "⚡",
    einheitLabel: "Bereich",
    einheitenPl: "Bereiche",
    feldTypen: ["Unterverteilung", "Leitungsverlegung", "Steckdosen / Schalter", "Beleuchtung", "Kabeltrasse", "Hausanschluss", "Zähleranlage", "Blitzschutz", "Photovoltaik-Anbindung"],
    bewehrung: [],
    extraFelder: [
      { key: "elektro_phase", label: "Installationsphase", type: "select", optionen: ["Vorinstallation (Leerrohre)", "Rohinstallation (Kabel)", "Endinstallation", "Prüfung / Abnahme", "Abgenommen"] },
      { key: "stromkreise", label: "Stromkreise (Anz.)", type: "number", placeholder: "0" },
      { key: "norm", label: "Norm / Prüfung", type: "select", optionen: ["VDE 0100 ausstehend", "VDE 0100 geprüft", "E-Check bestanden", "Brandschutz geprüft"] },
    ],
    namePlaceholder: "z.B. EG – Wohnbereich West",
    fortschrittLabel: "Bereiche abgenommen",
    betonCheck: false,
  },
  sanitaer: {
    label: "Sanitärinstallation",
    icon: "🚿",
    einheitLabel: "Einheit",
    einheitenPl: "Einheiten",
    feldTypen: ["Trinkwasser kalt", "Trinkwasser warm", "Abwasser", "Regenwasser", "Badezimmer", "Küche", "WC", "Technikraum", "Außenzapfstelle"],
    bewehrung: [],
    extraFelder: [
      { key: "sanitaer_phase", label: "Installationsphase", type: "select", optionen: ["Vorinstallation (Schlitze/Kernbohrungen)", "Rohinstallation (Leitungen)", "Endinstallation (Armaturen)", "Druckprüfung", "Abgenommen"] },
      { key: "druckprobe", label: "Druckprobe", type: "select", optionen: ["Ausstehend", "Bestanden", "Nicht bestanden", "Nicht erforderlich"] },
      { key: "daemmung", label: "Rohrdämmung", type: "select", optionen: ["Keine", "Ausstehend", "Teilweise", "Vollständig"] },
    ],
    namePlaceholder: "z.B. OG – Bad Nordseite",
    fortschrittLabel: "Einheiten abgenommen",
    betonCheck: false,
  },
  heizung: {
    label: "Heizung / HLKS",
    icon: "🔥",
    einheitLabel: "Bereich",
    einheitenPl: "Bereiche",
    feldTypen: ["Heizkessel / Wärmepumpe", "Verteilung / Verteiler", "Heizkörper", "Fußbodenheizung", "Lüftungsanlage", "Kälteanlage", "Solar-Thermie", "Übergabestation"],
    bewehrung: [],
    extraFelder: [
      { key: "heizung_typ", label: "Heizsystem", type: "select", optionen: ["Gas-Brennwert", "Wärmepumpe Luft", "Wärmepumpe Erde", "Pellet", "Fernwärme", "Elektro", "Hybrid"] },
      { key: "heizung_phase", label: "Montagephase", type: "select", optionen: ["Rohinstallation", "Endmontage", "Befüllung / Entlüftung", "Inbetriebnahme", "Abgenommen"] },
      { key: "druckprobe", label: "Druckprobe", type: "select", optionen: ["Ausstehend", "Bestanden", "Nicht bestanden"] },
    ],
    namePlaceholder: "z.B. Heizzentrale UG",
    fortschrittLabel: "Bereiche in Betrieb",
    betonCheck: false,
  },
  estrich: {
    label: "Estrich",
    icon: "🪨",
    einheitLabel: "Fläche",
    einheitenPl: "Flächen",
    feldTypen: ["Zementestrich", "Anhydritestrich", "Trockenestrich", "Heizestrich (FBH)", "Gefälleestrich", "Industrieestrich"],
    bewehrung: ["Keine", "Estrichdrahtgitter 50×50", "Glasfasergewebe", "Stahlnadeln / PP-Fasern"],
    extraFelder: [
      { key: "estrich_typ", label: "Estrichart", type: "select", optionen: ["Zementestrich CT", "Anhydritestrich CA", "Trockenestrich", "Gussasphalt", "Kunstharzestrich"] },
      { key: "schichtdicke", label: "Schichtdicke (mm)", type: "number", placeholder: "z.B. 60" },
      { key: "trockenzeit", label: "Trocknungszeit (Tage)", type: "number", placeholder: "z.B. 28" },
      { key: "belegreife", label: "Belegreife", type: "select", optionen: ["Ausstehend", "Gemessen – nicht belegreif", "Belegreif", "Belegt"] },
    ],
    namePlaceholder: "z.B. EG – Wohnbereich (85m²)",
    fortschrittLabel: "Flächen belegreif",
    betonCheck: false,
  },
  innenausbau: {
    label: "Innenausbau / Trockenbau",
    icon: "🪚",
    einheitLabel: "Bereich",
    einheitenPl: "Bereiche",
    feldTypen: ["Trennwand GK", "Unterdecke", "Vorsatzschale", "Bekleidung", "Brandschutzwand", "Schachtverkleidung", "Fensterbänke", "Türen / Zargen"],
    bewehrung: [],
    extraFelder: [
      { key: "ausbau_phase", label: "Phase", type: "select", optionen: ["Planung", "Ständerwerk", "Beplankung 1. Lage", "Beplankung 2. Lage", "Verspachtelung", "Fertig"] },
      { key: "brandschutz", label: "Brandschutz", type: "select", optionen: ["Nicht erforderlich", "F30 ausstehend", "F30 abgenommen", "F60 ausstehend", "F60 abgenommen", "F90 abgenommen"] },
    ],
    namePlaceholder: "z.B. OG Flur – Trennwände",
    fortschrittLabel: "Bereiche fertig",
    betonCheck: false,
  },
  fliesen: {
    label: "Fliesen / Beläge",
    icon: "🟫",
    einheitLabel: "Fläche",
    einheitenPl: "Flächen",
    feldTypen: ["Bodenfliesen", "Wandfliesen", "Außenfliesen", "Naturstein", "Parkett", "Laminat", "Teppich", "Vinyl / LVT"],
    bewehrung: [],
    extraFelder: [
      { key: "belag_material", label: "Material", type: "text", placeholder: "z.B. Feinsteinzeug 60×60" },
      { key: "verlegung", label: "Verlegemuster", type: "select", optionen: ["Reihenverband", "Versatz 1/3", "Versatz 1/2", "Diagonal", "Fischgrät", "Freies Muster"] },
      { key: "belag_phase", label: "Status", type: "select", optionen: ["Untergrund vorbereiten", "Fliesenarbeiten", "Verfugung", "Abgenommen"] },
    ],
    namePlaceholder: "z.B. EG Bad – Boden (12m²)",
    fortschrittLabel: "Flächen verlegt",
    betonCheck: false,
  },
};

export const PROJEKTTYPEN = {
  hochbau: {
    label: "Hausbau / Hochbau",
    icon: "🏠",
    einheitLabel: "Position",
    einheitenPl: "Positionen",
    feldTypen: Object.values(HOCHBAU_GEWERKE).flatMap(g => g.feldTypen),
    bewehrung: HOCHBAU_GEWERKE.rohbau.bewehrung,
    betonsorte: ["C20/25 XC1", "C25/30 XC2", "C30/37 XC3", "C35/45 XC4", "Sonstige"],
    gewerke: HOCHBAU_GEWERKE,
    extraFelder: [
      { key: "gewerk", label: "Gewerk", type: "select",
        optionen: Object.entries(HOCHBAU_GEWERKE).map(([k,g]) => `${g.icon} ${g.label}`) },
    ],
    namePlaceholder: "z.B. EG – Bodenplatte / Bad Nord",
    fortschrittLabel: "Positionen fertig",
  },
  tiefgarage: {
    label: "Tiefgarage / Parkdeck",
    icon: "🅿️",
    einheitLabel: "Abschnitt",
    einheitenPl: "Abschnitte",
    feldTypen: ["Bodenplatte", "Wand", "Stütze", "Decke", "Rampe", "Widerlager", "Entwässerung"],
    bewehrung: ["BSt 500, Ø10, 15cm", "BSt 500, Ø12, 15cm", "BSt 500, Ø14, 12cm", "BSt 500, Ø16, 10cm", "BSt 500, Ø20, 10cm", "Doppelkopfanker"],
    betonsorte: ["C25/30 XC2 WU", "C30/37 XC3 WU", "C35/45 XC4 WU", "C30/37 XF1", "Sonstige"],
    extraFelder: [],
    namePlaceholder: "z.B. TG-A1 – Ebene -1 West",
    fortschrittLabel: "Abschnitte fertig",
  },
  tiefbau: {
    label: "Tiefbau / Straße",
    icon: "🛣️",
    einheitLabel: "Abschnitt",
    einheitenPl: "Abschnitte",
    feldTypen: ["Fahrbahn", "Gehweg", "Randstreifen", "Bordstein", "Entwässerungsrinne", "Kreuzungsbereich", "Brückenkappe"],
    bewehrung: ["Bewehrungsmatte Q188", "Bewehrungsmatte Q257", "Bewehrungsmatte Q335", "Bewehrungsmatte Q524", "BSt 500, Ø12, 15cm", "Unbewehrt / Magerbeton"],
    betonsorte: ["C30/37 XF4", "C35/45 XF4", "C40/50 XF4 XM", "C30/37 XF2", "Magerbeton C8/10", "Sonstige"],
    extraFelder: [],
    namePlaceholder: "z.B. FA-001 – Fahrbahn km 0+000",
    fortschrittLabel: "Abschnitte betoniert",
  },
  dach: {
    label: "Dach",
    icon: "🏚️",
    einheitLabel: "Fläche",
    einheitenPl: "Flächen",
    feldTypen: ["Hauptfläche", "Gaube", "Traufe", "First", "Ortgang", "Kehle", "Dachflächenfenster", "Kaminanschluss"],
    bewehrung: ["Nicht zutreffend"],
    betonsorte: ["Nicht zutreffend"],
    extraFelder: [
      { key: "material",     label: "Dachmaterial",      type: "select", optionen: ["Dachziegel Ton", "Dachziegel Beton", "Bitumenschindeln", "Stehfalzblech", "Trapezblech", "Gründach", "Flachdach EPDM"] },
      { key: "eingedeckt_m2", label: "Eingedeckt (m²)", type: "number", placeholder: "0" },
      { key: "daemmung",     label: "Dämmung",            type: "select", optionen: ["Keine", "Zwischensparren", "Aufsparren", "Untersparren", "Vollsparren"] },
    ],
    namePlaceholder: "z.B. Nordseite – Hauptfläche",
    fortschrittLabel: "Flächen eingedeckt",
  },
  pv: {
    label: "PV-Anlage",
    icon: "☀️",
    einheitLabel: "Modul-Reihe",
    einheitenPl: "Reihen",
    feldTypen: ["Modulreihe", "Wechselrichter", "DC-Verkabelung", "AC-Verkabelung", "Einspeisepunkt", "Montagegestell", "Erdung"],
    bewehrung: ["Nicht zutreffend"],
    betonsorte: ["Nicht zutreffend"],
    extraFelder: [
      { key: "module_anzahl",  label: "Module (Stk.)",     type: "number", placeholder: "0" },
      { key: "kwp",            label: "Leistung (kWp)",    type: "number", placeholder: "0.0" },
      { key: "elektro_status", label: "Elektroinstallation", type: "select", optionen: ["Ausstehend", "In Arbeit", "Abgeschlossen", "Abgenommen"] },
      { key: "modul_typ",      label: "Modultyp",           type: "text",   placeholder: "z.B. Jinko 440W" },
    ],
    namePlaceholder: "z.B. Reihe A – Südseite (12 Module)",
    fortschrittLabel: "Reihen installiert",
  },
};

export const ALLE_GEWERKE = [
  { key:"rohbau",       label:"Rohbau / Beton",           icon:"🏗️" },
  { key:"elektro",      label:"Elektroinstallation",       icon:"⚡" },
  { key:"sanitaer",     label:"Sanitärinstallation",       icon:"🚿" },
  { key:"heizung",      label:"Heizung / HLKS",            icon:"🔥" },
  { key:"estrich",      label:"Estrich",                   icon:"🪨" },
  { key:"innenausbau",  label:"Innenausbau / Trockenbau",  icon:"🪚" },
  { key:"fliesen",      label:"Fliesen / Beläge",          icon:"🟫" },
  { key:"tiefbau",      label:"Tiefbau / Straße",          icon:"🛣️" },
  { key:"dach",         label:"Dach",                      icon:"🏚️" },
  { key:"pv",           label:"PV-Anlage",                 icon:"☀️" },
  { key:"maler",        label:"Maler / Putz",              icon:"🖌️" },
  { key:"schreiner",    label:"Schreiner / Fenster",       icon:"🪟" },
  { key:"abbruch",      label:"Abbruch / Rückbau",         icon:"⛏️" },
  { key:"vermessung",   label:"Vermessung",                icon:"📐" },
  { key:"garten",       label:"Garten / Außenanlagen",     icon:"🌿" },
];

export const PLAN_CONFIG = {
  trial:   { label:"Testversion",  preis:"kostenlos · 14 Tage", farbe:"#64748B", icon:"⏱️" },
  starter: { label:"Starter",      preis:"49 € / Monat",        farbe:"#2563EB", icon:"🚀" },
  pro:     { label:"Pro",          preis:"99 € / Monat",        farbe:"#F5C400", icon:"⚡" },
};

export const ONBOARDING_KEY = "polier_pro_onboarding_done";
export const ONBOARDING_DRAFT_KEY = "polier_pro_onboarding_draft";

export const ROLLEN = {
  administrator: {
    label: "Administrator",
    icon: "🔑",
    farbe: "#7C3AED",
    tabs: ["dashboard","felder","gantt","editor","scanner","wetter","kolonnen","tagebuch","zeiten","firmen"],
    kannBearbeiten: true,
    kannAufgabenBearbeiten: true,
    kannNutzerVerwalten: true,
    kannKolonneLoeschen: true,
    siehtAlleProjekte: true,
  },
  // "Abgespeckter Admin" für Geschäftsführer/Inhaber: sieht alle Baustellen,
  // Kosten & Angebote (inkl. KI-Angebotserstellung), aber keine
  // Nutzerverwaltung und kein Kolonnen-Löschen.
  geschaeftsfuehrer: {
    label: "Geschäftsführer",
    icon: "💼",
    farbe: "#0F766E",
    tabs: ["dashboard","gantt","kosten","wetter","kolonnen","tagebuch","zeiten","angebot"],
    kannBearbeiten: false,
    kannAufgabenBearbeiten: true,
    kannNutzerVerwalten: false,
    kannKolonneLoeschen: false,
    siehtAlleProjekte: true,
  },
  bauleiter: {
    label: "Bauleiter",
    icon: "📋",
    farbe: "#2563EB",
    tabs: ["dashboard","felder","gantt","wetter","kolonnen","tagebuch","zeiten"],
    kannBearbeiten: false,
    kannAufgabenBearbeiten: true,
    kannNutzerVerwalten: false,
    kannKolonneLoeschen: false,
    siehtAlleProjekte: true,
  },
  polier: {
    label: "Polier",
    icon: "⚒️",
    farbe: "#F5C400",
    tabs: ["dashboard","felder","gantt","editor","scanner","wetter","kolonnen","tagebuch","zeiten"],
    kannBearbeiten: true,
    kannAufgabenBearbeiten: true,
    kannNutzerVerwalten: false,
    kannKolonneLoeschen: false,
    siehtAlleProjekte: false,
    // Ein Polier führt eine ganze Baustelle, nicht eine einzelne Kolonne
    // (kolonne_id bleibt bei dieser Rolle immer leer) — Baustellen-Zugriff
    // muss hier weiterhin manuell je Baustelle vergeben werden.
    baustellenZugriffUeberKolonne: false,
  },
  // Aufgaben-Bearbeitung bewusst NICHT erlaubt (Stand: Absprache mit dem
  // Kunden) — nur Polier, Admin, Geschäftsführer und Bauleiter dürfen
  // Aufgaben anlegen/bearbeiten/löschen. Vorarbeiter darf weiterhin Kolonnen
  // und Projektdaten bearbeiten (kannBearbeiten), nur eben keine Aufgaben.
  vorarbeiter: {
    label: "Vorarbeiter",
    icon: "👷",
    farbe: "#EA580C",
    tabs: ["dashboard","felder","kolonnen","tagebuch","stempeln"],
    kannBearbeiten: true,
    kannAufgabenBearbeiten: false,
    kannNutzerVerwalten: false,
    kannKolonneLoeschen: false,
    siehtAlleProjekte: false,
    // Zugriff ergibt sich automatisch aus der zugewiesenen Kolonne und deren
    // Baustelle — kein manueller Schritt nötig (siehe NutzerVerwaltungView).
    baustellenZugriffUeberKolonne: true,
  },
  facharbeiter: {
    label: "Facharbeiter",
    icon: "🔨",
    farbe: "#64748B",
    tabs: ["stempeln"],
    kannBearbeiten: false,
    kannAufgabenBearbeiten: false,
    kannNutzerVerwalten: false,
    kannKolonneLoeschen: false,
    siehtAlleProjekte: false,
    baustellenZugriffUeberKolonne: true,
  },
};

export const TAETIGKEITEN = {
  beton:      { label:"Betonage",       icon:"🏗️" },
  schalung:   { label:"Schalung",       icon:"🪵"  },
  bewehrung:  { label:"Bewehrung",      icon:"🔩"  },
  abdichtung: { label:"Abdichtung",     icon:"💧"  },
  estrich:    { label:"Estrich",        icon:"🪣"  },
  aufraeumen: { label:"Aufräumen",      icon:"🧹"  },
  transport:  { label:"Transport",      icon:"🚚"  },
  vorarbeit:  { label:"Vorbereitung",   icon:"📐"  },
  sonstiges:  { label:"Sonstiges",      icon:"📋"  },
};

export const AUFGABEN_TYPEN = {
  beton:      { label:"Betonage",    icon:"🏗️", farbe:"#F5C400" },
  schalung:   { label:"Schalung",    icon:"🪵",  farbe:"#C2410C" },
  bewehrung:  { label:"Bewehrung",   icon:"🔩",  farbe:"#4A9EE0" },
  abdichtung: { label:"Abdichtung",  icon:"💧",  farbe:"#0891B2" },
  estrich:    { label:"Estrich",     icon:"🪣",  farbe:"#7C3AED" },
  allgemein:  { label:"Allgemein",   icon:"📋",  farbe:"#64748B" },
  mangel:     { label:"Mangel",      icon:"⚠️",  farbe:"#DC2626" },
};

export const AUFGABEN_STATUS = {
  offen:         { label:"Offen",       icon:"○",  farbe:"#64748B", bg:"var(--surface2)" },
  in_arbeit:     { label:"In Arbeit",   icon:"◑",  farbe:"#F5C400", bg:"var(--ybg)" },
  zur_pruefung:  { label:"Zur Prüfung", icon:"◐",  farbe:"#1D4ED8", bg:"var(--bbg)" },
  abgeschlossen: { label:"Fertig",      icon:"●",  farbe:"#15803D", bg:"var(--gbg)" },
  blockiert:     { label:"Blockiert",   icon:"✕",  farbe:"#DC2626", bg:"var(--rbg)" },
};

export const AUFGABEN_PRIO = {
  niedrig:  { label:"Niedrig",  icon:"↓", farbe:"#64748B" },
  mittel:   { label:"Mittel",   icon:"→", farbe:"#F5C400" },
  hoch:     { label:"Hoch",     icon:"↑", farbe:"#EA580C" },
  kritisch: { label:"Kritisch", icon:"‼", farbe:"#DC2626" },
};

// Reihenfolge entspricht dem tatsächlichen Bauablauf (Baugrube vor
// Bewehrung vor Betonage vor Ausschalen usw.), damit die Vorlagenliste
// auch als grobe Checkliste von oben nach unten abgearbeitet werden kann.
export const AUFGABEN_VORLAGEN = [
  { name:"Baugrube ausheben",     typ:"allgemein",  betonsorte:"",       icon:"⛏️" },
  { name:"Sauberkeitsschicht",    typ:"beton",      betonsorte:"C12/15", icon:"🏗️" },
  { name:"Schalung stellen",      typ:"schalung",   betonsorte:"",       icon:"🪵" },
  { name:"Bewehrung verlegen",    typ:"bewehrung",  betonsorte:"",       icon:"🔩" },
  { name:"Einbauteile setzen",    typ:"allgemein",  betonsorte:"",       icon:"🔧" },
  { name:"Bodenplatte",           typ:"beton",      betonsorte:"C25/30", icon:"🏗️" },
  { name:"Fundament",             typ:"beton",      betonsorte:"C25/30", icon:"🏗️" },
  { name:"Kellerwand WU",         typ:"beton",      betonsorte:"C30/37", icon:"🏗️" },
  { name:"Ausschalen",            typ:"schalung",   betonsorte:"",       icon:"🪵" },
  { name:"Nachbehandlung Beton",  typ:"beton",      betonsorte:"",       icon:"🏗️" },
  { name:"Abdichtung 2-lagig",    typ:"abdichtung", betonsorte:"",       icon:"💧" },
  { name:"Estrich einbringen",    typ:"estrich",    betonsorte:"",       icon:"🪣" },
];

// Schnellerstellungs-Vorlagen je Projekttyp — ohne das hier würde die
// Aufgaben-Schnellerstellung IMMER die Beton-Vorlagen oben zeigen, auch für
// ein Dach- oder PV-Projekt, bei dem "Bodenplatte"/"Schaltafel stellen"
// keinen Sinn ergeben. Projekttypen ohne eigenen Eintrag (tiefgarage,
// tiefbau) fallen auf AUFGABEN_VORLAGEN zurück, da dort Beton tatsächlich
// das dominante Gewerk ist. Wie bei AUFGABEN_VORLAGEN oben folgt die
// Reihenfolge dem realen Bauablauf (z.B. bei PV: erst Gerüst und
// Unterkonstruktion, dann Module, zuletzt Verkabelung und Abnahme) statt
// nur eine lose Stichwortsammlung zu sein.
export const AUFGABEN_VORLAGEN_NACH_TYP = {
  // Hausbau/Hochbau deckt anders als Tiefgarage/Tiefbau nicht nur den
  // Rohbau ab, sondern das komplette Haus bis zur Übergabe — deshalb eine
  // eigene, deutlich längere Phasenliste statt der reinen Beton-Vorlagen.
  hochbau: [
    { name:"Baustelleneinrichtung",                  typ:"allgemein",  betonsorte:"",       icon:"🚧" },
    { name:"Baugrube ausheben",                       typ:"allgemein",  betonsorte:"",       icon:"⛏️" },
    { name:"Sauberkeitsschicht",                      typ:"beton",      betonsorte:"C12/15", icon:"🏗️" },
    { name:"Fundament / Bodenplatte",                 typ:"beton",      betonsorte:"C25/30", icon:"🏗️" },
    { name:"Kellerwände",                             typ:"beton",      betonsorte:"C30/37", icon:"🏗️" },
    { name:"Kellerabdichtung",                        typ:"abdichtung", betonsorte:"",       icon:"💧" },
    { name:"Rohbau Erdgeschoss",                      typ:"beton",      betonsorte:"C25/30", icon:"🏗️" },
    { name:"Rohbau Obergeschoss",                     typ:"beton",      betonsorte:"C25/30", icon:"🏗️" },
    { name:"Dachstuhl aufrichten",                    typ:"allgemein",  betonsorte:"",       icon:"🏚️" },
    { name:"Dach eindecken",                          typ:"allgemein",  betonsorte:"",       icon:"🏚️" },
    { name:"Fenster und Außentüren einbauen",         typ:"allgemein",  betonsorte:"",       icon:"🪟" },
    { name:"Elektro-Rohinstallation",                 typ:"allgemein",  betonsorte:"",       icon:"⚡" },
    { name:"Sanitär-Rohinstallation",                 typ:"allgemein",  betonsorte:"",       icon:"🚿" },
    { name:"Heizung-Rohinstallation",                 typ:"allgemein",  betonsorte:"",       icon:"🔥" },
    { name:"Estrich einbringen",                      typ:"estrich",    betonsorte:"",       icon:"🪣" },
    { name:"Innenputz / Trockenbau",                  typ:"allgemein",  betonsorte:"",       icon:"🪚" },
    { name:"Fliesenarbeiten",                         typ:"allgemein",  betonsorte:"",       icon:"🟫" },
    { name:"Malerarbeiten",                           typ:"allgemein",  betonsorte:"",       icon:"🖌️" },
    { name:"Endinstallation Elektro/Sanitär/Heizung", typ:"allgemein",  betonsorte:"",       icon:"🔌" },
    { name:"Bodenbeläge verlegen",                    typ:"allgemein",  betonsorte:"",       icon:"🧱" },
    { name:"Außenanlagen",                            typ:"allgemein",  betonsorte:"",       icon:"🌳" },
    { name:"Abnahme / Übergabe",                      typ:"allgemein",  betonsorte:"",       icon:"✅" },
  ],
  dach: [
    { name:"Gerüst stellen",          typ:"allgemein",  betonsorte:"",               icon:"🪜" },
    { name:"Lattung prüfen",          typ:"allgemein",  betonsorte:"",               icon:"🏚️" },
    { name:"Unterspannbahn verlegen", typ:"allgemein",  betonsorte:"",               icon:"🏚️" },
    { name:"Traufe",                  typ:"allgemein",  betonsorte:"",               icon:"🏚️" },
    { name:"Hauptfläche eindecken",   typ:"allgemein",  betonsorte:"Dachziegel Ton", icon:"🏚️" },
    { name:"Ortgang",                 typ:"allgemein",  betonsorte:"",               icon:"🏚️" },
    { name:"First schließen",         typ:"allgemein",  betonsorte:"",               icon:"🏚️" },
    { name:"Kehle abdichten",         typ:"abdichtung", betonsorte:"",               icon:"💧" },
    { name:"Dachflächenfenster",      typ:"allgemein",  betonsorte:"",               icon:"🏚️" },
    { name:"Dämmung verlegen",        typ:"allgemein",  betonsorte:"",               icon:"🏚️" },
    { name:"Dachrinne montieren",     typ:"allgemein",  betonsorte:"",               icon:"🏚️" },
    { name:"Gerüst abbauen",          typ:"allgemein",  betonsorte:"",               icon:"🪜" },
  ],
  pv: [
    { name:"Gerüst stellen",             typ:"allgemein", betonsorte:"", icon:"🪜" },
    { name:"Unterkonstruktion montieren",typ:"allgemein", betonsorte:"", icon:"☀️" },
    { name:"Schienen montieren",         typ:"allgemein", betonsorte:"", icon:"☀️" },
    { name:"Module verlegen",            typ:"allgemein", betonsorte:"", icon:"☀️" },
    { name:"DC-Verkabelung",             typ:"allgemein", betonsorte:"", icon:"☀️" },
    { name:"Wechselrichter setzen",      typ:"allgemein", betonsorte:"", icon:"☀️" },
    { name:"AC-Verkabelung",             typ:"allgemein", betonsorte:"", icon:"☀️" },
    { name:"Einspeisepunkt anschließen", typ:"allgemein", betonsorte:"", icon:"☀️" },
    { name:"Inbetriebnahme / Abnahme",   typ:"allgemein", betonsorte:"", icon:"☀️" },
    { name:"Gerüst abbauen",             typ:"allgemein", betonsorte:"", icon:"🪜" },
  ],
};

// Labels + Platzhalter für die generischen "m2"/"betonsorte"-Spalten (die
// Datenbank hat nur diese zwei Zusatzfelder auf jeder Aufgabe) — je
// Projekttyp umbeschriftet, damit ein Dach-Projekt "Eingedeckt (m²)" /
// "Dachmaterial" zeigt statt "Fläche (m²)" / "Betonsorte".
export const AUFGABEN_EXTRA_FELD_LABEL = {
  dach: { m2:"Eingedeckt (m²)", sorte:"Dachmaterial", sortePlatzhalter:"z.B. Dachziegel Ton" },
  pv:   { m2:"Module (Stk.)",   sorte:"Modultyp",     sortePlatzhalter:"z.B. Jinko 440W" },
};
const STANDARD_EXTRA_FELD_LABEL = { m2:"Fläche (m²)", sorte:"Betonsorte", sortePlatzhalter:"C25/30" };

// Bewehrung wird immer nach Gewicht abgerechnet (siehe DEFAULT_EINHEITSPREISE,
// Gewerk "Bewehrung", Einheit "t") — unabhängig vom Projekttyp, anders als
// bei Dach/PV oben, wo die Umbeschriftung vom Projekttyp abhängt. Ohne diese
// Umbeschriftung blieb das generische m2-Feld für Bewehrung-Aufgaben
// unsichtbar (nur für typ "beton" bzw. Dach/PV eingeblendet) und ein
// importiertes Angebot zeigte Bewehrung-Positionen immer mit menge:0.
export const BEWEHRUNG_EXTRA_FELD_LABEL = { m2:"Menge (t)", sorte:"Stahlsorte", sortePlatzhalter:"z.B. BSt 500 S" };

export function aufgabenVorlagenFuer(projektTyp) {
  return AUFGABEN_VORLAGEN_NACH_TYP[projektTyp] || AUFGABEN_VORLAGEN;
}

export function extraFeldLabelFuer(projektTyp) {
  return AUFGABEN_EXTRA_FELD_LABEL[projektTyp] || STANDARD_EXTRA_FELD_LABEL;
}

// Bei diesen Projekttypen sind die "m2"/"betonsorte"-Felder auch außerhalb
// des Aufgabentyps "beton" sinnvoll (ein Dach-Task heißt nie "Betonage"),
// deshalb werden sie dort unabhängig vom gewählten Aufgabentyp angezeigt.
export const PROJEKTTYPEN_MIT_IMMER_SICHTBAREN_EXTRAFELDERN = ["dach", "pv"];

export const DEFAULT_EINHEITSPREISE = [
  { id:1, gewerk:"Betonage",     einheit:"m²", preis:85,  beschreibung:"Beton C25/30 inkl. Einbau" },
  { id:2, gewerk:"Betonage",     einheit:"m³", preis:220, beschreibung:"Beton C30/37 inkl. Einbau" },
  { id:3, gewerk:"Schalung",     einheit:"m²", preis:35,  beschreibung:"Schaltafel stellen/abheben" },
  { id:4, gewerk:"Bewehrung",    einheit:"t",  preis:1200,beschreibung:"Betonstahl BSt 500 S" },
  { id:5, gewerk:"Abdichtung",   einheit:"m²", preis:45,  beschreibung:"Bitumenschweißbahn 2-lagig" },
  { id:6, gewerk:"Estrich",      einheit:"m²", preis:28,  beschreibung:"Zementestrich ZE 20, 6cm" },
  { id:7, gewerk:"Erdarbeiten",  einheit:"m³", preis:18,  beschreibung:"Aushub/Verfüllung" },
  { id:8, gewerk:"Allgemein",    einheit:"h",  preis:55,  beschreibung:"Stundenverrechnungssatz" },
];

export const DEFAULT_LV_VORLAGEN = [
  {
    id:1, name:"Bodenplatte Standard", gewerk:"Betonage",
    positionen:[
      { bez:"Schalung stellen", einheit:"m²", menge:0, ep_id:3 },
      { bez:"Bewehrung verlegen", einheit:"t", menge:0, ep_id:4 },
      { bez:"Beton einbauen C25/30", einheit:"m²", menge:0, ep_id:1 },
    ]
  },
  {
    id:2, name:"Kellerabdichtung", gewerk:"Abdichtung",
    positionen:[
      { bez:"Abdichtung 2-lagig", einheit:"m²", menge:0, ep_id:5 },
      { bez:"Beton WU C30/37", einheit:"m³", menge:0, ep_id:2 },
    ]
  },
];
