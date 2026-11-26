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
function flaecheLinks(g, von, nach, maxSchritte = 5000) {
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
