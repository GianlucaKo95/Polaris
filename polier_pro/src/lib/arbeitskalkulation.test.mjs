import { test } from "node:test";
import assert from "node:assert/strict";
import { sollIstJePosition, faktorenJeStammposition } from "./arbeitskalkulation.js";

const kp = [{ id: 1, kategorie: "lohn", einheit: "h", preis: 50 }];
const angebote = [{ id: 9, positionen: [
  { id: 1, bez: "── Titel ──" },
  { id: 2, bez: "Mauerwerk", stammpositionId: 7, kalk: { lohnposten: [{ stammId: 1, menge: 100 }] } },
  { id: 3, bez: "Putz", kalk: { lohnposten: [{ stammId: 1, menge: 40 }] } },
] }];

test("Soll-Ist, Faktor und Prognose je Position", () => {
  const r = sollIstJePosition({
    angebote, kalkulationspreise: kp,
    fortschritt: [{ angebot_id: 9, position_id: 2, prozent: 50 }],
    verteilung: [{ angebot_id: 9, position_id: 2, stunden: 40 }, { angebot_id: 9, position_id: 2, stunden: 20 }, { angebot_id: 9, position_id: 3, stunden: 5 }],
  });
  const m = r.zeilen.find(z => z.positionId === 2);
  assert.equal(m.sollErbracht, 50);
  assert.equal(m.ist, 60);
  assert.equal(m.faktor, 1.2);
  assert.equal(m.prognose, 120);
  assert.equal(m.mehrkosten, 1000); // 20 h × 50 €
  assert.equal(m.ampel, "rot");
  const p = r.zeilen.find(z => z.positionId === 3);
  assert.equal(p.faktor, null); // Leistungsstand 0
  assert.equal(r.summe.ist, 65);
});

test("Faktoren je Stammposition ab Mindestmenge", () => {
  const zeilen = [{ stammpositionId: 7, sollErbracht: 50, ist: 60 }, { stammpositionId: 8, sollErbracht: 2, ist: 4 }];
  assert.deepEqual(faktorenJeStammposition(zeilen), [{ stammpositionId: 7, faktor: 1.2, sollErbracht: 50, ist: 60 }]);
});
