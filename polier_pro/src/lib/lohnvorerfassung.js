// Lohnvorerfassung für die Baulohnabrechnung beim Steuerberater/Lohnbüro.
//
// Polaris rechnet KEINE Löhne (Steuer, Sozialversicherung, SOKA-BAU bleiben
// im Lohnprogramm). Es liefert je Mitarbeiter und Monat die Bewegungsdaten:
// Stunden je Baustelle (Kostenstelle), Überstunden-, Nacht-, Sonntags- und
// Feiertagsstunden, bezahlte Feiertage, Urlaubs- und Krankheitstage sowie
// von Hand erfasste Schlechtwetter-, Erschwernis- und Auslösewerte — als
// DATEV-LODAS-ASCII-Datei oder Tabelle.
//
// Lohnarten-Nummern und BS-Nummern sind firmenindividuell: Standardwerte
// unten sind Platzhalter und MÜSSEN mit dem Lohnbüro abgestimmt werden.

export const LOHNARTEN = [
  { key: "grund", bez: "Arbeitsstunden", einheit: "h" },
  { key: "ueberstunden", bez: "Überstundenzuschlag", einheit: "h" },
  { key: "nacht", bez: "Nachtarbeitszuschlag", einheit: "h" },
  { key: "sonntag", bez: "Sonntagszuschlag", einheit: "h" },
  { key: "feiertagArbeit", bez: "Feiertagszuschlag", einheit: "h" },
  { key: "feiertagBezahlt", bez: "Feiertagslohn", einheit: "h" },
  { key: "urlaub", bez: "Urlaub", einheit: "Tage" },
  { key: "krank", bez: "Krankheit", einheit: "Tage" },
  { key: "schlechtwetter", bez: "Ausfallstunden Schlechtwetter", einheit: "h" },
  { key: "erschwernis", bez: "Erschwerniszuschlag", einheit: "h" },
  { key: "ausloese", bez: "Auslöse/Verpflegung", einheit: "Tage" },
];

export const STANDARD_LOHN = {
  bundesland: "NW",
  sollJeWochentag: [0, 8, 8, 8, 8, 8, 0], // So … Sa
  ueberstunden: "woche", // "woche" | "tag" | "keine"
  wochenSoll: 40,
  nachtVon: "20:00", nachtBis: "05:00",
  beraterNr: "", mandantenNr: "",
  // la = Lohnart im Lohnprogramm, bs = BS-Nr (Stunden/Tage) — Platzhalter!
  lohnarten: Object.fromEntries(LOHNARTEN.map((l, i) => [l.key, { la: String(100 + i * 10), bs: l.einheit === "Tage" ? "2" : "1" }])),
  personalnummern: {},
};

export function lohnEinstellungen(gespeichert) {
  const g = gespeichert || {};
  return { ...STANDARD_LOHN, ...g, lohnarten: { ...STANDARD_LOHN.lohnarten, ...(g.lohnarten || {}) }, personalnummern: g.personalnummern || {} };
}

// ── Feiertage ───────────────────────────────────────────────────────────
function ostersonntag(j) {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(j, monat - 1, tag));
}
const iso = d => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * 86400000);

export const BUNDESLAENDER = ["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"];

// Gesetzliche Feiertage (Mariä Himmelfahrt in BY nur in Gemeinden mit
// überwiegend katholischer Bevölkerung — hier nicht berücksichtigt).
export function feiertage(jahr, land = "NW") {
  const o = ostersonntag(jahr);
  const f = {
    [`${jahr}-01-01`]: "Neujahr", [iso(plus(o, -2))]: "Karfreitag", [iso(plus(o, 1))]: "Ostermontag",
    [`${jahr}-05-01`]: "Tag der Arbeit", [iso(plus(o, 39))]: "Christi Himmelfahrt", [iso(plus(o, 50))]: "Pfingstmontag",
    [`${jahr}-10-03`]: "Tag der Deutschen Einheit", [`${jahr}-12-25`]: "1. Weihnachtstag", [`${jahr}-12-26`]: "2. Weihnachtstag",
  };
  const in_ = (...l) => l.includes(land);
  if (in_("BW", "BY", "ST")) f[`${jahr}-01-06`] = "Heilige Drei Könige";
  if (in_("BE", "MV")) f[`${jahr}-03-08`] = "Internationaler Frauentag";
  if (in_("BB")) { f[iso(o)] = "Ostersonntag"; f[iso(plus(o, 49))] = "Pfingstsonntag"; }
  if (in_("BW", "BY", "HE", "NW", "RP", "SL")) f[iso(plus(o, 60))] = "Fronleichnam";
  if (in_("SL")) f[`${jahr}-08-15`] = "Mariä Himmelfahrt";
  if (in_("TH")) f[`${jahr}-09-20`] = "Weltkindertag";
  if (in_("BB", "MV", "SN", "ST", "TH", "HB", "HH", "NI", "SH")) f[`${jahr}-10-31`] = "Reformationstag";
  if (in_("BW", "BY", "NW", "RP", "SL")) f[`${jahr}-11-01`] = "Allerheiligen";
  if (in_("SN")) {
    const nov23 = new Date(Date.UTC(jahr, 10, 23));
    f[iso(plus(nov23, -(((nov23.getUTCDay() - 3) + 7) % 7 || 7)))] = "Buß- und Bettag"; // Mittwoch vor dem 23.11.
  }
  return f;
}

// ── Auswertung ──────────────────────────────────────────────────────────
const lokalDatum = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const minutenVon = s => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// Minuten des Intervalls [ein, aus] im Nachtfenster (lokale Zeit, über Mitternacht).
export function nachtMinuten(ein, aus, von = "20:00", bis = "05:00") {
  const a = new Date(ein), b = new Date(aus);
  if (!(b > a)) return 0;
  const nv = minutenVon(von), nb = minutenVon(bis);
  let summe = 0;
  const tag = new Date(a); tag.setHours(0, 0, 0, 0);
  for (let t = new Date(tag.getTime() - 86400000); t < b; t = new Date(t.getTime() + 86400000)) {
    const s = new Date(t.getTime() + nv * 60000);
    const e = nb > nv ? new Date(t.getTime() + nb * 60000) : new Date(t.getTime() + (1440 + nb) * 60000);
    summe += Math.max(0, Math.min(b, e) - Math.max(a, s)) / 60000;
  }
  return Math.round(summe);
}

function wocheVon(datum) { // ISO-Woche als Schlüssel "YYYY-Www" (Montag als Wochenbeginn)
  const d = new Date(`${datum}T12:00:00Z`);
  const tag = (d.getUTCDay() + 6) % 7;
  const montag = plus(d, -tag);
  return iso(montag);
}

// monat: "2026-11"; buchungen: zeitbuchungen (abgeschlossen) aller MA;
// abwesenheiten: genehmigte/erfasste; eingaben: { profilId: { schlechtwetter, erschwernis, ausloese } }
// projekte: [{id, projektnummer}] für die Kostenstelle.
export function monatAuswerten({ monat, buchungen = [], abwesenheiten = [], eingaben = {}, einstellungen, projekte = [] }) {
  const e = lohnEinstellungen(einstellungen);
  const [jahr, mon] = monat.split("-").map(Number);
  const ft = feiertage(jahr, e.bundesland);
  const tage = [];
  for (let d = new Date(Date.UTC(jahr, mon - 1, 1)); d.getUTCMonth() === mon - 1; d = plus(d, 1)) tage.push(iso(d));
  const soll = datum => ft[datum] ? 0 : Number(e.sollJeWochentag[new Date(`${datum}T12:00:00Z`).getUTCDay()]) || 0;
  const istArbeitstag = datum => !ft[datum] && soll(datum) > 0;
  const kst = id => { const p = projekte.find(x => String(x.id) === String(id)); return p?.projektnummer || (id != null ? String(id) : ""); };

  const jeMa = new Map();
  const ma = id => {
    if (!jeMa.has(id)) jeMa.set(id, { profilId: id, name: "", tage: {}, baustellen: {}, nacht: 0, sonntag: 0, feiertagArbeit: 0, urlaub: 0, krank: 0, hinweise: [] });
    return jeMa.get(id);
  };
  for (const b of buchungen) {
    if (!b.profil_id || b.status && b.status !== "abgeschlossen") continue;
    const datum = lokalDatum(b.eingestempelt_at);
    if (!datum.startsWith(monat)) continue;
    const m = ma(b.profil_id);
    if (b.profile) m.name = `${b.profile.vorname || ""} ${b.profile.nachname || ""}`.trim();
    const min = Number(b.netto_minuten) || 0;
    m.tage[datum] = (m.tage[datum] || 0) + min;
    const k = kst(b.projekt_id);
    m.baustellen[k] = (m.baustellen[k] || 0) + min;
    if (b.ausgestempelt_at) {
      const brutto = (new Date(b.ausgestempelt_at) - new Date(b.eingestempelt_at)) / 60000;
      const nacht = nachtMinuten(b.eingestempelt_at, b.ausgestempelt_at, e.nachtVon, e.nachtBis);
      m.nacht += brutto > 0 ? Math.min(min, nacht * min / brutto) : 0; // Pause anteilig abziehen
    }
    if (ft[datum]) m.feiertagArbeit += min;
    else if (new Date(`${datum}T12:00:00Z`).getUTCDay() === 0) m.sonntag += min;
    if (min > 13 * 60) m.hinweise.push(`${datum}: ${Math.round(min / 6) / 10} h an einem Tag — Buchung prüfen`);
  }
  for (const a of abwesenheiten) {
    if (!["genehmigt", "erfasst"].includes(a.status)) continue;
    const id = a.profile_id || a.profil_id;
    if (!id) continue;
    const m = ma(id);
    if (a.mitarbeiter && !m.name) m.name = `${a.mitarbeiter.vorname || ""} ${a.mitarbeiter.nachname || ""}`.trim();
    for (const d of tage) if (d >= a.von_datum && d <= a.bis_datum && istArbeitstag(d)) {
      if (a.typ === "urlaub") m.urlaub++; else if (a.typ === "krankheit") m.krank++;
    }
  }
  for (const id of Object.keys(eingaben || {})) ma(id);

  const feiertageImMonat = tage.filter(d => ft[d] && Number(e.sollJeWochentag[new Date(`${d}T12:00:00Z`).getUTCDay()]) > 0);
  return [...jeMa.values()].map(m => {
    const ist = Object.values(m.tage).reduce((s, x) => s + x, 0);
    let ueber = 0;
    if (e.ueberstunden === "tag") {
      for (const [d, min] of Object.entries(m.tage)) ueber += Math.max(0, min - soll(d) * 60);
    } else if (e.ueberstunden === "woche") {
      const wochen = {};
      for (const [d, min] of Object.entries(m.tage)) wochen[wocheVon(d)] = (wochen[wocheVon(d)] || 0) + min;
      for (const min of Object.values(wochen)) ueber += Math.max(0, min - e.wochenSoll * 60);
    }
    // Bezahlter Feiertag: Soll des Wochentags, wenn an dem Tag nicht gearbeitet wurde
    // und der MA nicht krank/im Urlaub war (Abwesenheit zählt nur Arbeitstage).
    const feiertagBezahlt = feiertageImMonat.filter(d => !m.tage[d])
      .reduce((s, d) => s + (Number(e.sollJeWochentag[new Date(`${d}T12:00:00Z`).getUTCDay()]) || 0), 0);
    const ein = eingaben?.[m.profilId] || {};
    const h = min => Math.round(min / 6) / 10;
    const werte = {
      ueberstunden: h(ueber), nacht: h(m.nacht), sonntag: h(m.sonntag), feiertagArbeit: h(m.feiertagArbeit),
      feiertagBezahlt: ist || m.urlaub || m.krank ? feiertagBezahlt : 0,
      urlaub: m.urlaub, krank: m.krank,
      schlechtwetter: Number(ein.schlechtwetter) || 0, erschwernis: Number(ein.erschwernis) || 0, ausloese: Number(ein.ausloese) || 0,
    };
    const sollMonat = tage.reduce((s, d) => s + soll(d), 0);
    return {
      profilId: m.profilId, name: m.name || ein.name || "", personalnummer: e.personalnummern[m.profilId] || "",
      stunden: h(ist), sollStunden: sollMonat, baustellen: Object.entries(m.baustellen).map(([k, min]) => ({ kostenstelle: k, stunden: h(min) })),
      werte, hinweise: m.hinweise, tageGearbeitet: Object.keys(m.tage).length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

// Bewegungsdaten-Zeilen: { pnr, la, bs, wert, kostenstelle, bemerkung }
export function bewegungsdaten(auswertung, einstellungen) {
  const e = lohnEinstellungen(einstellungen);
  const zeilen = [];
  for (const m0 of auswertung) {
    const m = { ...m0, personalnummer: e.personalnummern[m0.profilId] || m0.personalnummer };
    const la = k => e.lohnarten[k] || {};
    for (const b of m.baustellen) if (b.stunden) zeilen.push({ pnr: m.personalnummer, name: m.name, key: "grund", la: la("grund").la, bs: la("grund").bs, wert: b.stunden, kostenstelle: b.kostenstelle });
    for (const l of LOHNARTEN.slice(1)) {
      const w = m.werte[l.key];
      if (w) zeilen.push({ pnr: m.personalnummer, name: m.name, key: l.key, la: la(l.key).la, bs: la(l.key).bs, wert: w, kostenstelle: "" });
    }
  }
  return zeilen;
}

const zahl = n => String(Math.round(n * 100) / 100).replace(".", ",");
// DATEV LODAS ASCII-Import, Satz u_lod_bwd_buchung_standard (laufender Monat).
export function lodasDatei(zeilen, { monat, einstellungen }) {
  const e = lohnEinstellungen(einstellungen);
  const [j, m] = monat.split("-");
  const zeitraum = `01.${m}.${j}`;
  const out = [
    "[Allgemein]", "Ziel=LODAS", "Version_SST=1.0", `BeraterNr=${e.beraterNr}`, `MandantenNr=${e.mandantenNr}`,
    "Feldtrennzeichen=;", "Zahlenkomma=,", "Datumsformat=TT.MM.JJJJ", "Stringbegrenzer=\"", "Kommentarzeichen=*", "",
    "[Satzbeschreibung]",
    "10;u_lod_bwd_buchung_standard;pnr#bwd;abrechnung_zeitraum#bwd;bs_wert_butab#bwd;bs_nr#bwd;la_eigene#bwd;kostenstelle#bwd;bemerkung#bwd;", "",
    "[Bewegungsdaten]",
  ];
  for (const z of zeilen) {
    if (!z.pnr) continue;
    out.push(`10;${z.pnr};${zeitraum};${zahl(z.wert)};${z.bs};${z.la};${z.kostenstelle ? `"${String(z.kostenstelle).replace(/"/g, "")}"` : ""};"Polaris ${z.key}";`);
  }
  return out.join("\r\n") + "\r\n";
}

export function lohnPruefen(auswertung, einstellungen) {
  const e = lohnEinstellungen(einstellungen);
  const fehler = [];
  if (!e.beraterNr || !e.mandantenNr) fehler.push("Berater- und Mandantennummer fehlen (Einstellungen).");
  for (const m of auswertung) if (!e.personalnummern[m.profilId]) fehler.push(`${m.name || "Mitarbeiter"}: Personalnummer fehlt — wird im LODAS-Export übersprungen.`);
  return fehler;
}
