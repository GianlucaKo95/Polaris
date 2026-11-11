import { test } from "node:test";
import assert from "node:assert/strict";
import { positionsart, inSumme, nettoSumme, titelSummen } from "./lv.js";
import { gaebX84Schreiben } from "./gaebX84.js";

const lv = [
  { id: 1, bez: "── Rohbau ──" },
  { id: 2, bez: "Beton", menge: 10, ep: 100 },
  { id: 3, bez: "[Bedarfsposition (nicht in Angebotssumme enthalten)] Wasserhaltung", menge: 5, ep: 50 },
  { id: 4, bez: "Kran", menge: 1, ep: 1000, art: "alternativ" },
  { id: 5, bez: "Zulage Sichtbeton", menge: 10, ep: 20, art: "zulage", rabatt: 50 },
  { id: 6, bez: "── Ausbau ──" },
  { id: 7, bez: "[Bedarfsposition] Mehrmenge", menge: 1, ep: 7 },
];

test("Positionsart aus Feld oder GAEB-Präfix", () => {
  assert.equal(positionsart(lv[1]), "normal");
  assert.equal(positionsart(lv[2]), "bedarf");
  assert.equal(positionsart(lv[3]), "alternativ");
  assert.equal(positionsart(lv[6]), "bedarf_mit");
});

test("Bedarf ohne GB und Alternativen zählen nicht zur Summe", () => {
  assert.equal(inSumme(lv[0]), false);
  assert.equal(nettoSumme(lv), 1000 + 100 + 7);
  assert.deepEqual(titelSummen(lv), { 1: 1100, 6: 7 });
});

test("X84 kennzeichnet Positionen ohne Gesamtbetrag und zählt sie nicht", () => {
  const { text, summe } = gaebX84Schreiben(lv);
  assert.equal(summe, 1107);
  assert.match(text, /<Provis>WithoutTotal<\/Provis>/);
  assert.doesNotMatch(text, /\[Bedarfsposition/);
});
