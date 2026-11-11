// Fachwissen für den KI-Angebots-Agenten, bewusst als Daten statt im
// Prompt: Synonyme machen die Katalogsuche robust gegen die Sprache auf der
// Baustelle ("BE", "Drän", "KS-Wand"), Checklisten sorgen dafür, dass bei
// einer Leistung die üblichen Nebenleistungen nicht vergessen werden — der
// häufigste Fehler unerfahrener Kalkulierer.

// Gruppen gleichbedeutender Begriffe (normalisiert: klein, ae/oe/ue/ss).
export const SYNONYM_GRUPPEN = [
  ["baustelleneinrichtung", "be", "baustellen einrichtung", "einrichten", "raeumen"],
  ["aushub", "erdaushub", "bodenaushub", "baugrube", "ausheben", "erdarbeiten", "abtrag"],
  ["verfuellen", "verfuellung", "hinterfuellen", "hinterfuellung", "rueckverfuellung", "andecken"],
  ["entsorgung", "abfuhr", "abtransport", "deponie", "entsorgen", "abfahren"],
  ["drainage", "draenage", "draen", "drainrohr", "draenrohr", "sickerrohr"],
  ["abdichtung", "abdichten", "bitumen", "dickbeschichtung", "kmb", "pmbc", "schweissbahn", "dichtschlaemme"],
  ["daemmung", "daemmen", "isolierung", "perimeterdaemmung", "xps", "eps", "waermedaemmung"],
  ["noppenbahn", "noppenfolie", "schutzbahn", "noppen"],
  ["bewehrung", "betonstahl", "baustahl", "eisen", "stahl", "bst", "matten", "stabstahl"],
  ["schalung", "schalen", "verschalung", "schaltafel", "einschalen"],
  ["beton", "ortbeton", "betonieren", "betonage"],
  ["bodenplatte", "sohle", "fundamentplatte", "sohlplatte"],
  ["fundament", "streifenfundament", "einzelfundament", "fundamente"],
  ["decke", "geschossdecke", "deckenplatte", "filigrandecke", "elementdecke"],
  ["mauerwerk", "mauern", "wand", "ks", "kalksandstein", "poroton", "ziegel", "porenbeton", "ytong"],
  ["estrich", "zementestrich", "fliessestrich", "ze"],
  ["geruest", "fassadengeruest", "arbeitsgeruest", "einruesten"],
  ["dachdeckung", "eindeckung", "dachziegel", "dachstein", "dachdecken"],
  ["dachabdichtung", "flachdach", "dachbahn", "folienabdichtung"],
  ["sauberkeitsschicht", "unterbeton", "magerbeton"],
  ["schotter", "frostschutz", "tragschicht", "kies"],
  ["kernbohrung", "bohrung", "durchbruch", "kernbohren"],
  ["abbruch", "rueckbau", "abriss", "abbrechen"],
  ["betoninstandsetzung", "betonsanierung", "spritzbeton", "reprofilierung", "pcc"],
  ["beschichtung", "parkdeckbeschichtung", "os8", "os11", "versiegelung"],
  ["fuge", "fugen", "dehnfuge", "fugenabdichtung", "fugenband"],
  ["kran", "turmdrehkran", "autokran", "mobilkran"],
  ["stunde", "stundenlohn", "regie", "regiearbeit", "stundenlohnarbeiten"],
];

const SYNONYM_INDEX = (() => {
  const m = new Map();
  for (const gruppe of SYNONYM_GRUPPEN) for (const w of gruppe) m.set(w, gruppe);
  return m;
})();

export function synonymeVon(wort) {
  return SYNONYM_INDEX.get(wort) || [wort];
}

// Checklisten: welche Positionen bei einer Leistungsart typischerweise
// dazugehören. Schlüsselwörter (normalisiert) entscheiden, welche Liste
// greift; mehrere Listen können zutreffen.
export const CHECKLISTEN = [
  {
    name: "Kellerabdichtung / Perimeter",
    stichworte: ["keller", "abdichtung", "perimeter", "daemmung", "noppen", "drainage"],
    positionen: [
      "Baustelleneinrichtung", "Aushub Arbeitsraum (m³, Wandlänge × Tiefe × Arbeitsraumbreite)", "Entsorgung Aushub oder seitliche Lagerung",
      "Wand reinigen / Untergrund vorbereiten", "Abdichtung (m², Wandfläche)", "Hohlkehle / Sockelanschluss (m)",
      "Perimeterdämmung (m²)", "Noppenbahn / Schutzschicht (m²)", "Drainage (m) mit Spülschächten (Stk)",
      "Verfüllen und Verdichten Arbeitsraum (m³)",
    ],
  },
  {
    name: "Bodenplatte / Fundamente",
    stichworte: ["bodenplatte", "fundament", "sohle", "gruendung"],
    positionen: [
      "Baustelleneinrichtung", "Oberboden abtragen", "Aushub (m³)", "Schotter-/Frostschutzschicht (m³ oder m²)",
      "Sauberkeitsschicht (m²)", "PE-Folie / Trennlage (m²)", "Randschalung (m)", "Bewehrung (t)",
      "Beton liefern und einbauen (m³)", "Erdung / Fundamenterder (m)", "Betonpumpe (Psch oder h)",
    ],
  },
  {
    name: "Wände / Mauerwerk",
    stichworte: ["mauerwerk", "wand", "kalksandstein", "poroton", "ziegel", "porenbeton"],
    positionen: [
      "Kimmschicht / Ausgleichsschicht (m)", "Mauerwerk (m², Länge × Höhe abzüglich Öffnungen > 2,5 m²)",
      "Stürze (Stk oder m)", "Ringbalken / Ringanker (m)", "Arbeitsgerüst / Innengerüst (m²)", "Querschnittsabdichtung (m)",
    ],
  },
  {
    name: "Decke",
    stichworte: ["decke", "geschossdecke", "filigran", "elementdecke"],
    positionen: [
      "Deckenschalung oder Filigranplatten (m²)", "Abstützung / Deckenstützen (m²)", "Randschalung (m)",
      "Bewehrung (t)", "Beton (m³, Fläche × Stärke)", "Aussparungen / Durchbrüche (Stk)", "Kran- oder Pumpeneinsatz",
    ],
  },
  {
    name: "Parkhaus / Betoninstandsetzung",
    stichworte: ["parkhaus", "parkdeck", "instandsetzung", "betonsanierung", "tiefgarage", "betoninstandsetzung"],
    positionen: [
      "Baustelleneinrichtung und Verkehrssicherung / Absperrung", "Schadstellen kartieren / Untersuchung",
      "Beton abtragen (m² oder m³, Höchstdruckwasserstrahlen oder Stemmen)", "Bewehrung freilegen, entrosten, Korrosionsschutz (m oder m²)",
      "Reprofilierung PCC/SPCC (m² × Schichtdicke)", "Fugen sanieren (m)", "Oberflächenschutz / Beschichtung OS 8 oder OS 11 (m²)",
      "Markierung (m oder Stk)", "Entsorgung Abbruch (t)",
    ],
  },
  {
    name: "Dach",
    stichworte: ["dach", "dachdeckung", "flachdach", "steildach", "dachabdichtung"],
    positionen: [
      "Gerüst / Fanggerüst (m²)", "Rückbau Altdeckung und Entsorgung (m²)", "Unterspannbahn / Dampfsperre (m²)",
      "Dämmung (m²)", "Lattung / Konterlattung (m²)", "Eindeckung oder Abdichtung (m²)", "Ortgang, First, Traufe (m)",
      "Anschlüsse und Durchdringungen (Stk oder m)", "Dachentwässerung (m, Stk)",
    ],
  },
];

export function checklistenFuer(text) {
  const n = String(text || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  return CHECKLISTEN.filter(c => c.stichworte.some(s => n.includes(s)));
}

// Sicherer Taschenrechner für Mengenermittlungen: nur Zahlen, + − × ÷ * /
// und Klammern, deutsches Komma erlaubt. Kein eval — ein eigener kleiner
// Parser, damit die KI keine Rechenfehler macht und trotzdem nichts
// Ausführbares durchkommt.
export function rechnen(ausdruck) {
  const s = String(ausdruck || "")
    .replace(/×|x(?=\s*[\d(])/g, "*").replace(/÷|:/g, "/").replace(/−/g, "-")
    .replace(/(\d),(\d)/g, "$1.$2").replace(/\s+/g, "");
  if (!/^[\d.+\-*/()]+$/.test(s)) throw new Error("Nur Zahlen, + − × ÷ und Klammern erlaubt.");
  let i = 0;
  const zahl = () => {
    const m = s.slice(i).match(/^\d+(\.\d+)?/);
    if (!m) throw new Error(`Zahl erwartet an Stelle ${i + 1}.`);
    i += m[0].length; return Number(m[0]);
  };
  const faktor = () => {
    if (s[i] === "-") { i++; return -faktor(); }
    if (s[i] === "(") { i++; const v = summe(); if (s[i] !== ")") throw new Error("Klammer fehlt."); i++; return v; }
    return zahl();
  };
  const produkt = () => {
    let v = faktor();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++]; const r = faktor();
      if (op === "/" && r === 0) throw new Error("Division durch 0.");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const summe = () => {
    let v = produkt();
    while (s[i] === "+" || s[i] === "-") { const op = s[i++]; const r = produkt(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const ergebnis = summe();
  if (i !== s.length) throw new Error(`Unerwartetes Zeichen an Stelle ${i + 1}.`);
  return Math.round(ergebnis * 1000) / 1000;
}
