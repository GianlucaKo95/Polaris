// Mengen je Achsabschnitt: "Abschnitt A–B / 1–2 im EG fertig" → welche
// Bauteile liegen in diesem Feld, welche Mengen sind das, um wie viel steigt
// der Leistungsstand der LV-Positionen.
//
// Alles hier ist reine Geometrie und Textauswertung ohne KI und ohne
// WebAssembly — dadurch nachprüfbar und testbar. Die Daten kommen aus
// lib/ifcRaster.js (IFC: Achsraster + Bauteile) oder dxfRasterLesen() unten
// (DXF: Achslinien mit Beschriftung + geschlossene Flächen).
//
// Modell (in Metern, Grundriss-Koordinaten x/y):
//   achsen:   [{ tag: "A", familie: "U", p1: {x,y}, p2: {x,y} }]
//   elemente: [{ id, typ, bauteil, material, geschoss, name,
//                flaeche, volumen, laenge, mengenQuelle, punkte: [{x,y}] }]
//   geschosse: ["UG", "EG", "1. OG"]
//
// Zuordnung eines Bauteils zum Feld (je Achsrichtung getrennt):
//   - schmal in dieser Richtung (≤ SCHMAL m, z.B. Stütze, Wanddicke):
//     ganz drin, wenn die Mitte im Feld ± TOLERANZ liegt — Stützen und Wände
//     AUF einer Achse gehören zum Feld dazu.
//   - sonst anteilig nach überdeckter Länge (Decke über drei Felder → 1/3).
// Der Gesamtanteil ist das Produkt beider Richtungen.

export const TOLERANZ = 0.35;
export const SCHMAL = 0.6;

// ── Geometrie-Helfer ────────────────────────────────────────────────────
export function konvexeHuelle(punkte) {
  const p = [...new Map((punkte || []).map(q => [`${Math.round(q.x * 100)}|${Math.round(q.y * 100)}`,
    { x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }])).values()]
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const kreuz = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const unten = [], oben = [];
  for (const q of p) { while (unten.length >= 2 && kreuz(unten.at(-2), unten.at(-1), q) <= 0) unten.pop(); unten.push(q); }
  for (const q of [...p].reverse()) { while (oben.length >= 2 && kreuz(oben.at(-2), oben.at(-1), q) <= 0) oben.pop(); oben.push(q); }
  return unten.slice(0, -1).concat(oben.slice(0, -1));
}

export function polygonFlaeche(punkte) {
  let s = 0;
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i], b = punkte[(i + 1) % punkte.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

const norm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y;

// ── Raster aus Achsen ───────────────────────────────────────────────────
// Ergebnis: { familien: { U: { normale, achsen: [{tag, pos}] }, V: … }, tags: Map(tagLower → {familie, pos, tag}) }
// Achsen ohne U/V-Kennung (DXF) werden nach Richtung gruppiert.
export function rasterBauen(achsen) {
  const liste = (achsen || []).filter(a => a?.tag && a.p1 && a.p2 && Math.hypot(a.p2.x - a.p1.x, a.p2.y - a.p1.y) > 1e-6);
  const familien = {};
  for (const a of liste) {
    let fam = a.familie;
    const richtung = norm({ x: a.p2.x - a.p1.x, y: a.p2.y - a.p1.y });
    if (!fam) {
      // Nach Richtung zuordnen: parallel (|sin| < 0.1) zu einer bestehenden Familie?
      fam = Object.keys(familien).find(k => Math.abs(richtung.x * familien[k].richtung.y - richtung.y * familien[k].richtung.x) < 0.1);
      if (!fam) fam = `F${Object.keys(familien).length + 1}`;
    }
    if (!familien[fam]) {
      // Normale so ausrichten, dass sie nach +x bzw. +y zeigt — Positionen steigen dann "nach rechts/oben".
      let n = { x: -richtung.y, y: richtung.x };
      if (n.x < -1e-9 || (Math.abs(n.x) < 1e-9 && n.y < 0)) n = { x: -n.x, y: -n.y };
      familien[fam] = { richtung, normale: n, achsen: [] };
    }
    const f = familien[fam];
    if (f.achsen.some(x => x.tag.toLowerCase() === String(a.tag).toLowerCase())) continue;
    f.achsen.push({ tag: String(a.tag), pos: dot(a.p1, f.normale) });
  }
  for (const f of Object.values(familien)) f.achsen.sort((a, b) => a.pos - b.pos);
  const tags = new Map();
  for (const [k, f] of Object.entries(familien)) for (const a of f.achsen) {
    const key = a.tag.toLowerCase();
    if (!tags.has(key)) tags.set(key, { familie: k, pos: a.pos, tag: a.tag });
  }
  return { familien, tags };
}

// Bereich aus gewählten Achs-Tags: je Familie [min, max] der genannten Achsen;
// Familie ohne genannte Achse → ganze Ausdehnung (als Annahme gemeldet).
export function bereichBauen(raster, tagListe) {
  const grenzen = {}, annahmen = [], fehler = [];
  for (const [k, f] of Object.entries(raster.familien)) {
    const genannt = tagListe.map(t => raster.tags.get(String(t).toLowerCase())).filter(t => t && t.familie === k);
    if (genannt.length >= 2) {
      const pos = genannt.map(t => t.pos);
      grenzen[k] = { von: Math.min(...pos), bis: Math.max(...pos), tags: genannt.map(t => t.tag) };
    } else if (genannt.length === 1) {
      fehler.push(`Nur eine Achse (${genannt[0].tag}) dieser Richtung genannt — bitte von–bis angeben, z.B. ${genannt[0].tag} und ${nachbar(f, genannt[0].tag)}.`);
    } else if (f.achsen.length) {
      grenzen[k] = { von: -Infinity, bis: Infinity, tags: [] };
      annahmen.push(`Keine Achse ${f.achsen.map(a => a.tag).slice(0, 4).join("/")}… genannt — ganze Länge in dieser Richtung.`);
    }
  }
  return { grenzen, annahmen, fehler };
}

// Flächige 2D-Objekte (DXF): echter Flächenanteil per Polygon-Clipping
// (Sutherland–Hodgman; der Bereich ist ein konvexes Viereck).
function flaechenAnteil(umriss, raster, bereich) {
  const ks = Object.keys(raster.familien);
  if (ks.length < 2) return 0;
  const [k1, k2] = ks, n1 = raster.familien[k1].normale, n2 = raster.familien[k2].normale;
  const g1 = bereich.grenzen[k1] || { von: -1e7, bis: 1e7 }, g2 = bereich.grenzen[k2] || { von: -1e7, bis: 1e7 };
  const lim = v => Math.max(-1e7, Math.min(1e7, v));
  const det = n1.x * n2.y - n1.y * n2.x;
  if (Math.abs(det) < 1e-9) return 0;
  const schnitt = (a, b) => ({ x: (a * n2.y - n1.y * b) / det, y: (n1.x * b - a * n2.x) / det });
  const [a0, a1, b0, b1] = [lim(g1.von), lim(g1.bis), lim(g2.von), lim(g2.bis)];
  let clip = [schnitt(a0, b0), schnitt(a1, b0), schnitt(a1, b1), schnitt(a0, b1)];
  // Umlaufsinn gegen den Uhrzeigersinn erzwingen
  let s = 0; for (let i = 0; i < 4; i++) { const p = clip[i], q = clip[(i + 1) % 4]; s += p.x * q.y - q.x * p.y; }
  if (s < 0) clip = clip.reverse();
  let poly = umriss;
  for (let i = 0; i < 4 && poly.length; i++) {
    const A = clip[i], B = clip[(i + 1) % 4];
    const innen = p => (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x) >= -1e-9;
    const schneide = (p, q) => {
      const d1 = (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
      const d2 = (B.x - A.x) * (q.y - A.y) - (B.y - A.y) * (q.x - A.x);
      const t = d1 / (d1 - d2);
      return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
    };
    const aus = [];
    for (let j = 0; j < poly.length; j++) {
      const p = poly[j], q = poly[(j + 1) % poly.length];
      if (innen(q)) { if (!innen(p)) aus.push(schneide(p, q)); aus.push(q); }
      else if (innen(p)) aus.push(schneide(p, q));
    }
    poly = aus;
  }
  const gesamt = polygonFlaeche(umriss);
  const f = gesamt > 0 && poly.length >= 3 ? polygonFlaeche(poly) / gesamt : 0;
  return f > 0.97 ? 1 : f < 0.03 ? 0 : f;
}

function nachbar(familie, tag) {
  const i = familie.achsen.findIndex(a => a.tag === tag);
  return (familie.achsen[i + 1] || familie.achsen[i - 1] || { tag: "…" }).tag;
}

// Anteil eines Bauteils (konvexe Grundrisshülle) am Bereich, 0…1.
export function elementAnteil(element, raster, bereich) {
  if (element.umriss?.length >= 3) return flaechenAnteil(element.umriss, raster, bereich);
  const pts = element.punkte || [];
  if (!pts.length) return 0;
  let anteil = 1;
  for (const [k, g] of Object.entries(bereich.grenzen)) {
    const n = raster.familien[k].normale;
    const proj = pts.map(p => dot(p, n));
    const lo = Math.min(...proj), hi = Math.max(...proj), breite = hi - lo;
    if (g.von === -Infinity) continue;
    if (breite <= SCHMAL) {
      const mitte = (lo + hi) / 2;
      if (mitte < g.von - TOLERANZ || mitte > g.bis + TOLERANZ) return 0;
    } else {
      const ueberdeckt = Math.max(0, Math.min(hi, g.bis) - Math.max(lo, g.von));
      // kleine Überstände über die Achse (Wanddicke, Auflager) nicht als Anteil abziehen
      const f = ueberdeckt / breite;
      anteil *= f > 0.97 ? 1 : f < 0.03 ? 0 : f;
    }
    if (anteil === 0) return 0;
  }
  return anteil;
}

// ── Satz verstehen ──────────────────────────────────────────────────────
export const BAUTEIL_WOERTER = [
  [/\b(decke|decken|platte|platten|bodenplatte|sohle)\b/i, "Decken/Platten"],
  [/\b(wand|wände|waende|wänden)\b/i, "Wände"],
  [/\b(stütze|stützen|stuetze|stuetzen)\b/i, "Stützen"],
  [/\b(unterzug|unterzüge|unterzuege|träger|traeger|balken)\b/i, "Unterzüge/Träger"],
  [/\b(fundament|fundamente|streifenfundament|einzelfundament)\b/i, "Fundamente"],
  [/\b(treppe|treppen|treppenlauf|treppenläufe)\b/i, "Treppen"],
  [/\b(dach|dächer)\b/i, "Dächer"],
];

const ESC = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORTGRENZE_VOR = "(?<![\\p{L}\\p{N}])", WORTGRENZE_NACH = "(?![\\p{L}\\p{N}])";

// Geschoss-Schreibweisen vereinheitlichen: "1.OG", "1. OG", "OG1", "1 OG" → "1og"; "Erdgeschoss" → "eg"
export function geschossSchluessel(s) {
  let t = String(s || "").toLowerCase().replace(/erdgeschoss/g, "eg").replace(/untergeschoss|kellergeschoss|keller/g, "ug")
    .replace(/obergeschoss/g, "og").replace(/dachgeschoss/g, "dg").replace(/kg\b/g, "ug");
  const m = t.match(/(\d+)\s*\.?\s*(og|ug)|(og|ug)\s*(\d+)/);
  if (m) return `${m[1] || m[4]}${m[2] || m[3]}`;
  return t.replace(/[^a-z0-9]/g, "");
}

// satz: Freitext; raster: rasterBauen(); geschosse: Namen aus dem Modell.
// Ergebnis: { tags, geschoss, bauteile, anteil, fehler[], annahmen[] }
export function abschnittVerstehen(satz, raster, geschosse = []) {
  let rest = ` ${String(satz || "")} `;
  const annahmen = [], fehler = [];

  // 1. Prozent ("zu 50 %", "halb") — vor den Achsen entfernen, sonst wird "50" zur Achse.
  let anteil = 1;
  const proz = rest.match(/(\d{1,3}(?:[.,]\d+)?)\s*(%|prozent)/i);
  if (proz) { anteil = Math.min(100, Number(proz[1].replace(",", "."))) / 100; rest = rest.replace(proz[0], " "); }
  else if (/\bhalb\b|\bzur hälfte\b/i.test(rest)) anteil = 0.5;

  // 2. Geschoss — ebenfalls vor den Achsen ("1. OG" enthält "1").
  let geschoss = null;
  const kandidaten = [...geschosse].sort((a, b) => b.length - a.length);
  for (const g of kandidaten) {
    const re = new RegExp(`${WORTGRENZE_VOR}${ESC(g)}${WORTGRENZE_NACH}`, "iu");
    if (re.test(rest)) { geschoss = g; rest = rest.replace(re, " "); break; }
  }
  if (!geschoss) {
    const m = rest.match(/(\d+)\s*\.?\s*(og|ug)\b|\b(og|ug)\s*(\d+)\b|\b(eg|ug|kg|dg|erdgeschoss|keller(?:geschoss)?|untergeschoss|dachgeschoss)\b/i);
    if (m) {
      const schl = geschossSchluessel(m[0]);
      geschoss = geschosse.find(g => geschossSchluessel(g) === schl) || null;
      if (!geschoss && geschosse.length) fehler.push(`Geschoss "${m[0].trim()}" gibt es im Modell nicht (vorhanden: ${geschosse.join(", ")}).`);
      rest = rest.replace(m[0], " ");
    }
  }
  if (!geschoss && geschosse.length > 1 && !fehler.length) annahmen.push("Kein Geschoss genannt — alle Geschosse.");

  // 3. Bauteile
  const bauteile = BAUTEIL_WOERTER.filter(([re]) => re.test(rest)).map(([, b]) => b);

  // 4. Achsen: alle bekannten Tags als ganze Wörter suchen (längste zuerst, "1a" vor "1").
  const tags = [];
  const bekannt = [...raster.tags.values()].sort((a, b) => b.tag.length - a.tag.length);
  for (const t of bekannt) {
    const re = new RegExp(`${WORTGRENZE_VOR}${ESC(t.tag)}${WORTGRENZE_NACH}`, "giu");
    if (re.test(rest)) { tags.push(t.tag); rest = rest.replace(re, " "); }
  }
  // "zwischen A und C" mit Achse B dazwischen ist erlaubt — es zählen min/max.
  if (!tags.length) fehler.push(`Keine Achse erkannt. Vorhandene Achsen: ${[...raster.tags.values()].map(t => t.tag).join(", ")}.`);
  return { tags, geschoss, bauteile, anteil, fehler, annahmen };
}

// ── Auswerten ───────────────────────────────────────────────────────────
// modell: { achsen, elemente, geschosse }; auftrag: Ergebnis von abschnittVerstehen()
// bereits: { elementId: schon gebuchter Anteil } — verhindert Doppelbuchung von
// Stützen auf gemeinsamen Achsen und von Decken über mehrere Felder.
export function abschnittAuswerten(modell, auftrag, bereits = {}) {
  const raster = rasterBauen(modell.achsen);
  const bereich = bereichBauen(raster, auftrag.tags);
  const fehler = [...(auftrag.fehler || []), ...bereich.fehler];
  const annahmen = [...(auftrag.annahmen || []), ...bereich.annahmen];
  const treffer = [];
  if (!fehler.length) {
    for (const e of modell.elemente || []) {
      if (auftrag.geschoss && e.geschoss !== auftrag.geschoss) continue;
      if (auftrag.bauteile?.length && !auftrag.bauteile.includes(e.bauteil)) continue;
      const geometrisch = elementAnteil(e, raster, bereich);
      if (geometrisch <= 0) continue;
      const gewuenscht = geometrisch * (auftrag.anteil ?? 1);
      const schon = bereits[e.id] || 0;
      const neu = Math.max(0, Math.min(gewuenscht, 1 - schon));
      treffer.push({ element: e, anteil: neu, geometrisch, schonGebucht: schon });
    }
  }
  return { treffer, gruppen: gruppieren(treffer), fehler, annahmen, bereich: bereichText(bereich, auftrag) };
}

function bereichText(bereich, auftrag) {
  const teile = Object.values(bereich.grenzen).filter(g => g.tags.length)
    .map(g => g.tags.length > 2 ? `${g.tags[0]}–${g.tags.at(-1)}` : g.tags.join("–"));
  return [teile.join(" / ") || "ganzes Raster", auftrag.geschoss, auftrag.bauteile?.length ? auftrag.bauteile.join(", ") : null,
    (auftrag.anteil ?? 1) < 1 ? `zu ${Math.round(auftrag.anteil * 100)} %` : null].filter(Boolean).join(" · ");
}

export function gruppieren(treffer) {
  const m = new Map();
  for (const t of treffer) {
    if (t.anteil <= 0) continue;
    const e = t.element;
    const key = `${e.bauteil}|${e.material || ""}`;
    const g = m.get(key) || { key, bauteil: e.bauteil, material: e.material || "", anzahl: 0, stueck: 0, flaeche: 0, volumen: 0, laenge: 0, anteilig: 0, berechnet: 0 };
    g.anzahl++;
    g.stueck += t.anteil;
    g.flaeche += (e.flaeche || 0) * t.anteil;
    g.volumen += (e.volumen || 0) * t.anteil;
    g.laenge += (e.laenge || 0) * t.anteil;
    if (t.anteil < 0.999) g.anteilig++;
    if (e.mengenQuelle === "geometrie") g.berechnet++;
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => a.bauteil.localeCompare(b.bauteil) || a.material.localeCompare(b.material));
}

// ── LV-Zuordnung und Leistungsstand ─────────────────────────────────────
const EINHEIT_MENGE = [
  [/^m(3|³)$|^cbm$/i, "volumen"], [/^m(2|²)$|^qm$/i, "flaeche"], [/^m$|^lfm$|^lfdm$/i, "laenge"],
  [/^(stk|st|stück|stueck)\.?$/i, "stueck"],
];
export function mengenartFuerEinheit(einheit) {
  const e = String(einheit || "").trim().replace(/\s+/g, "");
  return (EINHEIT_MENGE.find(([re]) => re.test(e)) || [null, null])[1];
}

const BAUTEIL_RE = Object.fromEntries(BAUTEIL_WOERTER.map(([re, b]) => [b, new RegExp(re.source.replace(/\\b/g, ""), "i")]));

// Vorschlag: zu jeder Gruppe die passendste Position (Bauteilwort in der
// Bezeichnung + passende Einheit; Material als Pluspunkt). positionen: [{key, bez, einheit, menge}]
export function zuordnungVorschlagen(gruppen, positionen, gespeichert = {}) {
  const ergebnis = {};
  for (const g of gruppen) {
    if (gespeichert[g.key] !== undefined && positionen.some(p => p.key === gespeichert[g.key])) { ergebnis[g.key] = gespeichert[g.key]; continue; }
    let best = null, bestPunkte = 0;
    for (const p of positionen) {
      const art = mengenartFuerEinheit(p.einheit);
      if (!art || !(g[art] > 0)) continue;
      let punkte = 0;
      if (BAUTEIL_RE[g.bauteil]?.test(p.bez || "")) punkte += 3;
      const mat = (g.material || "").toLowerCase().split(/[\s,/-]+/).filter(w => w.length > 3);
      if (mat.some(w => (p.bez || "").toLowerCase().includes(w))) punkte += 1;
      if (/beton/i.test(g.material) && /beton|stb|stahlbeton/i.test(p.bez || "")) punkte += 1;
      if (punkte > bestPunkte) { best = p.key; bestPunkte = punkte; }
    }
    ergebnis[g.key] = bestPunkte >= 3 ? best : "";
  }
  return ergebnis;
}

// Neuer Leistungsstand je Position. zuordnung: {gruppenKey → positionKey};
// positionen: [{key, menge, einheit, prozent}] (prozent = bisheriger Stand).
export function leistungsstandBerechnen(gruppen, zuordnung, positionen) {
  const zuwachs = new Map();
  for (const g of gruppen) {
    const pk = zuordnung[g.key];
    const p = positionen.find(x => x.key === pk);
    if (!p) continue;
    const art = mengenartFuerEinheit(p.einheit);
    const menge = art ? g[art] : 0;
    if (!(menge > 0)) continue;
    zuwachs.set(pk, (zuwachs.get(pk) || 0) + menge);
  }
  return [...zuwachs.entries()].map(([key, menge]) => {
    const p = positionen.find(x => x.key === key);
    const alt = Number(p.prozent) || 0;
    const plus = p.menge > 0 ? menge / p.menge * 100 : 0;
    const neu = Math.min(100, Math.round((alt + plus) * 10) / 10);
    return { key, menge, alt, neu, ueberLv: alt + plus > 100.5 };
  });
}

const z = n => (n || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
export function abschnittAlsText(ergebnis) {
  if (!ergebnis.gruppen.length) return `Abschnitt ${ergebnis.bereich}: keine Bauteile gefunden.`;
  return `Mengen Abschnitt ${ergebnis.bereich}:\n` + ergebnis.gruppen.map(g => {
    const t = [`${z(g.stueck)} Stk`];
    if (g.volumen) t.push(`${z(g.volumen)} m³`);
    if (g.flaeche) t.push(`${z(g.flaeche)} m²`);
    if (g.laenge) t.push(`${z(g.laenge)} m`);
    if (g.anteilig) t.push(`${g.anteilig} anteilig`);
    return `- ${g.bauteil}${g.material ? ` · ${g.material}` : ""}: ${t.join(", ")}`;
  }).join("\n");
}

// ── DXF: Achslinien + Beschriftung, geschlossene Flächen ────────────────
// Achsen: LINE/LWPOLYLINE (2 Punkte) auf Layern mit achs/raster/grid/axis im
// Namen. Beschriftung: TEXT/MTEXT oder Block-Attribut (Achsblase) nahe einem
// Linienende, Inhalt wie "A", "B'", "1", "12a". Flächen: geschlossene
// Polylinien/Hatches auf allen anderen Layern → Bauteil = Layername, Menge = m².
export function dxfRasterAuswerten(objekte) {
  // objekte: { linien: [{layer, p1, p2}], texte: [{text, x, y}], flaechen: [{layer, punkte}] } (Zeicheneinheiten)
  const achsLayer = /achs|raster|grid|axis|axe/i;
  const linien = objekte.linien.filter(l => achsLayer.test(l.layer || ""));
  const texte = objekte.texte.map(t => ({ ...t, text: String(t.text || "").replace(/\\[A-Za-z][^;]*;|[{}]/g, "").trim() }))
    .filter(t => /^([A-Z]{1,2}['’]?|\d{1,3}[a-z]?['’]?)$/i.test(t.text));
  // Zeicheneinheit raten: Ausdehnung > 1000 → mm
  const xs = [...linien.flatMap(l => [l.p1.x, l.p2.x]), ...objekte.flaechen.flatMap(f => f.punkte.map(p => p.x))];
  const ys = [...linien.flatMap(l => [l.p1.y, l.p2.y]), ...objekte.flaechen.flatMap(f => f.punkte.map(p => p.y))];
  const ausdehnung = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 0;
  const s = ausdehnung > 2000 ? 0.001 : ausdehnung > 200 ? 0.01 : 1;
  const achsen = [];
  for (const l of linien) {
    let best = null, bestD = Infinity;
    for (const t of texte) for (const e of [l.p1, l.p2]) {
      const d = Math.hypot(t.x - e.x, t.y - e.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best && bestD * s <= 4) // Beschriftung höchstens 4 m vom Linienende
      achsen.push({ tag: best.text, p1: { x: l.p1.x * s, y: l.p1.y * s }, p2: { x: l.p2.x * s, y: l.p2.y * s } });
  }
  const elemente = objekte.flaechen.filter(f => !achsLayer.test(f.layer || "") && f.punkte.length >= 3).map((f, i) => {
    const punkte = f.punkte.map(p => ({ x: p.x * s, y: p.y * s }));
    const bauteil = (BAUTEIL_WOERTER.find(([re]) => re.test(String(f.layer || "").replace(/[_-]/g, " "))) || [null, f.layer || "Fläche"])[1];
    return { id: `dxf${i}`, typ: "DXF", bauteil, material: bauteil === f.layer ? "" : f.layer, geschoss: null, name: f.layer,
      flaeche: Math.round(polygonFlaeche(punkte) * 100) / 100, volumen: 0, laenge: 0, mengenQuelle: "geometrie", umriss: punkte };
  }).filter(e => e.flaeche > 0.05);
  return { achsen, elemente, geschosse: [], einheit: s === 1 ? "m" : s === 0.01 ? "cm" : "mm" };
}
