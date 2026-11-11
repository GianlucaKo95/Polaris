import { test } from "node:test";
import assert from "node:assert/strict";
import { positionPruefen, angebotPruefen, vergleichswerteAusAngeboten } from "./plausibilitaet.js";

const basis = [
  { ref: "EP:1", bez: "Abdichtung · Perimeterdämmung XPS", einheit: "m²", ep: 40 },
  { ref: "LV:1:1", bez: "Perimeterdämmung XPS 100 mm", einheit: "m2", ep: 36 },
  { ref: "LV:1:2", bez: "Perimeterdämmung XPS 120 mm", einheit: "qm", ep: 44 },
  { ref: "EP:2", bez: "Bodenplatte C25/30", einheit: "m³", ep: 220 },
];

test("Ohne Preis ist die Position rot", () => {
  assert.equal(positionPruefen({ id: 1, bez: "Noppenbahn", einheit: "m²", ep: 0 }, basis).ampel, "rot");
});

test("Nahe am Median ist grün, Einheiten-Aliase zählen als gleiche Einheit", () => {
  const r = positionPruefen({ id: 1, bez: "Perimeterdämmung XPS 120 mm", einheit: "m²", ep: 42 }, basis);
  assert.equal(r.ampel, "gruen");
  assert.equal(r.anzahl, 3);
  assert.equal(r.median, 40);
});

test("Eigene Preisquelle zählt nicht als Vergleichswert", () => {
  const r = positionPruefen({ id: 1, bez: "Perimeterdämmung XPS", einheit: "m²", ep: 40, preisquelle: { ref: "EP:1" } }, basis);
  assert.equal(r.anzahl, 2);
});

test("30 % Abweichung ist gelb, 100 % ist rot", () => {
  assert.equal(positionPruefen({ id: 1, bez: "Perimeterdämmung XPS", einheit: "m²", ep: 52 }, basis).ampel, "gelb");
  assert.equal(positionPruefen({ id: 1, bez: "Perimeterdämmung XPS", einheit: "m²", ep: 80 }, basis).ampel, "rot");
});

test("Andere Einheit oder anderer Text ergibt keine Vergleichswerte", () => {
  assert.equal(positionPruefen({ id: 1, bez: "Perimeterdämmung XPS", einheit: "m", ep: 12 }, basis).ampel, "keine");
  assert.equal(positionPruefen({ id: 1, bez: "Gerüst stellen", einheit: "m²", ep: 12 }, basis).ampel, "keine");
});

test("Frühere Angebote werden als Vergleich genutzt, das aktuelle nicht", () => {
  const angebote = [
    { id: 5, positionen: [{ id: 1, bez: "Gerüst stellen und vorhalten", einheit: "m²", ep: 11 }] },
    { id: 6, positionen: [{ id: 1, bez: "Gerüst stellen und vorhalten", einheit: "m²", ep: 99 }] },
  ];
  const werte = vergleichswerteAusAngeboten(angebote, 6);
  assert.equal(werte.length, 1);
  const { jePosition, zaehler } = angebotPruefen([{ id: 9, bez: "Gerüst stellen", einheit: "m²", ep: 12 }, { id: 10, bez: "── Titel" }], werte);
  assert.equal(jePosition[9].ampel, "gruen");
  assert.equal(zaehler.gruen, 1);
  assert.equal(jePosition[10], undefined);
});
