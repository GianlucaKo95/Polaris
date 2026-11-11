// Kalkulation über die Endsumme (EFB 222): statt fester Zuschlagssätze je
// Kostenart werden die Baustellengemeinkosten dieses Projekts konkret
// kalkuliert (Bauleitung, Container, Kran, Bauzaun …) und zusammen mit
// Allgemeinen Geschäftskosten sowie Wagnis und Gewinn auf die Einzelkosten
// der Teilleistungen umgelegt.
//
//   Σ EKT (Lohn, Material, Gerät, NU) + BGK      = Herstellkosten HK
//   HK × AGK %                                   = AGK
//   (HK + AGK) × W&G %                           = Wagnis und Gewinn
//   HK + AGK + W&G                               = Angebotssumme (kalkulierte Positionen)
//   Angebotssumme − Σ EKT                        = Umlage
//
// Die Umlage wird als Zuschlagssatz in die Positionskalkulationen
// geschrieben — entweder nur auf den Lohn (üblich im Bauhauptgewerbe) oder
// gleichmäßig auf alle Kostenarten. Damit bleibt die bestehende EP-Logik
// (kalkulation.js) unverändert gültig. Positionen ohne Kalkulation (direkter
// EP) bleiben Festpreise und tragen keine Umlage.

import { kalkulationAufschluesselung, kalkulationEp, ZUSCHLAG_FELD } from "./kalkulation.js";

export const LEERE_ENDSUMME = { bgk: [], agkProzent: 0, wgProzent: 0, umlageAuf: "lohn" };

const KOSTENARTEN = ["lohn", "material", "geraet", "fremdleistung"];

export function endsummeBerechnen(positionen, endsumme, kalkulationspreise) {
  const ekt = { lohn: 0, material: 0, geraet: 0, fremdleistung: 0 };
  let festpreise = 0;
  for (const p of positionen || []) {
    if (!p?.bez || p.bez.startsWith("──")) continue;
    if (!p.kalk) { festpreise += (Number(p.menge) || 0) * (Number(p.ep) || 0); continue; }
    const a = kalkulationAufschluesselung(p.kalk, kalkulationspreise);
    for (const k of KOSTENARTEN) ekt[k] += a[k];
  }
  const ektSumme = KOSTENARTEN.reduce((s, k) => s + ekt[k], 0);
  const bgk = (endsumme?.bgk || []).reduce((s, b) => s + (Number(b.betrag) || 0), 0);
  const hk = ektSumme + bgk;
  const agk = hk * (Number(endsumme?.agkProzent) || 0) / 100;
  const wg = (hk + agk) * (Number(endsumme?.wgProzent) || 0) / 100;
  const angebotssumme = hk + agk + wg;
  const umlage = angebotssumme - ektSumme;
  const basis = endsumme?.umlageAuf === "alle" ? ektSumme : ekt.lohn;
  const satz = basis > 0 ? umlage / basis * 100 : null;
  return {
    ekt, ektSumme, bgk, hk, agk, wg, angebotssumme, umlage, festpreise,
    gesamt: angebotssumme + festpreise,
    umlageSatz: satz,
    umlageAuf: endsumme?.umlageAuf === "alle" ? "alle" : "lohn",
    fehler: satz == null ? (endsumme?.umlageAuf === "alle" ? "Keine kalkulierten Positionen vorhanden." : "Keine Lohnkosten in den kalkulierten Positionen — Umlage auf alle Kostenarten wählen.") : null,
  };
}

// Schreibt den Umlagesatz in alle kalkulierten Positionen und berechnet die
// EP neu. Gibt die Positionen unverändert zurück, wenn kein Satz möglich ist.
export function endsummeAnwenden(positionen, endsumme, kalkulationspreise) {
  const e = endsummeBerechnen(positionen, endsumme, kalkulationspreise);
  if (e.umlageSatz == null) return positionen;
  const satz = Math.round(e.umlageSatz * 10000) / 10000;
  return (positionen || []).map(p => {
    if (!p?.kalk) return p;
    const kalk = { ...p.kalk };
    for (const k of KOSTENARTEN) {
      kalk[ZUSCHLAG_FELD[k]] = endsumme?.umlageAuf === "alle" || k === "lohn" ? satz : 0;
    }
    return { ...p, kalk, ep: kalkulationEp(kalk, kalkulationspreise, p.menge) };
  });
}
