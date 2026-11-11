// Leistungsverzeichnis-Regeln, die überall gleich gelten müssen (Editor,
// PDF, Word, Kundenansicht, Freigaberegeln, GAEB-Export, EFB):
//
// Positionsarten (position.art):
//   normal      Normalposition, in der Angebotssumme
//   zulage      Zulageposition (Zuschlag zu einer anderen Leistung), in der Summe
//   bedarf_mit  Bedarfsposition MIT Gesamtbetrag (GAEB Provis "WithTotal")
//   bedarf      Bedarfs-/Eventualposition OHNE Gesamtbetrag — Einheitspreis
//               wird angeboten, zählt aber nicht zur Angebotssumme
//   alternativ  Wahl-/Alternativposition — nicht in der Summe, ersetzt bei
//               Beauftragung eine Grundposition
//
// Ältere Angebote kennen kein art-Feld; die Art wird dann aus dem Präfix
// abgeleitet, das die GAEB-Importe in den Text schreiben
// ("[Bedarfsposition (nicht in Angebotssumme enthalten)] …").

export const POSITIONSARTEN = [
  ["normal", "Normal"],
  ["zulage", "Zulage"],
  ["bedarf_mit", "Bedarf (mit GB)"],
  ["bedarf", "Bedarf (ohne GB)"],
  ["alternativ", "Alternativ"],
];

export const ART_LABEL = Object.fromEntries(POSITIONSARTEN);

export function istTitel(p) {
  return String(p?.bez || "").startsWith("──");
}

export function positionsart(p) {
  if (p?.art) return p.art;
  const bez = String(p?.bez || "");
  if (bez.startsWith("[Alternativposition")) return "alternativ";
  if (bez.startsWith("[Bedarfsposition (nicht in Angebotssumme")) return "bedarf";
  if (bez.startsWith("[Bedarfsposition")) return "bedarf_mit";
  return "normal";
}

export function inSumme(p) {
  if (istTitel(p)) return false;
  const art = positionsart(p);
  return art !== "bedarf" && art !== "alternativ";
}

// Gesamtpreis der Zeile (auch für Positionen außerhalb der Summe — er wird
// angezeigt, aber nicht addiert).
export function gp(p) {
  return (Number(p?.menge) || 0) * (Number(p?.ep) || 0) * (1 - (Number(p?.rabatt) || 0) / 100);
}

export function nettoSumme(positionen) {
  return (positionen || []).reduce((s, p) => s + (inSumme(p) ? gp(p) : 0), 0);
}

// Titelname aus einer Kopfzeile "── A / B ──".
export function titelName(p) {
  return String(p?.bez || "").replace(/^──\s*/, "").replace(/\s*──$/, "");
}

// Summe je Titel: alle Positionen bis zur nächsten Titelzeile.
export function titelSummen(positionen) {
  const summen = {};
  let aktuell = null;
  for (const p of positionen || []) {
    if (p?.bez?.startsWith("──")) { aktuell = p.id; summen[aktuell] = 0; continue; }
    if (aktuell != null && inSumme(p)) summen[aktuell] += gp(p);
  }
  return summen;
}
