// Test für den Mutter-LV-Preisabgleich (lib/mutterlv.js): eine Ausschreibung
// wird gegen zuvor gespeicherte LV-Vorlagen abgeglichen, um automatisch ein
// bepreistes Angebot vorzuschlagen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mutterLvIndexBauen, angebotAusAusschreibungAbgleichen } from "./mutterlv.js";

const mutterLv = {
  id: 1, name: "Parkdeck-Instandsetzung (Referenz)", gewerk: "Rohbau",
  positionen: [
    { id: 1, bez: "── Allgemein ──", einheit: "", menge: 0, ep: 0, rabatt: 0 },
    { id: 2, bez: "Baustelle einrichten Sämtl.LV-Abschn. Zufahrt vorh.", einheit: "Psch", menge: 1, ep: 4482, rabatt: 0, stlk: "1910110711" },
    { id: 3, bez: "[Bedarfsposition] Beweissicherung", einheit: "psch", menge: 1, ep: 355.25, rabatt: 0 },
    { id: 4, bez: "Position ohne Preis, nie als Quelle nutzbar", einheit: "Stk", menge: 1, ep: 0, rabatt: 0, stlk: "9999999999" },
  ],
};

test("mutterLvIndexBauen ignoriert unbepreiste Positionen als Preisquelle", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  assert.equal(idx.nachStlk.has("9999999999"), false);
});

test("mutterLvIndexBauen indiziert sowohl StLK als auch normalisierten Text", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  assert.equal(idx.nachStlk.get("1910110711").ep, 4482);
  assert.equal(idx.nachText.get("baustelle einrichten sämtl.lv-abschn. zufahrt vorh.").ep, 4482);
});

test("angebotAusAusschreibungAbgleichen matcht per StLK, auch bei abweichendem Text", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  const ausschreibung = [
    { id: 10, bez: "── Titel ──", einheit: "", menge: 0, ep: 0, rabatt: 0 },
    { id: 11, bez: "Baustelleneinrichtung – komplett anders formuliert", einheit: "Psch", menge: 1, ep: 0, rabatt: 0, stlk: "1910110711" },
  ];
  const { positionen, treffer, gesamt, fehlend } = angebotAusAusschreibungAbgleichen(ausschreibung, idx);
  assert.equal(treffer, 1);
  assert.equal(gesamt, 1); // Gruppenkopfzeile zählt nicht mit
  assert.equal(fehlend, 0);
  assert.equal(positionen.find(p => p.id === 11).ep, 4482);
});

test("angebotAusAusschreibungAbgleichen fällt ohne StLK auf normalisierten Text zurück (GAEB90-Fall)", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  const ausschreibung = [
    // GAEB90 D81/D83 trägt keine Katalognummer — Positionsart-Präfix und
    // Groß-/Kleinschreibung dürfen den Abgleich trotzdem nicht verhindern.
    { id: 20, bez: "[Bedarfsposition] BEWEISSICHERUNG", einheit: "psch", menge: 1, ep: 0, rabatt: 0 },
  ];
  const { positionen, treffer } = angebotAusAusschreibungAbgleichen(ausschreibung, idx);
  assert.equal(treffer, 1);
  assert.equal(positionen[0].ep, 355.25);
});

test("angebotAusAusschreibungAbgleichen lässt Positionen ohne Treffer unbepreist (ep bleibt 0, nie geraten)", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  const ausschreibung = [
    { id: 30, bez: "Völlig neue Leistung ohne Referenz", einheit: "m2", menge: 10, ep: 0, rabatt: 0 },
  ];
  const { positionen, treffer, fehlend } = angebotAusAusschreibungAbgleichen(ausschreibung, idx);
  assert.equal(treffer, 0);
  assert.equal(fehlend, 1);
  assert.equal(positionen[0].ep, 0);
});

test("angebotAusAusschreibungAbgleichen bevorzugt StLK vor Text, falls beide auf unterschiedliche Preise zeigen würden", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  const ausschreibung = [
    // Text matcht zufällig eine andere (hier: keine) Textquelle, StLK ist eindeutig.
    { id: 40, bez: "Beliebiger Text ohne Textquelle", einheit: "Psch", menge: 1, ep: 0, rabatt: 0, stlk: "1910110711" },
  ];
  const { positionen } = angebotAusAusschreibungAbgleichen(ausschreibung, idx);
  assert.equal(positionen[0].ep, 4482);
});
