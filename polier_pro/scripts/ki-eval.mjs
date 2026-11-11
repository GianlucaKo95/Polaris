// Qualitätsprüfung des KI-Angebots-Agenten gegen echte Claude-Aufrufe.
//
//   ANTHROPIC_API_KEY=sk-ant-… npm run ki-eval
//   ANTHROPIC_API_KEY=sk-ant-… npm run ki-eval -- 3      (nur Fall 3)
//
// Spielt typische Anfragen aus dem Bauhauptgewerbe gegen einen Muster-
// Stammdatenbestand durch und prüft: Sind die erwarteten Leistungen
// enthalten, stimmen die Mengen (Toleranz), hat jede Position einen Preis
// aus dem Katalog? Rückfragen der KI werden automatisch mit "keine Angabe,
// übliche Annahme treffen" beantwortet. Kostet pro Durchlauf einige Euro
// API-Guthaben — vor jeder Änderung am Prompt oder an den Werkzeugen laufen
// lassen und die Trefferquote vergleichen.

import { katalogBauen } from "../src/lib/katalog.js";
import { agentStarten, agentFortsetzen, vorschlagZuPositionen } from "../src/lib/kiAngebotAgent.js";
import { aehnlichkeit, einheitNormalisieren } from "../src/lib/katalog.js";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODELL = process.env.KI_MODELL || "claude-opus-5";
if (!KEY) { console.error("ANTHROPIC_API_KEY fehlt."); process.exit(1); }

// ── Muster-Stammdaten eines Rohbauers ─────────────────────────────────────
const kalkulationspreise = [
  { id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 52 },
  { id: 2, kategorie: "lohn", bezeichnung: "Helfer", einheit: "h", preis: 42 },
  { id: 10, kategorie: "material", bezeichnung: "Beton C25/30", einheit: "m³", preis: 145 },
  { id: 11, kategorie: "material", bezeichnung: "Betonstahl BSt 500", einheit: "t", preis: 1150 },
  { id: 12, kategorie: "material", bezeichnung: "Schalungsmaterial anteilig", einheit: "m²", preis: 6 },
  { id: 13, kategorie: "material", bezeichnung: "XPS 120 mm", einheit: "m²", preis: 19 },
  { id: 14, kategorie: "material", bezeichnung: "Bitumen-Dickbeschichtung", einheit: "m²", preis: 9 },
  { id: 15, kategorie: "material", bezeichnung: "Noppenbahn", einheit: "m²", preis: 2.8 },
  { id: 16, kategorie: "material", bezeichnung: "Drainrohr DN100 + Kies", einheit: "m", preis: 11 },
  { id: 17, kategorie: "material", bezeichnung: "Schotter 0/32", einheit: "m³", preis: 32 },
  { id: 18, kategorie: "material", bezeichnung: "KS-Stein 17,5 inkl. Mörtel", einheit: "m²", preis: 38 },
  { id: 19, kategorie: "material", bezeichnung: "Beschichtung OS 8", einheit: "m²", preis: 14 },
  { id: 30, kategorie: "geraet", bezeichnung: "Bagger 14 t", einheit: "h", preis: 75 },
  { id: 31, kategorie: "geraet", bezeichnung: "Rüttelplatte", einheit: "h", preis: 12 },
  { id: 32, kategorie: "geraet", bezeichnung: "Betonpumpe", einheit: "h", preis: 160 },
  { id: 40, kategorie: "fremdleistung", bezeichnung: "Entsorgung Boden Z0", einheit: "m³", preis: 24 },
];
const sp = (id, bez, einheit, gewerk, rezeptur) => ({ id, bez, einheit, gewerk, rezeptur: rezeptur.map(([stammId, mengeJeEinheit]) => ({ stammId, mengeJeEinheit })) });
const stammpositionen = [
  sp(101, "Baugrube / Arbeitsraum ausheben, seitlich lagern", "m³", "Erdarbeiten", [[1, 0.05], [30, 0.06]]),
  sp(102, "Boden laden und entsorgen Z0", "m³", "Erdarbeiten", [[30, 0.04], [40, 1]]),
  sp(103, "Arbeitsraum verfüllen und verdichten", "m³", "Erdarbeiten", [[2, 0.15], [30, 0.04], [31, 0.1]]),
  sp(104, "Schottertragschicht 0/32 einbauen und verdichten", "m³", "Erdarbeiten", [[2, 0.4], [17, 1.2], [31, 0.1]]),
  sp(110, "Bodenplatte Beton C25/30 liefern und einbauen", "m³", "Beton", [[1, 0.6], [10, 1.02], [32, 0.08]]),
  sp(111, "Betonstahl liefern, schneiden, biegen, verlegen", "t", "Beton", [[1, 14], [11, 1.03]]),
  sp(112, "Randschalung Bodenplatte", "m", "Beton", [[1, 0.5], [12, 0.3]]),
  sp(113, "Geschossdecke Ortbeton C25/30 liefern und einbauen", "m³", "Beton", [[1, 0.7], [10, 1.02], [32, 0.1]]),
  sp(114, "Deckenschalung inkl. Abstützung", "m²", "Beton", [[1, 0.65], [12, 1]]),
  sp(120, "Mauerwerk Kalksandstein 17,5 cm", "m²", "Mauerwerk", [[1, 0.85], [18, 1]]),
  sp(130, "Kellerwand Abdichtung Bitumen-Dickbeschichtung zweilagig", "m²", "Abdichtung", [[1, 0.35], [14, 1.05]]),
  sp(131, "Perimeterdämmung XPS 120 mm", "m²", "Abdichtung", [[1, 0.2], [13, 1.05]]),
  sp(132, "Noppenbahn als Schutzschicht", "m²", "Abdichtung", [[2, 0.08], [15, 1.1]]),
  sp(133, "Drainage DN 100 in Kiespackung", "m", "Abdichtung", [[1, 0.35], [16, 1]]),
  sp(140, "Parkdeckbeschichtung OS 8 inkl. Untergrundvorbereitung", "m²", "Betoninstandsetzung", [[1, 0.25], [19, 1]]),
];
const einheitspreise = [{ id: 1, gewerk: "Allgemein", beschreibung: "Baustelleneinrichtung einrichten und räumen", einheit: "Psch", preis: 1800 }];
const standardZuschlaege = { zuschlagLohn: 35, zuschlagMaterial: 20, zuschlagGeraet: 20, zuschlagFremdleistung: 12 };
const katalog = katalogBauen({ stammpositionen, einheitspreise, kalkulationspreise, standardZuschlaege });

// ── Testfälle: erwartet = [Suchtext, Einheit, [min, max]] ────────────────
const FAELLE = [
  { anfrage: "Kunde will die Kellerwände abdichten. 40 m Außenwand, 2,50 m tief. Mit Dämmung und Drainage.",
    erwartet: [["Abdichtung Kellerwand", "m²", [95, 110]], ["Perimeterdämmung", "m²", [95, 110]], ["Noppenbahn", "m²", [95, 110]], ["Drainage", "m", [38, 50]], ["Baustelleneinrichtung", "Psch", [1, 1]]] },
  { anfrage: "Bodenplatte 10 x 12 m, 25 cm stark, auf Schotter 20 cm.",
    erwartet: [["Bodenplatte Beton", "m³", [29, 32]], ["Betonstahl", "t", [1.5, 5]], ["Schotter", "m³", [23, 27]], ["Randschalung", "m", [43, 46]]] },
  { anfrage: "KS-Wände 17,5 im EG, insgesamt 35 m Wandlänge, Raumhöhe 2,75, zwei Türöffnungen 1 x 2,10.",
    erwartet: [["Mauerwerk Kalksandstein", "m²", [88, 97]]] },
  { anfrage: "Geschossdecke 120 qm, 20 cm Ortbeton, normal bewehrt.",
    erwartet: [["Geschossdecke Ortbeton", "m³", [23, 26]], ["Deckenschalung", "m²", [115, 125]], ["Betonstahl", "t", [1.5, 4]]] },
  { anfrage: "Parkdeck neu beschichten, 800 m², OS 8.",
    erwartet: [["Parkdeckbeschichtung", "m²", [790, 810]]] },
  { anfrage: "Baugrube 15 x 10 m, 2 m tief ausheben, Boden abfahren.",
    erwartet: [["Baugrube ausheben", "m³", [290, 330]], ["Boden entsorgen", "m³", [290, 330]]] },
  { anfrage: "BE, Drän 25m, Perimter 60qm, Noppe gleiche Fläche",
    erwartet: [["Baustelleneinrichtung", "Psch", [1, 1]], ["Drainage", "m", [25, 25]], ["Perimeterdämmung", "m²", [60, 60]], ["Noppenbahn", "m²", [60, 60]]] },
  { anfrage: "Garage als Massivbau, Bodenplatte und KS-Wände, ca. 6 x 3 m.",
    erwartet: [["Bodenplatte Beton", "m³", [3, 8]], ["Mauerwerk Kalksandstein", "m²", [30, 60]]] },
];

async function rufeKi(system, messages, tools) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODELL, max_tokens: 4000, system, messages, tools }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function bewerten(ergebnis, fall) {
  const zeilen = [];
  let ok = 0;
  for (const [suche, einheit, [min, max]] of fall.erwartet) {
    const kandidaten = ergebnis.positionen.filter(p => einheitNormalisieren(p.einheit) === einheitNormalisieren(einheit)
      && Math.max(aehnlichkeit(suche, p.bez), aehnlichkeit(suche, p.preisquelle?.bez || "")) >= 0.5);
    const treffer = kandidaten.find(p => p.menge >= min && p.menge <= max);
    if (treffer) ok++;
    zeilen.push(`   ${treffer ? "✓" : "✗"} ${suche} (${min}–${max} ${einheit})${treffer ? ` → ${treffer.menge}` : kandidaten.length ? ` → Menge ${kandidaten.map(k => k.menge).join("/")}` : " → fehlt"}`);
  }
  const ohnePreis = ergebnis.positionen.filter(p => !(p.ep > 0));
  return { ok, gesamt: fall.erwartet.length, ohnePreis, zeilen };
}

const nur = process.argv[2] ? Number(process.argv[2]) : null;
let summeOk = 0, summeGesamt = 0, summeOhnePreis = 0;
for (const [i, fall] of FAELLE.entries()) {
  if (nur && nur !== i + 1) continue;
  process.stdout.write(`\nFall ${i + 1}: ${fall.anfrage}\n`);
  try {
    let r = await agentStarten({ anfrage: fall.anfrage, katalog, kontext: { projekt: { name: "Eval" } }, rufeKi });
    if (r.status === "rueckfrage") {
      console.log(`   Rückfragen: ${r.fragen.join(" | ")}`);
      r = await agentFortsetzen({ ...r, antworten: r.fragen.map(() => ""), katalog, kontext: {}, rufeKi });
    }
    if (r.status !== "fertig") { console.log(`   ✗ ${r.fehler}`); summeGesamt += fall.erwartet.length; continue; }
    const ergebnis = vorschlagZuPositionen(r.vorschlag, { katalog, stammpositionen, kalkulationspreise, standardZuschlaege });
    const b = bewerten(ergebnis, fall);
    b.zeilen.forEach(z => console.log(z));
    if (b.ohnePreis.length) console.log(`   ! ohne Preis: ${b.ohnePreis.map(p => p.bez).join(", ")}`);
    summeOk += b.ok; summeGesamt += b.gesamt; summeOhnePreis += b.ohnePreis.length;
  } catch (e) {
    console.log(`   ✗ Fehler: ${e.message}`);
    summeGesamt += fall.erwartet.length;
  }
}
console.log(`\nErgebnis: ${summeOk}/${summeGesamt} erwartete Positionen mit richtiger Menge (${Math.round(summeOk / Math.max(1, summeGesamt) * 100)} %), ${summeOhnePreis} Positionen ohne Preis.`);
