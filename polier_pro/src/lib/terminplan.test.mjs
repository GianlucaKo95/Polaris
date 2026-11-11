import { test } from "node:test";
import assert from "node:assert/strict";
import { terminplanAusAngebot, arbeitstageAddieren } from "./terminplan.js";

const kp = [{ id: 1, kategorie: "lohn", einheit: "h", preis: 50 }];
const k = h => ({ lohnposten: [{ stammId: 1, menge: h }] });

test("Arbeitstage überspringen das Wochenende", () => {
  assert.equal(arbeitstageAddieren("2026-11-13", 1), "2026-11-13"); // Freitag
  assert.equal(arbeitstageAddieren("2026-11-13", 2), "2026-11-16"); // → Montag
  assert.equal(arbeitstageAddieren("2026-11-14", 1), "2026-11-16"); // Samstag → Montag
});

test("Vorgänge je Titel, Dauer aus Lohnstunden und Kolonnenstärke, lückenlos verkettet", () => {
  const plan = terminplanAusAngebot({ titel: "EFH", positionen: [
    { id: 1, bez: "── Erdarbeiten ──" }, { id: 2, bez: "Aushub", kalk: k(30) },
    { id: 3, bez: "── Rohbau ──" }, { id: 4, bez: "Bodenplatte", kalk: k(100) }, { id: 5, bez: "Wände", kalk: k(140) },
    { id: 6, bez: "Wasserhaltung", art: "bedarf", kalk: k(500) },
  ] }, kp, { kolonnenStaerke: 3, stundenProTag: 8, start: "2026-11-16" });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].dauer_tage, 2);            // 30 / 24
  assert.equal(plan[0].faellig_am, "2026-11-17");
  assert.equal(plan[1].soll_stunden, 240);         // Bedarf ohne GB ausgelassen
  assert.equal(plan[1].dauer_tage, 10);
  assert.equal(plan[1].beginn, "2026-11-18");
  assert.equal(plan[1].faellig_am, "2026-12-01");
});

test("Ohne Titel ein Vorgang je Position", () => {
  const plan = terminplanAusAngebot({ positionen: [{ bez: "A", kalk: k(8) }, { bez: "B", kalk: k(0) }, { bez: "C", ep: 5 }] }, kp, { start: "2026-11-16" });
  assert.deepEqual(plan.map(p => p.titel), ["A"]);
});
