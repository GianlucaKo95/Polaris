// Kennzahlen für das Desktop-Cockpit (views/CockpitView.jsx): firmenweite
// Angebote, Aufträge, Forderungen und der Stundenverlauf einer Baustelle.
import { nettoSumme, gp, istTitel, inSumme } from "./lv.js";
import { ausgangsPosten, opUebersicht } from "./fibu.js";

const netto = a => nettoSumme(a.positionen || []) * (1 - (Number(a.rabatt) || 0) / 100);

export function baustellenUebersicht({ projekte = [], angebote = [], baufortschritt = [] }) {
  const prozent = new Map(baufortschritt.map(b => [`${b.angebot_id}:${b.position_id}`, Number(b.prozent) || 0]));
  return projekte.map(p => {
    const auftraege = angebote.filter(a => String(a.projekt_id) === String(p.id) && a.status === "angenommen");
    let summe = 0, erbracht = 0;
    for (const a of auftraege) for (const pos of a.positionen || []) {
      if (istTitel(pos) || !inSumme(pos)) continue;
      const wert = gp(pos);
      summe += wert;
      erbracht += wert * (prozent.get(`${a.id}:${pos.id}`) || 0) / 100;
    }
    const rabatt = auftraege.length ? auftraege.reduce((s, a) => s + netto(a), 0) : 0;
    return { projekt: p, auftragNetto: rabatt, leistungsstand: summe > 0 ? erbracht / summe : null, erbrachtNetto: erbracht };
  });
}

export function kennzahlen({ projekte = [], angebote = [], rechnungen = [], baufortschritt = [], heute }) {
  const offen = angebote.filter(a => ["entwurf", "versendet"].includes(a.status));
  const freigaben = angebote.filter(a => a.interne_freigabe?.status === "angefragt")
    .map(a => ({ angebot: a, projekt: projekte.find(p => String(p.id) === String(a.projekt_id)), netto: netto(a) }));
  const baustellen = baustellenUebersicht({ projekte, angebote, baufortschritt });
  const auftrag = baustellen.reduce((s, b) => s + b.auftragNetto, 0);
  const abgerechnet = rechnungen.filter(r => r.status !== "entwurf").reduce((s, r) => s + (Number(r.netto_betrag) || 0), 0);
  const posten = rechnungen.map(r => ausgangsPosten(r, projekte.find(p => String(p.id) === String(r.projekt_id))));
  const op = opUebersicht(posten, heute);
  const ueberfaellig = posten.filter(p => p.offen > 0.005 && !p.entwurf && p.faellig < heute);
  const aeltesteTage = ueberfaellig.length
    ? Math.max(...ueberfaellig.map(p => Math.round((new Date(`${heute}T12:00:00Z`) - new Date(`${p.faellig}T12:00:00Z`)) / 86400000))) : 0;
  return {
    angeboteOffen: { anzahl: offen.length, netto: offen.reduce((s, a) => s + netto(a), 0), zurFreigabe: freigaben.length },
    auftragsbestand: Math.max(0, auftrag - abgerechnet),
    forderungen: op.forderungen,
    ueberfaellig: { anzahl: ueberfaellig.length, summe: ueberfaellig.reduce((s, p) => s + p.offen, 0), aeltesteTage },
    freigaben, baustellen,
  };
}

// Montag der Woche (lokal) als YYYY-MM-DD
function wochenStart(d) {
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export function kalenderwoche(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const tag = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - tag);
  const jahrStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - jahrStart) / 86400000 + 1) / 7);
}

// Gestempelte Stunden je Woche, kumuliert über die letzten n Wochen
// (inklusive aller Stunden davor als Startwert).
export function stundenVerlauf(zeitbuchungen = [], { wochen = 16, heute = new Date() } = {}) {
  const ende = wochenStart(heute);
  const starts = Array.from({ length: wochen }, (_, i) => { const d = new Date(ende); d.setDate(d.getDate() - (wochen - 1 - i) * 7); return d; });
  const kum = new Array(wochen).fill(0);
  let davor = 0;
  for (const z of zeitbuchungen) {
    if (z.status && z.status !== "abgeschlossen") continue;
    const t = new Date(z.eingestempelt_at);
    const h = (Number(z.netto_minuten) || 0) / 60;
    if (t < starts[0]) { davor += h; continue; }
    const i = starts.findIndex((s, k) => t >= s && (k === wochen - 1 || t < starts[k + 1]));
    if (i >= 0) kum[i] += h;
  }
  let lauf = davor;
  return starts.map((s, i) => { lauf += kum[i]; return { kw: kalenderwoche(s), start: s, stunden: lauf }; });
}

// Abschnitts-Text "C–D / 3–4 · EG" in Achsen-Teile zerlegen (für die Achsblasen).
export function abschnittTeile(bereich) {
  const [achsen, ...rest] = String(bereich || "").split(" · ");
  const gruppen = achsen.split(" / ").map(g => g.split("–").map(s => s.trim()).filter(Boolean)).filter(g => g.length && g.every(t => /^[A-Za-z0-9]{1,3}['’]?$/.test(t)));
  return { gruppen, rest: rest.join(" · ") };
}
