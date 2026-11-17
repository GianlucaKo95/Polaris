// Lieferanten- und NU-Angebote per KI einlesen (1.87).
//
// NU-Angebote kommen oft als PDF auf eigenem Briefbogen oder als Mail statt
// als GAEB X84. Die KI liest die Preise und ordnet sie den eigenen
// LV-Positionen zu; das Ergebnis geht in den NU-Preisspiegel
// (lib/preisspiegel.js), wie ein eingelesenes X84.
// Lieferantenangebote (Material, Gerät) ordnet die KI den Kostenbausteinen
// zu und rechnet auf deren Einheit um; das Ergebnis landet als
// Lieferantenangebot im Preisstand des Angebots (lib/preisstand.js).
//
// Kontrolle gegen Lesefehler: Nennt das Dokument eine Angebotssumme, wird sie
// mit Σ EP × Menge verglichen. Vorbehalte und nicht angebotene Positionen
// werden ausgewiesen, damit kein Bieter billiger wirkt, als er ist.

import { istTitel } from "./lv.js";

const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const zahlDe = (n, st = 3) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
const r2 = n => Math.round(n * 100) / 100;

export function dokumentInhalt(anhang, text) {
  return [
    ...(anhang ? anhang.bloecke || [anhang.block] : []),
    ...(String(text || "").trim() ? [{ type: "text", text: `Angebotstext (aus Mail o.ä.):\n${String(text).trim().slice(0, 30000)}` }] : []),
  ];
}

// ── NU-Angebot ──
export const NU_WERKZEUG = {
  name: "nu_angebot_abgeben",
  description: "Gibt das gelesene NU-Angebot ab, zugeordnet zu unseren Positionen.",
  input_schema: {
    type: "object",
    properties: {
      bieter: { type: "string" },
      datum: { type: "string" }, gueltig_bis: { type: "string" },
      positionen: { type: "array", items: { type: "object", properties: {
        nr: { type: "integer", description: "Unsere Positionsnummer (#)" },
        ep: { type: "number", description: "Einheitspreis netto in € je UNSERER Einheit" },
        hinweis: { type: "string", description: "Abweichung, z.B. andere Einheit umgerechnet, Fabrikat, 'nur Lieferung'" },
      }, required: ["nr", "ep"] } },
      nicht_angeboten: { type: "array", items: { type: "integer" }, description: "Unsere Positionen, die der NU nicht bepreist hat" },
      vorbehalte: { type: "array", items: { type: "string" }, description: "Einschränkungen, Ausschlüsse, Zuschläge, Bedingungen" },
      summe_netto: { type: "number", description: "Angebotssumme netto, wenn im Dokument genannt" },
    },
    required: ["bieter", "positionen"],
  },
};

export function nuPrompt() {
  return `Du liest das Angebot eines Nachunternehmers und ordnest seine Preise unseren LV-Positionen zu.
- Zuordnung über Ordnungszahl, sonst über Leistung und Einheit. Weicht seine Einheit ab, rechne auf unsere Einheit um und nenne das im hinweis.
- Nur Preise, die im Dokument stehen. Nichts schätzen. Pauschalen, die mehrere Positionen abdecken, nicht aufteilen, sondern als Vorbehalt nennen.
- Alles, was das Angebot einschränkt (ohne Gerüst, ohne Entsorgung, Preisgleitung, Mindermengenzuschlag, Bindefrist, Zahlungsbedingungen), unter vorbehalte.
- summe_netto nur, wenn die Summe im Dokument steht.
Rufe genau einmal ${NU_WERKZEUG.name} auf.`;
}

export function lvFuerKi(positionen) {
  let nr = 0;
  const map = new Map();
  const text = (positionen || []).filter(p => !istTitel(p) && p.typ !== "hinweis").map(p => {
    map.set(++nr, p);
    return `#${nr}${p.oz ? ` | OZ ${p.oz}` : ""} | ${zahlDe(p.menge)} ${p.einheit || ""} | ${kurz(p.bez, 140)}`;
  }).join("\n");
  return { text, map };
}

export function nuAntwortAuswerten(input, map) {
  const positionen = [];
  for (const e of input?.positionen || []) {
    const p = map.get(Number(e.nr));
    const ep = Number(e.ep);
    if (!p || !(ep > 0)) continue;
    // Gleiche OZ und gleicher Text wie unsere Position: preisspiegel.js ordnet sicher zu
    positionen.push({ id: `nu${p.id}`, oz: p.oz || "", bez: p.bez, einheit: p.einheit, menge: Number(p.menge) || 0, ep: r2(ep), ...(e.hinweis ? { hinweis: String(e.hinweis) } : {}), quellPosId: p.id });
  }
  const berechnet = r2(positionen.reduce((s, x) => s + x.ep * x.menge, 0));
  const angegeben = Number(input?.summe_netto) > 0 ? r2(Number(input.summe_netto)) : null;
  const abweichung = angegeben ? (berechnet - angegeben) / angegeben : null;
  return {
    name: String(input?.bieter || "NU").trim(), positionen, quelle: "ki",
    datum: input?.datum || null, gueltigBis: input?.gueltig_bis || null,
    vorbehalte: (input?.vorbehalte || []).map(String).filter(Boolean),
    nichtAngeboten: (input?.nicht_angeboten || []).map(n => map.get(Number(n))).filter(Boolean).map(p => p.oz || p.bez),
    summe: { angegeben, berechnet, abweichung, ok: angegeben == null || Math.abs(abweichung) <= 0.01 },
  };
}

export async function nuAngebotEinlesen({ anhang, text, positionen, rufeKi }) {
  const { text: lv, map } = lvFuerKi(positionen);
  const antwort = await rufeKi(nuPrompt(), [{ role: "user", content: [...dokumentInhalt(anhang, text), { type: "text", text: `Unser LV:\n${lv}` }] }],
    [NU_WERKZEUG], { type: "tool", name: NU_WERKZEUG.name });
  const input = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === NU_WERKZEUG.name)?.input;
  if (!input) throw new Error("Die KI konnte das Angebot nicht lesen");
  return nuAntwortAuswerten(input, map);
}

// ── Lieferantenangebot ──
export const LIEFERANT_WERKZEUG = {
  name: "lieferantenangebot_abgeben",
  description: "Gibt das gelesene Lieferantenangebot ab, zugeordnet zu den Kostenbausteinen.",
  input_schema: {
    type: "object",
    properties: {
      lieferant: { type: "string" }, datum: { type: "string" }, gueltig_bis: { type: "string" },
      artikel: { type: "array", items: { type: "object", properties: {
        text: { type: "string", description: "Artikel wie im Angebot" },
        preis: { type: "number", description: "Preis netto wie im Angebot" },
        einheit: { type: "string", description: "Einheit wie im Angebot" },
        baustein: { type: "string", description: "id des passenden Kostenbausteins, leer wenn keiner passt" },
        preis_je_baustein: { type: "number", description: "Preis umgerechnet auf die Einheit des Bausteins" },
        umrechnung: { type: "string", description: "Wie umgerechnet wurde, z.B. '1 Pal. = 40 Sack à 25 kg'" },
      }, required: ["text", "preis", "einheit"] } },
      vorbehalte: { type: "array", items: { type: "string" }, description: "Fracht, Mindermengen, Kranentladung, Preisgleitung, Bindefrist …" },
    },
    required: ["lieferant", "artikel"],
  },
};

export function lieferantPrompt() {
  return `Du liest das Angebot eines Baustofflieferanten oder Geräteverleihers und ordnest die Artikel unseren Kostenbausteinen zu.
- Nur zuordnen, wenn Artikel und Baustein wirklich dasselbe sind (Material, Festigkeit, Abmessung).
- Rechne auf die Einheit des Bausteins um und schreibe den Rechenweg in umrechnung. Ist das nicht eindeutig möglich, lass preis_je_baustein leer.
- Nur Preise aus dem Dokument. Rabatte, die im Angebot schon abgezogen sind, berücksichtigen; Fracht und Zuschläge unter vorbehalte.
Rufe genau einmal ${LIEFERANT_WERKZEUG.name} auf.`;
}

export function bausteineFuerKi(kalkulationspreise) {
  return (kalkulationspreise || []).filter(k => k.kategorie === "material" || k.kategorie === "geraet")
    .map(k => `${k.id} | ${k.kategorie} | ${kurz(k.bezeichnung, 80)} | ${k.einheit}`).join("\n");
}

export function lieferantAntwortAuswerten(input, kalkulationspreise) {
  const artikel = (input?.artikel || []).filter(a => a?.text && Number(a.preis) > 0).map((a, i) => {
    const b = a.baustein ? (kalkulationspreise || []).find(k => String(k.id) === String(a.baustein)) : null;
    const umgerechnet = Number(a.preis_je_baustein) > 0 ? r2(Number(a.preis_je_baustein)) : null;
    return { id: `a${i}`, text: String(a.text).trim(), preis: r2(Number(a.preis)), einheit: String(a.einheit || ""),
      bausteinId: b ? b.id : null, bausteinBez: b?.bezeichnung || null, bausteinEinheit: b?.einheit || null,
      preisJeBaustein: b ? umgerechnet : null, umrechnung: String(a.umrechnung || ""), bisher: b ? Number(b.preis) || null : null };
  });
  return { lieferant: String(input?.lieferant || "Lieferant").trim(), datum: input?.datum || null, gueltigBis: input?.gueltig_bis || null,
    vorbehalte: (input?.vorbehalte || []).map(String).filter(Boolean), artikel };
}

export async function lieferantenangebotEinlesen({ anhang, text, kalkulationspreise, rufeKi }) {
  const antwort = await rufeKi(lieferantPrompt(), [{ role: "user", content: [...dokumentInhalt(anhang, text),
    { type: "text", text: `Unsere Kostenbausteine (id | Kategorie | Bezeichnung | Einheit):\n${bausteineFuerKi(kalkulationspreise) || "keine"}` }] }],
    [LIEFERANT_WERKZEUG], { type: "tool", name: LIEFERANT_WERKZEUG.name });
  const input = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === LIEFERANT_WERKZEUG.name)?.input;
  if (!input) throw new Error("Die KI konnte das Angebot nicht lesen");
  return lieferantAntwortAuswerten(input, kalkulationspreise);
}

// Ausgewählte Artikel als Lieferantenangebote an die Bausteine hängen
export function alsLieferantenangebote(kalkulationspreise, ergebnis, auswahlIds, heute) {
  const gewaehlt = ergebnis.artikel.filter(a => auswahlIds.includes(a.id) && a.bausteinId != null && a.preisJeBaustein > 0);
  return (kalkulationspreise || []).map(k => {
    const neu = gewaehlt.filter(a => String(a.bausteinId) === String(k.id));
    if (!neu.length) return k;
    const alt = (k.lieferantenangebote || []).filter(x => x.lieferant !== ergebnis.lieferant);
    return { ...k, lieferantenangebote: [...alt, ...neu.map(a => ({ lieferant: ergebnis.lieferant, preis: a.preisJeBaustein, datum: heute,
      artikel: a.text, ...(a.umrechnung ? { umrechnung: a.umrechnung } : {}), ...(ergebnis.gueltigBis ? { gueltigBis: ergebnis.gueltigBis } : {}), quelle: "ki" }))] };
  });
}
