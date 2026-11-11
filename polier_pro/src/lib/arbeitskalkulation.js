// Arbeitskalkulation: Soll-Ist je LV-Position und Prognose.
//
// Ist-Stunden je Position kommen aus der Stundenverteilung (Tabelle
// stunden_positionen): Der Polier verteilt am Tagesende die gestempelten
// Stunden seiner Kolonne auf die bearbeiteten Positionen — so bleibt das
// Stempeln für die Mitarbeiter unverändert einfach.
//
// Je Position:
//   Soll gesamt     = Lohnstunden der Kalkulation
//   Soll erbracht   = Soll gesamt × Leistungsstand %
//   Ist             = Σ verteilte Stunden
//   Leistungsfaktor = Ist / Soll erbracht (1,2 = 20 % langsamer als kalkuliert)
//   Prognose        = Ist ÷ Leistungsstand (Stunden bei Fertigstellung)
//   Mehr-/Minderkosten = (Prognose − Soll gesamt) × Kalkulationslohn

import { istTitel } from "./lv.js";

function lohnstunden(kalk, kalkulationspreise) {
  return (kalk?.lohnposten || []).reduce((s, p) => {
    const stamm = (kalkulationspreise || []).find(k => k.id === p.stammId);
    return stamm?.einheit === "h" ? s + (Number(p.menge) || 0) : s;
  }, 0);
}

function lohnsatz(kalk, kalkulationspreise) {
  const std = lohnstunden(kalk, kalkulationspreise);
  if (!std) return 0;
  const kosten = (kalk?.lohnposten || []).reduce((s, p) => {
    const stamm = (kalkulationspreise || []).find(k => k.id === p.stammId);
    return stamm?.einheit === "h" ? s + (Number(p.menge) || 0) * (Number(stamm.preis) || 0) : s;
  }, 0);
  return kosten / std;
}

// angebote: angenommene Angebote; fortschritt: [{angebot_id, position_id, prozent}];
// verteilung: [{angebot_id, position_id, stunden}]
export function sollIstJePosition({ angebote, fortschritt, verteilung, kalkulationspreise }) {
  const prozentNach = new Map((fortschritt || []).map(e => [`${e.angebot_id}:${e.position_id}`, Number(e.prozent) || 0]));
  const istNach = new Map();
  for (const v of verteilung || []) {
    const k = `${v.angebot_id}:${v.position_id}`;
    istNach.set(k, (istNach.get(k) || 0) + (Number(v.stunden) || 0));
  }
  const zeilen = [];
  for (const a of angebote || []) {
    for (const p of a.positionen || []) {
      if (istTitel(p) || !p.bez) continue;
      const key = `${a.id}:${p.id}`;
      const soll = p.kalk ? lohnstunden(p.kalk, kalkulationspreise) : 0;
      const prozent = prozentNach.get(key) || 0;
      const ist = istNach.get(key) || 0;
      if (!soll && !ist) continue;
      const sollErbracht = soll * prozent / 100;
      const faktor = sollErbracht > 0 && ist > 0 ? ist / sollErbracht : null;
      const prognose = prozent > 0 ? ist / (prozent / 100) : null;
      const satz = lohnsatz(p.kalk, kalkulationspreise);
      zeilen.push({
        angebotId: a.id, positionId: p.id, oz: p.oz || "", bez: p.bez, stammpositionId: p.stammpositionId || null,
        soll, prozent, sollErbracht, ist, faktor, prognose,
        mehrkosten: prognose != null && satz ? (prognose - soll) * satz : null,
        ampel: faktor == null ? "keine" : faktor > 1.15 ? "rot" : faktor > 1.05 ? "gelb" : "gruen",
      });
    }
  }
  const summe = zeilen.reduce((s, z) => ({
    soll: s.soll + z.soll, sollErbracht: s.sollErbracht + z.sollErbracht, ist: s.ist + z.ist,
    mehrkosten: s.mehrkosten + (z.mehrkosten || 0),
  }), { soll: 0, sollErbracht: 0, ist: 0, mehrkosten: 0 });
  summe.faktor = summe.sollErbracht > 0 && summe.ist > 0 ? summe.ist / summe.sollErbracht : null;
  return { zeilen, summe };
}

// Faktoren je Stammposition (gewichtet nach Soll erbracht) für die
// Rückführung in die Zeitansätze — genauer als der Baustellenfaktor in
// nachkalkulation.js, weil jede Leistung ihren eigenen Wert bekommt.
export function faktorenJeStammposition(zeilen, minSollErbracht = 8) {
  const acc = new Map();
  for (const z of zeilen || []) {
    if (!z.stammpositionId || !(z.sollErbracht > 0) || !(z.ist > 0)) continue;
    const a = acc.get(z.stammpositionId) || { soll: 0, ist: 0 };
    a.soll += z.sollErbracht; a.ist += z.ist;
    acc.set(z.stammpositionId, a);
  }
  return [...acc.entries()]
    .filter(([, a]) => a.soll >= minSollErbracht)
    .map(([id, a]) => ({ stammpositionId: id, faktor: a.ist / a.soll, sollErbracht: a.soll, ist: a.ist }));
}
