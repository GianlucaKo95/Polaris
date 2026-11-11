export function dxfTokenize(text) {
  const lines = text.split(/\r?\n/);
  const tokens = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1] !== undefined ? lines[i + 1].trim() : "";
    if (!Number.isNaN(code)) tokens.push({ code, value });
  }
  return tokens;
}

export function dxfSplitSections(tokens) {
  const sections = {};
  let current = null;
  let name = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.code === 0 && t.value === "SECTION") {
      current = [];
      name = null;
    } else if (t.code === 2 && current !== null && name === null) {
      name = t.value;
    } else if (t.code === 0 && t.value === "ENDSEC") {
      if (name) sections[name] = current;
      current = null; name = null;
    } else if (current !== null) {
      current.push(t);
    }
  }
  return sections;
}

export function dxfSplitEntities(tokens) {
  const entities = [];
  let current = null;
  for (const t of tokens) {
    if (t.code === 0) {
      if (current) entities.push(current);
      current = { type: t.value, tags: [] };
    } else if (current) {
      current.tags.push(t);
    }
  }
  if (current) entities.push(current);
  return entities;
}

export function dxfGet(tags, code, def) {
  const t = tags.find(x => x.code === code);
  return t ? t.value : def;
}

export function dxfGetNum(tags, code, def) {
  const v = dxfGet(tags, code, undefined);
  return v !== undefined ? parseFloat(v) : def;
}

export function dxfGetAll(tags, code) {
  return tags.filter(x => x.code === code).map(x => x.value);
}

export function bulgeArcPoints(p1, p2, bulge, segments = 12) {
  if (!bulge) return [p2];
  const theta = 4 * Math.atan(bulge);
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const chord = Math.hypot(dx, dy);
  if (chord === 0) return [p2];
  const radius = chord / (2 * Math.sin(theta / 2));
  const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
  const sagitta = radius * (1 - Math.cos(theta / 2)) * Math.sign(bulge);
  const nx = -dy / chord, ny = dx / chord;
  const cx = midX + nx * (radius * Math.cos(theta / 2)) * Math.sign(bulge);
  const cy = midY + ny * (radius * Math.cos(theta / 2)) * Math.sign(bulge);
  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  const pts = [];
  for (let s = 1; s <= segments; s++) {
    const a = startAngle + theta * (s / segments);
    pts.push({ x: cx + Math.abs(radius) * Math.cos(a), y: cy + Math.abs(radius) * Math.sin(a) });
  }
  return pts;
}

export function dxfEntityToPolyline(entity) {
  const { type, tags } = entity;
  const layer = dxfGet(tags, 8, "0");

  if (type === "LWPOLYLINE") {
    const xs = dxfGetAll(tags, 10).map(Number);
    const ys = dxfGetAll(tags, 20).map(Number);
    const bulges = {};
    // Bulge (Code 42) gehört zum vorherigen Vertex — wir sammeln sie positionsgebunden
    let vertexIdx = -1;
    const bulgeByVertex = [];
    for (const t of tags) {
      if (t.code === 10) { vertexIdx++; bulgeByVertex[vertexIdx] = 0; }
      if (t.code === 42) bulgeByVertex[vertexIdx] = parseFloat(t.value);
    }
    const closedFlag = Number(dxfGet(tags, 70, "0")) & 1;
    const rawPts = xs.map((x, i) => ({ x, y: ys[i] }));
    let pts = [];
    for (let i = 0; i < rawPts.length; i++) {
      pts.push(rawPts[i]);
      const nextIdx = closedFlag ? (i + 1) % rawPts.length : i + 1;
      if (nextIdx < rawPts.length && bulgeByVertex[i]) {
        pts = pts.concat(bulgeArcPoints(rawPts[i], rawPts[nextIdx], bulgeByVertex[i]));
      }
      if (!closedFlag && nextIdx >= rawPts.length) break;
    }
    return { points: pts, closed: !!closedFlag, layer, type };
  }

  if (type === "POLYLINE") {
    // POLYLINE referenziert VERTEX-Entitäten separat — werden vom Aufrufer
    // vorab eingesammelt und hier als tags.__vertices übergeben.
    const closedFlag = Number(dxfGet(tags, 70, "0")) & 1;
    const verts = tags.__vertices || [];
    return { points: verts, closed: !!closedFlag, layer, type };
  }

  if (type === "LINE") {
    const p1 = { x: dxfGetNum(tags, 10, 0), y: dxfGetNum(tags, 20, 0) };
    const p2 = { x: dxfGetNum(tags, 11, 0), y: dxfGetNum(tags, 21, 0) };
    return { points: [p1, p2], closed: false, layer, type: "LINE" };
  }

  if (type === "CIRCLE") {
    const cx = dxfGetNum(tags, 10, 0), cy = dxfGetNum(tags, 20, 0);
    const r  = dxfGetNum(tags, 40, 0);
    const pts = [];
    const seg = 24;
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return { points: pts, closed: true, layer, type };
  }

  if (type === "ARC") {
    const cx = dxfGetNum(tags, 10, 0), cy = dxfGetNum(tags, 20, 0);
    const r  = dxfGetNum(tags, 40, 0);
    const a1 = dxfGetNum(tags, 50, 0) * Math.PI / 180;
    let   a2 = dxfGetNum(tags, 51, 0) * Math.PI / 180;
    if (a2 < a1) a2 += Math.PI * 2;
    const pts = [];
    const seg = 16;
    for (let s = 0; s <= seg; s++) {
      const a = a1 + (a2 - a1) * (s / seg);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return { points: pts, closed: false, layer, type };
  }

  if (type === "HATCH") {
    // HATCH: Boundary-Pfade bestehen aus Edges (Code 72/73 Typ) mit Linien/Bögen.
    // Vereinfachtes, aber korrektes Parsing der häufigsten Polyline-Boundary (Typ 7).
    const pts = [];
    let collecting = false;
    let curX = null;
    for (const t of tags) {
      if (t.code === 92) collecting = true; // Boundary path type flag beginnt Pfad
      if (collecting) {
        if (t.code === 10) curX = parseFloat(t.value);
        if (t.code === 20 && curX !== null) {
          pts.push({ x: curX, y: parseFloat(t.value) });
          curX = null;
        }
      }
    }
    return { points: pts, closed: true, layer, type };
  }

  return null;
}

export function dxfTransformPoint(p, ins, scaleX, scaleY, rotDeg) {
  const rot = (rotDeg || 0) * Math.PI / 180;
  const sx = (p.x || 0) * (scaleX ?? 1);
  const sy = (p.y || 0) * (scaleY ?? 1);
  const rx = sx * Math.cos(rot) - sy * Math.sin(rot);
  const ry = sx * Math.sin(rot) + sy * Math.cos(rot);
  return { x: rx + ins.x, y: ry + ins.y };
}

export function dxfResolveInserts(entities, blockDefs, depth = 0) {
  if (depth > 6) return []; // Schutz vor zirkulären Block-Referenzen
  const resolved = [];
  for (const e of entities) {
    if (e.type !== "INSERT") continue;
    const blockName = dxfGet(e.tags, 2, "");
    const def = blockDefs[blockName];
    if (!def) continue;
    const insX = dxfGetNum(e.tags, 10, 0), insY = dxfGetNum(e.tags, 20, 0);
    const scaleX = dxfGetNum(e.tags, 41, 1), scaleY = dxfGetNum(e.tags, 42, 1);
    const rot = dxfGetNum(e.tags, 50, 0);
    const colCount = Number(dxfGet(e.tags, 70, "1")) || 1;
    const rowCount  = Number(dxfGet(e.tags, 71, "1")) || 1;
    const colSpace  = dxfGetNum(e.tags, 44, 0);
    const rowSpace  = dxfGetNum(e.tags, 45, 0);

    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < colCount; col++) {
        const ins = { x: insX + col * colSpace, y: insY + row * rowSpace };
        // Block-interne Entitäten: direkte Geometrie + rekursiv aufgelöste Sub-Blöcke
        const directInner = def.entities.filter(x => x.type !== "INSERT");
        const nestedResolved = dxfResolveInserts(def.entities, blockDefs, depth + 1);
        const innerAll = directInner.concat(nestedResolved.map(r => ({ type: r.type, tags: r.tags, __precomputed: r.__precomputed })));

        for (const inner of innerAll) {
          const geo = inner.__precomputed || dxfEntityToPolyline(inner);
          if (!geo || !geo.points.length) continue;
          const transformedPts = geo.points.map(p =>
            dxfTransformPoint(p, ins, scaleX, scaleY, rot)
          );
          resolved.push({
            type: inner.type,
            tags: inner.tags,
            __precomputed: { ...geo, points: transformedPts },
          });
        }
      }
    }
  }
  return resolved;
}

export function dxfChainLinesToPolygons(lineSegments, tolerance = 0.01) {
  if (lineSegments.length === 0) return [];

  function keyOf(p) {
    return `${Math.round(p.x / tolerance) * tolerance}_${Math.round(p.y / tolerance) * tolerance}`;
  }

  // Adjazenzliste: Punkt-Key → Liste von {to, segIdx}
  const adjacency = new Map();
  function addEdge(a, b, idx) {
    const ka = keyOf(a);
    if (!adjacency.has(ka)) adjacency.set(ka, []);
    adjacency.get(ka).push({ point: a, to: b, idx });
  }
  lineSegments.forEach((seg, idx) => {
    addEdge(seg.p1, seg.p2, idx);
    addEdge(seg.p2, seg.p1, idx);
  });

  const usedSegments = new Set();
  const polygons = [];

  for (let startIdx = 0; startIdx < lineSegments.length; startIdx++) {
    if (usedSegments.has(startIdx)) continue;
    const startSeg = lineSegments[startIdx];
    const path = [startSeg.p1, startSeg.p2];
    const pathSegIdx = new Set([startIdx]);
    let currentPoint = startSeg.p2;
    let closed = false;
    let guard = 0;

    while (guard++ < 500) {
      const candidates = (adjacency.get(keyOf(currentPoint)) || [])
        .filter(c => !pathSegIdx.has(c.idx) && !usedSegments.has(c.idx));
      if (candidates.length === 0) break;
      const next = candidates[0];
      pathSegIdx.add(next.idx);
      currentPoint = next.to;
      // Zyklus geschlossen, wenn wir zum Startpunkt zurückkehren
      if (keyOf(currentPoint) === keyOf(path[0])) { closed = true; break; }
      path.push(currentPoint);
    }

    if (closed && path.length >= 3) {
      pathSegIdx.forEach(i => usedSegments.add(i));
      polygons.push(path);
    }
  }

  return polygons;
}

export function dxfPolygonArea(pts) {
  let a = 0;
  for (let j = 0; j < pts.length; j++) {
    const p1 = pts[j], p2 = pts[(j + 1) % pts.length];
    a += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(a / 2);
}

// Alle Entitäten der Zeichnung: POLYLINE-Vertices eingesammelt, Blöcke
// (INSERT) aufgelöst. Grundlage für Flächen und Achsraster.
export function dxfEntitaetenLesen(dxfText) {
  const tokens   = dxfTokenize(dxfText);
  const sections = dxfSplitSections(tokens);

  // ── BLOCKS-Sektion: Block-Definitionen sammeln (Name → Entitäten) ──
  const blockDefs = {};
  if (sections.BLOCKS) {
    const blockTokens = sections.BLOCKS;
    let currentBlockName = null;
    let currentBlockEntities = null;
    let inBlock = false;
    let i = 0;
    while (i < blockTokens.length) {
      const t = blockTokens[i];
      if (t.code === 0 && t.value === "BLOCK") {
        inBlock = true;
        currentBlockEntities = [];
        currentBlockName = null;
      } else if (inBlock && t.code === 2 && currentBlockName === null) {
        currentBlockName = t.value;
      } else if (t.code === 0 && t.value === "ENDBLK") {
        if (currentBlockName) blockDefs[currentBlockName] = { entities: currentBlockEntities };
        inBlock = false; currentBlockName = null; currentBlockEntities = null;
      } else if (inBlock && currentBlockEntities !== null && currentBlockName !== null) {
        currentBlockEntities.push(t);
      }
      i++;
    }
    // Entitäten je Block in echte Entity-Objekte umwandeln
    for (const name in blockDefs) {
      blockDefs[name].entities = dxfSplitEntities(blockDefs[name].entities);
    }
  }

  if (!sections.ENTITIES) {
    throw new Error("Keine ENTITIES-Sektion in der DXF-Datei gefunden.");
  }

  let entities = dxfSplitEntities(sections.ENTITIES);

  // ── POLYLINE-Sonderfall: VERTEX-Kindobjekte einsammeln ──
  const withVertices = [];
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.type === "POLYLINE") {
      const verts = [];
      let j = i + 1;
      while (j < entities.length && entities[j].type === "VERTEX") {
        verts.push({ x: dxfGetNum(entities[j].tags, 10, 0), y: dxfGetNum(entities[j].tags, 20, 0) });
        j++;
      }
      e.tags.__vertices = verts;
      withVertices.push(e);
      i = j - 1; // VERTEX-Einträge überspringen (bis SEQEND)
    } else if (e.type === "VERTEX" || e.type === "SEQEND") {
      // wird oben mitverarbeitet, hier ignorieren
    } else {
      withVertices.push(e);
    }
  }
  entities = withVertices;

  // ── INSERT-Blöcke auflösen ──
  // dxfResolveInserts gibt ausschließlich die aus Block-Referenzen erzeugte
  // (transformierte) Geometrie zurück. Direkte Entitäten kombinieren wir separat.
  const blockGeometrie = dxfResolveInserts(entities, blockDefs);
  const allEntities = entities.filter(e => e.type !== "INSERT").concat(blockGeometrie);
  return allEntities;
}

export function parseDXFFlaechen(dxfText) {
  const allEntities = dxfEntitaetenLesen(dxfText);

  // ── Geometrie extrahieren ──
  const closedPolygons = []; // { points, layer, source }
  const openLineSegments = []; // für spätere Verkettung

  for (const e of allEntities) {
    const geo = e.__precomputed || dxfEntityToPolyline(e);
    if (!geo || geo.points.length < 2) continue;

    if (geo.type === "LINE") {
      openLineSegments.push({ p1: geo.points[0], p2: geo.points[1], layer: geo.layer });
      continue;
    }
    if (geo.points.length >= 3) {
      closedPolygons.push({ points: geo.points, layer: geo.layer, source: geo.type });
    }
  }

  // ── Offene LINE-Ketten zu Polygonen zusammensetzen ──
  if (openLineSegments.length > 0) {
    const chained = dxfChainLinesToPolygons(openLineSegments);
    chained.forEach(pts => closedPolygons.push({
      points: pts, layer: openLineSegments[0]?.layer || "0", source: "LINE-CHAIN"
    }));
  }

  if (closedPolygons.length === 0) {
    throw new Error("Keine geschlossenen Flächen gefunden (weder Polylinien, Hatches, Kreise noch geschlossene Linienketten).");
  }

  // ── Flächen berechnen, Einheiten normalisieren, filtern ──
  const results = closedPolygons
    .map((poly, idx) => {
      const m2raw = dxfPolygonArea(poly.points);
      // Heuristik: DXF-Dateien sind oft in mm modelliert.
      // Realistische Bauflächen liegen zwischen ~1 und ~5000 m².
      // Bei mm-Einheiten wäre die Rohfläche 1_000_000x zu groß.
      const m2 = m2raw > 100000 ? m2raw / 1_000_000 : m2raw;
      const cx = poly.points.reduce((s, p) => s + p.x, 0) / poly.points.length;
      const cy = poly.points.reduce((s, p) => s + p.y, 0) / poly.points.length;
      return {
        name: poly.layer && poly.layer !== "0" ? poly.layer : `Fläche ${idx + 1}`,
        m2: Math.round(m2 * 10) / 10,
        plan_x: cx, plan_y: cy,
        quelle: poly.source,
      };
    })
    .filter(f => f.m2 > 0.5 && f.m2 < 50000); // Mini-/Riesenflächen (Rahmen, Bemaßung) rausfiltern

  if (results.length === 0) {
    throw new Error("Erkannte Flächen liegen außerhalb eines plausiblen Größenbereichs (0.5–50.000 m²). Prüfe die Zeicheneinheiten der DXF-Datei.");
  }

  return results;
}

// Für die Achsabschnitts-Auswertung (lib/achsraster.js → dxfRasterAuswerten):
// Linien (mit Layer), Texte/Attribute mit Einfügepunkt, geschlossene Flächen.
export function dxfObjekteLesen(dxfText) {
  const linien = [], texte = [], flaechen = [];
  for (const e of dxfEntitaetenLesen(dxfText)) {
    if (["TEXT", "MTEXT", "ATTRIB"].includes(e.type) && e.tags) {
      const text = [dxfGetAll(e.tags, 3).join(""), dxfGet(e.tags, 1, "")].join("");
      texte.push({ text, x: dxfGetNum(e.tags, 10, 0), y: dxfGetNum(e.tags, 20, 0) });
      continue;
    }
    const geo = e.__precomputed || dxfEntityToPolyline(e);
    if (!geo || geo.points.length < 2) continue;
    if (geo.type === "LINE" || (geo.points.length === 2 && !geo.closed)) linien.push({ layer: geo.layer, p1: geo.points[0], p2: geo.points.at(-1) });
    else if (geo.closed !== false && geo.points.length >= 3) flaechen.push({ layer: geo.layer, punkte: geo.points });
  }
  return { linien, texte, flaechen };
}
