// Plan-Assistent, Profil Steildach: Dachaufsicht (Projektion) → wahre Mengen.
//
//  • Umriss = Traufe/Ortgang-Linienzug (wie beim Flachdach gesucht).
//  • Dachlinien im Umriss: Linien, die an einer Umrissecke beginnen, sind
//    Grat (ausspringende Ecke) oder Kehle (einspringende Ecke); Linien
//    parallel zu einer Umrisskante, die an Graten hängen oder Kante zu Kante
//    laufen, sind First. Schraffuren (viele parallele Linien) fallen heraus.
//  • Umrisskanten, auf denen ein First endet, sind Ortgang, die übrigen Traufe.
//  • Neigung aus dem Plan („DN 35°“, „Dachneigung 35°“) oder Eingabe; bei
//    gleicher Neigung aller Flächen gilt: wahre Fläche = Grundfläche / cos α,
//    Ortgang = Länge / cos α, Grat/Kehle über die Höhen ihrer Endpunkte
//    (Höhe = Abstand zur nächsten Traufe × tan α).
//
// Jede Menge trägt ihre Planlinien plus Faktor, damit die Abschnitts-
// abrechnung auf die wahren Werte kommt.

import { polygonFlaeche, punktInPolygon, oeffnungenFinden, bezugGesamt } from "./planAbschnitt.js";
import { flaecheFinden, schwerpunkt, aussenRand } from "./umriss.js";
import { zuordnungMitRegeln } from "./zuordnung.js";

const r2 = x => Math.round(x * 100) / 100;
const de = x => r2(x).toLocaleString("de-DE");
const zu = p => [...p, p[0]];
const lang = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const signiert = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;

function abstandZurStrecke(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
const richtung = (a, b) => { let w = Math.atan2(b.y - a.y, b.x - a.x); if (w < 0) w += Math.PI; if (w >= Math.PI) w -= Math.PI; return w; };
const parallel = (w1, w2, tol = 5 * Math.PI / 180) => { const d = Math.abs(w1 - w2); return d < tol || Math.PI - d < tol; };

// Neigung aus Plantexten: häufigster Wert, 5–75°
export function neigungAusTexten(texte) {
  const z = new Map();
  for (const t of texte || []) {
    for (const m of String(t.text).matchAll(/(?:\bDN|dachneigung|neigung)\s*[:=]?\s*(\d{1,2}(?:[.,]\d+)?)\s*°|(\d{1,2}(?:[.,]\d+)?)\s*°/gi)) {
      const v = Number((m[1] || m[2]).replace(",", "."));
      if (v >= 5 && v <= 75) z.set(v, (z.get(v) || 0) + (m[1] ? 3 : 1));
    }
  }
  return [...z.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// Dachlinien im Umriss finden und einordnen
export function dachlinienFinden(umriss, linien, texte = []) {
  const tol = 0.03;
  const ccw = signiert(umriss) > 0;
  const ecken = umriss.map((p, i) => {
    const a = umriss[(i - 1 + umriss.length) % umriss.length], b = umriss[(i + 1) % umriss.length];
    const kreuz = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
    return { p, konvex: ccw ? kreuz > 0 : kreuz < 0 };
  });
  const kanten = umriss.map((a, i) => ({ a, b: umriss[(i + 1) % umriss.length], w: richtung(a, umriss[(i + 1) % umriss.length]) }));
  const aufUmriss = p => kanten.some(k => abstandZurStrecke(p, k.a, k.b) <= tol);
  const ecke = p => ecken.find(e => lang(e.p, p) <= tol);
  const innen = p => punktInPolygon(p, umriss) && !aufUmriss(p);
  const kand = linien.filter(l => lang(l.p1, l.p2) >= 0.8 && (innen(l.p1) || aufUmriss(l.p1)) && (innen(l.p2) || aufUmriss(l.p2))
    && !(aufUmriss(l.p1) && aufUmriss(l.p2) && kanten.some(k => abstandZurStrecke({ x: (l.p1.x + l.p2.x) / 2, y: (l.p1.y + l.p2.y) / 2 }, k.a, k.b) <= tol)));

  // Schraffur-Filter: Linienscharen (≥ 3 parallele, Kante zu Kante, eng beieinander)
  const kanteZuKante = kand.filter(l => aufUmriss(l.p1) && aufUmriss(l.p2) && !ecke(l.p1) && !ecke(l.p2));
  const schar = l => {
    const w = richtung(l.p1, l.p2), n = { x: -Math.sin(w), y: Math.cos(w) };
    const s0 = (l.p1.x + l.p2.x) / 2 * n.x + (l.p1.y + l.p2.y) / 2 * n.y;
    return kanteZuKante.filter(m => m !== l && parallel(richtung(m.p1, m.p2), w, 2 * Math.PI / 180)
      && Math.abs(((m.p1.x + m.p2.x) / 2 * n.x + (m.p1.y + m.p2.y) / 2 * n.y) - s0) < 2).length >= 2;
  };
  const firstText = (texte || []).filter(t => /\bfirst\b|\bFH\b|firsth/i.test(t.text));

  const gewaehlt = [];
  // 1) an Umrissecken: Grat/Kehle
  for (const l of kand) {
    const e = ecke(l.p1) || ecke(l.p2);
    if (e && (innen(l.p1) || innen(l.p2))) gewaehlt.push({ ...l, typ: e.konvex ? "grat" : "kehle" });
  }
  // 2) Firste: an Grat-/Kehl-Enden angeschlossen oder Kante zu Kante (ohne Schraffur)
  const enden = () => gewaehlt.flatMap(g => [g.p1, g.p2]).filter(innen);
  for (let runde = 0; runde < 4; runde++) {
    let neu = 0;
    for (const l of kand) {
      if (gewaehlt.some(g => g.p1 === l.p1 && g.p2 === l.p2)) continue;
      const ans = enden().some(p => lang(p, l.p1) <= tol || lang(p, l.p2) <= tol);
      if (!ans) continue;
      const w = richtung(l.p1, l.p2);
      gewaehlt.push({ ...l, typ: kanten.some(k => parallel(k.w, w)) ? "first" : "grat" });
      neu++;
    }
    if (!neu) break;
  }
  if (!gewaehlt.some(g => g.typ === "first")) {
    // Satteldach: First läuft Ortgang zu Ortgang. Aus einer Schar nur die Linie an
    // einer First-Beschriftung oder die mittlere zwischen zwei parallelen Traufen.
    const kandidaten = kanteZuKante.filter(l => kanten.some(k => parallel(k.w, richtung(l.p1, l.p2))));
    const ohneSchar = kandidaten.filter(l => !schar(l));
    let wahl = ohneSchar;
    if (!wahl.length && kandidaten.length) {
      const mitText = firstText.length ? kandidaten.map(l => ({ l, d: Math.min(...firstText.map(t => abstandZurStrecke(t, l.p1, l.p2))) })).sort((a, b) => a.d - b.d)[0] : null;
      if (mitText && mitText.d < 1.5) wahl = [mitText.l];
      else {
        const mitte = kandidaten.map(l => {
          const m = { x: (l.p1.x + l.p2.x) / 2, y: (l.p1.y + l.p2.y) / 2 }, w = richtung(l.p1, l.p2);
          const ds = kanten.filter(k => parallel(k.w, w)).map(k => abstandZurStrecke(m, k.a, k.b)).sort((a, b) => a - b);
          return { l, sym: ds.length >= 2 ? Math.abs(ds[0] - ds[1]) / (ds[0] + ds[1]) : 1 };
        }).sort((a, b) => a.sym - b.sym)[0];
        if (mitte && mitte.sym < 0.08) wahl = [mitte.l];
      }
    }
    for (const l of wahl) gewaehlt.push({ ...l, typ: "first" });
  }

  // Kanten einordnen: Ortgang, wenn ein First mitten auf ihr endet
  const firstEnden = gewaehlt.filter(g => g.typ === "first").flatMap(g => [g.p1, g.p2]).filter(p => !ecke(p));
  const umrissKanten = kanten.map(k => ({ ...k, typ: firstEnden.some(p => abstandZurStrecke(p, k.a, k.b) <= tol) ? "ortgang" : "traufe" }));
  return { dachlinien: gewaehlt, kanten: umrissKanten };
}

// Höhe über Traufe bei gleicher Neigung: Abstand zur nächsten Traufkante × tan α
const hoehe = (p, traufen, tanA) => (traufen.length ? Math.min(...traufen.map(k => abstandZurStrecke(p, k.a, k.b))) : 0) * tanA;

export function steildachErkennen(plan, { start, bereich, neigung } = {}) {
  const gef = flaecheFinden(plan, { start, bereich });
  if (gef.fehler) return { fehler: gef.fehler.replace("Keine Fläche", "Keine Dachfläche").replace("in die Fläche", "in die Dachfläche") };
  // Grate/Kehlen teilen den Umriss in Dachflächen — das ganze Dach ist der äußere Rand
  const rand = aussenRand(gef.g, gef.innen, { start: gef.innen.start });
  const innen = rand && rand.flaeche > gef.innen.flaeche * 1.001 ? { ...rand, start: gef.innen.start } : gef.innen;
  const hinweise = [];
  let alpha = neigung != null ? neigung : neigungAusTexten(plan.texte);
  const angenommen = alpha == null;
  if (angenommen) { alpha = 35; hinweise.push("Dachneigung nicht im Plan gefunden — 35° angenommen. Bitte eintragen."); }
  const cosA = Math.cos(alpha * Math.PI / 180), tanA = Math.tan(alpha * Math.PI / 180);

  const { dachlinien, kanten } = dachlinienFinden(innen.punkte, plan.linien || [], plan.texte);
  const traufen = kanten.filter(k => k.typ === "traufe");
  if (!dachlinien.length) hinweise.push("Keine First-, Grat- oder Kehllinien erkannt — nur Fläche und Ränder. Pultdach? Dann ist eine Kante der First.");
  const oeffnungen = oeffnungenFinden(innen.punkte, plan);

  const mengen = [];
  const neu = (id, name, art, einheit, bezug, extra = {}) => mengen.push({ id, name, art, einheit, bezug, menge: r2(bezugGesamt(bezug)), ...extra });
  const abz = oeffnungen.map(o => ({ punkte: o.punkte, abzug: true, oeffnung: o.text }));
  neu("dach", `Dachfläche (wahre Fläche, ${de(alpha)}°)`, "flaeche", "m²", { art: "flaeche", faktor: 1 / cosA, teile: [{ punkte: innen.punkte }, ...abz] },
    { annahme: angenommen, info: `Grundfläche ${de(polygonFlaeche(innen.punkte))} m²${oeffnungen.length ? `, abzüglich ${oeffnungen.map(o => o.text).join(", ")}` : ""}` });
  neu("grund", "Grundfläche (Projektion)", "flaeche", "m²", { art: "flaeche", teile: [{ punkte: innen.punkte }, ...abz] });
  const linienBezug = (typ, faktorFn) => ({ art: "strecke", teile: dachlinien.filter(d => d.typ === typ).map(d => ({ punkte: [d.p1, d.p2], faktor: faktorFn(d) })) });
  const wahr = d => { const l = lang(d.p1, d.p2), dh = hoehe(d.p1, traufen, tanA) - hoehe(d.p2, traufen, tanA); return l > 0 ? Math.hypot(l, dh) / l : 1; };
  const kantenBezug = typ => ({ art: "strecke", faktor: typ === "ortgang" ? 1 / cosA : 1, teile: kanten.filter(k => k.typ === typ).map(k => ({ punkte: [k.a, k.b] })) });
  if (traufen.length) neu("traufe", "Traufe", "strecke", "m", kantenBezug("traufe"));
  if (kanten.some(k => k.typ === "ortgang")) neu("ortgang", "Ortgang (wahre Länge)", "strecke", "m", kantenBezug("ortgang"), { annahme: angenommen });
  if (dachlinien.some(d => d.typ === "first")) neu("first", "First", "strecke", "m", linienBezug("first", () => 1));
  if (dachlinien.some(d => d.typ === "grat")) neu("grat", "Grat (wahre Länge)", "strecke", "m", linienBezug("grat", wahr), { annahme: angenommen });
  if (dachlinien.some(d => d.typ === "kehle")) neu("kehle", "Kehle (wahre Länge)", "strecke", "m", linienBezug("kehle", wahr), { annahme: angenommen });
  const fg = dachlinien.filter(d => d.typ === "first" || d.typ === "grat");
  if (fg.length && dachlinien.some(d => d.typ === "grat")) neu("first_grat", "First + Grat", "strecke", "m", { art: "strecke", teile: fg.map(d => ({ punkte: [d.p1, d.p2], faktor: d.typ === "grat" ? wahr(d) : 1 })) });
  neu("rand", "Dachrand gesamt (Traufe + Ortgang)", "strecke", "m", { art: "strecke", teile: kanten.map(k => ({ punkte: [k.a, k.b], faktor: k.typ === "ortgang" ? 1 / cosA : 1 })) });
  if (oeffnungen.length) {
    neu("oeffnungen", "Dachfenster, Gauben, Ausstiege", "zaehlen", "Stk", { art: "zaehlen", teile: [{ punkte: oeffnungen.map(o => schwerpunkt(o.punkte)) }] });
    neu("oeffnungen_umfang", "Anschluss an Öffnungen", "strecke", "m", { art: "strecke", faktor: 1, teile: oeffnungen.map(o => ({ punkte: zu(o.punkte) })) });
  }
  return { profil: "steildach", innen, neigung: alpha, dachlinien, kanten, oeffnungen, mengen, hinweise };
}

const NIE = /stundenlohn|baustelleneinrichtung|ger[üu]st|kran|container|fallrohr|standrohr|schneefang|sicherheitshaken|tritt/i;
const STEILDACH = [
  ["oeffnungen", /dachfenster|wohnraumfenster|ausstieg|gaube|lichtkuppel|einbau.*fenster/i, "zaehlen"],
  ["ortgang", /ortgang|windbrett|stirnbrett/i, "strecke"],
  ["first_grat", /first.*grat|grat.*first/i, "strecke"],
  ["first", /first/i, "strecke"],
  ["grat", /grat/i, "strecke"],
  ["first_grat", /first|grat/i, "strecke"],
  ["kehle", /kehl/i, "strecke"],
  ["traufe", /trauf|rinne|vogelschutz|l[üu]ftungsgitter|insektenschutz|einlaufblech|rinneneisen/i, "strecke"],
  ["oeffnungen_umfang", /anschluss.*fenster|fensteranschluss|eindeckrahmen/i, "strecke"],
  ["rand", /dachrand|randabschluss|abschlussblech/i, "strecke"],
  ["dach", /eindeck|ziegel|pfanne|dachstein|biber|schiefer|lattung|konterlattung|unterdeck|unterspann|schalung|d[äa]mm|dampf|bahn|folie|blech|falz|dachfl[äa]che|dach|abriss|entsorg|reinig/i, "flaeche"],
];
export const zuordnungSteildach = (positionen, mengen) => zuordnungMitRegeln(positionen, mengen, { regeln: STEILDACH, nie: NIE });
