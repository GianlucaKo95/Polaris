import { test } from "node:test";
import assert from "node:assert/strict";
import { mittellohnBerechnen, geraetekostenJeStunde, kalkulationspreiseAbleiten } from "./kalkulationsgrundlagen.js";

const ml = { lohngruppen: [{ bez: "Vorarbeiter", anzahl: 1, stundenlohn: 26 }, { bez: "Facharbeiter", anzahl: 3, stundenlohn: 22 }],
  zulagen: 0.5, sozialkostenProzent: 90, lohnnebenkosten: 1.5 };

test("Mittellohn → Kalkulationslohn", () => {
  const r = mittellohnBerechnen(ml);
  assert.equal(r.durchschnitt, 23);
  assert.equal(r.mittellohn, 23.5);
  assert.equal(r.sozialkosten, 21.15);
  assert.equal(r.kalkulationslohn, 46.15);
});

test("Gerätekosten nach BGL-Schema", () => {
  // 120.000 × (2,4 % + 1,6 %) / 170 = 28,24 €/h + 8 l × 1,60 € = 12,80
  const r = geraetekostenJeStunde({ neuwert: 120000, avProzent: 2.4, repProzent: 1.6, stundenJeMonat: 170, verbrauchJeH: 8, betriebsstoffPreis: 1.6 });
  assert.equal(r.vorhaltung, 28.24);
  assert.equal(r.betriebsstoff, 12.8);
  assert.equal(r.gesamt, 41.04);
});

test("Abgeleitete Kalkulationspreise behalten ihre ID und lassen manuelle Preise in Ruhe", () => {
  const manuell = { id: 1, kategorie: "material", bezeichnung: "Beton", einheit: "m³", preis: 140 };
  const g = { id: "g1", bez: "Bagger 14 t", neuwert: 120000, avProzent: 2.4, repProzent: 1.6, stundenJeMonat: 170 };
  const erst = kalkulationspreiseAbleiten([manuell], { mittellohn: ml, geraete: [g] });
  assert.equal(erst.length, 3);
  const mlId = erst.find(k => k.herkunft?.typ === "mittellohn").id;
  const zweit = kalkulationspreiseAbleiten(erst, { mittellohn: { ...ml, zulagen: 1.5 }, geraete: [] });
  assert.equal(zweit.length, 2);
  const mlNeu = zweit.find(k => k.herkunft?.typ === "mittellohn");
  assert.equal(mlNeu.id, mlId);
  assert.equal(mlNeu.preis, 48.05);
  assert.deepEqual(zweit[0], manuell);
});
