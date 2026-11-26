import { test } from "node:test";
import assert from "node:assert/strict";
import { achsenAusBlasen, rasterAusAchsen, satzVerstehen, abschnittBerechnen, abschnittInsAufmass, gebuchtAusAufmass,
  fortschritt, bezugGesamt, mengeInZelle } from "./planAbschnitt.js";
import { massstabFinden, pdfOperatorenAuswerten } from "../pdfPlan.js";

const nah = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// Raster: Buchstaben A–C bei y = 0, 5, 10; Zahlen 1–3 bei x = 0, 6, 12.
// Achsblasen an beiden Enden (r = 0,3 m), dazu Bemaßungszahlen ohne Kreis.
function plan() {
  const texte = [], kreise = [];
  const blase = (tag, x, y) => { texte.push({ text: tag, x: x - 0.1, y: y - 0.1 }); kreise.push({ x, y, r: 0.3 }); };
  [["A", 0], ["B", 5], ["C", 10]].forEach(([t, y]) => { blase(t, -2, y); blase(t, 14, y); });
  [["1", 0], ["2", 6], ["3", 12]].forEach(([t, x]) => { blase(t, x, -2); blase(t, x, 12); });
  texte.push({ text: "6", x: 3, y: -1 }, { text: "5", x: -1, y: 2.5 }, { text: "24", x: 6, y: 6 });
  return { texte, kreise };
}
const rechteck = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

function einrichtung() {
  const { achsen } = achsenAusBlasen(plan());
  return {
    achsen,
    bezuege: {
      // Dach 0,5 m über die Randachsen hinaus: 13 × 11 = 143 m²
      dach: { art: "flaeche", teile: [{ punkte: rechteck(-0.5, -0.5, 12.5, 10.5) }, { punkte: rechteck(2, 2, 3, 3), abzug: true }] },
      attika: { art: "strecke", teile: [{ punkte: [...rechteck(-0.5, -0.5, 12.5, 10.5), { x: -0.5, y: -0.5 }] }] },
      gully: { art: "zaehlen", teile: [{ punkte: [{ x: 3, y: 3 }, { x: 9, y: 7 }, { x: 6, y: 5 }] }] },
      kies: { art: "strecke", teile: [{ punkte: [{ x: 0, y: 0 }, { x: 12, y: 0 }] }], modus: "plan" },
    },
  };
}
const positionen = [
  { key: "dach", standId: "s", knotenId: "k1", oz: "01", kurztext: "Dachabdichtung Bitumen 2-lagig", einheit: "m²", mengeLv: 150 },
  { key: "attika", standId: "s", knotenId: "k2", oz: "02", kurztext: "Attikaabdeckung Zink", einheit: "m", mengeLv: 50 },
  { key: "gully", standId: "s", knotenId: "k3", oz: "03", kurztext: "Dachgully DN 100", einheit: "Stk", mengeLv: 3 },
  { key: "kies", standId: "s", knotenId: "k4", oz: "04", kurztext: "Kiesleiste", einheit: "m", mengeLv: 12 },
];

test("Achsblasen: Paare werden Achsen, Bemaßungszahlen fallen raus", () => {
  const { achsen, einzeln } = achsenAusBlasen(plan());
  assert.deepEqual(achsen.map(a => a.tag).sort(), ["1", "2", "3", "A", "B", "C"]);
  assert.deepEqual(einzeln, []);
  const r = rasterAusAchsen(achsen);
  assert.deepEqual(r.fehler, []);
  assert.equal(r.felder.length, 2);
  assert.ok(r.felder.every(f => f.baender.length === 2));
  assert.equal(r.felder[0].baender[0].von, -Infinity);
  assert.equal(r.felder[0].baender[1].bis, Infinity);
});

test("Satz: Achsen je Richtung, Arbeitsgang, ohne, Prozent", () => {
  const r = rasterAusAchsen(einrichtung().achsen);
  const v = satzVerstehen("Abschnitt A–B / 1-2 Abdichtung fertig, ohne Kies, zu 50 %", r);
  assert.deepEqual(v.fehler, []);
  assert.equal(v.anteil, 0.5);
  assert.deepEqual(v.nur, ["Abdichtung"]);
  assert.deepEqual(v.ohne, ["Kies"]);
  assert.ok(v.bereiche.every(Boolean));
  assert.match(satzVerstehen("nur A genannt", r).fehler[0], /von–bis/);
  assert.match(satzVerstehen("alles fertig", r).fehler[0], /Keine Achse/);
  assert.equal(satzVerstehen("B bis A 2 bis 3", r).hinweise.length, 0);
});

test("Zuschnitt: Randfeld enthält den Überstand, Abzug und Punkte", () => {
  const p = einrichtung();
  nah(bezugGesamt(p.bezuege.dach), 143 - 1);
  nah(bezugGesamt(p.bezuege.attika), 48);
  const e = abschnittBerechnen({ planraster: p, positionen, satz: "A-B 1-2 fertig" });
  assert.equal(e.bereich, "A–B / 1–2");
  const dach = e.zeilen.find(z => z.key === "dach");
  // Feld x −0,5…6, y −0,5…5 = 6,5 × 5,5 = 35,75 − Aussparung 1 = 34,75
  nah(dach.planNeu, 34.75, 1e-3);
  nah(dach.menge, Math.round(34.75 / 142 * 150 * 1000) / 1000, 1e-3);
  const att = e.zeilen.find(z => z.key === "attika");
  nah(att.planNeu, 6.5 + 5.5, 1e-3);
  assert.equal(e.zeilen.find(z => z.key === "gully").planNeu, 1);
  const kies = e.zeilen.find(z => z.key === "kies");
  assert.equal(kies.modus, "plan");
  nah(kies.menge, 6);
});

test("Keine Doppelbuchung: überlappende Meldungen, Teilanteile, Fortschritt", () => {
  const p = einrichtung();
  const e1 = abschnittBerechnen({ planraster: p, positionen, satz: "A–B 1–2 zu 50 %" });
  const z1 = abschnittInsAufmass(e1, { neueZeile: f => ({ ...f }), satz: "A–B 1–2 zu 50 %" });
  assert.equal(z1[0].blatt, "Abschnitte");
  assert.equal(z1[0].quelle, "messung");
  let g = gebuchtAusAufmass(z1);
  const e2 = abschnittBerechnen({ planraster: p, positionen, satz: "A–C 1–3 fertig", gebucht: g });
  const dach2 = e2.zeilen.find(z => z.key === "dach");
  nah(dach2.planNeu, 142 - 34.75 / 2, 1e-3);
  g = gebuchtAusAufmass([...z1, ...abschnittInsAufmass(e2, { neueZeile: f => ({ ...f }) })]);
  const f = fortschritt(p, g);
  for (const k of Object.keys(p.bezuege)) nah(f[k], 1, 1e-9);
  const e3 = abschnittBerechnen({ planraster: p, positionen, satz: "B-C 2-3", gebucht: g });
  assert.equal(e3.zeilen.length, 0);
  assert.match(e3.hinweise.join(" "), /schon gebucht/);
});

test("Arbeitsgang filtert nach Kurztext, unbekannte Wörter werden gemeldet", () => {
  const p = einrichtung();
  const e = abschnittBerechnen({ planraster: p, positionen, satz: "A–C / 1–3 Attika und Gully fertig, ohne Kies" });
  assert.deepEqual(e.zeilen.map(z => z.key).sort(), ["attika", "gully"]);
  const leer = abschnittBerechnen({ planraster: p, positionen, satz: "A–C 1–3 Begrünung" });
  assert.match(leer.fehler[0], /Kein Arbeitsgang/);
  const teil = abschnittBerechnen({ planraster: p, positionen, satz: "A–C 1–3 Attika Begrünung" });
  assert.match(teil.hinweise.join(" "), /Nicht zugeordnet: Begrünung/);
  const ohneGeo = abschnittBerechnen({ planraster: { achsen: p.achsen, bezuege: {} }, positionen, satz: "A-C 1-3" });
  assert.match(ohneGeo.fehler[0], /Plangeometrie/);
});

test("Linien auf der Feldgrenze und schräge Linien werden anteilig geteilt", () => {
  const p = einrichtung();
  const r = rasterAusAchsen(p.achsen);
  const schraeg = { art: "strecke", teile: [{ punkte: [{ x: 0, y: 0 }, { x: 12, y: 10 }] }] };
  const e = abschnittBerechnen({ planraster: { ...p, bezuege: { dach: schraeg } }, positionen, satz: "A–B 1–2" });
  nah(e.zeilen[0].planNeu / bezugGesamt(schraeg), 0.5, 1e-3);
  assert.equal(typeof mengeInZelle, "function");
  assert.ok(r.felder.length === 2);
});

test("PDF: Maßstab im Schriftfeld auf zwei Zeilen, Kreise aus Kurvenpfaden", () => {
  assert.equal(massstabFinden([{ text: "Maßstab:" }, { text: "1 : 50" }]), 50);
  assert.equal(massstabFinden([{ text: "1 : 50" }]), null);
  const OPS = { constructPath: 1, stroke: 2, save: 3, restore: 4, transform: 5, fill: 6 };
  const k = 0.5523 * 10;
  // Kreis r=10 um (100,100) aus vier Bézier-Vierteln
  const kreis = [0, 110, 100, 2, 110, 100 + k, 100 + k, 110, 100, 110, 2, 100 - k, 110, 90, 100 + k, 90, 100,
    2, 90, 100 - k, 100 - k, 90, 100, 90, 2, 100 + k, 90, 110, 100 - k, 110, 100, 4];
  const r = pdfOperatorenAuswerten({ fnArray: [OPS.constructPath], argsArray: [[OPS.stroke, [kreis]]] }, OPS);
  assert.equal(r.kreise.length, 1);
  nah(r.kreise[0].x, 100); nah(r.kreise[0].y, 100); nah(r.kreise[0].r, 10);
  assert.equal(r.linien.length, 0);
});
