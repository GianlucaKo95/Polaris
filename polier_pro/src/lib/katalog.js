// Einheitlicher Preiskatalog über alle Stammdaten einer Firma — die einzige
// Stelle, aus der der KI-Angebots-Agent (kiAngebotAgent.js) Preise bezieht,
// und die Vergleichsbasis der Plausibilitätsprüfung (plausibilitaet.js).
//
// Quellen, in Prioritätsreihenfolge (eigene Rezeptur vor fertigem Preis):
//   UK  Urkalkulation — nur bei Nachträgen: die Positionen des Auftrags,
//       auf dessen Preisen ein Nachtrag nach VOB/B § 2 aufbauen muss
//   SP  Stammposition (stammpositionen.js) — EP aus Rezeptur + Zuschlägen
//   EP  Einheitspreis-Katalog (fertiger Verkaufspreis je Gewerk)
//   LV  Position aus einer Mutter-LV (lvVorlagen, aus GAEB-Import mit Preis)
//
// Jeder Eintrag trägt eine stabile Referenz ("SP:12", "EP:3",
// "LV:1712345:0815"), über die der Agent eine Position auswählt — die KI
// nennt nie selbst einen Preis, sondern nur eine Referenz aus diesem Katalog.
//
// Suche bewusst ohne Vektor-Datenbank: Leistungstexte im Bau sind
// Komposita ("Perimeterdämmung", "Bodenplattenbewehrung"), deshalb zählt
// ein Suchwort auch als Treffer, wenn es TEIL eines Katalogworts ist.

import { stammpositionEp } from "./stammpositionen.js";

const STOPPWOERTER = new Set([
  "und", "oder", "mit", "ohne", "inkl", "inklusive", "für", "fuer", "von", "vom", "zum", "zur",
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "eines", "auf", "aus", "bis",
  "nach", "über", "ueber", "unter", "bei", "als", "liefern", "herstellen", "einbauen", "ca",
]);

export function normalisieren(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function suchwoerter(text) {
  return normalisieren(text).split(" ").filter(w => w.length >= 3 && !STOPPWOERTER.has(w));
}

export function einheitNormalisieren(einheit) {
  const e = String(einheit || "").toLowerCase().replace(/\s+/g, "").replace("²", "2").replace("³", "3");
  const ALIAS = {
    qm: "m2", m2: "m2", cbm: "m3", m3: "m3", lfm: "m", lfdm: "m", m: "m",
    st: "stk", stk: "stk", stck: "stk", stueck: "stk", "stück": "stk",
    psch: "psch", pau: "psch", pauschal: "psch", h: "h", std: "h", t: "t", kg: "kg",
  };
  return ALIAS[e] || e;
}

// Ähnlichkeit 0..1: Anteil der Suchwörter, die im Kandidaten vorkommen
// (exakt oder als Wortbestandteil, in beide Richtungen ab 5 Zeichen).
export function aehnlichkeit(suchtext, kandidatText) {
  const such = suchwoerter(suchtext);
  if (such.length === 0) return 0;
  const kand = suchwoerter(kandidatText);
  if (kand.length === 0) return 0;
  let treffer = 0;
  for (const w of such) {
    if (kand.some(k => k === w || (w.length >= 5 && k.includes(w)) || (k.length >= 5 && w.includes(k)))) treffer++;
  }
  return treffer / such.length;
}

export function katalogBauen({ stammpositionen = [], einheitspreise = [], lvVorlagen = [], kalkulationspreise = [], standardZuschlaege = null, urkalkulation = null } = {}) {
  const eintraege = [];
  for (const p of urkalkulation?.positionen || []) {
    if (!p?.bez || p.bez.startsWith("──") || !(Number(p.ep) > 0)) continue;
    eintraege.push({
      ref: `UK:${p.id}`, quelle: "urkalkulation", bez: p.bez, langtext: p.langtext || "",
      gewerk: urkalkulation.titel || "", einheit: p.einheit || "", ep: Number(p.ep) || 0,
      ...(p.oz ? { oz: p.oz } : {}), ...(p.stlk ? { stlk: p.stlk } : {}),
    });
  }
  for (const sp of stammpositionen) {
    if (!sp?.bez) continue;
    eintraege.push({
      ref: `SP:${sp.id}`, quelle: "stammposition", bez: sp.bez, langtext: sp.langtext || "",
      gewerk: sp.gewerk || "", einheit: sp.einheit || "",
      ep: stammpositionEp(sp, kalkulationspreise, standardZuschlaege),
    });
  }
  for (const e of einheitspreise) {
    if (!e?.beschreibung && !e?.gewerk) continue;
    eintraege.push({
      ref: `EP:${e.id}`, quelle: "einheitspreis", bez: [e.gewerk, e.beschreibung].filter(Boolean).join(" · "),
      langtext: "", gewerk: e.gewerk || "", einheit: e.einheit || "", ep: Number(e.preis) || 0,
    });
  }
  for (const v of lvVorlagen) {
    for (const p of v?.positionen || []) {
      if (!p?.bez || p.bez.startsWith("──") || !(Number(p.ep) > 0)) continue;
      eintraege.push({
        ref: `LV:${v.id}:${p.id}`, quelle: "mutter_lv", bez: p.bez, langtext: "",
        gewerk: v.gewerk || v.name || "", einheit: p.einheit || "", ep: Number(p.ep) || 0,
        ...(p.stlk ? { stlk: p.stlk } : {}),
      });
    }
  }
  return eintraege;
}

const QUELLEN_RANG = { urkalkulation: -1, stammposition: 0, einheitspreis: 1, mutter_lv: 2 };

// Sucht im Katalog. einheit (optional) bevorzugt passende Einheiten, schließt
// andere aber nicht aus — eine Leistung in "m" kann auch als "m²"-Position
// sinnvoll sein, die Entscheidung trifft der Agent bzw. der Nutzer.
export function katalogSuchen(katalog, suchtext, { einheit = null, max = 8, minAehnlichkeit = 0.34 } = {}) {
  const zielEinheit = einheit ? einheitNormalisieren(einheit) : null;
  return (katalog || [])
    .map(e => {
      let score = aehnlichkeit(suchtext, `${e.bez} ${e.langtext} ${e.gewerk}`);
      if (zielEinheit && einheitNormalisieren(e.einheit) === zielEinheit) score += 0.1;
      return { ...e, score: Math.round(score * 100) / 100 };
    })
    .filter(e => e.score >= minAehnlichkeit)
    .sort((a, b) => b.score - a.score || QUELLEN_RANG[a.quelle] - QUELLEN_RANG[b.quelle])
    .slice(0, max);
}

export function katalogEintrag(katalog, ref) {
  return (katalog || []).find(e => e.ref === ref) || null;
}

export const QUELLEN_LABEL = {
  stammposition: "Stammposition",
  einheitspreis: "Einheitspreis-Katalog",
  mutter_lv: "Mutter-LV",
  urkalkulation: "Urkalkulation",
  nachunternehmer: "Nachunternehmer",
  manuell: "Manuell",
  ki_ohne_preis: "Ohne Preis",
};
