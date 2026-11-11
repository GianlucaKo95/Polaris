import { test } from "node:test";
import assert from "node:assert/strict";
import { preisspiegelBauen, nuPreiseUebernehmen } from "./preisspiegel.js";
import { gaebX84Schreiben } from "./gaebX84.js";
import { parseGaebXml } from "./gaebXml.js";
import { gaeb90ZuPositionen } from "./gaeb90.js";

const eigene = [
  { id: 1, bez: "── Abdichtung ──", menge: 0, ep: 0 },
  { id: 2, oz: "01.0010", bez: "Perimeterdämmung XPS", einheit: "m²", menge: 100, ep: 0 },
  { id: 3, oz: "01.0020", bez: "Noppenbahn verlegen", einheit: "m²", menge: 100, ep: 0 },
];

test("Bepreiste X84 liefert beim Einlesen den Einheitspreis", () => {
  const { text } = gaebX84Schreiben([{ bez: "A", oz: "01.0010", menge: 2, einheit: "m", ep: 12.5 }]);
  assert.equal(parseGaebXml(text).positionen[0].ep, 12.5);
  assert.equal(gaeb90ZuPositionen(parseGaebXml(text)).find(p => p.oz).ep, 12.5);
});

test("Preisspiegel ordnet über OZ und Text zu und findet den günstigsten Bieter", () => {
  const nuA = { name: "Abdicht GmbH", positionen: [
    { oz: "01.0010", bez: "XPS", einheit: "m²", ep: 30 },
    { oz: "01.0020", bez: "Noppe", einheit: "m²", ep: 9 },
  ] };
  const nuB = { name: "Keller KG", positionen: [
    { bez: "Perimeterdämmung XPS 120", einheit: "qm", ep: 27 },
  ] };
  const s = preisspiegelBauen(eigene, [nuA, nuB]);
  assert.deepEqual(s.bieter, ["Abdicht GmbH", "Keller KG"]);
  assert.equal(s.zeilen.length, 2);
  assert.deepEqual(s.zeilen[0].preise, [30, 27]);
  assert.equal(s.zeilen[0].minIndex, 1);
  assert.deepEqual(s.zeilen[1].preise, [9, null]);
  assert.deepEqual(s.summen, [3900, 2700]);
  assert.deepEqual(s.fehlend, [0, 1]);
});

test("Übernahme legt NU-Preis als Fremdleistung mit Zuschlag in die Kalkulation", () => {
  const s = preisspiegelBauen(eigene, [{ name: "NU", positionen: [{ oz: "01.0010", bez: "x", einheit: "m²", ep: 30 }] }]);
  const neu = nuPreiseUebernehmen(eigene, s, { 2: 0, 3: 0 }, 15);
  assert.equal(neu[1].kalk.fremdleistung, 3000);
  assert.equal(Math.round(neu[1].ep * 100) / 100, 34.5);
  assert.equal(neu[1].preisquelle.art, "nachunternehmer");
  assert.equal(neu[2], eigene[2]); // ohne NU-Preis unverändert
});
