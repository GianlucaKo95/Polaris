import { test } from "node:test";
import assert from "node:assert/strict";
import { endsummeBerechnen, endsummeAnwenden } from "./endsumme.js";

const kp = [{ id: 1, kategorie: "lohn", einheit: "h", preis: 50 }, { id: 2, kategorie: "material", einheit: "m³", preis: 100 }];
const positionen = [
  { id: 1, bez: "Beton", menge: 10, ep: 0, kalk: { lohnposten: [{ stammId: 1, menge: 20 }], materialposten: [{ stammId: 2, menge: 10 }], geraetPosten: [], fremdleistung: 0 } },
  { id: 2, bez: "BE", menge: 1, ep: 500 },
];
const es = { bgk: [{ bez: "Container", betrag: 1000 }], agkProzent: 10, wgProzent: 5, umlageAuf: "lohn" };

test("Endsumme: HK, AGK, W&G und Umlagesatz auf Lohn", () => {
  const e = endsummeBerechnen(positionen, es, kp);
  assert.equal(e.ektSumme, 2000);        // Lohn 1000 + Material 1000
  assert.equal(e.hk, 3000);
  assert.equal(e.agk, 300);
  assert.equal(Math.round(e.wg * 100) / 100, 165);
  assert.equal(Math.round(e.angebotssumme * 100) / 100, 3465);
  assert.equal(Math.round(e.umlageSatz * 100) / 100, 146.5); // 1465 / 1000 Lohn
  assert.equal(Math.round(e.gesamt * 100) / 100, 3965);
});

test("Anwenden: Summe der kalkulierten Positionen = kalkulierte Angebotssumme, Festpreise bleiben", () => {
  const neu = endsummeAnwenden(positionen, es, kp);
  assert.equal(Math.round(neu[0].menge * neu[0].ep * 100) / 100, 3465);
  assert.equal(neu[0].kalk.zuschlagMaterial, 0);
  assert.equal(neu[1], positionen[1]);
  const alle = endsummeAnwenden(positionen, { ...es, umlageAuf: "alle" }, kp);
  assert.equal(alle[0].kalk.zuschlagMaterial, alle[0].kalk.zuschlagLohn);
  assert.equal(Math.round(alle[0].menge * alle[0].ep * 100) / 100, 3465);
});

test("Ohne Lohn kein Umlagesatz auf Lohn", () => {
  const ohneLohn = [{ ...positionen[0], kalk: { ...positionen[0].kalk, lohnposten: [] } }];
  assert.ok(endsummeBerechnen(ohneLohn, es, kp).fehler);
  assert.equal(endsummeAnwenden(ohneLohn, es, kp), ohneLohn);
});
