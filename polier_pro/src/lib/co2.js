// CO₂-Bilanz (graue Emissionen, Herstellung A1–A3) für Angebote und Modelle.
//
// Rechenweg: Menge × Emissionsfaktor (kg CO₂-Äq. je Einheit).
//  1. Positionen mit Kalkulation: je Materialposten (z.B. 0,25 m³ Beton C30/37
//     und 25 kg Betonstahl je m² Decke) — genau, weil die Rezeptur die
//     Materialmengen kennt.
//  2. Sonst die Position selbst, wenn ihr Text einen Baustoff nennt und die
//     Einheit passt ("Beton C25/30 liefern und einbauen", m³).
// Faktoren: firmeneigene Liste (Admin → CO₂, aus EPD des Lieferanten oder
// ÖKOBAUDAT) vor den eingebauten Richtwerten. Richtwerte sind Branchen-
// durchschnitte — für Nachweise (QNG, Ausschreibungen mit GWP-Grenzwert)
// immer die EPD des tatsächlich gelieferten Produkts eintragen.

const Q_CSC = "CSC Österreich, Branchenreferenzwert Transportbeton A1–A3 (2026)";
const Q_BR18 = "Generische Daten A1–A3, EU-TRIS-Notifizierung 2026/26757 (Tabelle 7)";
export const CO2_RICHTWERTE = [
  { id: "c1620", name: "Beton C16/20", einheit: "m³", faktor: 180, muster: "c\\s?16\\s?/\\s?20", quelle: Q_CSC },
  { id: "c2025", name: "Beton C20/25", einheit: "m³", faktor: 209, muster: "c\\s?20\\s?/\\s?25", quelle: Q_CSC },
  { id: "c2530", name: "Beton C25/30", einheit: "m³", faktor: 237, muster: "c\\s?25\\s?/\\s?30", quelle: Q_CSC },
  { id: "c3037", name: "Beton C30/37", einheit: "m³", faktor: 250, muster: "c\\s?30\\s?/\\s?37", quelle: Q_CSC },
  { id: "c3545", name: "Beton C35/45", einheit: "m³", faktor: 275, muster: "c\\s?35\\s?/\\s?45", quelle: Q_CSC },
  { id: "c4050", name: "Beton C40/50", einheit: "m³", faktor: 294, muster: "c\\s?40\\s?/\\s?50", quelle: Q_CSC },
  { id: "c5060", name: "Beton C50/60", einheit: "m³", faktor: 314, muster: "c\\s?50\\s?/\\s?60", quelle: Q_CSC },
  { id: "beton", name: "Beton ohne Angabe (wie C30/37)", einheit: "m³", faktor: 250, muster: "beton|stb-|stahlbeton|transportbeton", quelle: `${Q_CSC}, Annahme C30/37` },
  { id: "betonstahl", name: "Betonstahl B500", einheit: "kg", faktor: 0.531, muster: "betonstahl|bewehrung|baustahlmatte|stabstahl|b\\s?500", quelle: "EPD bearbeiteter Bewehrungsstahl, Produktionsmix Deutschland (Heinze)" },
  { id: "baustahl", name: "Baustahl, feuerverzinkt", einheit: "kg", faktor: 0.789, muster: "stahlprofil|baustahl|stahlträger|stahltraeger|\\bhe[abm]\\b|\\bipe\\b", quelle: "PCF feuerverzinkte Baustähle, Institut Feuerverzinken" },
  { id: "ziegel", name: "Mauerziegel", einheit: "m³", faktor: 128.6, muster: "ziegel|hlz|planziegel", quelle: "Rechenwert Mauerziegel A1–A3 (Lücking, Ökobilanz-Vortrag 2024)" },
  { id: "porenbeton", name: "Porenbeton", einheit: "m³", faktor: 243.1, muster: "porenbeton|ytong|gasbeton", quelle: Q_BR18 },
  { id: "gipskarton", name: "Gipskartonplatte Standard", einheit: "m²", faktor: 1.727, muster: "gipskarton|gk-platte|\\bgkb\\b", quelle: Q_BR18 },
  { id: "nadelholz", name: "Bauholz Nadelholz (inkl. gespeichertem CO₂)", einheit: "m³", faktor: -670, muster: "kvh|konstruktionsvollholz|bauholz|kantholz|nadelholz", quelle: `${Q_BR18}; negativ wegen biogenem Kohlenstoff` },
];

const UMRECHNUNG = { t: ["kg", 1000], to: ["kg", 1000], kg: ["kg", 1], "m3": ["m³", 1], "m³": ["m³", 1], cbm: ["m³", 1], "m2": ["m²", 1], "m²": ["m²", 1], qm: ["m²", 1] };
// Menge in der Einheit des Faktors, oder null wenn nicht umrechenbar.
export function mengeInEinheit(menge, von, nach) {
  const a = UMRECHNUNG[String(von || "").trim().toLowerCase()], b = UMRECHNUNG[String(nach || "").trim().toLowerCase()];
  if (!a || !b || a[0] !== b[0]) return null;
  return (Number(menge) || 0) * a[1] / b[1];
}

function passend(text, einheit, faktoren) {
  const t = String(text || "").toLowerCase();
  for (const f of faktoren) {
    let re;
    try { re = new RegExp(f.muster, "i"); } catch { continue; }
    if (!f.muster || !re.test(t)) continue;
    if (mengeInEinheit(1, einheit, f.einheit) == null) continue;
    return f;
  }
  return null;
}

export function faktorListe(eigene) {
  return [...(Array.isArray(eigene) ? eigene.filter(f => f?.muster && Number.isFinite(Number(f.faktor))) : []), ...CO2_RICHTWERTE];
}

// positionen: Angebotspositionen; kalkulationspreise: Stamm-Kostenbausteine.
export function co2Bilanz(positionen, { kalkulationspreise = [], eigeneFaktoren = [] } = {}) {
  const faktoren = faktorListe(eigeneFaktoren);
  const zeilen = [];
  let summe = 0, ohne = 0;
  for (const p of positionen || []) {
    if (!p?.bez || String(p.bez).startsWith("──")) continue;
    const details = [];
    for (const mp of p.kalk?.materialposten || []) {
      const stamm = kalkulationspreise.find(k => k.id === mp.stammId) || mp;
      const f = passend(`${stamm.bez || ""} ${stamm.notiz || ""}`, stamm.einheit, faktoren);
      if (!f) continue;
      const m = mengeInEinheit(mp.menge, stamm.einheit, f.einheit);
      details.push({ material: stamm.bez, menge: Number(mp.menge) || 0, einheit: stamm.einheit, faktor: f, kg: m * Number(f.faktor) });
    }
    let quelle = details.length ? "rezeptur" : null;
    if (!details.length) {
      const f = passend(`${p.bez} ${p.langtext || ""}`, p.einheit, faktoren);
      if (f) {
        details.push({ material: p.bez, menge: Number(p.menge) || 0, einheit: p.einheit, faktor: f, kg: mengeInEinheit(p.menge, p.einheit, f.einheit) * Number(f.faktor) });
        quelle = "position";
      }
    }
    const kg = details.reduce((s, d) => s + d.kg, 0);
    if (!quelle) ohne++;
    summe += kg;
    zeilen.push({ oz: p.oz, bez: p.bez, menge: p.menge, einheit: p.einheit, kg, quelle, details });
  }
  return { zeilen, summe, ohne };
}

// IFC-Gruppen (lib/ifcMengen.js mengenAggregieren): Volumen × Faktor nach Material.
export function co2AusModell(gruppen, eigeneFaktoren = []) {
  const faktoren = faktorListe(eigeneFaktoren);
  return (gruppen || []).map(g => {
    const f = g.volumen > 0 ? passend(`${g.material} ${g.bauteil}`, "m³", faktoren) : null;
    return { ...g, co2: f ? g.volumen * Number(f.faktor) : null, faktor: f };
  });
}

const t = kg => (kg / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 });
export function co2AlsText(bilanz) {
  const mit = bilanz.zeilen.filter(z => z.quelle);
  return `CO₂-Bilanz (Herstellung A1–A3): ${t(bilanz.summe)} t CO₂-Äq.\n`
    + mit.sort((a, b) => b.kg - a.kg).map(z => `- ${z.oz ? `${z.oz} ` : ""}${z.bez}: ${t(z.kg)} t`).join("\n")
    + (bilanz.ohne ? `\n${bilanz.ohne} Position(en) ohne zuordenbaren Baustoff.` : "");
}
