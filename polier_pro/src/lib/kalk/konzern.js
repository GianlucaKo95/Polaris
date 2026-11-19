// Konzern-Controlling: Projekte über Gesellschaften und Niederlassungen hinweg.
// Grundlage ist je Projekt die letzte gemeldete Leistungsmeldung (eingefrorene
// Werte, siehe controlling.js); ohne Meldung zählt der Auftragsstand als
// Auftragsbestand. Bei ARGE-Projekten wahlweise nur der eigene Anteil.

import { eigeneQuote } from "./arge.js";
import { rundeCent } from "./lvBaum.js";

export const AMPEL_TAGE = 45;  // Meldung älter als 45 Tage → gelb
const FELDER = ["auftrag", "leistung", "istKosten", "ergebnisKalk", "ergebnisPrognose", "abweichung", "nichtAbgerechnet", "angebote"];

function tageSeit(monat, heute) {
  if (!monat) return Infinity;
  const [j, m] = String(monat).slice(0, 7).split("-").map(Number);
  const ende = Date.UTC(j, m, 0);
  return Math.floor((Date.parse(heute) - ende) / 86400000);
}

export function ampel(z, { heute = new Date().toISOString().slice(0, 10) } = {}) {
  if (!z.meldung) return z.auftrag > 0 ? "grau" : null;
  if (z.ergebnisPrognose < 0 || (z.auftrag > 0 && z.abweichung / z.auftrag < -0.05)) return "rot";
  if (z.abweichung < 0 || tageSeit(z.meldung, heute) > AMPEL_TAGE) return "gelb";
  return "gruen";
}

// projekte: [{ id, name, nummer, status, gesellschaft_id, arge }]
// meldungen: letzte gemeldete je Projekt [{ kalk_projekt_id, monat, werte }]
// auftragssummen: Map projektId → Auftragswert (Auftragsstand), angebotssummen: Map projektId → Angebotssumme (offene Projekte)
export function projektZeilen({ projekte, meldungen = [], auftragssummen = new Map(), angebotssummen = new Map(), nurEigenerAnteil = true, heute }) {
  const letzte = new Map();
  for (const m of meldungen) {
    if (m.status && m.status !== "gemeldet") continue;
    const alt = letzte.get(m.kalk_projekt_id);
    if (!alt || String(m.monat) > String(alt.monat)) letzte.set(m.kalk_projekt_id, m);
  }
  return (projekte || []).map(p => {
    const q = nurEigenerAnteil ? eigeneQuote(p.arge) : 1;
    const m = letzte.get(p.id);
    const w = m?.werte || {};
    const z = {
      id: p.id, name: p.name, nummer: p.nummer || "", status: p.status, gesellschaft_id: p.gesellschaft_id, arge: !!p.arge?.aktiv, quote: q, meldung: m?.monat || null,
      auftrag: rundeCent((w.erloes?.prognose ?? auftragssummen.get(p.id) ?? 0) * q),
      leistung: rundeCent((w.erloes?.kum ?? 0) * q),
      istKosten: rundeCent((w.kosten?.istKum ?? 0) * q),
      ergebnisKalk: rundeCent((w.ergebnis?.kalkuliert ?? 0) * q),
      ergebnisPrognose: rundeCent((w.ergebnis?.prognose ?? 0) * q),
      abweichung: rundeCent((w.ergebnis?.abweichung ?? 0) * q),
      nichtAbgerechnet: rundeCent((w.nichtAbgerechnet ?? 0) * q),
      angebote: auftragssummen.has(p.id) ? 0 : rundeCent((angebotssummen.get(p.id) ?? 0) * q),
    };
    z.ampel = ampel(z, { heute });
    return z;
  });
}

// Summen je Gesellschaft, Niederlassungen in die Mutter gerollt
export function konzernBaum(gesellschaften, zeilen) {
  const kinder = new Map();
  for (const g of gesellschaften || []) { const k = g.parent_id || null; kinder.set(k, [...(kinder.get(k) || []), g]); }
  const summe = l => Object.fromEntries(FELDER.map(f => [f, rundeCent(l.reduce((s, z) => s + (z[f] || 0), 0))]));
  const knoten = g => {
    const eigene = zeilen.filter(z => z.gesellschaft_id === g.id);
    const unter = (kinder.get(g.id) || []).map(knoten);
    const alle = [...eigene, ...unter.flatMap(u => u.alleProjekte)];
    return { gesellschaft: g, projekte: eigene, unter, alleProjekte: alle, summen: summe(alle),
      rot: alle.filter(z => z.ampel === "rot").length, ergebnisQuote: summe(alle).leistung ? summe(alle).ergebnisPrognose / summe(alle).auftrag : null };
  };
  const wurzeln = (kinder.get(null) || []).map(knoten);
  const ohne = zeilen.filter(z => !(gesellschaften || []).some(g => g.id === z.gesellschaft_id));
  return { wurzeln, ohneGesellschaft: ohne, gesamt: summe(zeilen) };
}
