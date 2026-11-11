import { test } from "node:test";
import assert from "node:assert/strict";
import { leistungsfaktor, zeitansaetzeAnpassen } from "./nachkalkulation.js";
import { stammpositionKalk } from "./stammpositionen.js";

const kp = [
  { id: 1, kategorie: "lohn", bezeichnung: "FA", einheit: "h", preis: 48 },
  { id: 2, kategorie: "material", bezeichnung: "XPS", einheit: "m²", preis: 18 },
];
const sp = { id: 7, bez: "Dämmung", einheit: "m²", rezeptur: [{ stammId: 1, mengeJeEinheit: 0.5 }, { stammId: 2, mengeJeEinheit: 1 }] };

test("Leistungsfaktor = Ist-Stunden / Soll-Stunden der erbrachten Leistung", () => {
  const kalk = stammpositionKalk(sp, 200, kp, null); // 100 h Soll
  const angebote = [{ id: 1, positionen: [{ id: 11, kalk, stammpositionId: 7, menge: 200 }] }];
  const r = leistungsfaktor({
    angebote, fortschritt: { 1: [{ position_id: 11, prozent: 50 }] }, kalkulationspreise: kp,
    zeitbuchungen: [{ status: "abgeschlossen", netto_minuten: 60 * 60 }, { status: "laeuft", netto_minuten: 600 }],
  });
  assert.equal(r.sollStunden, 50);
  assert.equal(r.istStunden, 60);
  assert.equal(r.faktor, 1.2);
  assert.deepEqual(r.stammpositionIds, [7]);
});

test("Zu wenig Daten: kein Faktor", () => {
  const kalk = stammpositionKalk(sp, 10, kp, null);
  const r = leistungsfaktor({ angebote: [{ id: 1, positionen: [{ id: 1, kalk }] }], fortschritt: { 1: [{ position_id: 1, prozent: 100 }] },
    zeitbuchungen: [{ status: "abgeschlossen", netto_minuten: 600 }], kalkulationspreise: kp });
  assert.equal(r.faktor, null);
  assert.ok(r.hinweis);
});

test("Zeitansätze anpassen skaliert nur Lohnstunden und schreibt Historie", () => {
  const [neu] = zeitansaetzeAnpassen([sp], [7], 1.2, kp, { projekt: "EFH", datum: "2026-11-11" });
  assert.equal(neu.rezeptur[0].mengeJeEinheit, 0.6);
  assert.equal(neu.rezeptur[1].mengeJeEinheit, 1);
  assert.deepEqual(neu.nachkalkulation, [{ datum: "2026-11-11", projekt: "EFH", faktor: 1.2 }]);
});
