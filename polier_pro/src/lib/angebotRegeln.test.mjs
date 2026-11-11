import { test } from "node:test";
import assert from "node:assert/strict";
import { freigabePflicht, angebotNetto } from "./angebotRegeln.js";

const angebot = { rabatt: 0, positionen: [{ menge: 100, ep: 40 }, { menge: 1, ep: 850 }] }; // 4.850 €
const gruen = { zaehler: { rot: 0, gelb: 0, gruen: 2, keine: 0 } };

test("Netto berücksichtigt Positions- und Gesamtrabatt", () => {
  assert.equal(angebotNetto({ rabatt: 10, positionen: [{ menge: 10, ep: 10, rabatt: 50 }] }), 45);
});

test("Unter der Kompetenzgrenze ohne Auffälligkeiten: keine Freigabe nötig", () => {
  const r = freigabePflicht({ angebot, rolle: "polier", regeln: { kompetenzgrenzePolier: 10000 }, pruefung: gruen });
  assert.equal(r.pflicht, false);
});

test("Über der Grenze: Freigabe nötig", () => {
  const r = freigabePflicht({ angebot, rolle: "polier", regeln: { kompetenzgrenzePolier: 4000 }, pruefung: gruen });
  assert.equal(r.pflicht, true);
  assert.match(r.gruende[0], /4\.000,00/);
});

test("Ohne hinterlegte Grenze braucht jedes Angebot die Freigabe", () => {
  assert.equal(freigabePflicht({ angebot, rolle: "polier", regeln: null, pruefung: gruen }).pflicht, true);
});

test("Rote Positionen oder Handpreise erzwingen die Freigabe auch unter der Grenze", () => {
  const regeln = { kompetenzgrenzePolier: 10000 };
  assert.equal(freigabePflicht({ angebot, rolle: "polier", regeln, pruefung: { zaehler: { rot: 1 } } }).pflicht, true);
  const hand = { ...angebot, positionen: [{ menge: 1, ep: 5, preisquelle: { art: "manuell" } }] };
  assert.equal(freigabePflicht({ angebot: hand, rolle: "polier", regeln, pruefung: gruen }).pflicht, true);
  assert.equal(freigabePflicht({ angebot: hand, rolle: "polier", regeln: { ...regeln, manuellePreiseErfordernFreigabe: false }, pruefung: gruen }).pflicht, false);
});

test("GF und Administrator brauchen nie eine Freigabe", () => {
  assert.equal(freigabePflicht({ angebot, rolle: "geschaeftsfuehrer", regeln: null, pruefung: { zaehler: { rot: 3 } } }).pflicht, false);
});
