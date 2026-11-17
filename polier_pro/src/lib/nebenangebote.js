// Nebenangebote (1.90): technisch gleichwertige, günstigere Ausführungen.
//
// Die KI schlägt Alternativen zu Positionen oder Positionsgruppen vor (z.B.
// Filigrandecke statt Ortbetondecke, KS-Plansteine statt Mauerwerk mit
// Mörtelfuge). Die neuen Positionen rechnet die KI-Vorkalkulation mit den
// eigenen Bausteinen (lib/kiVorkalkulation.js), die Ersparnis ergibt sich
// also aus den eigenen Preisen. Übernommen wird ein Nebenangebot als eigener
// Abschnitt mit Alternativpositionen (nicht in der Angebotssumme).
// Bei öffentlichen Vergaben sind Nebenangebote nur zulässig, wenn der
// Auftraggeber sie zugelassen hat; das zeigt die Oberfläche an.

import { istTitel, inSumme } from "./lv.js";
import { blockVorkalkulieren, vorschlagAnwenden } from "./kiVorkalkulation.js";

const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const zahlDe = (n, st = 3) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const r3 = n => Math.round(n * 1000) / 1000;

export const NEBEN_WERKZEUG = {
  name: "nebenangebote_abgeben",
  description: "Gibt Vorschläge für Nebenangebote ab.",
  input_schema: {
    type: "object",
    properties: {
      vorschlaege: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titel: { type: "string" },
            ersetzt: { type: "array", items: { type: "integer" }, description: "Nummern (#) der ersetzten Positionen" },
            idee: { type: "string", description: "Was anders gemacht wird, 1–2 Sätze" },
            gleichwertigkeit: { type: "string", description: "Warum technisch gleichwertig (Norm, Tragfähigkeit, Bauphysik)" },
            voraussetzungen: { type: "string", description: "Was geklärt sein muss (Statik, Zulassung, Termin, Zustimmung)" },
            positionen: { type: "array", items: { type: "object", properties: {
              kurztext: { type: "string" }, langtext: { type: "string" }, einheit: { type: "string" },
              bezug: { type: "integer", description: "Nummer (#) der Position, deren Menge übernommen wird" },
              faktor: { type: "number", description: "Menge = Menge der Bezugsposition × faktor" },
              menge: { type: "number", description: "Nur ohne Bezug" },
            }, required: ["kurztext", "einheit"] } },
          },
          required: ["titel", "ersetzt", "idee", "gleichwertigkeit", "positionen"],
        },
      },
    },
    required: ["vorschlaege"],
  },
};

export function nebenPrompt() {
  return `Du bist erfahrener Kalkulator und Bauingenieur und suchst Nebenangebote: technisch gleichwertige Ausführungen, die günstiger oder schneller sind.
- Nur echte Alternativen mit gleicher Funktion, Qualität und Normkonformität. Keine Qualitätsabstriche, keine Weglassungen.
- Bevorzuge Alternativen, die sich mit den Kostenbausteinen der Firma rechnen lassen.
- Beschreibe die neuen Positionen als LV-Positionen; die Menge nimm über bezug und faktor aus der ersetzten Position.
- Höchstens 5 Vorschläge, die mit dem größten Hebel zuerst. Keine Preise nennen.
Rufe genau einmal ${NEBEN_WERKZEUG.name} auf. Deutsch.`;
}

export function nebenKontext(positionen, kalkulationspreise) {
  let nr = 0;
  const map = new Map();
  const lv = (positionen || []).map(p => {
    if (istTitel(p)) return `— ${String(p.bez).replace(/─/g, "").trim()} —`;
    if (!inSumme(p)) return null;
    map.set(++nr, p);
    return `#${nr}${p.oz ? ` | OZ ${p.oz}` : ""} | ${zahlDe(p.menge)} ${p.einheit || ""} | GP ${eur((Number(p.menge) || 0) * (Number(p.ep) || 0))} | ${kurz(p.bez, 120)}${p.langtext ? `\n   ${kurz(p.langtext, 300)}` : ""}`;
  }).filter(Boolean).join("\n");
  const bausteine = (kalkulationspreise || []).map(k => `${k.kategorie}: ${kurz(k.bezeichnung, 60)} [${k.einheit}]`).join("; ");
  return { text: `LV:\n${lv}\n\nKostenbausteine der Firma: ${bausteine || "keine"}`, map };
}

export function vorschlaegeAuswerten(input, map) {
  return (input?.vorschlaege || []).map((v, i) => {
    const ersetzt = (v.ersetzt || []).map(n => map.get(Number(n))).filter(Boolean);
    const positionen = (v.positionen || []).filter(p => p?.kurztext && p?.einheit).map((p, j) => {
      const bezug = p.bezug ? map.get(Number(p.bezug)) : null;
      const menge = bezug ? r3((Number(bezug.menge) || 0) * (Number(p.faktor) > 0 ? Number(p.faktor) : 1)) : (Number(p.menge) > 0 ? Number(p.menge) : 1);
      return { id: `na${Date.now().toString(36)}${i}_${j}`, bez: String(p.kurztext).trim(), langtext: String(p.langtext || "").trim(), einheit: String(p.einheit).trim(), menge, ep: 0 };
    });
    return { id: `v${i}`, titel: String(v.titel || "").trim(), idee: String(v.idee || ""), gleichwertigkeit: String(v.gleichwertigkeit || ""),
      voraussetzungen: String(v.voraussetzungen || ""), ersetztIds: ersetzt.map(p => p.id), positionen };
  }).filter(v => v.titel && v.ersetztIds.length && v.positionen.length);
}

// Neue Positionen mit den eigenen Bausteinen bepreisen
export async function vorschlagBepreisen(v, { katalog, stammpositionen, kalkulationspreise, standardZuschlaege, kontext, rufeKi }) {
  const erg = await blockVorkalkulieren({ block: v.positionen, katalog, kalkulationspreise, kontext, rufeKi });
  const positionen = v.positionen.map(p => {
    const vk = erg.get(p.id);
    return vk && vk.art !== "offen" ? { ...vorschlagAnwenden(p, vk, { stammpositionen, kalkulationspreise, standardZuschlaege }), art: "alternativ" } : { ...p, art: "alternativ", kiKalkulation: vk ? { art: "offen", begruendung: vk.begruendung, sicherheit: "niedrig" } : undefined };
  });
  return { ...v, positionen };
}

export function vergleich(v, positionen) {
  const alt = (positionen || []).filter(p => v.ersetztIds.includes(p.id)).reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.ep) || 0), 0);
  const neu = v.positionen.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.ep) || 0), 0);
  const offen = v.positionen.filter(p => !(Number(p.ep) > 0)).length;
  return { alt, neu, ersparnis: alt - neu, anteil: alt > 0 ? (alt - neu) / alt : 0, offen };
}

// Als eigener Abschnitt mit Alternativpositionen anhängen
export function alsNebenangebot(positionen, v, nummer) {
  const ersetzt = (positionen || []).filter(p => v.ersetztIds.includes(p.id));
  const hinweis = `Nebenangebot zu ${ersetzt.map(p => p.oz ? `Pos. ${p.oz}` : `„${kurz(p.bez, 40)}“`).join(", ")}: ${v.idee}`;
  return [
    ...(positionen || []),
    { id: `t${Date.now().toString(36)}`, bez: `── Nebenangebot ${nummer}: ${v.titel} ──`, einheit: "", menge: 0, ep: 0 },
    ...v.positionen.map((p, i) => ({ ...p, art: "alternativ", rabatt: 0, ...(i === 0 ? { langtext: [hinweis, p.langtext].filter(Boolean).join("\n\n") } : {}) })),
  ];
}
