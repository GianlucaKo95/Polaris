import { test } from "node:test";
import assert from "node:assert/strict";
import { rechnen, checklistenFuer } from "./bauwissen.js";
import { aehnlichkeit } from "./katalog.js";

test("Rechner: deutsche Schreibweise, Punkt vor Strich, Klammern", () => {
  assert.equal(rechnen("40 × 2,5"), 100);
  assert.equal(rechnen("(12,5 + 7,5) x 2 - 3"), 37);
  assert.equal(rechnen("10 / 4"), 2.5);
  assert.equal(rechnen("40*2,5*0,6"), 60);
});

test("Rechner lehnt alles außer Arithmetik ab", () => {
  assert.throws(() => rechnen("alert(1)"));
  assert.throws(() => rechnen("1/0"));
  assert.throws(() => rechnen("2 +"));
});

test("Synonyme und Kürzel finden Katalogeinträge", () => {
  assert.equal(aehnlichkeit("BE", "Baustelleneinrichtung einrichten und räumen"), 1);
  assert.equal(aehnlichkeit("Drän verlegen", "Drainage DN 100 verlegen"), 1);
  assert.equal(aehnlichkeit("KS-Wand 17,5", "Mauerwerk Kalksandstein 17,5 cm"), 1);
  assert.equal(aehnlichkeit("Bewehrung", "Betonstahl BSt 500 S liefern und verlegen"), 1);
});

test("Tippfehler werden toleriert", () => {
  assert.equal(aehnlichkeit("Perimterdämmung", "Perimeterdämmung XPS"), 1);
});

test("Checklisten passen zur Anfrage", () => {
  const namen = checklistenFuer("Kellerwände abdichten, Drainage").map(c => c.name);
  assert.ok(namen.includes("Kellerabdichtung / Perimeter"));
  assert.equal(checklistenFuer("Fenster putzen").length, 0);
});
