// Test für die Zuschlagskalkulation (lib/kalkulation.js): Einzelkosten aus
// Lohn-/Material-/Geräte-Posten + Fremdleistung, je Kostenart ein eigener
// Zuschlagssatz, daraus abgeleiteter EP. Inkl. Rückwärtskompatibilität zum
// alten, vor der Kostenarten-Aufschlüsselung gespeicherten Schema (drei
// additive, für die ganze Position geltende Sätze).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leereKalkulation, kalkulationAufschluesselung, kalkulationEinzelkosten,
  kalkulationZuschlagProzent, kalkulationZuschlagProzentJeKostenart,
  kalkulationGesamtkosten, kalkulationEp, kalkulationSollAufschluesselung,
} from "./kalkulation.js";

const stammdaten = [
  { id: 1, kategorie: "lohn",     bezeichnung: "Facharbeiter", einheit: "h",  preis: 45 },
  { id: 2, kategorie: "material", bezeichnung: "Zement",       einheit: "kg", preis: 0.2 },
  { id: 3, kategorie: "geraet",   bezeichnung: "Bagger 5t",     einheit: "h",  preis: 60 },
];

// Kalkulation mit eigenem Zuschlagssatz je Kostenart (aktuelles Schema) —
// gegen die echte Referenzkalkulation (Kaufland Freiberg Bebelplatz 2)
// angelehnte Größenordnung: Lohn deutlich höher bezuschlagt als Fremdleistung.
const kalk = {
  ...leereKalkulation(),
  lohnposten:     [{ stammId: 1, menge: 10 }],  // 10h × 45 = 450
  materialposten: [{ stammId: 2, menge: 500 }], // 500kg × 0.2 = 100
  geraetPosten:   [{ stammId: 3, menge: 2 }],   // 2h × 60 = 120
  fremdleistung: 30,
  zuschlagLohn: 35, zuschlagMaterial: 25, zuschlagGeraet: 25, zuschlagFremdleistung: 15,
};

// Simuliert einen vor dieser Änderung gespeicherten Angebots-Datensatz: nur
// die drei alten, additiven Felder, OHNE die neuen Kostenarten-Felder (die
// gab es in dem Schema noch nicht) — bewusst nicht über leereKalkulation()
// gebaut, da das inzwischen die neuen Felder (mit 0) mitliefern würde und so
// einen in der Praxis nie vorkommenden Mischzustand simulieren würde.
const kalkLegacy = {
  lohnposten:     [{ stammId: 1, menge: 10 }],
  materialposten: [{ stammId: 2, menge: 500 }],
  geraetPosten:   [{ stammId: 3, menge: 2 }],
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

test("kalkulationZuschlagProzentJeKostenart liest den eigenen Satz je Kostenart", () => {
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalk, "lohn"), 35);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalk, "material"), 25);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalk, "geraet"), 25);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalk, "fremdleistung"), 15);
});

test("kalkulationGesamtkosten wendet je Kostenart ihren eigenen Zuschlag an und summiert", () => {
  // 450×1,35 + 100×1,25 + 120×1,25 + 30×1,15 = 607,50 + 125 + 150 + 34,50
  assert.equal(kalkulationGesamtkosten(kalk, stammdaten), 917);
});

test("kalkulationZuschlagProzent liefert den gewichteten Gesamtsatz über alle Kostenarten", () => {
  // (917 / 700 - 1) × 100
  assert.ok(Math.abs(kalkulationZuschlagProzent(kalk, stammdaten) - 31) < 0.01);
});

test("kalkulationEp teilt die Gesamtkosten durch die Positionsmenge", () => {
  assert.equal(kalkulationEp(kalk, stammdaten, 10), 91.7); // 917 / 10
});

test("kalkulationEp liefert 0 statt Division durch 0 bei Menge 0", () => {
  assert.equal(kalkulationEp(kalk, stammdaten, 0), 0);
});

test("ein unbekannter stammId wird als 0 € gewertet statt den Test abzubrechen", () => {
  const kalkMitUnbekannt = { ...leereKalkulation(), lohnposten: [{ stammId: 999, menge: 5 }] };
  assert.equal(kalkulationEinzelkosten(kalkMitUnbekannt, stammdaten), 0);
});

test("Rückwärtskompatibilität: ohne eigene Kostenarten-Felder gilt die Summe der alten drei Sätze für jede Kostenart", () => {
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkLegacy, "lohn"), 20);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkLegacy, "material"), 20);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkLegacy, "geraet"), 20);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkLegacy, "fremdleistung"), 20);
});

test("Rückwärtskompatibilität: ein vor der Kostenarten-Aufschlüsselung gespeichertes Angebot rechnet exakt wie vorher (ein gemeinsamer Satz von 20% auf alle Einzelkosten)", () => {
  assert.equal(kalkulationGesamtkosten(kalkLegacy, stammdaten), 840); // 700 × 1,20
  assert.ok(Math.abs(kalkulationZuschlagProzent(kalkLegacy, stammdaten) - 20) < 1e-9);
});

test("kalkulationSollAufschluesselung summiert über mehrere Angebote und Positionen, ignoriert Positionen ohne Kalkulationsschema", () => {
  const angebote = [
    { positionen: [
      { kalk: kalkLegacy, menge: 10 },                      // Gesamtkosten 840 (siehe oben)
      { ep: 100, menge: 5 },                                  // kein kalk -> ignoriert
    ] },
    { positionen: [
      { kalk: { ...leereKalkulation(), lohnposten: [{ stammId: 1, menge: 2 }] }, menge: 1 }, // 90 Lohn, 0% Zuschlag
    ] },
  ];
  const soll = kalkulationSollAufschluesselung(angebote, stammdaten);
  assert.equal(soll.lohn, 450 + 90);
  assert.equal(soll.material, 100);
  assert.equal(soll.geraet, 120);
  assert.equal(soll.fremdleistung, 30);
  assert.equal(soll.zuschlag, 140); // 840 - 700, zweites Angebot hat 0% Zuschlag
});
