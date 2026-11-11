import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as WebIFC from "web-ifc";
import { rasterBauen, abschnittVerstehen, abschnittAuswerten, zuordnungVorschlagen, leistungsstandBerechnen,
  geschossSchluessel, dxfRasterAuswerten, konvexeHuelle, abschnittAlsText } from "./achsraster.js";
import { ifcRasterModell } from "./ifcRaster.js";

const hier = dirname(fileURLToPath(import.meta.url));
const typen = Object.fromEntries(Object.keys(WebIFC).filter(k => /^IFC[A-Z]+$/.test(k)).map(k => [k, WebIFC[k]]));

async function rasterModell() {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const id = api.OpenModel(new Uint8Array(readFileSync(join(hier, "__fixtures__", "raster.ifc"))));
  try { return await ifcRasterModell(api, id, typen); } finally { api.CloseModel(id); }
}
const nah = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("IFC: Achsraster, Geschosse und Bauteile in Metern (mm-Projekt, versetztes Gebäude)", async () => {
  const m = await rasterModell();
  assert.deepEqual(m.geschosse, ["EG", "1. OG"]);
  const a = m.achsen.find(x => x.tag === "A"), b2 = m.achsen.find(x => x.tag === "2");
  nah(a.p1.x, 1.0); nah(b2.p1.y, 8.5); // Gebäude um (1 m / 0,5 m) verschoben
  const st = m.elemente.find(e => e.name === "Stuetze A1");
  const mx = st.punkte.reduce((s, p) => s + p.x, 0) / st.punkte.length;
  nah(mx, 1.0); assert.equal(st.geschoss, "EG"); assert.equal(st.volumen, 0.27);
  assert.equal(m.elemente.filter(e => e.typ === "IFCCOLUMN").length, 9);
});

test("Abschnitt A–B / 1–2 im EG: Stützen auf den Achsen ganz, Platte und Wand anteilig", async () => {
  const m = await rasterModell();
  const auftrag = abschnittVerstehen("Abschnitt zwischen A und B und 1 und 2 im EG ist fertig", rasterBauen(m.achsen), m.geschosse);
  assert.deepEqual(auftrag.fehler, []);
  assert.equal(auftrag.geschoss, "EG");
  const r = abschnittAuswerten(m, auftrag);
  const g = n => r.gruppen.find(x => x.bauteil === n);
  nah(g("Stützen").stueck, 4); nah(g("Stützen").volumen, 1.08);
  nah(g("Decken/Platten").volumen, 12); nah(g("Decken/Platten").flaeche, 48);
  nah(g("Wände").volumen, 5.76); nah(g("Wände").flaeche, 24);
  assert.match(r.bereich, /A–B \/ 1–2 · EG/);
  assert.match(abschnittAlsText(r), /Stützen: 4 Stk, 1,08 m³/);
});

test("Doppelbuchung: Stützen auf Achse B zählen im Nachbarfeld nicht nochmal", async () => {
  const m = await rasterModell();
  const raster = rasterBauen(m.achsen);
  const r1 = abschnittAuswerten(m, abschnittVerstehen("A-B 1-2 EG", raster, m.geschosse));
  const bereits = Object.fromEntries(r1.treffer.map(t => [t.element.id, t.anteil]));
  const r2 = abschnittAuswerten(m, abschnittVerstehen("B bis C, 1 bis 2, EG", raster, m.geschosse), bereits);
  nah(r2.gruppen.find(x => x.bauteil === "Stützen").stueck, 2); // C1, C2
  nah(r2.gruppen.find(x => x.bauteil === "Decken/Platten").volumen, 12);
  assert.equal(r2.gruppen.find(x => x.bauteil === "Wände"), undefined); // Wand auf A liegt nicht in B–C
});

test("Satz verstehen: Prozent, Geschoss-Schreibweisen, Bauteilfilter, Fehler", async () => {
  const m = await rasterModell();
  const raster = rasterBauen(m.achsen);
  const a = abschnittVerstehen("Decke 1.OG Achse A bis C / 1-3 zu 50 % betoniert", raster, m.geschosse);
  assert.equal(a.geschoss, "1. OG"); assert.equal(a.anteil, 0.5); assert.deepEqual(a.bauteile, ["Decken/Platten"]);
  assert.deepEqual(a.tags.sort(), ["1", "3", "A", "C"]);
  const r = abschnittAuswerten(m, a);
  assert.equal(r.gruppen.length, 1); nah(r.gruppen[0].volumen, 24);
  assert.equal(geschossSchluessel("Obergeschoss 1"), "1og");
  assert.ok(abschnittVerstehen("Feld A 1 fertig", raster, m.geschosse).tags.length === 2);
  const nurEine = abschnittAuswerten(m, abschnittVerstehen("Achse A und 1 bis 2", raster, m.geschosse));
  assert.match(nurEine.fehler.join(" "), /Nur eine Achse \(A\)/);
  assert.match(abschnittVerstehen("Bereich X bis Y", raster, m.geschosse).fehler[0], /Keine Achse erkannt/);
  assert.match(abschnittVerstehen("A-B 1-2 im 3. OG", raster, m.geschosse).fehler[0], /gibt es im Modell nicht/);
});

test("LV-Zuordnung und Leistungsstand", () => {
  const gruppen = [
    { key: "Stützen|Beton C30/37", bauteil: "Stützen", material: "Beton C30/37", stueck: 4, volumen: 1.08, flaeche: 0, laenge: 0 },
    { key: "Decken/Platten|Beton", bauteil: "Decken/Platten", material: "Beton", stueck: 0.25, volumen: 12, flaeche: 48, laenge: 0 },
  ];
  const positionen = [
    { key: "a:1", bez: "Stahlbetonstützen C30/37 herstellen", einheit: "m³", menge: 2.43, prozent: 0 },
    { key: "a:2", bez: "Bodenplatte d=25 cm", einheit: "m²", menge: 192, prozent: 10 },
    { key: "a:3", bez: "Schalung Bodenplatte Rand", einheit: "m", menge: 56, prozent: 0 },
  ];
  const z = zuordnungVorschlagen(gruppen, positionen);
  assert.equal(z["Stützen|Beton C30/37"], "a:1");
  assert.equal(z["Decken/Platten|Beton"], "a:2");
  const neu = leistungsstandBerechnen(gruppen, z, positionen);
  nah(neu.find(x => x.key === "a:1").neu, 44.4, 0.1);
  assert.equal(neu.find(x => x.key === "a:2").neu, 35);
});

test("DXF-Weg: Achsen mit Beschriftung, Deckenfläche anteilig per Clipping (mm-Zeichnung)", () => {
  const L = (x1, y1, x2, y2) => ({ layer: "A_ACHSEN", p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
  const objekte = {
    linien: [L(0, -2000, 0, 10000), L(5000, -2000, 5000, 10000), L(10000, -2000, 10000, 10000),
      L(-2000, 0, 12000, 0), L(-2000, 8000, 12000, 8000)],
    texte: [{ text: "A", x: 0, y: -2600 }, { text: "B", x: 5000, y: -2600 }, { text: "C", x: 10000, y: -2600 },
      { text: "1", x: -2600, y: 0 }, { text: "2", x: -2600, y: 8000 }, { text: "Wohnen", x: 3000, y: 3000 }],
    // L-förmige Decke: 10×8 m minus 5×4 m oben rechts = 60 m²
    flaechen: [{ layer: "Decke_EG", punkte: [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 4000 }, { x: 5000, y: 4000 }, { x: 5000, y: 8000 }, { x: 0, y: 8000 }] }],
  };
  const m = dxfRasterAuswerten(objekte);
  assert.equal(m.einheit, "mm");
  assert.deepEqual(m.achsen.map(a => a.tag).sort(), ["1", "2", "A", "B", "C"]);
  assert.equal(m.elemente[0].bauteil, "Decken/Platten"); assert.equal(m.elemente[0].flaeche, 60);
  const r = abschnittAuswerten(m, abschnittVerstehen("B bis C, 1-2", rasterBauen(m.achsen), []));
  nah(r.gruppen[0].flaeche, 20); // nur der untere Teil rechts
});

test("Konvexe Hülle", () => {
  const h = konvexeHuelle([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0.5, y: 0.5 }]);
  assert.equal(h.length, 4);
});
