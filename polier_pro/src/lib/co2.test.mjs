import { test } from "node:test";
import assert from "node:assert/strict";
import { co2Bilanz, co2AusModell, mengeInEinheit, co2AlsText } from "./co2.js";

const kp = [
  { id: "b1", bez: "Transportbeton C25/30", einheit: "m³", kategorie: "material" },
  { id: "s1", bez: "Betonstahl B500B", einheit: "t", kategorie: "material" },
  { id: "l1", bez: "Facharbeiter", einheit: "h", kategorie: "lohn" },
];

test("Rezeptur: Beton und Stahl je Position, t → kg umgerechnet", () => {
  const b = co2Bilanz([{ bez: "Stahlbetondecke d=25 cm", einheit: "m²", menge: 100,
    kalk: { materialposten: [{ stammId: "b1", menge: 25 }, { stammId: "s1", menge: 2 }], lohnposten: [{ stammId: "l1", menge: 40 }] } }],
    { kalkulationspreise: kp });
  assert.equal(b.zeilen[0].quelle, "rezeptur");
  assert.equal(Math.round(b.summe), 25 * 237 + 2000 * 0.531);
});

test("Ohne Kalkulation: Positionstext + passende Einheit; Schalung (m²) bleibt ohne", () => {
  const b = co2Bilanz([
    { bez: "Betonstahl BSt 500 liefern und verlegen", einheit: "t", menge: 3 },
    { bez: "Schalung Beton Wände", einheit: "m²", menge: 50 },
    { bez: "── Rohbau" },
  ]);
  assert.equal(Math.round(b.zeilen[0].kg), 1593);
  assert.equal(b.ohne, 1);
  assert.match(co2AlsText(b), /1,6 t CO₂-Äq\./);
});

test("Eigene Faktoren (EPD) haben Vorrang", () => {
  const b = co2Bilanz([{ bez: "Beton C25/30 Bodenplatte", einheit: "m³", menge: 10 }],
    { eigeneFaktoren: [{ name: "Ökobeton Lieferant X", einheit: "m³", faktor: 150, muster: "c25/30" }] });
  assert.equal(b.summe, 1500);
});

test("Modell: Volumen × Faktor nach Material", () => {
  const g = co2AusModell([{ bauteil: "Wände", material: "Beton C30/37", volumen: 10 }, { bauteil: "Türen", material: "", volumen: 0 }]);
  assert.equal(g[0].co2, 2500); assert.equal(g[1].co2, null);
  assert.equal(mengeInEinheit(2, "t", "kg"), 2000); assert.equal(mengeInEinheit(2, "m²", "kg"), null);
});
