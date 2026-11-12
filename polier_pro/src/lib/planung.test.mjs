import { test } from "node:test";
import assert from "node:assert/strict";
import { montag, wochen, kolonnenRessourcen, kolonnenKonflikt, geraetKonflikt, zuweisen, besetzung, abwesenheitenNormalisieren } from "./planung.js";

test("montag und Kalenderwochen", () => {
  assert.equal(montag("2026-11-12"), "2026-11-09");
  assert.equal(montag("2026-11-15"), "2026-11-09");
  const w = wochen("2026-12-28", 2);
  assert.deepEqual(w.map(x => x.kw), [53, 1]);
  assert.equal(w[0].freitag, "2027-01-01");
});

test("Kolonnen werden firmenweit nach Namen zusammengefasst", () => {
  const r = kolonnenRessourcen([
    { name: "Kolonne Yilmaz", vorarbeiter: "Mehmet Yilmaz", mitarbeiter: [{ name: "Mehmet Yilmaz" }, { name: "Jan Kowalski" }] },
    { name: " kolonne  yilmaz", mitarbeiter: [{ name: "Jan Kowalski" }, { name: "Lukas Brandt" }] },
    { name: "Kolonne Berg", mitarbeiter: [] },
  ]);
  assert.equal(r.length, 2);
  assert.deepEqual(r[1].mitarbeiter, ["Mehmet Yilmaz", "Jan Kowalski", "Lukas Brandt"]);
});

test("Abwesenheit in der Woche", () => {
  const k = kolonnenRessourcen([{ name: "K", mitarbeiter: [{ name: "A B" }, { name: "C D" }] }])[0];
  const w = wochen("2026-11-16", 1)[0];
  const ab = abwesenheitenNormalisieren([{ mitarbeiter: { vorname: "A", nachname: "B" }, von_datum: "2026-11-20", bis_datum: "2026-11-27", status: "genehmigt" }]);
  assert.equal(kolonnenKonflikt(k, w, ab).text, "1 von 2 abwesend");
  assert.equal(kolonnenKonflikt(k, wochen("2026-11-30", 1)[0], ab), null);
});

test("Gerätekonflikte: Werkstatt, Prüfung in der Woche, anderer Standort", () => {
  const w = wochen("2026-11-09", 1)[0];
  const r = { geraet: { status: "einsatz", projekt_id: 2, pruefungen: [{ art: "uvv", intervall_monate: 12, zuletzt: "2025-11-11" }] } };
  const k = geraetKonflikt(r, w, 1, "2026-11-12");
  assert.deepEqual(k.map(x => x.text), ["UVV-Prüfung fällig 11.11.2026", "steht auf einer anderen Baustelle"]);
  assert.equal(geraetKonflikt({ geraet: { status: "verfuegbar", pruefungen: [] } }, w, 1, "2026-11-12"), null);
});

test("zuweisen über Wochen und Besetzung", () => {
  const res = { schluessel: "kolonne:k", art: "kolonne", name: "K" };
  const plan = [{ id: 1, ressource: "kolonne:k", woche: "2026-11-09", projekt_id: 5, art: "kolonne" }];
  const z = zuweisen(plan, res, 7, ["2026-11-09", "2026-11-16"]);
  assert.equal(z.speichern.length, 2);
  assert.equal(z.speichern[0].id, 1);
  assert.deepEqual(zuweisen(plan, res, null, ["2026-11-09", "2026-11-16"]).loeschen, [1]);
  assert.deepEqual(besetzung(plan, "2026-11-09"), { 5: { kolonnen: 1, geraete: 0 } });
});
