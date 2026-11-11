// Plausibilitäts-Ampel je Angebotsposition: vergleicht den EP mit den
// eigenen Vergleichswerten der Firma (Katalog aus lib/katalog.js plus
// Positionen früherer Angebote). Marktpreisdatenbanken (SIRADOS & Co.)
// kommen später als weitere Vergleichsquelle dazu — die Bewertung hier
// bleibt dieselbe.
//
// Vergleichbar ist ein Wert, wenn Einheit gleich ist und der Leistungstext
// hinreichend ähnlich (aehnlichkeit() ≥ MIN_AEHNLICHKEIT). Die eigene
// Preisquelle der Position zählt NICHT als Vergleich — sonst wäre jede aus
// dem Katalog übernommene Position automatisch grün.
//
// Ampel:
//   rot    kein Preis, oder > 60 % Abweichung vom Median der Vergleichswerte
//   gelb   25–60 % Abweichung
//   gruen  ≤ 25 % Abweichung
//   keine  keine Vergleichswerte vorhanden (nicht bewertbar)

import { aehnlichkeit, einheitNormalisieren } from "./katalog.js";

export const MIN_AEHNLICHKEIT = 0.5;
export const GRENZE_GELB = 0.25;
export const GRENZE_ROT = 0.6;

function median(werte) {
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const euro = n => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Vergleichswerte aus früheren Angeboten (nur Positionen mit Preis).
export function vergleichswerteAusAngeboten(angebote, ohneAngebotId = null) {
  const werte = [];
  for (const a of angebote || []) {
    if (ohneAngebotId != null && a.id === ohneAngebotId) continue;
    for (const p of a.positionen || []) {
      if (!p?.bez || !(Number(p.ep) > 0)) continue;
      werte.push({ ref: `AN:${a.id}:${p.id}`, quelle: "angebot", bez: p.bez, einheit: p.einheit, ep: Number(p.ep) });
    }
  }
  return werte;
}

export function positionPruefen(position, vergleichsbasis) {
  if (!position?.bez || position.bez.startsWith("──")) return null;
  const ep = Number(position.ep) || 0;
  if (ep <= 0) return { ampel: "rot", text: "Kein Preis — Position manuell kalkulieren." };

  const einheit = einheitNormalisieren(position.einheit);
  const eigeneRef = position.preisquelle?.ref;
  const werte = (vergleichsbasis || [])
    .filter(v => v.ref !== eigeneRef && Number(v.ep) > 0 && einheitNormalisieren(v.einheit) === einheit)
    .filter(v => aehnlichkeit(position.bez, v.bez) >= MIN_AEHNLICHKEIT)
    .map(v => Number(v.ep));

  if (werte.length === 0) return { ampel: "keine", text: "Keine Vergleichswerte im eigenen Bestand." };

  const m = median(werte);
  const abw = ep / m - 1;
  const prozent = Math.round(Math.abs(abw) * 100);
  const richtung = abw >= 0 ? "über" : "unter";
  const basis = `Median ${euro(m)} € aus ${werte.length} Vergleichswert${werte.length === 1 ? "" : "en"}`;
  const ampel = Math.abs(abw) > GRENZE_ROT ? "rot" : Math.abs(abw) > GRENZE_GELB ? "gelb" : "gruen";
  return {
    ampel,
    text: prozent === 0 ? `Entspricht dem Vergleich (${basis}).` : `${prozent} % ${richtung} Vergleich (${basis}).`,
    median: m, anzahl: werte.length, abweichung: abw,
  };
}

export function angebotPruefen(positionen, vergleichsbasis) {
  const ergebnis = {};
  const zaehler = { rot: 0, gelb: 0, gruen: 0, keine: 0 };
  for (const p of positionen || []) {
    const r = positionPruefen(p, vergleichsbasis);
    if (!r) continue;
    ergebnis[p.id] = r;
    zaehler[r.ampel]++;
  }
  return { jePosition: ergebnis, zaehler };
}

export const AMPEL_FARBE = {
  rot: "var(--red)",
  gelb: "var(--yellow)",
  gruen: "var(--green)",
  keine: "var(--muted)",
};
