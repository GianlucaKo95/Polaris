// ARGE (Arbeitsgemeinschaft): mehrere Firmen führen ein Projekt gemeinsam aus.
// Am Projekt: arge = { aktiv, partner: [{ id, name, quote, eigene, federfuehrend }] }
// Quoten in Prozent, Summe 100; genau ein Partner ist die eigene Firma.
// Aufteilung centgenau nach dem Verfahren der größten Reste, damit die
// Anteile immer exakt die Summe ergeben.

import { neueId } from "./lvBaum.js";

export const neuerPartner = (felder = {}) => ({ id: neueId(), name: "", quote: 0, eigene: false, federfuehrend: false, ...felder });

export function argePruefen(arge) {
  if (!arge?.aktiv) return [];
  const f = [];
  const p = arge.partner || [];
  if (p.length < 2) f.push("Eine ARGE hat mindestens zwei Partner.");
  const summe = Math.round(p.reduce((s, x) => s + (Number(x.quote) || 0), 0) * 1000) / 1000;
  if (summe !== 100) f.push(`Die Quoten ergeben ${summe.toLocaleString("de-DE")} % statt 100 %.`);
  if (p.filter(x => x.eigene).length !== 1) f.push("Genau ein Partner muss die eigene Firma sein.");
  if (p.filter(x => x.federfuehrend).length > 1) f.push("Nur ein Partner kann federführend sein.");
  if (p.some(x => !String(x.name || "").trim())) f.push("Jeder Partner braucht einen Namen.");
  if (p.some(x => !(Number(x.quote) > 0))) f.push("Jede Quote muss größer als 0 sein.");
  return f;
}

export function eigeneQuote(arge) {
  if (!arge?.aktiv || argePruefen(arge).length) return 1;
  return (Number(arge.partner.find(p => p.eigene)?.quote) || 0) / 100;
}

// Betrag nach Quoten auf Cent verteilen (größte Reste)
export function aufteilen(betrag, partner) {
  const c = Math.round((Number(betrag) || 0) * 100);
  const vorz = c < 0 ? -1 : 1;
  const abs = Math.abs(c);
  const roh = partner.map(p => abs * (Number(p.quote) || 0) / 100);
  const ganz = roh.map(Math.floor);
  let rest = abs - ganz.reduce((a, b) => a + b, 0);
  const reihen = roh.map((r, i) => [r - ganz[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of reihen) { if (rest <= 0) break; ganz[i]++; rest--; }
  return partner.map((p, i) => ({ id: p.id, name: p.name, quote: Number(p.quote) || 0, eigene: !!p.eigene, betrag: vorz * ganz[i] / 100 }));
}

// Kennzahlen (z. B. aus der Leistungsmeldung) je Partner
export function argeAufteilung(kennzahlen, arge) {
  const partner = arge?.partner || [];
  const aus = partner.map(p => ({ id: p.id, name: p.name, quote: Number(p.quote) || 0, eigene: !!p.eigene, federfuehrend: !!p.federfuehrend, werte: {} }));
  for (const [k, v] of Object.entries(kennzahlen || {})) {
    if (!Number.isFinite(Number(v))) continue;
    aufteilen(v, partner).forEach((a, i) => { aus[i].werte[k] = a.betrag; });
  }
  return aus;
}

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const eurD = x => (Number(x) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ARGE_KENNZAHLEN = [["auftrag", "Auftrag inkl. Nachträge"], ["leistung", "Leistung kumuliert"], ["istKosten", "Ist-Kosten"], ["ergebnisKalk", "Ergebnis kalkuliert"], ["ergebnisPrognose", "Ergebnis Prognose"]];

export function argeBerichtHtml(projekt, monatText, kennzahlen, arge) {
  const a = argeAufteilung(kennzahlen, arge);
  const kopf = a.map(p => `<th class="r">${esc(p.name)}${p.federfuehrend ? " (ff.)" : ""}<br><span class="g">${p.quote.toLocaleString("de-DE")} %</span></th>`).join("");
  const zeilen = ARGE_KENNZAHLEN.filter(([k]) => kennzahlen[k] != null).map(([k, l]) => `<tr><td>${l}</td><td class="r">${eurD(kennzahlen[k])}</td>${a.map(p => `<td class="r">${eurD(p.werte[k])}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>ARGE-Bericht ${esc(projekt.name)}</title><style>
body{font:10pt/1.4 system-ui,sans-serif;margin:16mm;color:#1c1c1c}h1{font-size:14pt;font-weight:600}table{width:100%;border-collapse:collapse}
td,th{padding:4px;border-bottom:.5px solid #ccc;text-align:left;font-weight:400}th{color:#555}.r{text-align:right;white-space:nowrap}.g{color:#777;font-size:8.5pt}
</style></head><body><h1>ARGE ${esc(projekt.name)}</h1><p>Leistungsmeldung ${esc(monatText)}</p>
<table><thead><tr><th></th><th class="r">ARGE gesamt</th>${kopf}</tr></thead><tbody>${zeilen}</tbody></table></body></html>`;
}
