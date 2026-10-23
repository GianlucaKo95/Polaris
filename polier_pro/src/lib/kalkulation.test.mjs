// Test für die Zuschlagskalkulation (lib/kalkulation.js): Einzelkosten aus
// Lohn-/Material-/Geräte-Posten + Fremdleistung, je Kostenart ein eigener
// Zuschlagssatz, selbst granular in BGK/AGK/WuG gegliedert, daraus
// abgeleiteter EP. Inkl. Rückwärtskompatibilität zu den beiden älteren
// Schemata: (1) ein eigener, aber noch nicht granularer Satz je Kostenart,
// (2) drei additive, für die ganze Position geltende Sätze (vor der
// Kostenarten-Aufschlüsselung überhaupt).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leereKalkulation, kalkulationAufschluesselung, kalkulationEinzelkosten,
  kalkulationZuschlagProzent, kalkulationZuschlagProzentJeKostenart,
  kalkulationZuschlagKomponenten, zuschlagFeldName,
  kalkulationGesamtkosten, kalkulationEp, kalkulationSollAufschluesselung,
} from "./kalkulation.js";

const stammdaten = [
  { id: 1, kategorie: "lohn",     bezeichnung: "Facharbeiter", einheit: "h",  preis: 45 },
  { id: 2, kategorie: "material", bezeichnung: "Zement",       einheit: "kg", preis: 0.2 },
  { id: 3, kategorie: "geraet",   bezeichnung: "Bagger 5t",     einheit: "h",  preis: 60 },
];

// Kalkulation mit granularem BGK/AGK/WuG-Zuschlag je Kostenart (aktuelles
// Schema) — Summen je Kostenart (35/25/25/15 %) an die echte Referenz-
// kalkulation (Kaufland Freiberg Bebelplatz 2) angelehnt: Lohn deutlich
// höher bezuschlagt als Fremdleistung.
const kalk = {
  ...leereKalkulation(),
  lohnposten:     [{ stammId: 1, menge: 10 }],  // 10h × 45 = 450
  materialposten: [{ stammId: 2, menge: 500 }], // 500kg × 0.2 = 100
  geraetPosten:   [{ stammId: 3, menge: 2 }],   // 2h × 60 = 120
  fremdleistung: 30,
  zuschlagLohnBgk: 10, zuschlagLohnAgk: 10, zuschlagLohnWg: 15,                           // Summe 35
  zuschlagMaterialBgk: 8, zuschlagMaterialAgk: 8, zuschlagMaterialWg: 9,                  // Summe 25
  zuschlagGeraetBgk: 8, zuschlagGeraetAgk: 8, zuschlagGeraetWg: 9,                        // Summe 25
  zuschlagFremdleistungBgk: 5, zuschlagFremdleistungAgk: 5, zuschlagFremdleistungWg: 5,   // Summe 15
};

// Simuliert einen Angebots-Datensatz aus der mittleren Schema-Generation:
// eigener Satz je Kostenart, aber noch OHNE die granularen BGK/AGK/WuG-
// Felder (die gab es in dem Schema noch nicht) — bewusst nicht über
// leereKalkulation() gebaut, da das inzwischen die granularen Felder (mit 0)
// mitliefern und so einen in der Praxis nie vorkommenden Mischzustand
// simulieren würde.
const kalkMittel = {
  lohnposten:     [{ stammId: 1, menge: 10 }],
  materialposten: [{ stammId: 2, menge: 500 }],
  geraetPosten:   [{ stammId: 3, menge: 2 }],
  fremdleistung: 30,
  zuschlagLohn: 35, zuschlagMaterial: 25, zuschlagGeraet: 25, zuschlagFremdleistung: 15,
};

// Simuliert einen noch älteren Angebots-Datensatz: nur die drei ältesten,
// additiven Felder, OHNE jegliche Kostenarten-Aufschlüsselung — aus
// demselben Grund wie oben nicht über leereKalkulation() gebaut.
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

test("kalkulationZuschlagKomponenten liefert BGK/AGK/WuG einzeln je Kostenart", () => {
  assert.deepEqual(kalkulationZuschlagKomponenten(kalk, "lohn"), { bgk: 10, agk: 10, wg: 15 });
  assert.deepEqual(kalkulationZuschlagKomponenten(kalk, "fremdleistung"), { bgk: 5, agk: 5, wg: 5 });
});

test("kalkulationZuschlagProzentJeKostenart summiert die granularen BGK/AGK/WuG-Sätze je Kostenart", () => {
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalk, "lohn"), 35);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalk, "material"), 25);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalk, "geraet"), 25);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalk, "fremdleistung"), 15);
});

test("kalkulationGesamtkosten wendet je Kostenart ihren eigenen (granularen) Zuschlag an und summiert", () => {
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

test("zuschlagFeldName baut den Feldnamen aus Kostenart + Komponente", () => {
  assert.equal(zuschlagFeldName("fremdleistung", "bgk"), "zuschlagFremdleistungBgk");
  assert.equal(zuschlagFeldName("lohn", "wg"), "zuschlagLohnWg");
});

test("leereKalkulation() ohne Firmenschema liefert 0% bei allen Zuschlagskomponenten", () => {
  const leer = leereKalkulation();
  assert.equal(leer.zuschlagLohnBgk, 0);
  assert.equal(leer.zuschlagFremdleistungWg, 0);
});

test("leereKalkulation(standardZuschlaege) übernimmt das firmenweite Zuschlagsschema als Default", () => {
  const standard = { zuschlagLohnBgk: 10, zuschlagLohnAgk: 10, zuschlagLohnWg: 15, zuschlagFremdleistungBgk: 5 };
  const vorbefuellt = leereKalkulation(standard);
  assert.equal(vorbefuellt.zuschlagLohnBgk, 10);
  assert.equal(vorbefuellt.zuschlagLohnWg, 15);
  assert.equal(vorbefuellt.zuschlagFremdleistungBgk, 5);
  assert.equal(vorbefuellt.zuschlagFremdleistungAgk, 0); // im Schema nicht hinterlegt -> 0, nicht geraten
});

test("Rückwärtskompatibilität (mittlere Generation): ohne granulare BGK/AGK/WuG-Felder gilt der alte, einheitliche Satz je Kostenart", () => {
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkMittel, "lohn"), 35);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkMittel, "material"), 25);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkMittel, "geraet"), 25);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkMittel, "fremdleistung"), 15);
  assert.equal(kalkulationGesamtkosten(kalkMittel, stammdaten), 917); // identisch zur granularen Kalkulation oben
});

test("Rückwärtskompatibilität (älteste Generation): ohne eigene Kostenarten-Felder gilt die Summe der alten drei Sätze für jede Kostenart", () => {
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkLegacy, "lohn"), 20);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkLegacy, "material"), 20);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkLegacy, "geraet"), 20);
  assert.equal(kalkulationZuschlagProzentJeKostenart(kalkLegacy, "fremdleistung"), 20);
});

test("Rückwärtskompatibilität (älteste Generation): ein vor der Kostenarten-Aufschlüsselung gespeichertes Angebot rechnet exakt wie vorher (ein gemeinsamer Satz von 20% auf alle Einzelkosten)", () => {
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
