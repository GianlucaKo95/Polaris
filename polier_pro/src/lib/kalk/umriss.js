// Geschlossene Umrisse aus losen Planlinien: Linienenden werden zu Knoten
// (Fangtoleranz), dann wird der Linienzug verfolgt, der einen Punkt am
// engsten umschließt ("rechte Hand an der Wand"). Linien, die nur mitten auf
// einer anderen enden (Schraffur, Bemaßung), verbinden nichts und stören nicht.
import { polygonFlaeche, punktInPolygon } from "./planAbschnitt.js";

export function linienGraph(linien, { toleranz = 0.02, minLaenge = 0.05 } = {}) {
  const knoten = [], gitter = new Map();
  const zelle = (x, y) => `${Math.round(x / toleranz)}|${Math.round(y / toleranz)}`;
  const knotenFuer = p => {
    const gx = Math.round(p.x / toleranz), gy = Math.round(p.y / toleranz);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of gitter.get(`${gx + dx}|${gy + dy}`) || []) if (Math.hypot(knoten[i].x - p.x, knoten[i].y - p.y) <= toleranz) return i;
    }
    const i = knoten.length;
    knoten.push({ x: p.x, y: p.y, kanten: [] });
    const k = zelle(p.x, p.y);
    gitter.set(k, [...(gitter.get(k) || []), i]);
    return i;
  };
  const kanten = [];
  for (const l of linien) {
    if (Math.hypot(l.p2.x - l.p1.x, l.p2.y - l.p1.y) < minLaenge) continue;
    const a = knotenFuer(l.p1), b = knotenFuer(l.p2);
    if (a === b) continue;
    const id = kanten.length;
    kanten.push({ a, b });
    knoten[a].kanten.push(id); knoten[b].kanten.push(id);
  }
  return { knoten, kanten };
}

const winkel = (p, q) => Math.atan2(q.y - p.y, q.x - p.x);

// Verfolgt die Fläche links der gerichteten Kante von→nach. Ergebnis: Punkte oder null.
export function flaecheLinks(g, von, nach, maxSchritte = 5000) {
  const pfad = [von];
  let u = von, v = nach;
  for (let s = 0; s < maxSchritte; s++) {
    pfad.push(v);
    if (v === von && pfad.length > 3) return pfad.slice(0, -1);
    const zurueck = winkel(g.knoten[v], g.knoten[u]);
    let best = null, bestW = Infinity;
    for (const id of g.knoten[v].kanten) {
      const k = g.kanten[id], w = k.a === v ? k.b : k.a;
      if (w === u && g.knoten[v].kanten.length > 1) continue;
      // kleinster Winkel im Uhrzeigersinn ab der Rückrichtung → Fläche liegt links
      let d = zurueck - winkel(g.knoten[v], g.knoten[w]);
      while (d <= 1e-9) d += 2 * Math.PI;
      if (d < bestW) { bestW = d; best = w; }
    }
    if (best == null) return null;
    u = v; v = best;
    if (pfad.length > 2 && pfad.indexOf(v) > 0 && v !== von) return null; // Schleife ohne Start
  }
  return null;
}

// Kleinster geschlossener Umriss um punkt mit Fläche ≥ minFlaeche.
// Sucht Kanten, die ein Strahl vom Punkt aus trifft (8 Richtungen), und
// verfolgt von dort die Fläche auf der Seite des Punktes.
export function umrissUmPunkt(g, punkt, { minFlaeche = 1, maxFlaeche = Infinity, ausser = [] } = {}) {
  const treffer = [];
  for (let r = 0; r < 8; r++) {
    const dx = Math.cos(r * Math.PI / 4 + 0.013), dy = Math.sin(r * Math.PI / 4 + 0.013);
    g.kanten.forEach((k, id) => {
      const a = g.knoten[k.a], b = g.knoten[k.b];
      const ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) return;
      const t = ((a.x - punkt.x) * ey - (a.y - punkt.y) * ex) / den;
      const u = ((a.x - punkt.x) * dy - (a.y - punkt.y) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) treffer.push({ id, t });
    });
  }
  treffer.sort((x, y) => x.t - y.t);
  const gesehen = new Set();
  let best = null;
  for (const { id } of treffer) {
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    const k = g.kanten[id];
    for (const [von, nach] of [[k.a, k.b], [k.b, k.a]]) {
      const zyk = flaecheLinks(g, von, nach);
      if (!zyk) continue;
      const poly = zyk.map(i => ({ x: g.knoten[i].x, y: g.knoten[i].y }));
      const f = polygonFlaeche(poly);
      if (f < minFlaeche || f > maxFlaeche || !punktInPolygon(punkt, poly)) continue;
      if (ausser.some(x => Math.abs(polygonFlaeche(x) - f) < 1e-6)) continue;
      if (!best || f < best.flaeche) best = { punkte: vereinfachen(poly), flaeche: f };
    }
    if (best && gesehen.size > 40) break;
  }
  return best;
}

// Kollineare Zwischenpunkte entfernen
export function vereinfachen(poly, eps = 1e-3) {
  const aus = poly.filter((p, i) => {
    const a = poly[(i - 1 + poly.length) % poly.length], b = poly[(i + 1) % poly.length];
    return Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / (Math.hypot(b.x - a.x, b.y - a.y) || 1) > eps;
  });
  return aus.length >= 3 ? aus : poly;
}

// ── Fläche suchen: Startpunkt aus Füllflächen oder Klick ─────────────────
export const huelle = pts => ({ x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) });
export const schwerpunkt = p => {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length], c = q.x * r.y - r.x * q.y;
    a += c; x += (q.x + r.x) * c; y += (q.y + r.y) * c;
  }
  return Math.abs(a) < 1e-12 ? p[0] : { x: x / (3 * a), y: y / (3 * a) };
};

export function linienImBereich(linien, bereich) {
  if (!bereich) return linien;
  const H = huelle(bereich);
  return linien.filter(l => [l.p1, l.p2].some(p => p.x > H.x0 && p.x < H.x1 && p.y > H.y0 && p.y < H.y1));
}

// Startpunkte: Schwerpunkte großer Füllflächen im Bereich (größte zuerst),
// dann die Mitte des Bereichs.
function startpunkte(plan, bereich) {
  const H = bereich ? huelle(bereich) : null;
  const drin = p => !H || (p.x > H.x0 && p.x < H.x1 && p.y > H.y0 && p.y < H.y1);
  const f = (plan.flaechen || []).map(x => ({ p: schwerpunkt(x.punkte), a: polygonFlaeche(x.punkte) }))
    .filter(x => x.a >= 10 && drin(x.p)).sort((a, b) => b.a - a.a).slice(0, 6);
  const aus = f.map(x => ({ punkt: x.p, erwartet: x.a }));
  if (H) aus.push({ punkt: { x: (H.x0 + H.x1) / 2, y: (H.y0 + H.y1) / 2 } });
  else if (plan.linien?.length) {
    // ohne Bereich: Mitte der längsten Linien (Schriftfeld und Rahmen sind kurz bzw. außen)
    const lang = [...plan.linien].sort((a, b) => Math.hypot(b.p2.x - b.p1.x, b.p2.y - b.p1.y) - Math.hypot(a.p2.x - a.p1.x, a.p2.y - a.p1.y)).slice(0, 12);
    const h = huelle(lang.flatMap(l => [l.p1, l.p2]));
    aus.push({ punkt: { x: (h.x0 + h.x1) / 2 + 0.013, y: (h.y0 + h.y1) / 2 + 0.017 } });
  }
  return aus;
}

// Hauptfläche: kleinster geschlossener Linienzug um den Startpunkt.
export function flaecheFinden(plan, { start, bereich, minFlaeche = 10 } = {}) {
  const g = linienGraph(linienImBereich(plan.linien || [], bereich));
  const versuche = start ? [{ punkt: start }] : startpunkte(plan, bereich);
  for (const v of versuche) {
    const u = umrissUmPunkt(g, v.punkt, { minFlaeche });
    if (!u) continue;
    if (v.erwartet && (u.flaeche < v.erwartet * 0.6 || u.flaeche > v.erwartet * 1.4)) continue;
    return { innen: { ...u, start: v.punkt }, g };
  }
  return { g, fehler: start ? "Um den Punkt liegt kein geschlossener Linienzug. Näher an die Kante klicken oder den Umriss zeichnen." : "Keine Fläche erkannt. Bitte einmal in die Fläche klicken." };
}

// Äußerer Rand des Linienzugs, zu dem eine gefundene Fläche gehört (z. B. ein
// Walmdach, dessen Grate den Umriss in Dachflächen teilen). Lose Enden
// (Stummel, Bemaßung) werden vorher abgeschnitten.
export function aussenRand(g, flaeche, { start } = {}) {
  const startKnoten = flaeche.punkte.map(p => g.knoten.findIndex(k => Math.hypot(k.x - p.x, k.y - p.y) < 1e-9)).filter(i => i >= 0);
  if (!startKnoten.length) return null;
  // Komponente
  const komp = new Set(startKnoten), stapel = [...startKnoten];
  while (stapel.length) {
    const v = stapel.pop();
    for (const id of g.knoten[v].kanten) { const k = g.kanten[id], w = k.a === v ? k.b : k.a; if (!komp.has(w)) { komp.add(w); stapel.push(w); } }
  }
  // 2-Kern: Knoten mit Grad 1 wiederholt entfernen
  const grad = new Map([...komp].map(v => [v, g.knoten[v].kanten.filter(id => { const k = g.kanten[id]; return komp.has(k.a) && komp.has(k.b); }).length]));
  const weg = [...komp].filter(v => grad.get(v) <= 1);
  while (weg.length) {
    const v = weg.pop();
    if (!komp.has(v)) continue;
    komp.delete(v);
    for (const id of g.knoten[v].kanten) { const k = g.kanten[id], w = k.a === v ? k.b : k.a; if (komp.has(w)) { grad.set(w, grad.get(w) - 1); if (grad.get(w) <= 1) weg.push(w); } }
  }
  if (!komp.size) return null;
  const teil = { knoten: g.knoten.map((k, i) => (komp.has(i) ? { ...k, kanten: k.kanten.filter(id => komp.has(g.kanten[id].a) && komp.has(g.kanten[id].b)) } : { ...k, kanten: [] })), kanten: g.kanten };
  let links = null;
  for (const v of komp) if (links == null || teil.knoten[v].x < teil.knoten[links].x - 1e-9 || (Math.abs(teil.knoten[v].x - teil.knoten[links].x) < 1e-9 && teil.knoten[v].y < teil.knoten[links].y)) links = v;
  const sp = start || flaeche.punkte[0];
  let best = null;
  for (const id of teil.knoten[links].kanten) {
    const k = g.kanten[id], w = k.a === links ? k.b : k.a;
    for (const [von, nach] of [[links, w], [w, links]]) {
      const zyk = flaecheLinks(teil, von, nach, 20000);
      if (!zyk) continue;
      const poly = zyk.map(i => ({ x: g.knoten[i].x, y: g.knoten[i].y }));
      const f = polygonFlaeche(poly);
      if (punktInPolygon(sp, poly) && (!best || f > best.flaeche)) best = { punkte: vereinfachen(poly), flaeche: f };
    }
  }
  return best;
}
