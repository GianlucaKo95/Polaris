// Test für die Zuschlagskalkulation (lib/kalkulation.js): Einzelkosten aus
// Lohn-/Material-/Geräte-Posten + Fremdleistung, additive Zuschläge
// (Gemeinkosten/Wagnis/Gewinn), daraus abgeleiteter EP.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leereKalkulation, kalkulationAufschluesselung, kalkulationEinzelkosten,
  kalkulationZuschlagProzent, kalkulationGesamtkosten, kalkulationEp,
  kalkulationSollAufschluesselung,
} from "./kalkulation.js";

const stammdaten = [
  { id: 1, kategorie: "lohn",     bezeichnung: "Facharbeiter", einheit: "h",  preis: 45 },
  { id: 2, kategorie: "material", bezeichnung: "Zement",       einheit: "kg", preis: 0.2 },
  { id: 3, kategorie: "geraet",   bezeichnung: "Bagger 5t",     einheit: "h",  preis: 60 },
];

const kalk = {
  ...leereKalkulation(),
  lohnposten:     [{ stammId: 1, menge: 10 }],  // 10h × 45 = 450
  materialposten: [{ stammId: 2, menge: 500 }], // 500kg × 0.2 = 100
  geraetPosten:   [{ stammId: 3, menge: 2 }],   // 2h × 60 = 120
  fremdleistung: 30,
  zuschlagGemeinkosten: 10, zuschlagWagnis: 2, zuschlagGewinn: 8,
};

test("kalkulationAufschluesselung summiert Posten je Kostenart korrekt", () => {
  const a = kalkulationAufschluesselung(kalk, stammdaten);
  assert.equal(a.lohn, 450);
  assert.equal(a.material, 100);
  assert.equal(a.geraet, 120);
  assert.equal(a.fremdleistung, 30);
});

test("kalkulationEinzelkosten summiert alle Kostenarten", () => {
  assert.equal(kalkulationEinzelkosten(kalk, stammdaten), 700);
});

test("kalkulationZuschlagProzent summiert die drei Zuschlagssätze additiv", () => {
  assert.equal(kalkulationZuschlagProzent(kalk), 20);
});

test("kalkulationGesamtkosten wendet den Zuschlag auf die Einzelkosten an", () => {
  assert.equal(kalkulationGesamtkosten(kalk, stammdaten), 840); // 700 × 1.20
});

test("kalkulationEp teilt die Gesamtkosten durch die Positionsmenge", () => {
  assert.equal(kalkulationEp(kalk, stammdaten, 10), 84); // 840 / 10
});

test("kalkulationEp liefert 0 statt Division durch 0 bei Menge 0", () => {
  assert.equal(kalkulationEp(kalk, stammdaten, 0), 0);
});

test("ein unbekannter stammId wird als 0 € gewertet statt den Test abzubrechen", () => {
  const kalkMitUnbekannt = { ...leereKalkulation(), lohnposten: [{ stammId: 999, menge: 5 }] };
  assert.equal(kalkulationEinzelkosten(kalkMitUnbekannt, stammdaten), 0);
});

test("kalkulationSollAufschluesselung summiert über mehrere Angebote und Positionen, ignoriert Positionen ohne Kalkulationsschema", () => {
  const angebote = [
    { positionen: [
      { kalk, menge: 10 },                                  // Gesamtkosten 840 (siehe oben)
      { ep: 100, menge: 5 },                                  // kein kalk -> ignoriert
    ] },
    { positionen: [
      { kalk: { ...leereKalkulation(), lohnposten: [{ stammId: 1, menge: 2 }] }, menge: 1 }, // 90 Lohn, kein Zuschlag
    ] },
  ];
  const soll = kalkulationSollAufschluesselung(angebote, stammdaten);
  assert.equal(soll.lohn, 450 + 90);
  assert.equal(soll.material, 100);
  assert.equal(soll.geraet, 120);
  assert.equal(soll.fremdleistung, 30);
  assert.equal(soll.zuschlag, 140); // 840 - 700, zweites Angebot hat 0% Zuschlag
});
