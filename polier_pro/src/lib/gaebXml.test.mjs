// Regressionstest für den GAEB-DA-XML-Parser (X83, DP=83) gegen eine echte
// Beispieldatei (Kaufland Freiberg Bebelplatz 2, Projekt 2025-074 — dieselbe
// Baumaßnahme wie die D84-Preisdatei in gaeb90.test.mjs). AVANTI pro 2024 /
// GXML Toolbox V3.3, 52 Positionen über 3 Gewerke/10 Titel, 11 Vorbemerkungs-
// /Zwischentexte. Läuft über Node's eingebauten Testrunner: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseGaebXml } from "./gaebXml.js";
import { gaeb90ZuPositionen, gaeb90PreiseEinspielen, parseGaeb90Preise } from "./gaeb90.js";

const hier = dirname(fileURLToPath(import.meta.url));
// GAEB-DA-XML ist UTF-8 — anders als die ANSI/Windows-1252-Beispieldateien
// der anderen Tests in diesem Verzeichnis.
const beispielDatei = readFileSync(join(hier, "__fixtures__", "gaeb-xml-sample.X83"), "utf-8");
const beispielDateiD84 = readFileSync(join(hier, "__fixtures__", "gaeb-priced-sample.D84"), "latin1");

test("parseGaebXml liest alle 52 Positionen und 11 Vorbemerkungs-/Zwischentexte der echten X83-Datei ohne Warnungen", () => {
  const { positionen, warnungen } = parseGaebXml(beispielDatei);
  assert.equal(warnungen.length, 0);
  assert.equal(positionen.filter(p => p.typ === "position").length, 52);
  assert.equal(positionen.filter(p => p.typ === "hinweis").length, 11);
});

test("parseGaebXml erkennt Projekttitel aus PrjInfo/LblPrj", () => {
  const { projektTitel } = parseGaebXml(beispielDatei);
  assert.equal(projektTitel, "KL Freiberg, Bebelplatz, part. Inst. Parkdeck");
});

test("parseGaebXml setzt die Ordnungszahl aus Gewerk/Titel/Item-RNoPart zusammen (kompatibel zum D84-OZ-Format)", () => {
  const { positionen } = parseGaebXml(beispielDatei);
  const erste = positionen.find(p => p.oz === "01.01.0010");
  assert.ok(erste);
  assert.equal(erste.titelPfad, "T01: Allgemein / T0101: Baustelleneinrichtung");
  assert.equal(erste.menge, 1);
  assert.equal(erste.einheit, "Psch");
});

test("parseGaebXml extrahiert Langtext aus dem p/span-Markup als reinen Fließtext", () => {
  const { positionen } = parseGaebXml(beispielDatei);
  const pos = positionen.find(p => p.oz === "01.01.0010");
  assert.match(pos.bez, /^Geräte, Werkzeuge und sonstige Betriebsmittel/);
  assert.ok(!pos.bez.includes("<"), "Markup darf nicht im Text verbleiben");
});

test("parseGaebXml markiert Bedarfspositionen (Provis-Feld) wie parseGaeb90 die Positionsart", () => {
  const { positionen } = parseGaebXml(beispielDatei);
  const arten = positionen.filter(p => p.typ === "position").map(p => p.art).filter(Boolean);
  assert.ok(arten.includes("Bedarfsposition"));
  assert.ok(arten.includes("Bedarfsposition (nicht in Angebotssumme enthalten)"));
});

test("gaeb90ZuPositionen wandelt das X83-Parse-Ergebnis in das AngebotEditor-Positionenformat um", () => {
  const { positionen } = parseGaebXml(beispielDatei);
  const uiPositionen = gaeb90ZuPositionen({ positionen });
  assert.ok(uiPositionen.length > 52); // inkl. Gruppenkopfzeilen
  const erste = uiPositionen.find(p => p.oz === "01.01.0010");
  assert.ok(erste);
  assert.equal(erste.ep, 0);
});

test("Mengen aus dem X83-Import stimmen mit der aus dem echten D84 zurückgerechneten Menge überein (Cross-Check zweier unabhängiger Dateien desselben Projekts)", () => {
  const { positionen } = parseGaebXml(beispielDatei);
  const pos = positionen.find(p => p.oz === "03.02.0040");
  assert.equal(pos.menge, 70);
  assert.equal(pos.einheit, "m2");
  const { preise } = parseGaeb90Preise(beispielDateiD84);
  const preis = preise.find(p => p.oz === "03.02.0040");
  assert.equal(Math.round((preis.gp / preis.ep) * 100) / 100, 70); // 10277.40 / 146.82 = 70
});

test("Ein X83-Import und ein nachträglich eingespieltes D84 teilen sich dieselbe Ordnungszahl — 52 von 54 Preispositionen finden eine passende X83-Position", () => {
  const { positionen } = parseGaebXml(beispielDatei);
  const uiPositionen = gaeb90ZuPositionen({ positionen });
  const { preise } = parseGaeb90Preise(beispielDateiD84);
  const { treffer, fehlend } = gaeb90PreiseEinspielen(uiPositionen, preise);
  // Die 2 fehlenden sind "a"-Zulagevarianten, die nur in der bepreisten D84-
  // Datei als eigene Preiszeile auftauchen, im unbepreisten X83-LV aber nicht
  // als eigene Position existieren — kein Parserfehler, siehe gaeb90.test.mjs.
  assert.equal(treffer, 52);
  assert.equal(fehlend, 2);
});
