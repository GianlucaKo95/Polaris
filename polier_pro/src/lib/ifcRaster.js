// IFC → Modell für die Achsabschnitts-Auswertung (lib/achsraster.js):
// Achsraster (IfcGrid mit IfcGridAxis.AxisTag), Bauteile mit Grundriss-Hülle
// aus der web-ifc-Triangulierung, Geschoss und Mengen.
//
// Koordinaten: web-ifc liefert Meshes in Metern mit Y nach oben
// (x' = X, y' = Z, z' = −Y). Für den Grundriss gilt daher x = x', y = −z'.
// Das Achsraster wird über die IfcLocalPlacement-Kette selbst aufgelöst und
// mit der Projekt-Längeneinheit auf Meter umgerechnet.
import { BAUTEILARTEN, ifcEinheiten, mengenUndMaterial, hauptmengen } from "./ifcMengen.js";
import { konvexeHuelle } from "./achsraster.js";

const EINS = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; // zeilenweise 4×4

function mal(a, b) {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
}
const anwenden = (m, p) => [0, 1, 2].map(i => m[i * 4] * p[0] + m[i * 4 + 1] * p[1] + m[i * 4 + 2] * (p[2] || 0) + m[i * 4 + 3]);
const zahl = v => (typeof v === "object" && v !== null ? Number(v.value) : Number(v));

function zeile(api, m, ref) {
  const id = typeof ref === "object" ? ref?.value : ref;
  return id ? api.GetLine(m, id, false) : null;
}

function richtung(api, m, ref, standard) {
  const d = zeile(api, m, ref);
  const v = (d?.DirectionRatios || []).map(zahl);
  if (!v.length) return standard;
  while (v.length < 3) v.push(0);
  const l = Math.hypot(...v) || 1;
  return v.map(x => x / l);
}

function achsPlatzierung(api, m, ref) {
  const a = zeile(api, m, ref);
  if (!a) return EINS;
  const o = (zeile(api, m, a.Location)?.Coordinates || []).map(zahl);
  while (o.length < 3) o.push(0);
  const z = richtung(api, m, a.Axis, [0, 0, 1]);
  let x = richtung(api, m, a.RefDirection, [1, 0, 0]);
  // x orthogonal zu z machen
  const d = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
  x = [x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]];
  const lx = Math.hypot(...x) || 1; x = x.map(v => v / lx);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2], 0, 0, 0, 1];
}

function platzierung(api, m, ref, tiefe = 0) {
  const lp = zeile(api, m, ref);
  if (!lp || tiefe > 40) return EINS;
  const eltern = lp.PlacementRelTo ? platzierung(api, m, lp.PlacementRelTo, tiefe + 1) : EINS;
  return mal(eltern, lp.RelativePlacement ? achsPlatzierung(api, m, lp.RelativePlacement) : EINS);
}

function achsenLesen(api, m, typen, L) {
  const achsen = [], warnungen = [];
  const grids = api.GetLineIDsWithType(m, typen.IFCGRID);
  for (let i = 0; i < grids.size(); i++) {
    const g = api.GetLine(m, grids.get(i), false);
    const M = platzierung(api, m, g.ObjectPlacement);
    for (const [familie, liste] of [["U", g.UAxes], ["V", g.VAxes]]) {
      for (const ref of liste || []) {
        const ax = zeile(api, m, ref);
        const tag = ax?.AxisTag?.value;
        const kurve = zeile(api, m, ax?.AxisCurve);
        const punkte = (kurve?.Points || []).map(p => (zeile(api, m, p)?.Coordinates || []).map(zahl));
        if (!tag) continue;
        if (punkte.length < 2) { warnungen.push(`Achse ${tag}: Kurventyp wird nicht unterstützt.`); continue; }
        const [a, b] = [punkte[0], punkte.at(-1)].map(p => anwenden(M, p).map(v => v * L));
        achsen.push({ tag, familie, p1: { x: a[0], y: a[1] }, p2: { x: b[0], y: b[1] } });
      }
    }
  }
  return { achsen, warnungen };
}

function geschosseLesen(api, m, typen) {
  const namen = new Map(); // storeyId → {name, hoehe}
  const st = api.GetLineIDsWithType(m, typen.IFCBUILDINGSTOREY);
  for (let i = 0; i < st.size(); i++) {
    const s = api.GetLine(m, st.get(i), false);
    namen.set(st.get(i), { name: s?.Name?.value || s?.LongName?.value || `Geschoss ${i + 1}`, hoehe: zahl(s?.Elevation) || 0 });
  }
  const vonElement = new Map();
  const rels = api.GetLineIDsWithType(m, typen.IFCRELCONTAINEDINSPATIALSTRUCTURE);
  for (let i = 0; i < rels.size(); i++) {
    const r = api.GetLine(m, rels.get(i), false);
    const g = namen.get(r?.RelatingStructure?.value);
    if (!g) continue;
    for (const e of r.RelatedElements || []) vonElement.set(e.value, g.name);
  }
  // Bauteile, die über IfcRelAggregates zu einem enthaltenen Bauteil gehören, erben dessen Geschoss
  const agg = api.GetLineIDsWithType(m, typen.IFCRELAGGREGATES);
  for (let i = 0; i < agg.size(); i++) {
    const r = api.GetLine(m, agg.get(i), false);
    const g = vonElement.get(r?.RelatingObject?.value);
    if (g) for (const e of r.RelatedObjects || []) if (!vonElement.has(e.value)) vonElement.set(e.value, g);
  }
  const geschosse = [...namen.values()].sort((a, b) => a.hoehe - b.hoehe).map(g => g.name);
  return { vonElement, geschosse };
}

// Grundriss-Punkte und Volumen (geschlossenes Netz) je Bauteil aus der Triangulierung.
function geometrieLesen(api, m) {
  const geo = new Map();
  api.StreamAllMeshes(m, mesh => {
    const eintrag = geo.get(mesh.expressID) || { punkte: [], volumen: 0 };
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const pg = mesh.geometries.get(i);
      const g = api.GetGeometry(m, pg.geometryExpressID);
      const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      const idx = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
      const t = pg.flatTransformation; // spaltenweise
      const welt = [];
      for (let k = 0; k < v.length; k += 6) {
        const x = v[k], y = v[k + 1], z = v[k + 2];
        welt.push([t[0] * x + t[4] * y + t[8] * z + t[12], t[1] * x + t[5] * y + t[9] * z + t[13], t[2] * x + t[6] * y + t[10] * z + t[14]]);
      }
      for (const p of welt) eintrag.punkte.push({ x: p[0], y: -p[2] });
      let vol = 0;
      for (let k = 0; k + 2 < idx.length; k += 3) {
        const a = welt[idx[k]], b = welt[idx[k + 1]], c = welt[idx[k + 2]];
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      }
      eintrag.volumen += Math.abs(vol);
      g.delete?.();
    }
    geo.set(mesh.expressID, eintrag);
  });
  return geo;
}

// typen: { IFCWALL: <Nr>, … } aus dem web-ifc-Modul.
export async function ifcRasterModell(api, modelID, typen) {
  const einheiten = ifcEinheiten(api, modelID, typen);
  const { achsen, warnungen } = achsenLesen(api, modelID, typen, einheiten.laenge);
  const { vonElement, geschosse } = geschosseLesen(api, modelID, typen);
  const geo = geometrieLesen(api, modelID);
  const elemente = [];
  for (const [name, typNr] of Object.entries(typen)) {
    if (!BAUTEILARTEN[name]) continue;
    const ids = api.GetLineIDsWithType(modelID, typNr);
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i);
      const g = geo.get(id);
      if (!g?.punkte.length) continue; // ohne Geometrie keine Lage
      const { mengen, material } = await mengenUndMaterial(api, modelID, id, einheiten);
      const h = hauptmengen(mengen);
      const zeileE = api.GetLine(modelID, id, false);
      let mengenQuelle = "ifc";
      if (h.volumen == null && g.volumen > 0) { h.volumen = Math.round(g.volumen * 1000) / 1000; mengenQuelle = "geometrie"; }
      elemente.push({
        id: String(zeileE?.GlobalId?.value || id), typ: name, bauteil: BAUTEILARTEN[name], material,
        geschoss: vonElement.get(id) || null, name: zeileE?.Name?.value || "",
        flaeche: h.flaeche || 0, volumen: h.volumen || 0, laenge: h.laenge || 0, mengenQuelle,
        punkte: konvexeHuelle(g.punkte),
      });
    }
  }
  if (!achsen.length) warnungen.push("Das Modell enthält kein Achsraster (IfcGrid). Beim IFC-Export das Raster mit ausgeben.");
  return { achsen, elemente, geschosse, warnungen };
}
