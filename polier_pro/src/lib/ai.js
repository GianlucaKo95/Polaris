import { SUPABASE_URL } from "./supabase.js";
import { betonCheck } from "./geo.js";
import { AUFGABEN_TYPEN, AUFGABEN_STATUS } from "../config/konstanten.js";

export async function generiereBerichtKI(diktat, projekt, kolonnen, wetter, session) {
  const kolonnenInfo = (kolonnen || []).map(k =>
    `${k.name}: ${k.mitarbeiter?.length || 0} Mann, Einsatz: ${k.einsatz}`
  ).join("\n");

  const wetterInfo = wetter
    ? `Temperatur: ${wetter.temp}°C, Wind: ${wetter.wind}km/h, Niederschlag: ${wetter.rain}mm`
    : "keine Wetterdaten";

  const prompt = `Du bist ein erfahrener Polier und schreibst einen professionellen Bautagesbericht.

Projekt: ${projekt?.name || ""}
Adresse: ${projekt?.adresse || ""}
Datum: ${new Date().toLocaleDateString("de-DE")}
Wetter: ${wetterInfo}
Kolonnen heute:
${kolonnenInfo || "keine Kolonnen eingetragen"}

Diktat des Poliers:
"${diktat}"

Erstelle daraus einen vollständigen, professionellen Bautagesbericht. Antworte NUR mit einem JSON-Objekt ohne Markdown:
{
  "taetigkeit": "Ausführliche Beschreibung der Tätigkeiten (3-5 Sätze, fachlich korrekt)",
  "besonderheiten": "Besonderheiten, Mängel, Vorkommnisse (oder leer wenn keine)",
  "material": "Materiallieferungen falls erwähnt (oder leer)",
  "fazit": "Kurzes Fazit zum Tagesfortschritt"
}`;

  const data = await rufeClaudeAuf(prompt, 1000, session);
  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return { taetigkeit: diktat, besonderheiten: "", material: "", fazit: "" };
  }
}

// Ruft NIE Anthropic direkt aus dem Browser auf — ein API-Key im
// Frontend-Code wäre für jeden Nutzer der installierten App über die
// Entwicklertools auslesbar. Stattdessen die ki-proxy Edge Function:
// die liest den Anthropic-Key der jeweiligen Firma serverseitig aus der
// Datenbank (siehe supabase/functions/ki-proxy) und ruft Anthropic damit
// auf — der Key selbst erreicht den Client nie.
async function rufeClaudeAuf(prompt, maxTokens, session, refusalHinweis) {
  const data = await rufeKiProxyAuf({ prompt, maxTokens }, session, refusalHinweis);
  return data;
}

// refusalHinweis passt die Meldung an den jeweiligen Aufrufer an ("Diktat
// umformulieren" ergibt z.B. bei der Vorlagenanalyse keinen Sinn, weil da
// gar nichts diktiert wird) — Default bleibt der Diktat-Text, weil das die
// meisten Aufrufer dieser Funktion sind.
async function rufeKiProxyAuf(body, session, refusalHinweis = "Bitte das Diktat umformulieren oder erneut versuchen.") {
  if (!session?.access_token) {
    throw new Error("Keine gültige Sitzung für KI-Anfrage.");
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ki-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const fehlerBody = await res.json().catch(() => ({}));
    throw new Error(fehlerBody?.error || `KI-Anfrage fehlgeschlagen (${res.status})`);
  }
  const data = await res.json();
  // stop_reason:"refusal" kommt als HTTP 200 zurück (Sicherheits-Klassifikator
  // hat abgelehnt, z.B. weil der ki-proxy trotz "default"-Fallback kein
  // Ersatzmodell mehr fand) — content ist dann leer oder unvollständig. Ohne
  // diese Prüfung würden alle Aufrufer hier einfach ein leeres/falsches
  // Ergebnis weiterverarbeiten, statt einen sichtbaren Fehler zu zeigen.
  if (data.stop_reason === "refusal") {
    throw new Error(`Die KI konnte diese Anfrage nicht bearbeiten (vom Sicherheitsfilter abgelehnt). ${refusalHinweis}`);
  }
  return data;
}

// ── KI-Assistent: Fragen zu echten Projektdaten ─────────────────────────
// Baut aus Aufgaben, Kolonnen, Wettervorhersage und Terminprognose einen
// System-Prompt mit klaren Leitplanken gegen Halluzination — die KI
// bekommt NUR diese Daten und die Anweisung, nichts darüber hinaus zu
// behaupten. Läuft als mehrstufiger Chat (verlauf), damit Rückfragen den
// bisherigen Gesprächskontext behalten.
function baueProjektKontext({ projekt, aufgaben = [], kolonnen = [], wetterVorhersage, terminprognose, tagesberichte = [], kommentare = [] }) {
  const heute = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const offeneAufgaben = aufgaben.filter(a => a.status !== "abgeschlossen");
  const aufgabenText = offeneAufgaben.map(a => {
    const teile = [
      AUFGABEN_TYPEN[a.typ]?.label || a.typ,
      `Status: ${AUFGABEN_STATUS[a.status]?.label || a.status}`,
    ];
    if (a.faellig_am) teile.push(`fällig am ${new Date(a.faellig_am).toLocaleDateString("de-DE")}`);
    if (a.zustaendig) teile.push(`zuständig: ${a.zustaendig}`);
    if (a.soll_stunden) teile.push(`Soll-Stunden: ${a.soll_stunden}`);
    if (a.ist_mangel) teile.push("MANGEL");
    if (a.prioritaet === "kritisch") teile.push("PRIORITÄT KRITISCH");
    return `- "${a.titel}" (${teile.join(", ")})`;
  }).join("\n") || "keine offenen Aufgaben erfasst";

  // Erledigte Aufgaben fehlten der KI bisher komplett (nur offeneAufgaben
  // oben) — ohne sie konnte sie z.B. "was wurde schon gemacht?" nicht
  // beantworten, obwohl die App es längst wusste. Auf die letzten 25 nach
  // Abschlussdatum begrenzt, sonst wächst dieser Abschnitt bei einem langen
  // Projekt unbegrenzt mit.
  const erledigteAufgaben = aufgaben
    .filter(a => a.status === "abgeschlossen")
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 25);
  const erledigtText = erledigteAufgaben.map(a => {
    const datum = a.updated_at ? new Date(a.updated_at).toLocaleDateString("de-DE") : "unbekannt";
    const teile = [AUFGABEN_TYPEN[a.typ]?.label || a.typ, `abgeschlossen am ${datum}`];
    if (a.zustaendig) teile.push(`zuständig: ${a.zustaendig}`);
    if (a.ist_mangel) teile.push("war MANGEL");
    return `- "${a.titel}" (${teile.join(", ")})`;
  }).join("\n") || "keine erledigten Aufgaben erfasst";

  // Letzte 40 Kommentare über alle Aufgaben dieses Projekts (aus dem
  // aufgaben!inner-Join in App.jsx, bereits auf diese Baustelle begrenzt) —
  // chronologisch aufsteigend, damit die KI den Gesprächsverlauf einer
  // Aufgabe in der richtigen Reihenfolge liest statt absteigend sortiert.
  const kommentareSortiert = [...kommentare].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const kommentareText = kommentareSortiert.map(k => {
    const titel = k.aufgaben?.titel || "unbekannte Aufgabe";
    const autor = k.autor ? [k.autor.vorname, k.autor.nachname].filter(Boolean).join(" ") : "unbekannt";
    const datum = new Date(k.created_at).toLocaleDateString("de-DE");
    return `- [${titel}] ${autor} (${datum}): "${k.text}"`;
  }).join("\n") || "keine Kommentare zu Aufgaben erfasst";

  // Letzte 10 Tagesberichte — ältere Berichte sind für aktuelle Fragen
  // ("was ist gestern passiert?", "gab es zuletzt Mängel im Bericht?")
  // selten relevant und würden den Prompt sonst unnötig aufblähen.
  const tagesberichteSortiert = [...tagesberichte]
    .sort((a, b) => new Date(b.datum) - new Date(a.datum))
    .slice(0, 10);
  const tagesberichteText = tagesberichteSortiert.map(b => {
    const teile = [`Datum: ${new Date(b.datum).toLocaleDateString("de-DE")}`];
    if (b.arbeiter) teile.push(`${b.arbeiter} Arbeiter`);
    if (b.maengel_anzahl) teile.push(`${b.maengel_anzahl} Mangel/Mängel`);
    const zeilen = [`- ${teile.join(", ")}`];
    if (b.taetigkeit) zeilen.push(`  Tätigkeit: ${b.taetigkeit}`);
    if (b.besonderheiten) zeilen.push(`  Besonderheiten: ${b.besonderheiten}`);
    if (b.material) zeilen.push(`  Material: ${b.material}`);
    return zeilen.join("\n");
  }).join("\n") || "keine Tagesberichte erfasst";

  const kolonnenText = kolonnen.map(k =>
    `- ${k.name}: ${k.mitarbeiter?.length || 0} Mann${k.vorarbeiter ? `, Vorarbeiter ${k.vorarbeiter}` : ""}, Einsatz: ${k.einsatz || "—"}`
  ).join("\n") || "keine Kolonnen erfasst";

  const wetterText = (wetterVorhersage || []).map(f => {
    const warn = betonCheck({ temp: f.max, wind: f.wind, rain: f.rain });
    const status = warn.length ? warn.join("; ") : "keine Einschränkungen für Betonage";
    return `- ${f.day} ${new Date(f.date).toLocaleDateString("de-DE")}: ${f.min}–${f.max}°C, Regen ${f.rain}mm, Wind ${f.wind}km/h → ${status}`;
  }).join("\n") || "keine Wettervorhersage verfügbar";

  const terminText = terminprognose?.zielTermin
    ? `Berechneter Fertigstellungstermin: ${terminprognose.projektEnde.toLocaleDateString("de-DE")}. `
      + `Ziel laut gesetzten Fälligkeitsdaten: ${terminprognose.zielTermin.toLocaleDateString("de-DE")}. `
      + (terminprognose.deltaTage > 0
        ? `Aktuell ${terminprognose.deltaTage} Tag(e) Verzug gegenüber diesem Ziel.`
        : "Aktuell im Plan.")
    : "keine Terminberechnung möglich (keine Fälligkeitsdaten an Aufgaben gesetzt)";

  return `Du bist ein erfahrener Baustellen-Assistent in der App "Polaris". Du beantwortest Fragen eines Poliers, Vorarbeiters oder Bauleiters ausschließlich anhand der unten aufgeführten echten Projektdaten.

VERBINDLICHE REGELN:
- Erfinde niemals Zahlen, Prozentangaben, Uhrzeiten oder Fakten, die sich nicht aus den Daten unten ableiten lassen.
- Wenn eine angefragte Information nicht in den Daten enthalten ist (z.B. Wetter für ein Datum außerhalb der 7-Tage-Vorhersage, eine nicht existierende Aufgabe oder Kolonne), sage das ausdrücklich — rate niemals.
- Bei sicherheitsrelevanten Einschätzungen (insbesondere Betonage/Wetter) nenne die konkreten Grenzwerte, die zur Einschätzung geführt haben, und erwähne verbleibende Unsicherheit statt falscher Präzision vorzutäuschen.
- Antworte kurz, konkret und in der Sprache eines erfahrenen Poliers — keine Floskeln, keine Wiederholung der Frage.

HEUTE: ${heute}
PROJEKT: ${projekt?.name || "—"}${projekt?.ort ? `, ${projekt.ort}` : ""}

OFFENE AUFGABEN:
${aufgabenText}

ERLEDIGTE AUFGABEN (zuletzt abgeschlossen, max. 25):
${erledigtText}

KOMMENTARE ZU AUFGABEN (chronologisch, max. 40):
${kommentareText}

TAGESBERICHTE (zuletzt erstellt, max. 10):
${tagesberichteText}

KOLONNEN:
${kolonnenText}

WETTERVORHERSAGE (7 Tage, sofern verfügbar):
${wetterText}

TERMINPROGNOSE:
${terminText}`;
}

export async function kiProjektFrage(frage, verlauf, kontext, session) {
  const system = baueProjektKontext(kontext);
  const messages = [
    ...verlauf.map(m => ({ role: m.rolle === "ki" ? "assistant" : "user", content: m.text })),
    { role: "user", content: frage },
  ];
  const data = await rufeKiProxyAuf({ system, messages, maxTokens: 1200 }, session);
  return data.content?.find(b => b.type === "text")?.text || "";
}

const GUELTIGE_PROJEKTTYPEN = ["hochbau", "tiefgarage", "tiefbau", "dach", "pv"];

// Extrahiert Baustellen-Stammdaten aus einem Diktat — füllt nur das
// Neue-Baustelle-Formular vor, legt NICHTS selbst an. Der Administrator
// sieht die übernommenen Felder vor dem Speichern und kann sie noch
// korrigieren; das Anlegen selbst läuft weiter über den normalen
// "Speichern"-Klick im Formular.
export async function kiBaustelleAnlegen(diktat, session) {
  const prompt = `Du extrahierst aus einem gesprochenen Diktat die Stammdaten für eine neue Baustelle in einer Bauleitungs-App.

Diktat:
"${diktat}"

Erfinde NICHTS, was im Diktat nicht vorkommt — nicht erwähnte Felder bleiben ein leerer String. Antworte NUR mit einem JSON-Objekt ohne Markdown:
{
  "typ": "hochbau|tiefgarage|tiefbau|dach|pv — welche Bauart am ehesten passt, sonst \\"hochbau\\"",
  "name": "Projektname",
  "adresse": "Straße und Hausnummer",
  "plz": "Postleitzahl",
  "ort": "Ort",
  "projektnummer": "Projekt-/Auftragsnummer falls genannt",
  "bauleiter": "Name des Bauleiters falls genannt",
  "auftraggeber": "Name des Auftraggebers falls genannt"
}`;

  const data = await rufeClaudeAuf(prompt, 800, session);
  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  try {
    const r = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      typ:           GUELTIGE_PROJEKTTYPEN.includes(r.typ) ? r.typ : "hochbau",
      name:          r.name || "",
      adresse:       r.adresse || "",
      plz:           r.plz || "",
      ort:           r.ort || "",
      projektnummer: r.projektnummer || "",
      bauleiter:     r.bauleiter || "",
      auftraggeber:  r.auftraggeber || "",
    };
  } catch {
    return null;
  }
}

// ── KI-Angebotserstellung: Positionen aus den hinterlegten Einheitspreisen ──
// Die KI erfindet NIE einen Preis — sie bekommt den kompletten Einheitspreise-
// Katalog der Firma mit ep_id und wählt daraus passende Positionen samt
// geschätzter Menge aus. Der tatsächliche Preis wird danach IMMER clientseitig
// über die ep_id aus der aktuellen einheitspreise-Liste aufgelöst (genau wie
// beim Laden einer LV-Vorlage in AngebotEditor.vorlageLaden) — ein von der KI
// halluzinierter Preis kann also nie ins Angebot gelangen. Passt kein
// Katalogeintrag, liefert die KI ep_id:null; die Position landet dann mit
// ep:0 im Angebot, damit der Nutzer den Preis manuell ergänzt statt dass die
// KI ihn sich ausdenkt.
export async function kiAngebotErstellen(diktat, einheitspreise, projekt, session) {
  const katalogText = (einheitspreise || []).map(p =>
    `id=${p.id}: ${p.gewerk} · ${p.beschreibung} · Einheit ${p.einheit}`
  ).join("\n") || "kein Einheitspreise-Katalog hinterlegt";

  const prompt = `Du bist ein erfahrener Kalkulator im Baugewerbe und erstellst aus einer Leistungsbeschreibung die Positionen für ein Angebot.

Projekt: ${projekt?.name || ""}${projekt?.ort ? `, ${projekt.ort}` : ""}

Verfügbarer Einheitspreise-Katalog dieser Firma (NUR daraus per id auswählen, NIE einen eigenen Preis nennen):
${katalogText}

Leistungsbeschreibung (Diktat):
"${diktat}"

Antworte NUR mit einem JSON-Objekt ohne Markdown:
{
  "titel": "Kurzer Angebotstitel falls aus dem Diktat ableitbar, sonst leerer String",
  "empfaenger": "Name des Auftraggebers falls genannt, sonst leerer String",
  "positionen": [
    {
      "bez": "Bezeichnung der Position",
      "menge": 0,
      "einheit": "m²|m³|m|t|h|Stk|pau",
      "ep_id": 0,
      "rabatt": 0
    }
  ]
}
Für "ep_id" ausschließlich eine id aus dem Katalog oben verwenden. Passt keine Katalogposition zur Leistung, setze "ep_id": null — erfinde NIEMALS eine eigene id oder einen eigenen Preis.
"rabatt" ist ein Prozentsatz (0-100) für diese eine Position — NUR setzen, wenn im Diktat für genau diese Position ausdrücklich ein Rabatt/Nachlass/Abschlag genannt wird (z.B. "10% Rabatt auf die Bodenplatte"), sonst 0. Nie einen Rabatt erfinden oder auf andere Positionen übertragen.`;

  const data = await rufeClaudeAuf(prompt, 1500, session);
  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  try {
    const r = JSON.parse(text.replace(/```json|```/g, "").trim());
    const katalogIds = new Set((einheitspreise || []).map(p => p.id));
    return {
      titel: r.titel || "",
      empfaenger: r.empfaenger || "",
      positionen: (Array.isArray(r.positionen) ? r.positionen : []).map(p => ({
        bez: p.bez || "",
        menge: Number(p.menge) || 0,
        einheit: p.einheit || "Stk",
        ep_id: katalogIds.has(p.ep_id) ? p.ep_id : null,
        rabatt: Math.min(100, Math.max(0, Number(p.rabatt) || 0)),
      })).filter(p => p.bez),
    };
  } catch {
    return null;
  }
}

// ── KI-Vorlagenanalyse: Text/Struktur-Vorschläge aus einer hochgeladenen
// .docx-Vorlage ──────────────────────────────────────────────────────────
// Läuft EINMALIG beim Hochladen einer Vorlage, nicht bei jeder Angebots-
// erstellung. Die KI bekommt nur den per mammoth extrahierten Rohtext der
// Datei (nie die Originaldatei/XML selbst) und schlägt Einleitungs-/
// Schlusstext sowie Tabellen-Spaltenbeschriftungen vor. Der Admin sieht die
// Vorschläge vor dem Speichern und kann sie korrigieren — das tatsächliche
// Angebots-Dokument wird später NIE aus dieser Datei heraus bearbeitet,
// sondern sauber neu aus diesen (ggf. korrigierten) Textbausteinen
// generiert (siehe lib/angebotVorlage.js). Nicht erkennbare Felder kommen
// als leerer String zurück statt erfunden zu werden.
export async function kiAngebotVorlageAnalysieren(text, session) {
  const prompt = `Du analysierst den Text einer von einem Bauunternehmen hochgeladenen Word-Vorlage für Angebote und schlägst daraus wiederverwendbare Textbausteine für eine automatisch generierte Angebots-Vorlage vor.

Text der hochgeladenen Datei:
"""
${(text || "").slice(0, 8000)}
"""

Erfinde NICHTS, was sich nicht aus dem Text ableiten lässt — nicht erkennbare Felder bleiben ein leerer String. Antworte NUR mit einem JSON-Objekt ohne Markdown:
{
  "intro_text": "Einleitungstext vor der Positionstabelle, falls erkennbar (z.B. 'Sehr geehrte Damen und Herren, hiermit unterbreiten wir Ihnen folgendes Angebot:'), sonst leerer String",
  "footer_text": "Schluss-/Grußtext nach der Positionstabelle, falls erkennbar (z.B. Zahlungsbedingungen, Gültigkeitshinweis, Grußformel), sonst leerer String",
  "spalte_bez": "Beschriftung der Bezeichnungs-Spalte falls abweichend vom Standard, sonst leerer String",
  "spalte_menge": "Beschriftung der Mengen-Spalte falls abweichend vom Standard, sonst leerer String",
  "spalte_einheit": "Beschriftung der Einheits-Spalte falls abweichend vom Standard, sonst leerer String",
  "spalte_ep": "Beschriftung der Einzelpreis-Spalte falls abweichend vom Standard, sonst leerer String",
  "spalte_gp": "Beschriftung der Gesamtpreis-Spalte falls abweichend vom Standard, sonst leerer String"
}`;

  const data = await rufeClaudeAuf(prompt, 1500, session,
    "Bitte eine andere Vorlage hochladen oder die Felder unten manuell ausfüllen.");
  const responseText = data.content?.find(b => b.type === "text")?.text || "{}";
  try {
    const r = JSON.parse(responseText.replace(/```json|```/g, "").trim());
    return {
      intro_text:    r.intro_text || "",
      footer_text:   r.footer_text || "",
      spalte_bez:    r.spalte_bez || "",
      spalte_menge:  r.spalte_menge || "",
      spalte_einheit:r.spalte_einheit || "",
      spalte_ep:     r.spalte_ep || "",
      spalte_gp:     r.spalte_gp || "",
    };
  } catch {
    return null;
  }
}

// ── KI-Vorlagenanalyse: Text-Vorschläge für die Bautagebuch-Vorlage ──────
// Gleiches Prinzip wie kiAngebotVorlageAnalysieren, aber für den
// Bautagebuch-Export: statt Tabellen-Spaltenbeschriftungen (Bautagebuch hat
// keine Positionstabelle) schlägt die KI hier Abschnitts-Beschriftungen vor
// (z.B. "Tätigkeiten" → "Ausgeführte Leistungen"), plus Einleitungs-/
// Schlusstext. Die hochgeladene Datei wird auch hier nie bearbeitet —
// jeder Bericht wird sauber neu generiert (siehe lib/tagebuchVorlage.js).
export async function kiTagebuchVorlageAnalysieren(text, session) {
  const prompt = `Du analysierst den Text einer von einem Bauunternehmen hochgeladenen Word-Vorlage für Bautagebücher und schlägst daraus wiederverwendbare Textbausteine für eine automatisch generierte Bautagebuch-Vorlage vor.

Text der hochgeladenen Datei:
"""
${(text || "").slice(0, 8000)}
"""

Erfinde NICHTS, was sich nicht aus dem Text ableiten lässt — nicht erkennbare Felder bleiben ein leerer String. Antworte NUR mit einem JSON-Objekt ohne Markdown:
{
  "intro_text": "Einleitungstext/Hinweis vor den Berichtsdaten, falls erkennbar, sonst leerer String",
  "footer_text": "Schlusstext nach dem Bericht, z.B. Hinweis zur Rechtsverbindlichkeit oder Aufbewahrungspflicht, falls erkennbar, sonst leerer String",
  "label_taetigkeit": "Beschriftung des Tätigkeiten-Abschnitts falls abweichend vom Standard 'Tätigkeiten', sonst leerer String",
  "label_besonderheiten": "Beschriftung des Besonderheiten-Abschnitts falls abweichend vom Standard 'Besonderheiten / Mängel', sonst leerer String",
  "label_material": "Beschriftung des Material-Abschnitts falls abweichend vom Standard 'Materiallieferungen', sonst leerer String",
  "label_personal": "Beschriftung des Personal-Abschnitts falls abweichend vom Standard 'Personal & Stunden', sonst leerer String"
}`;

  const data = await rufeClaudeAuf(prompt, 1500, session,
    "Bitte eine andere Vorlage hochladen oder die Felder unten manuell ausfüllen.");
  const responseText = data.content?.find(b => b.type === "text")?.text || "{}";
  try {
    const r = JSON.parse(responseText.replace(/```json|```/g, "").trim());
    return {
      intro_text:           r.intro_text || "",
      footer_text:          r.footer_text || "",
      label_taetigkeit:     r.label_taetigkeit || "",
      label_besonderheiten: r.label_besonderheiten || "",
      label_material:       r.label_material || "",
      label_personal:       r.label_personal || "",
    };
  } catch {
    return null;
  }
}

export async function kiTagesabschluss(diktat, projekt, kolonnen, wetter, aufgaben, session) {
  const heute = new Date().toLocaleDateString("de-DE");
  const heuteISO = new Date().toISOString().slice(0,10);
  const wetterInfo = wetter
    ? `${wetter.temp}°C, Wind ${wetter.wind}km/h, Niederschlag ${wetter.rain}mm`
    : "keine Wetterdaten";

  // Bereits in der App erfasste Aufgaben, die für den heutigen Tagesabschluss
  // relevant sind — heute abgeschlossen, aktuell in Arbeit, oder heute zur
  // Bestätigung vorgeschlagen. Ohne das kannte die KI nur, was im Diktat
  // erwähnt wurde, und "vergaß" alles, was der Polier zu erwähnen vergaß,
  // obwohl die App es längst wusste.
  const aufgabenHeute = (aufgaben || []).filter(a =>
    (a.status === "abgeschlossen" && a.updated_at?.slice(0,10) === heuteISO) ||
    a.status === "in_arbeit" ||
    a.status === "zur_pruefung"
  );
  const aufgabenInfo = aufgabenHeute.length
    ? aufgabenHeute.map(a => {
        const statusLabel = a.status === "abgeschlossen" ? "heute abgeschlossen"
          : a.status === "zur_pruefung" ? "heute zur Bestätigung vorgeschlagen"
          : "in Arbeit";
        return `- ${a.titel} (${AUFGABEN_TYPEN[a.typ]?.label || a.typ}) — ${statusLabel}`;
      }).join("\n")
    : "keine erfassten Aufgaben mit Status-Änderung heute";

  const prompt = `Du bist ein erfahrener Polier-Assistent. Analysiere dieses Diktat vom Tagesabschluss und extrahiere strukturierte Daten.

Datum: ${heute}
Projekt: ${projekt?.name || ""}
Wetter heute: ${wetterInfo}
Kolonnen: ${kolonnen.map(k=>k.name).join(", ")}

Bereits in der App erfasste Aufgaben (in die Tätigkeitsbeschreibung einbeziehen, auch wenn im Diktat nicht erwähnt — für diese NICHT zusätzlich eine "neue_aufgabe" vorschlagen):
${aufgabenInfo}

Diktat des Poliers:
"${diktat}"

Antworte NUR mit diesem JSON (kein Markdown, keine Erklärungen):
{
  "bericht": {
    "taetigkeit": "Professionelle Beschreibung der heutigen Tätigkeiten (3-4 Sätze, VOB-konform)",
    "besonderheiten": "Besonderheiten, Probleme, Vorkommnisse (oder leerer String)",
    "material": "Erwähnte Materiallieferungen (oder leerer String)",
    "arbeiter": 0
  },
  "neue_aufgaben": [
    {
      "titel": "Aufgabentitel",
      "typ": "beton|schalung|bewehrung|abdichtung|allgemein",
      "prioritaet": "niedrig|mittel|hoch|kritisch",
      "beschreibung": "Details"
    }
  ],
  "neue_maengel": [
    {
      "titel": "Mangelbeschreibung",
      "mangel_verursacher": "Wer hat den Mangel verursacht",
      "prioritaet": "mittel|hoch|kritisch"
    }
  ],
  "wetter_warnung": "Warnung wenn morgen kritisches Wetter für geplante Arbeiten (oder leerer String)"
}`;

  // 1500 war bei einem ausführlichen Diktat (mehrere Kolonnen, mehrere neue
  // Aufgaben UND Mängel als JSON-Arrays) knapp genug, dass die Antwort mitten
  // im JSON abgeschnitten werden konnte — der Polier bekam dann ausgerechnet
  // beim größten Tagesabschluss nur "KI-Antwort konnte nicht ausgewertet
  // werden" statt eines Ergebnisses.
  const data = await rufeClaudeAuf(prompt, 4000, session);
  const text = data.content?.find(b=>b.type==="text")?.text || "{}";
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

// ── KI-Mängelerkennung aus Foto ─────────────────────────────────────────
// Läuft NUR auf Tastendruck (eigener Button im Mangel-Details-Block von
// AufgabenFormular.jsx), nie automatisch beim Hochladen. Der ki-proxy
// reicht "messages" unverändert an Anthropic durch (siehe
// supabase/functions/ki-proxy/index.ts) — content kann deshalb hier,
// anders als bei den reinen Text-Aufrufen oben, ein Array aus Bild- und
// Text-Block sein (Vision), ohne dass die Edge Function angepasst werden
// müsste. Wie bei kiBaustelleAnlegen wird nur das Formular vorausgefüllt;
// der Nutzer sieht den Vorschlag vor dem Speichern und kann ihn
// korrigieren oder verwerfen.
const GUELTIGE_MANGEL_PRIO = ["niedrig", "mittel", "hoch", "kritisch"];

export async function kiMangelAusFoto(fotoDataUrl, session) {
  const treffer = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(fotoDataUrl || "");
  if (!treffer) throw new Error("Kein auswertbares Foto vorhanden.");
  const [, mediaType, base64Data] = treffer;

  const prompt = `Du bist ein erfahrener Bauleiter und begutachtest ein Foto eines Mangels auf einer Baustelle.

Beschreibe ausschließlich, was auf dem Foto tatsächlich zu erkennen ist. Wenn du dir bei einem Feld unsicher bist (z.B. welches Gewerk den Mangel verursacht hat), lass es leer statt zu raten.

Antworte NUR mit einem JSON-Objekt ohne Markdown:
{
  "titel": "Kurze, fachliche Mangelbeschreibung (z.B. \\"Riss in Bodenplatte, ca. 30cm\\")",
  "beschreibung": "Ausführlichere Beschreibung des erkennbaren Schadens (2-3 Sätze)",
  "verursacher": "Vermutliches Gewerk, NUR falls auf dem Foto eindeutig erkennbar (z.B. \\"Estrich\\", \\"Elektrik\\"), sonst leerer String",
  "prioritaet": "niedrig|mittel|hoch|kritisch — Einschätzung allein nach sichtbarem Schadensausmaß"
}`;

  const data = await rufeKiProxyAuf({
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
        { type: "text", text: prompt },
      ],
    }],
    maxTokens: 600,
  }, session, "Bitte ein anderes Foto wählen oder die Felder manuell ausfüllen.");

  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  try {
    const r = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      titel:        r.titel || "",
      beschreibung: r.beschreibung || "",
      verursacher:  r.verursacher || "",
      prioritaet:   GUELTIGE_MANGEL_PRIO.includes(r.prioritaet) ? r.prioritaet : "mittel",
    };
  } catch {
    return null;
  }
}

// Läuft VOR jeder Firmenanlage — es gibt also noch keine firma_id und
// keinen firmenspezifischen Anthropic-Key, deshalb ein eigener Endpunkt
// (nicht ki-proxy): firma-recherche nutzt einen Plattform-Key, der laut
// Server serverseitig nur für Nutzer OHNE firma_id funktioniert, und
// durchsucht das Web über Anthropics Websuche-Werkzeug statt nur zu raten.
// Nicht gefundene Felder kommen als null zurück (nie erfunden) — der
// Aufrufer (OnboardingFlow) markiert sie entsprechend zur manuellen Prüfung.
export async function kiFirmenRecherche(name, ort, session) {
  if (!session?.access_token) {
    throw new Error("Keine gültige Sitzung für die Firmenrecherche.");
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/firma-recherche`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ name, ort }),
  });
  if (!res.ok) {
    const fehlerBody = await res.json().catch(() => ({}));
    throw new Error(fehlerBody?.error || `Firmenrecherche fehlgeschlagen (${res.status})`);
  }
  return res.json(); // { firma, quellen, hinweis }
}
