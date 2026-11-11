// Terminplan aus der Kalkulation: Die Lohnstunden je Titel (bzw. je
// Position, wenn das LV keine Titel hat) ergeben mit der Kolonnenstärke die
// Dauer in Arbeitstagen. Die Vorgänge werden als Aufgaben angelegt und
// nacheinander verkettet (abhaengig_von) — Bauablauf, Gantt und
// Terminprognose der App arbeiten damit ohne Sonderfall weiter.
//
//   Dauer [AT] = aufrunden( Lohnstunden ÷ (Kolonnenstärke × Stunden je Tag) )
//
// Wochenenden werden übersprungen; Feiertage nicht (der Polier verschiebt
// im Gantt).

import { istTitel, titelName, inSumme } from "./lv.js";

function lohnstunden(kalk, kalkulationspreise) {
  return (kalk?.lohnposten || []).reduce((s, p) => {
    const stamm = (kalkulationspreise || []).find(k => k.id === p.stammId);
    return stamm?.einheit === "h" ? s + (Number(p.menge) || 0) : s;
  }, 0);
}

export function arbeitstageAddieren(startIso, tage) {
  const d = new Date(`${startIso}T12:00:00Z`);
  let rest = tage;
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  while (rest > 1) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) rest--;
  }
  return d.toISOString().slice(0, 10);
}

function naechsterArbeitstag(iso) {
  return arbeitstageAddieren(new Date(Date.parse(`${iso}T12:00:00Z`) + 864e5).toISOString().slice(0, 10), 1);
}

export function terminplanAusAngebot(angebot, kalkulationspreise, { kolonnenStaerke = 3, stundenProTag = 8, start = new Date().toISOString().slice(0, 10) } = {}) {
  const positionen = angebot?.positionen || [];
  const mitTiteln = positionen.some(istTitel);
  const gruppen = [];
  let aktuell = null;
  for (const p of positionen) {
    if (istTitel(p)) { aktuell = { titel: titelName(p), stunden: 0, positionen: [] }; gruppen.push(aktuell); continue; }
    if (!inSumme(p) || !p.kalk) continue;
    const h = lohnstunden(p.kalk, kalkulationspreise);
    if (!h) continue;
    if (!mitTiteln) { gruppen.push({ titel: p.bez, stunden: h, positionen: [p.bez] }); continue; }
    if (!aktuell) { aktuell = { titel: angebot.titel || "Leistungen", stunden: 0, positionen: [] }; gruppen.push(aktuell); }
    aktuell.stunden += h; aktuell.positionen.push(p.bez);
  }
  const kapazitaet = Math.max(1, kolonnenStaerke) * Math.max(1, stundenProTag);
  let beginn = start;
  return gruppen.filter(g => g.stunden > 0).map(g => {
    const dauer = Math.max(1, Math.ceil(g.stunden / kapazitaet));
    const ende = arbeitstageAddieren(beginn, dauer);
    const vorgang = {
      titel: g.titel, typ: "allgemein", status: "offen", prioritaet: "mittel",
      soll_stunden: Math.round(g.stunden * 10) / 10, dauer_tage: dauer,
      mindest_mitarbeiter: kolonnenStaerke, beginn, faellig_am: ende,
      beschreibung: `Aus Kalkulation „${angebot.titel || ""}“: ${Math.round(g.stunden)} Lohnstunden${g.positionen.length > 1 ? ` (${g.positionen.length} Positionen)` : ""}.`,
    };
    beginn = naechsterArbeitstag(ende);
    return vorgang;
  });
}
