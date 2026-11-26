// Dach-Assistent (Flachdach): aus einem Vektor-PDF der Dachaufsicht die
// Grundmengen ableiten — ohne Nachklicken.
//
//  • Dachfläche = kleinster geschlossener Linienzug um einen Startpunkt
//    (automatisch aus der größten Füllfläche im Achsraster, sonst ein Klick).
//  • Attika außen = nächstgrößerer Linienzug um dieselbe Fläche.
//  • Randstreifen (Kies) = Versatz der Innenkante; die Breite liest der
//    Assistent aus gleichmäßig eingerückten Füllflächen, sonst 0,50 m (Annahme).
//  • Öffnungen = beschriftete Umrisse (oeffnungenFinden), immer abgezogen.
//  • Durchführungen = Kürzel-Beschriftungen „DD r'/ SW …“ je Gewerk.
//
// Jede Menge trägt ihre Geometrie (bezug) — sie wird direkt zur Plangeometrie
// einer LV-Position und damit auch für die Abschnittsabrechnung genutzt.
// Unsicheres wird als Hinweis markiert, nicht verschwiegen.

import { polygonFlaeche, punktInPolygon, oeffnungenFinden, bezugGesamt } from "./planAbschnitt.js";
import { linienGraph, umrissUmPunkt } from "./umriss.js";

const r2 = x => Math.round(x * 100) / 100;
const de = x => r2(x).toLocaleString("de-DE");
const signiert = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
export const umfang = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + Math.hypot(b.x - a.x, b.y - a.y); }, 0);
const schwerpunkt = p => {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length], c = q.x * r.y - r.x * q.y;
    a += c; x += (q.x + r.x) * c; y += (q.y + r.y) * c;
  }
  return Math.abs(a) < 1e-12 ? p[0] : { x: x / (3 * a), y: y / (3 * a) };
};
const zu = p => [...p, p[0]];

// Polygon um d nach innen (d > 0) bzw. außen (d < 0) versetzen (Kanten parallel
// verschieben, Nachbarkanten schneiden). Für einfache Umrisse ohne Engstellen.
export function versatz(poly, d) {
  const ccw = signiert(poly) > 0;
  const n = poly.length, kanten = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y, l = Math.hypot(ex, ey) || 1;
    const nx = (ccw ? -ey : ey) / l * d, ny = (ccw ? ex : -ex) / l * d;
    kanten.push({ a: { x: a.x + nx, y: a.y + ny }, b: { x: b.x + nx, y: b.y + ny } });
  }
  return kanten.map((k, i) => {
    const v = kanten[(i - 1 + n) % n];
    const d1x = v.b.x - v.a.x, d1y = v.b.y - v.a.y, d2x = k.b.x - k.a.x, d2y = k.b.y - k.a.y;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12) return k.a;
    const t = ((k.a.x - v.a.x) * d2y - (k.a.y - v.a.y) * d2x) / den;
    return { x: v.a.x + t * d1x, y: v.a.y + t * d1y };
  });
}

const huelle = pts => ({ x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) });

// Randstreifenbreite: Füllfläche, deren Hülle auf allen vier Seiten gleich weit
// (±2 cm, 0,2–1,2 m) gegenüber der Dachhülle eingerückt ist.
export function randstreifenAusFuellungen(dach, flaechen) {
  const H = huelle(dach);
  const kand = [];
  for (const f of flaechen || []) {
    if (!f.punkte || f.punkte.length < 3) continue;
    const h = huelle(f.punkte), d = [h.x0 - H.x0, H.x1 - h.x1, h.y0 - H.y0, H.y1 - h.y1];
    const m = d.reduce((a, b) => a + b, 0) / 4;
    if (m >= 0.2 && m <= 1.2 && d.every(x => Math.abs(x - m) <= 0.02)) kand.push(m);
  }
  return kand.length ? r2(Math.min(...kand)) : null;
}

// Durchführungen nach Gewerk aus Kürzel-Beschriftungen (DD/BD r'/ SW …)
const GEWERK = [[/^sw|entl[üu]ft|abwasser/i, "sw", "Entlüftung (SW)"], [/^rlt|l[üu]ftung/i, "rlt", "Lüftung (RLT)"],
  [/elektro|^pv|kabel/i, "pv", "Elektro / PV"], [/^rw|regen/i, "rw", "Regenwasser"]];
export function durchfuehrungenZaehlen(texte, bereich) {
  const aus = {};
  for (const t of texte || []) {
    if (!punktInPolygon(t, bereich)) continue;
    for (const x of String(t.text).matchAll(/(?<![A-ZÄÖÜ])(?:DD|BD)\s*r?['’]?\s*\/\s*([A-Za-zÄÖÜäöü]+)/g)) {
      const g = GEWERK.find(([re]) => re.test(x[1]));
      const id = g ? g[1] : x[1].toLowerCase(), name = g ? g[2] : x[1];
      aus[id] ||= { id, name, punkte: [] };
      aus[id].punkte.push({ x: t.x, y: t.y });
    }
  }
  return Object.values(aus);
}

// Entwässerung: nur Hinweis (Beschriftungen zeigen meist per Pfeil auf
// mehrere Abläufe; die Stückzahl muss der Mensch bestätigen).
export function entwaesserungHinweise(texte, bereich, rand = 3) {
  const H = huelle(bereich);
  return (texte || []).filter(t => t.x > H.x0 - rand && t.x < H.x1 + rand && t.y > H.y0 - rand && t.y < H.y1 + rand
    && /\bLX\s*\d+|not[üu]berlauf|attikaentw|gull(y|ies)|dachablauf|speier|wasserspeier/i.test(t.text))
    .flatMap(t => [...String(t.text).matchAll(/LX\s*\d+|not[üu]berlauf|notentw[äa]sserung|attikaentw[äa]sserung|gully|dachablauf|wasserspeier|speier/gi)].map(x => x[0].replace(/\s+/g, " ")));
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
  return aus;
}

// plan: { linien, flaechen, texte, umrisse } in Metern
// opt.start: Klickpunkt im Dach; opt.bereich: Polygon (z. B. Achsraster + Rand)
// opt.randstreifen: Breite in m (überschreibt die Erkennung; 0 = keiner)
export function dachErkennen(plan, { start, bereich, randstreifen } = {}) {
  const linien = bereich ? (() => { const H = huelle(bereich); return plan.linien.filter(l => [l.p1, l.p2].some(p => p.x > H.x0 && p.x < H.x1 && p.y > H.y0 && p.y < H.y1)); })() : plan.linien;
  const g = linienGraph(linien);
  let innen = null;
  const versuche = start ? [{ punkt: start }] : startpunkte(plan, bereich);
  for (const v of versuche) {
    const u = umrissUmPunkt(g, v.punkt, { minFlaeche: 10 });
    if (!u) continue;
    if (v.erwartet && (u.flaeche < v.erwartet * 0.6 || u.flaeche > v.erwartet * 1.4)) continue;
    innen = { ...u, start: v.punkt };
    break;
  }
  if (!innen) return { fehler: start ? "Um den Punkt liegt kein geschlossener Linienzug. Näher an die Dachkante klicken oder den Umriss zeichnen." : "Keine Dachfläche erkannt. Bitte einmal in die Dachfläche klicken." };

  const hinweise = [];
  const aussenRoh = umrissUmPunkt(g, innen.start, { minFlaeche: innen.flaeche * 1.001, maxFlaeche: innen.flaeche * 1.6, ausser: [innen.punkte] });
  const aussen = aussenRoh && innen.punkte.every(p => punktInPolygon(p, aussenRoh.punkte) || aussenRoh.punkte.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.05)) ? aussenRoh : null;
  if (!aussen) hinweise.push("Attika-Außenkante nicht als geschlossener Linienzug gefunden — Außenmaße fehlen.");
  const ui = umfang(innen.punkte), ua = aussen ? umfang(aussen.punkte) : null;
  const attikaBreite = aussen ? r2((aussen.flaeche - innen.flaeche) / ((ui + ua) / 2)) : null;

  const oeffnungen = oeffnungenFinden(innen.punkte, plan);
  let rs = randstreifen != null ? randstreifen : randstreifenAusFuellungen(innen.punkte, plan.flaechen);
  const rsAngenommen = randstreifen == null && rs == null;
  if (rsAngenommen) { rs = 0.5; hinweise.push("Randstreifenbreite nicht im Plan erkannt — 0,50 m angenommen."); }
  const feld = rs > 0 ? versatz(innen.punkte, rs) : null;
  if (feld && (polygonFlaeche(feld) <= 0 || polygonFlaeche(feld) >= innen.flaeche)) hinweise.push("Randstreifen ließ sich nicht sauber versetzen.");

  const abz = oeffnungen.map(o => ({ punkte: o.punkte, abzug: true, oeffnung: o.text }));
  const durchf = durchfuehrungenZaehlen(plan.texte, aussen?.punkte || innen.punkte);
  const entw = entwaesserungHinweise(plan.texte, aussen?.punkte || innen.punkte);
  if (entw.length) hinweise.push(`Entwässerung im Plan beschriftet (${[...new Map(entw.map(x => [x.toLowerCase(), /^lx/i.test(x) ? x.toUpperCase().replace(/LX\s*/, "LX ") : x[0].toUpperCase() + x.slice(1).toLowerCase()])).values()].join(", ")}) — Stückzahl bitte selbst zählen; Beschriftungen zeigen oft auf mehrere Abläufe.`);

  const mengen = [];
  const neu = (id, name, art, einheit, bezug, extra = {}) => mengen.push({ id, name, art, einheit, bezug, menge: r2(bezugGesamt(bezug)), ...extra });
  neu("dach", "Dachfläche innerhalb Attika", "flaeche", "m²", { art: "flaeche", teile: [{ punkte: innen.punkte }, ...abz] },
    { info: oeffnungen.length ? `abzüglich ${oeffnungen.map(o => `${o.text} (${de(o.flaeche)} m²)`).join(", ")}` : "keine beschriftete Öffnung gefunden" });
  if (feld) {
    neu("feld", `Fläche innerhalb Randstreifen (${String(rs).replace(".", ",")} m)`, "flaeche", "m²", { art: "flaeche", teile: [{ punkte: feld }, ...abz.filter(a => a.punkte.every(p => punktInPolygon(p, feld)))] }, { annahme: rsAngenommen });
    neu("rand", `Randstreifen ${String(rs).replace(".", ",")} m`, "flaeche", "m²", { art: "flaeche", teile: [{ punkte: innen.punkte }, { punkte: feld, abzug: true }] }, { annahme: rsAngenommen });
    neu("randgrenze", "Randstreifen, Innenkante", "strecke", "m", { art: "strecke", teile: [{ punkte: zu(feld) }] }, { annahme: rsAngenommen });
    neu("rand_mitte", "Randstreifen, Mittellinie", "strecke", "m", { art: "strecke", teile: [{ punkte: zu(versatz(innen.punkte, rs / 2)) }] }, { annahme: rsAngenommen });
  }
  neu("attika_innen", "Attika innen (Anschluss)", "strecke", "m", { art: "strecke", teile: [{ punkte: zu(innen.punkte) }] });
  if (aussen) {
    neu("attika_aussen", "Attika außen", "strecke", "m", { art: "strecke", teile: [{ punkte: zu(aussen.punkte) }] });
    neu("attika_mitte", `Attika Mittellinie (Breite ${String(attikaBreite).replace(".", ",")} m)`, "strecke", "m", { art: "strecke", teile: [{ punkte: zu(versatz(innen.punkte, -attikaBreite / 2)) }] });
    neu("attika_ecken", "Attika-Ecken", "zaehlen", "Stk", { art: "zaehlen", teile: [{ punkte: aussen.punkte }] });
  }
  if (oeffnungen.length) {
    neu("oeffnungen", "Öffnungen (Lichtkuppel, Ausstieg …)", "zaehlen", "Stk", { art: "zaehlen", teile: [{ punkte: oeffnungen.map(o => schwerpunkt(o.punkte)) }] });
    neu("oeffnungen_umfang", "Anschluss an Öffnungen", "strecke", "m", { art: "strecke", teile: oeffnungen.map(o => ({ punkte: zu(o.punkte) })) });
    neu("anschluss_gesamt", "Anschlüsse gesamt (Attika innen + Öffnungen)", "strecke", "m", { art: "strecke", teile: [{ punkte: zu(innen.punkte) }, ...oeffnungen.map(o => ({ punkte: zu(o.punkte) }))] });
  }
  for (const d of durchf) neu(`df_${d.id}`, `Durchführungen ${d.name}`, "zaehlen", "Stk", { art: "zaehlen", teile: [{ punkte: d.punkte }] }, { annahme: true, info: "aus Beschriftungen gezählt" });

  return { innen, aussen, feld, randstreifen: rs, attikaBreite, oeffnungen, mengen, hinweise };
}

// ── Zuordnung zu LV-Positionen ──────────────────────────────────────────
// Vorschlag je Position nach Einheit und Titel (erste Wörter des Kurztexts).
// Reihenfolge = Vorrang; NIE schließt eine Position aus. Ein Vorschlag ist
// kein Urteil: Abweichungen > 25 % zur LV-Menge werden markiert.
const NIE = /ablauf|abl[äa]ufe|fallrohr|standrohr|sockel|aufgehend|erosion|anschlussleitung|flexleitung|stelzlager|plattenbelag|betonplatte|stundenlohn|notabdichtung|kantholz|schacht|nachweis|seil|klemm|schiene|modul|solar|statisch/i;
const REGELN = [
  ["df_pv", /\bpv\b|elektro|schwanenhals|kabel/i, "zaehlen"],
  ["df_rlt", /\brlt\b|(?<!ent)l[üu]ftung|dn\s*1(25|50)\b/i, "zaehlen"],
  ["df_sw", /entl[üu]ft|\bsw\b|durchf[üu]hrung/i, "zaehlen"],
  ["oeffnungen", /lichtkuppel|dachausstieg|\brwa\b|oberlicht|dachfenster|lichtband/i, "zaehlen"],
  ["attika_ecken", /\becke|eckaus|eckbild/i, "zaehlen"],
  ["randgrenze", /kiesleiste|trennleiste|trennprofil|kiesfang/i, "strecke"],
  ["rand_mitte", /\bkies|randstreifen/i, "strecke"],
  ["oeffnungen_umfang", /oberlicht|lichtkuppel|geba|aufsetzkranz/i, "strecke"],
  ["anschluss_gesamt", /hochf[üu]hr|hochzuf[üu]hr/i, "strecke"],
  ["attika_aussen", /abdeckung|fugenversiegel|dehnungsaus/i, "strecke"],
  ["attika_innen", /uv-schutz|wandanschluss|aufkantung|abwicklung/i, "strecke"],
  ["attika_mitte", /attik|unterkonstruktion|randabschluss/i, "strecke"],
  ["rand", /\bkies|randstreifen/i, "flaeche"],
  ["feld", /substrat|sedum|extensiv|vegetation|begr[üu]nung|pflanz|ansaat|w[äa]ssern|d[üu]ngen|pflege/i, "flaeche"],
  ["dach", /d[äa]mm|abdicht|dampf|vlies|schutz|dr[äa]n|filter|s[äa]uber|untergrund|grundier|voranstrich|trenn|bahn|folie|speicher|dach/i, "flaeche"],
];
const ART_EINHEIT = [[/^(m2|m²|qm)$/i, "flaeche"], [/^(m|lfm|lfdm)$/i, "strecke"], [/^(st|stk|stck|stück|stueck)$/i, "zaehlen"]];
const artVon = e => (ART_EINHEIT.find(([re]) => re.test(String(e || "").trim().replace(/\.$/, ""))) || [])[1] || null;
export const titel = (t, n = 3) => String(t || "").split(/\s+/).slice(0, n).join(" ");

export function zuordnungVorschlagen(positionen, mengen) {
  const da = new Map(mengen.map(m => [m.id, m]));
  let vorher = null;
  return positionen.map(p => {
    const art = artVon(p.einheit);
    // Flächen und Längen nach dem Kurztitel, Stück auch nach DN im längeren Titel
    const t = titel(p.kurztext, art === "zaehlen" ? 8 : 3);
    let id = null;
    if (art && /zur vorposition|wie vor\b/i.test(p.kurztext || "") && vorher?.art === art) id = vorher.id;
    else if (art && !NIE.test(titel(p.kurztext, 8))) id = (REGELN.find(([i, re, a]) => a === art && da.has(i) && re.test(t)) || [])[0] || null;
    const m = id ? da.get(id) : null;
    const abweichung = m && p.mengeLv > 0 ? m.menge / p.mengeLv - 1 : null;
    vorher = art ? { art, id } : vorher;
    return { key: p.key, id, menge: m?.menge ?? null, abweichung, pruefen: abweichung != null && Math.abs(abweichung) > 0.25 };
  });
}

export function mengeNachId(mengen, id) { return mengen.find(m => m.id === id) || null; }
