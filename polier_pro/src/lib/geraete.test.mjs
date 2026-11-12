import { test } from "node:test";
import assert from "node:assert/strict";
import { monateDazu, pruefStand, naechstePruefung, einsatzbereit, umsetzen, arbeitstage, tagessatz, mieteJeBaustelle, summeMiete, neuesGeraet } from "./geraete.js";

test("monateDazu kappt auf Monatsende", () => {
  assert.equal(monateDazu("2026-01-31", 1), "2026-02-28");
  assert.equal(monateDazu("2025-11-12", 12), "2026-11-12");
});

test("pruefStand: überfällig, bald, ok, offen", () => {
  const g = { pruefungen: [
    { art: "uvv", intervall_monate: 12, zuletzt: "2025-10-01" },     // fällig 2026-10-01 → überfällig
    { art: "hu", intervall_monate: 24, zuletzt: "2024-11-30" },      // fällig 2026-11-30 → bald (18 Tage)
    { art: "elektro", intervall_monate: 12, zuletzt: "2026-06-01" }, // ok
    { art: "kran", intervall_monate: 12, zuletzt: null },            // offen
  ] };
  const s = Object.fromEntries(pruefStand(g, "2026-11-12").map(p => [p.art, p.stand]));
  assert.deepEqual(s, { uvv: "ueberfaellig", hu: "bald", elektro: "ok", kran: "offen" });
  assert.equal(naechstePruefung(g, "2026-11-12").art, "uvv");
  assert.equal(einsatzbereit(g, "2026-11-12"), false);
  assert.equal(einsatzbereit({ pruefungen: [{ art: "uvv", intervall_monate: 12, zuletzt: "2026-06-01" }] }, "2026-11-12"), true);
  assert.equal(einsatzbereit({ status: "werkstatt", pruefungen: [] }, "2026-11-12"), false);
});

test("umsetzen schließt den laufenden Einsatz am Vortag und öffnet den neuen", () => {
  let g = neuesGeraet({ id: 1 });
  g = umsetzen(g, 7, "2026-11-02");
  assert.equal(g.status, "einsatz");
  g = umsetzen(g, 9, "2026-11-09");
  assert.deepEqual(g.einsaetze, [{ projekt_id: 7, von: "2026-11-02", bis: "2026-11-08" }, { projekt_id: 9, von: "2026-11-09", bis: null }]);
  g = umsetzen(g, null, "2026-11-09"); // am selben Tag zurück: Einsatz entfällt
  assert.equal(g.einsaetze.length, 1);
  assert.equal(g.status, "verfuegbar");
  assert.equal(g.projekt_id, null);
});

test("arbeitstage ohne Wochenenden und Feiertage", () => {
  assert.equal(arbeitstage("2026-11-02", "2026-11-08"), 5);
  assert.equal(arbeitstage("2026-10-26", "2026-11-01", "NW"), 5);  // 1.11. ist Sonntag
  assert.equal(arbeitstage("2026-12-21", "2026-12-27", "NW"), 4);  // 25.12. Freitag, 26.12. Samstag
});

test("Tagessatz aus BGL-Grundlage und Miete je Baustelle", () => {
  const grundlagen = { geraete: [{ id: 5, bez: "Bagger 14 t", neuwert: 170000, avProzent: 2.5, repProzent: 1.6, stundenJeMonat: 170, verbrauchJeH: 9, betriebsstoffPreis: 1.6 }] };
  const bagger = { id: 1, bezeichnung: "Bagger", grundlage_id: 5, stunden_je_tag: 8, einsaetze: [
    { projekt_id: 7, von: "2026-11-02", bis: "2026-11-06" }, { projekt_id: 9, von: "2026-11-09", bis: null }] };
  const satz = tagessatz(bagger, grundlagen); // (170000×4,1 %/170 + 14,40) × 8
  assert.equal(satz, Math.round((41 + 14.4) * 8 * 100) / 100);
  const z = mieteJeBaustelle([bagger, { id: 2, tagessatz: 35, einsaetze: [{ projekt_id: 7, von: "2026-11-05", bis: null }] }], grundlagen, { von: "2026-11-01", bis: "2026-11-12" });
  const je = Object.fromEntries(z.map(x => [`${x.geraet_id}-${x.projekt_id}`, x.tage]));
  assert.deepEqual(je, { "1-7": 5, "1-9": 4, "2-7": 6 });
  assert.equal(summeMiete(z.filter(x => x.projekt_id === 7)), Math.round((5 * satz + 6 * 35) * 100) / 100);
});
