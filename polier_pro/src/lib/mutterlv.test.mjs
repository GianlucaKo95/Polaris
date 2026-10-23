// Test für den Mutter-LV-Preisabgleich (lib/mutterlv.js): eine Ausschreibung
// wird gegen zuvor gespeicherte LV-Vorlagen abgeglichen, um automatisch ein
// bepreistes Angebot vorzuschlagen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mutterLvIndexBauen, angebotAusAusschreibungAbgleichen, positionenMitKalkulationVorbereiten } from "./mutterlv.js";
import { kalkulationZuschlagProzentJeKostenart } from "./kalkulation.js";

const mutterLv = {
  id: 1, name: "Parkdeck-Instandsetzung (Referenz)", gewerk: "Rohbau",
  positionen: [
    { id: 1, bez: "── Allgemein ──", einheit: "", menge: 0, ep: 0, rabatt: 0 },
    { id: 2, bez: "Baustelle einrichten Sämtl.LV-Abschn. Zufahrt vorh.", einheit: "Psch", menge: 1, ep: 4482, rabatt: 0, stlk: "1910110711" },
    { id: 3, bez: "[Bedarfsposition] Beweissicherung", einheit: "psch", menge: 1, ep: 355.25, rabatt: 0 },
    { id: 4, bez: "Nebenleistung ohne eigenen Preis", einheit: "Stk", menge: 1, ep: 0, rabatt: 0, stlk: "9999999999" },
  ],
};

// Eine 0,00-€-Position in der Mutter-LV ist trotzdem eine real erbrachte
// Leistung (z.B. im Ursprungsangebot so kalkuliert) und soll als bekannte
// Position gelten statt als "fehlend"/unbekannt — nur echte Gruppenkopfzeilen
// (keine eigene Leistung) bleiben außen vor.
test("mutterLvIndexBauen nimmt auch 0,00-€-Positionen als Treffer auf (reale Leistung, kein Ausschluss nur wegen Preis 0)", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  assert.equal(idx.nachStlk.get("9999999999").ep, 0);
  assert.equal(idx.nachText.get("nebenleistung ohne eigenen preis").ep, 0);
});

test("mutterLvIndexBauen ignoriert Gruppenkopfzeilen (keine eigene Leistung, keine Preisquelle)", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  assert.equal(idx.nachText.has("allgemein"), false);
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

test("angebotAusAusschreibungAbgleichen zählt eine 0,00-€-Mutter-LV-Position als Treffer, nicht als fehlend", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  const ausschreibung = [
    { id: 35, bez: "Nebenleistung – anders formuliert", einheit: "Stk", menge: 1, ep: 0, rabatt: 0, stlk: "9999999999" },
  ];
  const { positionen, treffer, fehlend } = angebotAusAusschreibungAbgleichen(ausschreibung, idx);
  assert.equal(treffer, 1);
  assert.equal(fehlend, 0);
  assert.equal(positionen[0].ep, 0); // Treffer, aber korrekt weiterhin 0 €
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

test("positionenMitKalkulationVorbereiten legt ohne hinterlegtes Zuschlagsschema eine Kalkulation mit 0% Zuschlag an, der EP bleibt unverändert", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  const ausschreibung = [
    { id: 50, bez: "Egal", einheit: "Psch", menge: 2, ep: 0, rabatt: 0, stlk: "1910110711" }, // matcht, ep=4482
  ];
  const { positionen: abgeglichen } = angebotAusAusschreibungAbgleichen(ausschreibung, idx);
  const [pos] = positionenMitKalkulationVorbereiten(abgeglichen);
  assert.ok(pos.kalk, "gematchte Position sollte eine Kalkulation bekommen");
  assert.equal(pos.kalk.fremdleistung, 4482 * 2);
  assert.equal(kalkulationZuschlagProzentJeKostenart(pos.kalk, "fremdleistung"), 0);
  assert.equal(pos.ep, 4482); // unverändert trotz Kalkulation, da Zuschlag 0%
});

test("positionenMitKalkulationVorbereiten wendet das hinterlegte, granulare Standard-Zuschlagsschema automatisch an", () => {
  const idx = mutterLvIndexBauen([mutterLv]);
  const ausschreibung = [
    { id: 51, bez: "Egal", einheit: "Psch", menge: 2, ep: 0, rabatt: 0, stlk: "1910110711" }, // matcht, ep=4482
  ];
  const { positionen: abgeglichen } = angebotAusAusschreibungAbgleichen(ausschreibung, idx);
  const standardZuschlaege = { zuschlagFremdleistungBgk: 5, zuschlagFremdleistungAgk: 5, zuschlagFremdleistungWg: 5 };
  const [pos] = positionenMitKalkulationVorbereiten(abgeglichen, standardZuschlaege);
  assert.equal(kalkulationZuschlagProzentJeKostenart(pos.kalk, "fremdleistung"), 15); // 5+5+5
  assert.equal(pos.ep, 4482 * 1.15); // 15% automatisch angewendet
});

test("positionenMitKalkulationVorbereiten lässt unbepreiste Positionen ohne Kalkulation (keine aufgedrängte leere Kalkulation)", () => {
  const ohneTreffer = [{ id: 60, bez: "Ohne Referenz", einheit: "m2", menge: 10, ep: 0, rabatt: 0 }];
  const [pos] = positionenMitKalkulationVorbereiten(ohneTreffer);
  assert.equal(pos.kalk, undefined);
});

test("positionenMitKalkulationVorbereiten lässt Gruppenkopfzeilen (ep=0 durch menge=0) unangetastet", () => {
  const kopfzeile = [{ id: 70, bez: "── Titel ──", einheit: "", menge: 0, ep: 0, rabatt: 0 }];
  const [pos] = positionenMitKalkulationVorbereiten(kopfzeile);
  assert.equal(pos.kalk, undefined);
});
