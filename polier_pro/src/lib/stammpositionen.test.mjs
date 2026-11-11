import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stammpositionKalk, stammpositionEp, stammpositionZeitansatz,
  positionAusStammposition, positionMengeAendern,
} from "./stammpositionen.js";
import { kalkulationGesamtkosten, kalkulationEp } from "./kalkulation.js";
import { katalogBauen, katalogSuchen, aehnlichkeit, einheitNormalisieren } from "./katalog.js";

const kalkulationspreise = [
  { id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 48 },
  { id: 2, kategorie: "material", bezeichnung: "XPS-Platte 120 mm", einheit: "m²", preis: 18 },
  { id: 3, kategorie: "geraet", bezeichnung: "Rüttelplatte", einheit: "h", preis: 12 },
  { id: 4, kategorie: "fremdleistung", bezeichnung: "Entsorgung NU", einheit: "t", preis: 90 },
];
const zuschlaege = { zuschlagLohn: 35, zuschlagMaterial: 25, zuschlagGeraet: 25, zuschlagFremdleistung: 15 };
const daemmung = {
  id: 10, bez: "Perimeterdämmung XPS 120 mm", einheit: "m²", gewerk: "Abdichtung",
  rezeptur: [
    { stammId: 1, mengeJeEinheit: 0.25 },
    { stammId: 2, mengeJeEinheit: 1.05 },
    { stammId: 3, mengeJeEinheit: 0.02 },
  ],
  fremdleistungJeEinheit: 0,
};

test("EP je Einheit = Rezeptur × Preise × (1 + Zuschlag je Kostenart)", () => {
  // Lohn 0,25×48=12 → 16,20 | Material 1,05×18=18,90 → 23,625 | Gerät 0,02×12=0,24 → 0,30
  assert.equal(stammpositionEp(daemmung, kalkulationspreise, zuschlaege), 40.13);
});

test("EP ist unabhängig von der Positionsmenge (lineare Rezeptur)", () => {
  const kalk = stammpositionKalk(daemmung, 120, kalkulationspreise, zuschlaege);
  assert.equal(Math.round(kalkulationEp(kalk, kalkulationspreise, 120) * 100) / 100, 40.13);
  assert.equal(kalk.lohnposten[0].menge, 30);
  assert.equal(kalk.materialposten[0].menge, 126);
});

test("Fremdleistung aus Rezeptur und je Einheit landet im Fremdleistungsbetrag", () => {
  const sp = { ...daemmung, rezeptur: [{ stammId: 4, mengeJeEinheit: 0.1 }], fremdleistungJeEinheit: 5 };
  const kalk = stammpositionKalk(sp, 10, kalkulationspreise, zuschlaege);
  assert.equal(kalk.fremdleistung, 140); // 0,1 t × 10 × 90 + 5 × 10
  assert.equal(kalkulationGesamtkosten(kalk, kalkulationspreise), 161);
});

test("Gelöschter Kalkulationspreis in der Rezeptur wird übersprungen", () => {
  const sp = { ...daemmung, rezeptur: [...daemmung.rezeptur, { stammId: 999, mengeJeEinheit: 3 }] };
  assert.equal(stammpositionEp(sp, kalkulationspreise, zuschlaege), 40.13);
});

test("Zeitansatz zählt nur Lohnstunden", () => {
  assert.equal(stammpositionZeitansatz(daemmung, kalkulationspreise), 0.25);
});

test("Mengenänderung rechnet die Rezeptur neu hoch und behält Positions-Zuschläge", () => {
  const pos = positionAusStammposition(daemmung, 10, kalkulationspreise, zuschlaege);
  const angepasst = { ...pos, kalk: { ...pos.kalk, zuschlagLohn: 50 } };
  const neu = positionMengeAendern(angepasst, 40, [daemmung], kalkulationspreise);
  assert.equal(neu.menge, 40);
  assert.equal(neu.kalk.lohnposten[0].menge, 10);
  assert.equal(neu.kalk.zuschlagLohn, 50);
  // EP bleibt je Einheit gleich (nur Lohnzuschlag geändert: 12×1,5=18 statt 16,20)
  assert.equal(Math.round(neu.ep * 100) / 100, 41.93);
});

test("Mengenänderung ohne Stammposition gibt null zurück", () => {
  assert.equal(positionMengeAendern({ menge: 1, ep: 5 }, 2, [daemmung], kalkulationspreise), null);
});

test("Einheiten-Aliase werden vereinheitlicht", () => {
  assert.equal(einheitNormalisieren("qm"), "m2");
  assert.equal(einheitNormalisieren("m²"), "m2");
  assert.equal(einheitNormalisieren("Psch"), "psch");
  assert.equal(einheitNormalisieren("pau"), "psch");
});

test("Ähnlichkeit erkennt Wortbestandteile in Komposita", () => {
  assert.ok(aehnlichkeit("Dämmung XPS", "Perimeterdämmung XPS 120 mm") >= 0.99);
  assert.equal(aehnlichkeit("Bewehrung", "Perimeterdämmung XPS"), 0);
});

test("Katalog verbindet alle Quellen und sortiert Stammpositionen bei Gleichstand nach vorn", () => {
  const katalog = katalogBauen({
    stammpositionen: [daemmung],
    einheitspreise: [{ id: 5, gewerk: "Abdichtung", beschreibung: "Perimeterdämmung XPS", einheit: "m²", preis: 45 }],
    lvVorlagen: [{ id: 7, name: "Kaufland", positionen: [
      { id: 1, bez: "Perimeterdämmung XPS 100 mm", einheit: "m2", ep: 38 },
      { id: 2, bez: "── Titel", ep: 0 },
      { id: 3, bez: "Nebenleistung", ep: 0 },
    ] }],
    kalkulationspreise, standardZuschlaege: zuschlaege,
  });
  assert.equal(katalog.length, 3);
  const treffer = katalogSuchen(katalog, "Perimeterdämmung XPS", { einheit: "m²" });
  assert.equal(treffer[0].ref, "SP:10");
  assert.equal(treffer[0].ep, 40.13);
  assert.deepEqual(treffer.map(t => t.quelle).sort(), ["einheitspreis", "mutter_lv", "stammposition"]);
});
