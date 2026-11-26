// Abschlag nach Planabschnitten: "S–T / 13–15 Abdichtung fertig" → Mengen je
// LV-Position aus der Plangeometrie, ohne Doppelbuchung, als Aufmaßzeilen.
//
// Einrichtung je Projekt (einmal): Achsraster aus dem PDF-Plan (Achsblasen),
// zu jeder Position ihre Geometrie im Plan — Fläche (Polygon), Länge
// (Linienzug) oder Stück (Punkte). Gespeichert in kalk_projekte.planraster.
//
// Melden: Der Satz nennt die Achsen (je Richtung von–bis), optional den
// Arbeitsgang ("Abdichtung", "ohne Kies") und einen Anteil ("zu 50 %").
// Jede Geometrie wird auf die Rasterfelder zugeschnitten; gebucht wird je
// Position und Feld, darum zählt ein Feld nie doppelt — auch nicht, wenn sich
// zwei Meldungen überschneiden. Die Felder liegen zwischen benachbarten Achsen;
// der Streifen vor der ersten und hinter der letzten Achse (Attika, Überstand)
// gehört zum Randfeld und wird mitgemeldet, wenn die Randachse genannt ist.
//
// Alles in Metern, reine Geometrie ohne KI — nachprüfbar und testbar.

import { rasterBauen } from "../achsraster.js";
import { schluessel } from "./abrechnung.js";

export const TAG_RE = /^([A-Z]{1,2}['’]?|\d{1,3}[a-z]?['’]?)$/i;
const dot = (p, n) => p.x * n.x + p.y * n.y;
const r3 = x => Math.round(x * 1000) / 1000;
const zahlDe = (n, st = 3) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st, useGrouping: false });

// ── Achsen aus Achsblasen ───────────────────────────────────────────────
// texte/kreise in Metern (pdfObjekteInMeter). Eine Achse = zwei Blasen mit
// derselben Beschriftung an beiden Enden; die Linie dazwischen ist die Achse.
// Bemaßungszahlen stehen nicht in Kreisen und fallen so heraus.
export function achsenAusBlasen({ texte = [], kreise = [] }) {
  const blasen = [];
  for (const t of texte) {
    const tag = String(t.text || "").trim();
    if (!TAG_RE.test(tag)) continue;
    let best = null;
    for (const k of kreise) {
      const d = Math.hypot(t.x - k.x, t.y - k.y);
      if (k.r > 0.05 && k.r < 2 && d < k.r * 1.25 && (!best || d < best.d)) best = { d, k };
    }
    if (best) blasen.push({ tag, x: best.k.x, y: best.k.y, r: best.k.r });
  }
  const jeTag = new Map();
  for (const b of blasen) {
    const l = jeTag.get(b.tag) || [];
    if (!l.some(x => Math.hypot(x.x - b.x, x.y - b.y) < 0.01)) l.push(b);
    jeTag.set(b.tag, l);
  }
  const achsen = [], einzeln = [];
  for (const [tag, l] of jeTag) {
    let paar = null, weit = 0;
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const d = Math.hypot(l[i].x - l[j].x, l[i].y - l[j].y);
      if (d > weit) { weit = d; paar = [l[i], l[j]]; }
    }
    if (paar && weit >= 2) achsen.push({ tag, p1: { x: paar[0].x, y: paar[0].y }, p2: { x: paar[1].x, y: paar[1].y } });
    else einzeln.push(tag);
  }
  // Je Richtung nur Buchstaben oder nur Zahlen (die Mehrheit gewinnt).
  const r = rasterBauen(achsen);
  const raus = new Set();
  for (const f of Object.values(r.familien)) {
    const zahl = f.achsen.filter(a => /^\d/.test(a.tag)).length;
    const istZahl = zahl * 2 >= f.achsen.length;
    for (const a of f.achsen) if (/^\d/.test(a.tag) !== istZahl) raus.add(a.tag);
  }
  return { achsen: achsen.filter(a => !raus.has(a.tag)), einzeln };
}

// ── Felder ──────────────────────────────────────────────────────────────
// Je Richtung Bänder zwischen benachbarten Achsen; das erste und letzte Band
// reicht bis ins Unendliche (Randstreifen gehört zum Randfeld).
export function rasterAusAchsen(achsen) {
  const r = rasterBauen(achsen);
  const ks = Object.keys(r.familien).filter(k => r.familien[k].achsen.length >= 2).slice(0, 2);
  const familien = ks.map(k => {
    const f = r.familien[k], a = f.achsen;
    const baender = [];
    for (let i = 0; i + 1 < a.length; i++) baender.push({ von: i === 0 ? -Infinity : a[i].pos, bis: i + 2 === a.length ? Infinity : a[i + 1].pos, links: a[i].tag, rechts: a[i + 1].tag });
    return { key: k, normale: f.normale, achsen: a, baender };
  });
  return { ...r, felder: familien, fehler: ks.length < 2 ? ["Es braucht Achsen in zwei Richtungen (z. B. Buchstaben und Zahlen)."] : [] };
}

export const zellId = (i, j) => `${i}|${j}`;
export function alleZellen(raster) {
  const [a, b] = raster.felder;
  if (!a || !b) return [];
  const z = [];
  for (let i = 0; i < a.baender.length; i++) for (let j = 0; j < b.baender.length; j++) z.push(zellId(i, j));
  return z;
}

function grenzenDerZelle(raster, id) {
  const [i, j] = id.split("|").map(Number);
  const [a, b] = raster.felder;
  return [{ n: a.normale, ...a.baender[i] }, { n: b.normale, ...b.baender[j] }];
}

// Bänder einer Richtung zwischen zwei genannten Achsen (inkl. Randstreifen).
function baenderZwischen(fam, tagA, tagB) {
  const ia = fam.achsen.findIndex(a => a.tag.toLowerCase() === tagA.toLowerCase());
  const ib = fam.achsen.findIndex(a => a.tag.toLowerCase() === tagB.toLowerCase());
  const [lo, hi] = [Math.min(ia, ib), Math.max(ia, ib)];
  const aus = [];
  for (let i = lo; i < hi; i++) aus.push(i);
  return aus; // Band i liegt zwischen Achse i und i+1; Randbänder sind schon unendlich
}

// ── Zuschneiden ─────────────────────────────────────────────────────────
function halbebene(poly, n, wert, unten) {
  // behält dot(p,n) >= wert (unten=true) bzw. <= wert
  const drin = p => unten ? dot(p, n) >= wert - 1e-12 : dot(p, n) <= wert + 1e-12;
  const aus = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = dot(p, n) - wert, dq = dot(q, n) - wert;
    if (drin(q)) {
      if (!drin(p)) { const t = dp / (dp - dq); aus.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) }); }
      aus.push(q);
    } else if (drin(p)) { const t = dp / (dp - dq); aus.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) }); }
  }
  return aus;
}

export function polygonFlaeche(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

function flaecheIn(punkte, grenzen) {
  let poly = punkte;
  for (const g of grenzen) {
    if (g.von > -Infinity) poly = halbebene(poly, g.n, g.von, true);
    if (g.bis < Infinity && poly.length) poly = halbebene(poly, g.n, g.bis, false);
    if (poly.length < 3) return 0;
  }
  return polygonFlaeche(poly);
}

function streckeIn(punkte, grenzen) {
  let summe = 0;
  for (let k = 0; k + 1 < punkte.length; k++) {
    const p = punkte[k], q = punkte[k + 1];
    let t0 = 0, t1 = 1;
    for (const g of grenzen) {
      const dp = dot(p, g.n), dd = dot(q, g.n) - dp;
      for (const [w, unten] of [[g.von, true], [g.bis, false]]) {
        if (!Number.isFinite(w)) continue;
        // unten: dp + t*dd >= w ; sonst <= w
        if (Math.abs(dd) < 1e-12) { if (unten ? dp < w : dp > w) { t0 = 1; t1 = 0; } continue; }
        const t = (w - dp) / dd;
        if ((dd > 0) === unten) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      }
    }
    if (t1 > t0) summe += (t1 - t0) * Math.hypot(q.x - p.x, q.y - p.y);
  }
  return summe;
}

function punkteIn(punkte, grenzen) {
  return punkte.filter(p => grenzen.every(g => { const d = dot(p, g.n); return d >= g.von && d < g.bis; })).length;
}

// Menge einer Positionsgeometrie in einer Zelle.
// bezug: { art: "flaeche"|"strecke"|"zaehlen", teile: [{ punkte, abzug? }] }
export function mengeInZelle(bezug, grenzen) {
  let s = 0;
  for (const t of bezug?.teile || []) {
    if (!t.punkte?.length) continue;
    const v = bezug.art === "flaeche" ? (t.punkte.length >= 3 ? flaecheIn(t.punkte, grenzen) : 0)
      : bezug.art === "strecke" ? streckeIn(t.punkte, grenzen) : punkteIn(t.punkte, grenzen);
    s += (t.abzug ? -v : v) * (t.faktor ?? 1);
  }
  return s * (bezug?.faktor ?? 1);
}

export function bezugGesamt(bezug) {
  let s = 0;
  for (const t of bezug?.teile || []) {
    if (!t.punkte?.length) continue;
    const v = bezug.art === "flaeche" ? (t.punkte.length >= 3 ? polygonFlaeche(t.punkte) : 0)
      : bezug.art === "strecke" ? t.punkte.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - t.punkte[i].x, p.y - t.punkte[i].y), 0)
      : t.punkte.length;
    s += (t.abzug ? -v : v) * (t.faktor ?? 1);
  }
  return s * (bezug?.faktor ?? 1);
}

export function mengenJeZelle(raster, bezug) {
  const aus = {};
  for (const id of alleZellen(raster)) {
    const m = mengeInZelle(bezug, grenzenDerZelle(raster, id));
    if (Math.abs(m) > 1e-9) aus[id] = m;
  }
  return aus;
}

// ── Satz verstehen ──────────────────────────────────────────────────────
const STOPP = new Set(("abschnitt abschnitte achse achsen feld felder bereich zwischen bis und von vom zum zur fertig erledigt komplett "
  + "vollständig vollstaendig ist sind im in der die das den dem des mit ohne außer ausser nicht noch fehlt fehlen alles alle heute gestern "
  + "verlegt hergestellt eingebaut montiert gemacht prozent halb hälfte haelfte wurde wurden haus dach dachfläche dachflaeche ganz ganze "
  + "aber auch sowie inkl inklusive bitte melden gemeldet").split(" "));
const normWort = s => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
export const stamm = w => { const n = normWort(w); return n.slice(0, n.length <= 5 ? n.length : 5); };

export function satzVerstehen(satz, raster) {
  let rest = ` ${String(satz || "")} `;
  const fehler = [], hinweise = [];
  let anteil = 1;
  const proz = rest.match(/(\d{1,3}(?:[.,]\d+)?)\s*(%|prozent)/i);
  if (proz) { anteil = Math.min(100, Number(proz[1].replace(",", "."))) / 100; rest = rest.replace(proz[0], " "); }
  else if (/\bhalb\b|\bzur hälfte\b|\bzur haelfte\b/i.test(rest)) anteil = 0.5;

  // Achsen: je Richtung die genannten Tags in Satzreihenfolge
  const je = raster.felder.map(() => []);
  const tokens = rest.split(/[\s,;/–—-]+/).filter(Boolean);
  const verbraucht = new Set();
  tokens.forEach((tok, i) => {
    const t = tok.replace(/[.:()]+$/g, "").replace(/^[(]+/, "");
    raster.felder.forEach((f, k) => {
      if (f.achsen.some(a => a.tag.toLowerCase() === t.toLowerCase())) { je[k].push(f.achsen.find(a => a.tag.toLowerCase() === t.toLowerCase()).tag); verbraucht.add(i); }
    });
  });
  const bereiche = raster.felder.map((f, k) => {
    const g = je[k];
    if (g.length === 0) return null;
    if (g.length === 1) { fehler.push(`Nur Achse ${g[0]} genannt — bitte von–bis, z. B. ${g[0]}–${nachbar(f, g[0])}.`); return null; }
    const idx = g.map(t => f.achsen.findIndex(a => a.tag === t));
    return { von: f.achsen[Math.min(...idx)].tag, bis: f.achsen[Math.max(...idx)].tag };
  });
  raster.felder.forEach((f, k) => {
    if (!je[k].length) hinweise.push(`Keine Achse ${f.achsen[0].tag}…${f.achsen.at(-1).tag} genannt — ganze Länge in dieser Richtung.`);
  });
  if (!je.some(x => x.length)) fehler.push(`Keine Achse erkannt. Vorhanden: ${raster.felder.map(f => f.achsen.map(a => a.tag).join(", ")).join(" · ")}.`);

  // Arbeitsgänge: übrige Wörter; nach "ohne/außer/nicht/noch nicht" ausgeschlossen
  const nur = [], ohne = [];
  let negiert = false;
  tokens.forEach((tok, i) => {
    if (verbraucht.has(i)) return;
    const w = tok.replace(/[^\p{L}]/gu, "");
    const lw = w.toLowerCase();
    if (/^(ohne|außer|ausser|nicht|fehlt|fehlen|noch)$/.test(lw)) { negiert = true; return; }
    if (/^(und|sowie|mit|inkl|inklusive|aber)$/.test(lw)) { if (lw !== "und" && lw !== "sowie") negiert = false; return; }
    if (w.length < 3 || STOPP.has(lw)) return;
    (negiert ? ohne : nur).push(w);
  });
  return { bereiche, anteil, nur, ohne, fehler, hinweise };
}

function nachbar(f, tag) {
  const i = f.achsen.findIndex(a => a.tag === tag);
  return (f.achsen[i + 1] || f.achsen[i - 1] || { tag: "…" }).tag;
}

const natuerlich = (a, b) => String(a).localeCompare(String(b), "de", { numeric: true });
export function bereichText(raster, bereiche) {
  const teile = raster.felder.map((f, k) => {
    const [a, b] = bereiche[k] ? [bereiche[k].von, bereiche[k].bis] : [f.achsen[0].tag, f.achsen.at(-1).tag];
    const [x, y] = [a, b].sort(natuerlich);
    return { zahl: /^\d/.test(x), text: `${x}–${y}` };
  });
  return teile.sort((p, q) => p.zahl - q.zahl).map(t => t.text).join(" / ");
}

export function zellenDesBereichs(raster, bereiche) {
  const [a, b] = raster.felder;
  const ia = bereiche[0] ? baenderZwischen(a, bereiche[0].von, bereiche[0].bis) : a.baender.map((_, i) => i);
  const ib = bereiche[1] ? baenderZwischen(b, bereiche[1].von, bereiche[1].bis) : b.baender.map((_, i) => i);
  return ia.flatMap(i => ib.map(j => zellId(i, j)));
}

// ── Bereits gebucht (aus dem Aufmaß) ────────────────────────────────────
// Ergebnis: { posKey: { zellId: anteil } } — Summe aller Abschnittszeilen.
export function gebuchtAusAufmass(aufmass) {
  const g = {};
  for (const z of aufmass || []) {
    const zellen = z.extra?.abschnitt?.zellen;
    if (!zellen) continue;
    const k = z.extra.abschnitt.key || schluessel(z.stand_id, z.knoten_id);
    g[k] ||= {};
    for (const [id, a] of Object.entries(zellen)) g[k][id] = Math.min(1, (g[k][id] || 0) + Number(a));
  }
  return g;
}

// ── Abschnitt berechnen ─────────────────────────────────────────────────
// planraster: { achsen, bezuege: { posKey: { art, teile, modus? } } }
// positionen: [{ key, standId, knotenId, oz, kurztext, einheit, mengeLv }]
// Ergebnis je Position: neue Planmenge im Abschnitt, Anteil an der
// Plan-Gesamtmenge und die Menge fürs Aufmaß — nach Modus "anteil"
// (Anteil × LV-Menge, Standard) oder "plan" (Planmenge selbst).
export function abschnittBerechnen({ planraster, positionen, satz, gebucht = {} }) {
  const raster = rasterAusAchsen(planraster?.achsen || []);
  if (raster.fehler.length) return { fehler: raster.fehler, hinweise: [], zeilen: [] };
  const v = satzVerstehen(satz, raster);
  if (v.fehler.length) return { ...v, zeilen: [] };
  const zellen = zellenDesBereichs(raster, v.bereiche);
  const text = bereichText(raster, v.bereiche);
  const bezuege = planraster.bezuege || {};
  const pos = positionen.filter(p => bezuege[p.key]?.teile?.length);
  if (!pos.length) return { ...v, fehler: ["Noch keine Position mit Plangeometrie — erst unter „Einrichten“ Flächen, Linien oder Stückpunkte zuordnen."], zeilen: [] };
  const text_ = p => normWort(p.kurztext || "");
  const passt = (p, woerter) => woerter.some(w => text_(p).includes(stamm(w)));
  let auswahl = pos;
  const unbekannt = v.nur.filter(w => !pos.some(p => passt(p, [w])));
  if (v.nur.length) {
    auswahl = pos.filter(p => passt(p, v.nur));
    if (!auswahl.length) return { ...v, fehler: [`Kein Arbeitsgang „${v.nur.join(", ")}“ unter den Positionen mit Plangeometrie gefunden.`], zeilen: [] };
  }
  if (v.ohne.length) auswahl = auswahl.filter(p => !passt(p, v.ohne));
  const hinweise = [...v.hinweise];
  if (v.nur.length && unbekannt.length) hinweise.push(`Nicht zugeordnet: ${unbekannt.join(", ")}.`);

  const zeilen = [];
  let schonGebucht = 0;
  for (const p of auswahl) {
    const b = bezuege[p.key];
    const gesamt = bezugGesamt(b);
    if (!(gesamt > 0)) continue;
    const schon = gebucht[p.key] || {};
    const neu = {};
    let planNeu = 0, planSchon = 0;
    for (const id of zellen) {
      const m = mengeInZelle(b, grenzenDerZelle(raster, id));
      if (Math.abs(m) < 1e-9) continue;
      const frei = Math.max(0, Math.min(v.anteil, 1 - (schon[id] || 0)));
      planSchon += m * Math.min(v.anteil, schon[id] || 0);
      if (frei <= 1e-9) continue;
      neu[id] = frei;
      planNeu += m * frei;
    }
    if (planNeu <= 1e-9) { if (planSchon > 1e-9) schonGebucht++; continue; }
    const quote = planNeu / gesamt;
    const modus = b.modus === "plan" ? "plan" : "anteil";
    const menge = r3(modus === "plan" ? planNeu : quote * (p.mengeLv || 0));
    zeilen.push({ ...p, art: b.art, modus, planGesamt: r3(gesamt), planNeu: r3(planNeu), planSchon: r3(planSchon), quote, menge, zellen: neu });
  }
  if (schonGebucht) hinweise.push(`${schonGebucht} Position${schonGebucht === 1 ? " ist" : "en sind"} in diesem Abschnitt schon gebucht.`);
  if (!zeilen.length && !schonGebucht) hinweise.push("In diesem Abschnitt liegt keine Plangeometrie der gewählten Positionen.");
  return { ...v, hinweise, zellen, bereich: text, zeilen };
}

// Ergebnis → Aufmaßzeilen (Blatt „Abschnitte“, Ort = Achsbereich).
export function abschnittInsAufmass(ergebnis, { neueZeile, satz = "", datum } = {}) {
  return ergebnis.zeilen.filter(z => z.menge > 0).map((z, i) => {
    const formel = z.modus === "plan" ? zahlDe(z.planNeu) : `${zahlDe(z.quote, 6)}*${zahlDe(z.mengeLv)}`;
    const bez = z.modus === "plan" ? `Planmenge im Abschnitt` : `${zahlDe(z.quote * 100, 2)} % der Planmenge (${zahlDe(z.planNeu, 2)} von ${zahlDe(z.planGesamt, 2)})`;
    return neueZeile({ stand_id: z.standId, knoten_id: z.knotenId, blatt: "Abschnitte", ort: ergebnis.bereich, bezeichnung: bez,
      formel, quelle: "messung", sort: Date.now() + i, ...(datum ? { datum } : {}),
      extra: { abschnitt: { key: z.key, zellen: z.zellen, satz, modus: z.modus } } });
  });
}

// Fortschritt je Position (für die Übersicht): gebuchter Anteil der Planmenge.
export function fortschritt(planraster, gebucht) {
  const raster = rasterAusAchsen(planraster?.achsen || []);
  if (raster.fehler.length) return {};
  const aus = {};
  for (const [key, b] of Object.entries(planraster.bezuege || {})) {
    const gesamt = bezugGesamt(b);
    if (!(gesamt > 0)) continue;
    const je = mengenJeZelle(raster, b);
    let s = 0;
    for (const [id, m] of Object.entries(je)) s += m * Math.min(1, gebucht[key]?.[id] || 0);
    aus[key] = s / gesamt;
  }
  return aus;
}

// ── Öffnungen automatisch abziehen ──────────────────────────────────────
// Eine Öffnung ist ein geschlossener Umriss im Plan, in dem ihre Beschriftung
// steht: ein Durchbruchskürzel mit Maß („BD / 120 x 120“, „DD 80/80“) oder ein
// Wort wie „Lichtkuppel“, „Dachausstieg“, „Schacht“. Ein bloßes Rechteck reicht
// nicht — PV-Module, Schraffurfelder und Beschriftungskästen sind auch
// geschlossen. Steht ein Maß dabei, muss der Umriss dazu passen (±15 %).
// Abgezogen wird jede erkannte Öffnung, unabhängig von der Größe.
export const OEFFNUNG_RE = /aufzug|treppenhaus|lichtkuppel|dachausstieg|ausstieg|dachfenster|dachluke|oberlicht|lichtband|lichtfirst|\brwa\b|rauchabzug|schacht|aussparung|öffnung|oeffnung|luftraum|durchbruch|treppenauge/i;
const KUERZEL_RE = /^(BD|DD|SD|DB|DÖ|Ö|AU)\b/i;
const MASS_RE = /(\d{2,4})\s*[x×\/]\s*(\d{2,4})/;

export function punktInPolygon(p, poly) {
  let drin = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

const huelle = pts => {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
const ueberlappen = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const passtMass = (k, [a, b]) => {
  const w = k.h.x1 - k.h.x0, h = k.h.y1 - k.h.y0;
  const ok = (x, y) => Math.abs(x - y) <= y * 0.15;
  return (ok(w, a) && ok(h, b)) || (ok(w, b) && ok(h, a));
};

// flaeche: Punkte der gezeichneten Fläche; plan: { texte, umrisse } in Metern.
// Ergebnis: [{ punkte, flaeche, text }]
export function oeffnungenFinden(flaeche, { texte = [], umrisse = [] } = {}) {
  if (!flaeche || flaeche.length < 3) return [];
  const gesamt = polygonFlaeche(flaeche);
  const kandidaten = umrisse
    .filter(u => u.length >= 3 && u.every(p => punktInPolygon(p, flaeche)))
    .map(u => ({ punkte: u, flaeche: polygonFlaeche(u), h: huelle(u) }))
    .filter(k => k.flaeche >= 0.05 && k.flaeche <= Math.min(50, gesamt * 0.5));
  const innen = texte.filter(t => punktInPolygon(t, flaeche));
  const aus = [];
  for (const t of innen) {
    const text = String(t.text || "").trim();
    const kuerzel = KUERZEL_RE.test(text), wort = OEFFNUNG_RE.test(text) && text.length <= 40;
    if (!kuerzel && !wort) continue;
    // Maß aus diesem Text oder einer Zeile direkt darunter („BD /“ ↵ „120 x 120“)
    let mass = text.match(MASS_RE);
    if (!mass) {
      const unten = innen.find(u => u !== t && Math.abs(u.x - t.x) < 0.6 && t.y - u.y > 0 && t.y - u.y < 0.4 && MASS_RE.test(u.text));
      if (unten) mass = String(unten.text).match(MASS_RE);
    }
    const m = mass ? [Number(mass[1]) / 100, Number(mass[2]) / 100] : null;
    const um = kandidaten.filter(k => punktInPolygon(t, k.punkte));
    let wahl = null;
    if (m) wahl = um.filter(k => passtMass(k, m)).sort((a, b) => Math.abs(a.flaeche - m[0] * m[1]) - Math.abs(b.flaeche - m[0] * m[1]))[0];
    else if (wort) wahl = um.filter(k => k.flaeche >= 0.25).sort((a, b) => a.flaeche - b.flaeche)[0];
    if (!wahl || aus.some(o => ueberlappen(o.h, wahl.h))) continue;
    aus.push({ ...wahl, text: [text, mass && !text.includes(mass[0]) ? mass[0] : ""].filter(Boolean).join(" ") });
  }
  return aus.map(({ punkte, flaeche: f, text }) => ({ punkte, flaeche: f, text }));
}
