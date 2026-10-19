// Test für die Rechnungsstellung nach Baufortschritt (lib/rechnung.js):
// Leistungsstand je Position -> Snapshot -> Rechnungsbetrag als Differenz
// zur vorherigen Rechnung -> MwSt/Sicherheitseinbehalt.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kumulierterWert, positionenMitLeistungsstand, gesamtFortschritt,
  snapshotErstellen, rechnungsbetragNetto, rechnungGesamt, naechsteRechnungsnummer,
} from "./rechnung.js";

const positionen = [
  { id: 1, bez: "── Titel 1 ──", einheit: "", menge: 0, ep: 0 }, // Gruppenkopfzeile, kein Leistungsstand
  { id: 2, bez: "Baustelle einrichten", einheit: "Psch", menge: 1,  ep: 4482 },
  { id: 3, bez: "Fugenfüllung entfernen", einheit: "m",  menge: 65, ep: 12.46 },
];

test("positionenMitLeistungsstand filtert Gruppenkopfzeilen heraus und ordnet den Prozentsatz nach position_id zu", () => {
  const baufortschritt = [{ position_id: 2, prozent: 50 }, { position_id: 3, prozent: 100 }];
  const mit = positionenMitLeistungsstand(positionen, baufortschritt);
  assert.equal(mit.length, 2);
  assert.equal(mit.find(p => p.id === 2).prozent, 50);
  assert.equal(mit.find(p => p.id === 3).prozent, 100);
});

test("positionenMitLeistungsstand liefert 0% für Positionen ohne Baufortschritt-Eintrag", () => {
  const mit = positionenMitLeistungsstand(positionen, []);
  assert.ok(mit.every(p => p.prozent === 0));
});

test("kumulierterWert = Menge × EP × Prozent/100", () => {
  assert.ok(Math.abs(kumulierterWert({ menge: 65, ep: 12.46 }, 50) - 404.95) < 1e-9);
  assert.equal(kumulierterWert({ menge: 65, ep: 12.46 }, 0), 0);
});

test("gesamtFortschritt ist wertgewichtet über alle Positionen", () => {
  // Position 2: 4482 Gesamtwert, 50% fertig -> 2241 erbracht
  // Position 3: 809.9 Gesamtwert, 100% fertig -> 809.9 erbracht
  const mit = positionenMitLeistungsstand(positionen, [{ position_id: 2, prozent: 50 }, { position_id: 3, prozent: 100 }]);
  const fortschritt = gesamtFortschritt(mit);
  const erwartet = (2241 + 809.9) / (4482 + 809.9) * 100;
  assert.ok(Math.abs(fortschritt - erwartet) < 1e-9);
});

test("snapshotErstellen friert Menge/EP/Prozent + kumulierten Wert ein", () => {
  const mit = positionenMitLeistungsstand(positionen, [{ position_id: 2, prozent: 50 }]);
  const snap = snapshotErstellen(mit);
  const p2 = snap.find(p => p.id === 2);
  assert.equal(p2.prozent, 50);
  assert.equal(p2.kumuliert, 2241);
  const p3 = snap.find(p => p.id === 3);
  assert.equal(p3.prozent, 0);
  assert.equal(p3.kumuliert, 0);
});

test("snapshotErstellen mit schluss:true erzwingt 100% unabhängig vom erfassten Leistungsstand", () => {
  const mit = positionenMitLeistungsstand(positionen, [{ position_id: 2, prozent: 50 }]);
  const snap = snapshotErstellen(mit, { schluss: true });
  assert.ok(snap.every(p => p.prozent === 100));
  assert.equal(snap.find(p => p.id === 2).kumuliert, 4482);
});

test("rechnungsbetragNetto ohne vorherige Rechnung entspricht dem vollen kumulierten Wert", () => {
  const mit = positionenMitLeistungsstand(positionen, [{ position_id: 2, prozent: 50 }]);
  const snap = snapshotErstellen(mit);
  assert.equal(rechnungsbetragNetto(snap, null), 2241);
});

test("rechnungsbetragNetto zieht den kumulierten Wert der vorherigen Rechnung ab (nur der Fortschritt seitdem wird bezahlt)", () => {
  const ersteRechnung = { positionen_snapshot: snapshotErstellen(positionenMitLeistungsstand(positionen, [{ position_id: 2, prozent: 50 }])) };
  // Fortschritt seit der ersten Rechnung: Position 2 jetzt 80% statt 50%
  const mitNeuemStand = positionenMitLeistungsstand(positionen, [{ position_id: 2, prozent: 80 }]);
  const zweitesSnapshot = snapshotErstellen(mitNeuemStand);
  // 4482 × 0,80 − 4482 × 0,50 = 1344,60
  assert.ok(Math.abs(rechnungsbetragNetto(zweitesSnapshot, ersteRechnung) - 1344.60) < 1e-9);
});

test("rechnungsbetragNetto ignoriert Positionen, die in der vorherigen Rechnung noch nicht vorkamen (als neu hinzugekommen, voller Wert zählt)", () => {
  const vorherige = { positionen_snapshot: [{ id: 2, kumuliert: 2241 }] }; // Position 3 war noch nicht dabei
  const mit = positionenMitLeistungsstand(positionen, [{ position_id: 2, prozent: 50 }, { position_id: 3, prozent: 100 }]);
  const snap = snapshotErstellen(mit);
  // Position 2 unverändert (2241-2241=0), Position 3 komplett neu (809,9-0=809,9)
  assert.ok(Math.abs(rechnungsbetragNetto(snap, vorherige) - 809.9) < 1e-9);
});

test("rechnungGesamt: MwSt auf den vollen Netto-Betrag, Sicherheitseinbehalt auf den Brutto-Betrag", () => {
  const g = rechnungGesamt(1000, { sicherheitseinbehaltProzent: 5, mwstProzent: 19 });
  assert.equal(g.mwstBetrag, 190);
  assert.equal(g.bruttoBetrag, 1190);
  assert.equal(g.einbehalt, 59.5); // 5% von 1190
  assert.equal(g.zahlbetrag, 1130.5);
});

test("rechnungGesamt ohne Sicherheitseinbehalt: Zahlbetrag = Bruttobetrag", () => {
  const g = rechnungGesamt(1000, { mwstProzent: 19 });
  assert.equal(g.einbehalt, 0);
  assert.equal(g.zahlbetrag, g.bruttoBetrag);
});

test("naechsteRechnungsnummer zählt pro Auftrag hoch, Jahr aus dem Rechnungsdatum", () => {
  assert.equal(naechsteRechnungsnummer([], "2026-03-15"), "2026-001");
  assert.equal(naechsteRechnungsnummer([{}, {}], "2026-03-15"), "2026-003");
});
