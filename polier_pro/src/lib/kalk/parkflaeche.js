// Plan-Assistent, Profil Parkfläche (Parkdeck, Tiefgaragendach, Stellplatzfläche).
//
//  • Fläche = kleinster geschlossener Linienzug um den Startpunkt; beschriftete
//    Öffnungen (Treppenhaus, Aufzug, Schacht, Treppenauge) werden abgezogen.
//  • Stellplätze: geschlossene Rechtecke in Stellplatzgröße (2,2–3,4 × 4,4–6,5 m)
//    oder Trennlinien (4,4–6,5 m lang, parallel, Abstand 2,2–3,4 m in einer Reihe).
//  • Markierung = Länge der Stellplatz-Trennlinien bzw. Rechteckkanten.
//  • Stellplatzfläche / Fahrgasse getrennt (z. B. OS 8 im Stellplatz, OS 11 in der Fahrgasse).
//  • Randanschluss (Sockel, Hohlkehle) = Umfang + Öffnungsränder.
//  • Abläufe aus Beschriftungen („BA“, „Bodenablauf“, „Ablauf“), Rinnen nur als Hinweis.

import { polygonFlaeche, punktInPolygon, oeffnungenFinden, bezugGesamt } from "./planAbschnitt.js";
import { flaecheFinden, schwerpunkt } from "./umriss.js";
import { zuordnungMitRegeln } from "./zuordnung.js";

const r2 = x => Math.round(x * 100) / 100;
const de = x => r2(x).toLocaleString("de-DE");
const zu = p => [...p, p[0]];
const lang = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const BREITE = [2.2, 3.4], TIEFE = [4.4, 6.5];

function rechteckMasse(u) {
  if (u.length !== 4) return null;
  const s = [0, 1, 2, 3].map(i => lang(u[i], u[(i + 1) % 4]));
  if (Math.abs(s[0] - s[2]) > 0.05 || Math.abs(s[1] - s[3]) > 0.05) return null;
  const a = (s[0] + s[2]) / 2, b = (s[1] + s[3]) / 2;
  return { b: Math.min(a, b), t: Math.max(a, b) };
}

export function stellplaetzeFinden(flaeche, { umrisse = [], linien = [] }) {
  const drin = p => punktInPolygon(p, flaeche);
  // a) Rechtecke
  const rechtecke = [];
  for (const u of umrisse) {
    const m = rechteckMasse(u);
    if (!m || m.b < BREITE[0] || m.b > BREITE[1] || m.t < TIEFE[0] || m.t > TIEFE[1]) continue;
    const c = schwerpunkt(u);
    if (!drin(c) || rechtecke.some(r => lang(r.c, c) < 0.3)) continue;
    rechtecke.push({ c, punkte: u, flaeche: m.b * m.t, kanten: u.map((p, i) => [p, u[(i + 1) % 4]]) });
  }
  if (rechtecke.length >= 2) {
    // Markierung: gemeinsame Kanten benachbarter Plätze nur einmal zählen
    const kanten = [];
    for (const r of rechtecke) for (const [a, b] of r.kanten) {
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!kanten.some(k => lang(k.m, m) < 0.05)) kanten.push({ a, b, m });
    }
    return { methode: "rechtecke", plaetze: rechtecke.map(r => ({ c: r.c, punkte: r.punkte })), markierung: kanten.map(k => [k.a, k.b]),
      platzflaeche: rechtecke.map(r => r.punkte) };
  }
  // b) Trennlinien in Reihen
  const kand = linien.filter(l => { const L = lang(l.p1, l.p2); return L >= TIEFE[0] && L <= TIEFE[1] && drin({ x: (l.p1.x + l.p2.x) / 2, y: (l.p1.y + l.p2.y) / 2 }); })
    .map(l => {
      let w = Math.atan2(l.p2.y - l.p1.y, l.p2.x - l.p1.x); if (w < 0) w += Math.PI; if (w >= Math.PI - 1e-9) w -= Math.PI;
      const d = { x: Math.cos(w), y: Math.sin(w) }, n = { x: -d.y, y: d.x };
      const m = { x: (l.p1.x + l.p2.x) / 2, y: (l.p1.y + l.p2.y) / 2 };
      return { l, w, s: m.x * n.x + m.y * n.y, t: m.x * d.x + m.y * d.y, L: lang(l.p1, l.p2), d, n };
    });
  const reihen = [];
  for (const k of kand) {
    const r = reihen.find(r => Math.abs(r.w - k.w) < 0.035 && Math.abs(r.t - k.t) < 0.5);
    if (r) r.glieder.push(k); else reihen.push({ w: k.w, t: k.t, glieder: [k] });
  }
  const plaetze = [], markierung = [], platzflaeche = [];
  for (const r of reihen) {
    const g = r.glieder.sort((a, b) => a.s - b.s);
    let genutzt = new Set();
    for (let i = 0; i + 1 < g.length; i++) {
      const ab = g[i + 1].s - g[i].s;
      if (ab < BREITE[0] || ab > BREITE[1]) continue;
      const a = g[i], b = g[i + 1];
      const c = { x: ((a.l.p1.x + a.l.p2.x) / 2 + (b.l.p1.x + b.l.p2.x) / 2) / 2, y: ((a.l.p1.y + a.l.p2.y) / 2 + (b.l.p1.y + b.l.p2.y) / 2) / 2 };
      const hl = Math.min(a.L, b.L) / 2;
      platzflaeche.push([a.l.p1, a.l.p2, b.l.p2, b.l.p1].every(Boolean) ? [
        { x: c.x - a.d.x * hl - a.n.x * ab / 2, y: c.y - a.d.y * hl - a.n.y * ab / 2 }, { x: c.x + a.d.x * hl - a.n.x * ab / 2, y: c.y + a.d.y * hl - a.n.y * ab / 2 },
        { x: c.x + a.d.x * hl + a.n.x * ab / 2, y: c.y + a.d.y * hl + a.n.y * ab / 2 }, { x: c.x - a.d.x * hl + a.n.x * ab / 2, y: c.y - a.d.y * hl + a.n.y * ab / 2 }] : []);
      plaetze.push({ c });
      genutzt.add(i); genutzt.add(i + 1);
    }
    for (const i of genutzt) markierung.push([g[i].l.p1, g[i].l.p2]);
  }
  return { methode: plaetze.length ? "trennlinien" : null, plaetze, markierung, platzflaeche };
}

export function parkflaecheErkennen(plan, { start, bereich } = {}) {
  const gef = flaecheFinden(plan, { start, bereich, minFlaeche: 20 });
  if (gef.fehler) return { fehler: gef.fehler };
  const { innen } = gef;
  const hinweise = [];
  const oeffnungen = oeffnungenFinden(innen.punkte, plan);
  const abz = oeffnungen.map(o => ({ punkte: o.punkte, abzug: true, oeffnung: o.text }));
  const sp = stellplaetzeFinden(innen.punkte, plan);
  const abl = (plan.texte || []).filter(t => punktInPolygon(t, innen.punkte) && /^\s*BA\b|bodenablauf|\bablauf|gully|einlauf/i.test(t.text));
  if ((plan.texte || []).some(t => punktInPolygon(t, innen.punkte) && /rinne/i.test(t.text))) hinweise.push("Rinnen im Plan beschriftet — Länge bitte nachzeichnen.");
  if (!sp.plaetze.length) hinweise.push("Keine Stellplätze erkannt (weder Rechtecke noch Trennlinien in Stellplatzgröße).");
  const nummern = (plan.texte || []).filter(t => punktInPolygon(t, innen.punkte) && /^\s*\d{1,3}\s*$/.test(t.text)).length;
  if (sp.plaetze.length && nummern && Math.abs(nummern - sp.plaetze.length) > 0) hinweise.push(`Plan trägt ${nummern} Stellplatznummern, erkannt sind ${sp.plaetze.length} Stellplätze — bitte prüfen.`);

  const mengen = [];
  const neu = (id, name, art, einheit, bezug, extra = {}) => mengen.push({ id, name, art, einheit, bezug, menge: r2(bezugGesamt(bezug)), ...extra });
  neu("flaeche", "Parkfläche gesamt", "flaeche", "m²", { art: "flaeche", teile: [{ punkte: innen.punkte }, ...abz] },
    { info: oeffnungen.length ? `abzüglich ${oeffnungen.map(o => `${o.text} (${de(o.flaeche)} m²)`).join(", ")}` : "keine beschriftete Öffnung gefunden" });
  if (sp.plaetze.length) {
    neu("stellplaetze", `Stellplätze (${sp.methode === "rechtecke" ? "aus Rechtecken" : "aus Trennlinien"})`, "zaehlen", "Stk", { art: "zaehlen", teile: [{ punkte: sp.plaetze.map(p => p.c) }] });
    neu("markierung", "Markierung Stellplatztrennung", "strecke", "m", { art: "strecke", teile: sp.markierung.map(([a, b]) => ({ punkte: [a, b] })) });
    const pf = sp.platzflaeche.filter(p => p.length >= 3);
    if (pf.length) {
      neu("stellplatzflaeche", "Stellplatzfläche", "flaeche", "m²", { art: "flaeche", teile: pf.map(p => ({ punkte: p })) });
      neu("fahrgasse", "Fahrgassen / Restfläche", "flaeche", "m²", { art: "flaeche", teile: [{ punkte: innen.punkte }, ...abz, ...pf.map(p => ({ punkte: p, abzug: true }))] });
    }
  }
  neu("rand", "Randanschluss (Sockel, Hohlkehle)", "strecke", "m", { art: "strecke", teile: [{ punkte: zu(innen.punkte) }, ...oeffnungen.map(o => ({ punkte: zu(o.punkte) }))] });
  if (abl.length) neu("ablaeufe", "Abläufe", "zaehlen", "Stk", { art: "zaehlen", teile: [{ punkte: abl.map(t => ({ x: t.x, y: t.y })) }] }, { annahme: true, info: "aus Beschriftungen gezählt" });
  if (oeffnungen.length) neu("oeffnungen", "Öffnungen (Treppenhaus, Aufzug, Schacht …)", "zaehlen", "Stk", { art: "zaehlen", teile: [{ punkte: oeffnungen.map(o => schwerpunkt(o.punkte)) }] });
  return { profil: "parkflaeche", innen, oeffnungen, stellplaetze: sp, mengen, hinweise, grundflaeche: polygonFlaeche(innen.punkte) };
}

const NIE = /stundenlohn|baustelleneinrichtung|ger[üu]st|kran|container|absperr|verkehrssicherung|schild(?!er)|beleuchtung/i;
const PARK = [
  ["stellplaetze", /stellplatz|parkplatz|nummer|piktogramm|radabweiser|parkstand|symbol/i, "zaehlen"],
  ["ablaeufe", /ablauf|abl[äa]ufe|gully|einlauf/i, "zaehlen"],
  ["oeffnungen", /durchbruch|schacht|aufzug|treppen/i, "zaehlen"],
  ["markierung", /markierung|linie|strich|begrenzung|trennlinie|leitlinie/i, "strecke"],
  ["rand", /hohlkehle|sockel|wandanschluss|aufkantung|anschluss|randabschluss|randfuge|kehle|st[üu]tzen/i, "strecke"],
  ["stellplatzflaeche", /stellpl[äa]tze|stellplatzfl|parkst[äa]nde|parkfl[äa]che der stell/i, "flaeche"],
  ["fahrgasse", /fahrgasse|fahrbahn|fahrweg|rampe|zufahrt/i, "flaeche"],
  ["flaeche", /beschicht|\bos\s*\d|gussasphalt|asphalt|abdicht|grundier|kugelstrahl|fr[äa]s|strahl|versiegel|epoxi|\bep\b|\bpu\b|polyurethan|verschlei[ßs]|deckschicht|belag|pflaster|estrich|reinig|vorbereit|untergrund|schutz|d[äa]mm|dampf|bahn|kratzspachtel|spachtel|egalisier|einstreu|abstreu|parkdeck|parkfl[äa]che|fl[äa]che/i, "flaeche"],
];
export const zuordnungPark = (positionen, mengen) => zuordnungMitRegeln(positionen, mengen, { regeln: PARK, nie: NIE });
