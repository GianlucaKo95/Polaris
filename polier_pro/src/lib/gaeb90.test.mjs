// Regressionstest für den GAEB90-Parser gegen eine echte Beispieldatei
// (D83, "T&T Datentechnik GmbH"/"Musterprojekt"/ROHBAUARBEITEN, 19
// Positionen über 2 Titel-/4 Untertitelgruppen inkl. Grund-, Alternativ-,
// Bedarfs- und Leitposition mit Unterpositionen). Läuft ohne zusätzliche
// Abhängigkeit über Node's eingebauten Testrunner: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseGaeb90, gaeb90ZuPositionen, gaeb90Schreiben } from "./gaeb90.js";

const hier = dirname(fileURLToPath(import.meta.url));
// Die Datei liegt als ANSI/Windows-1252 vor; die Beispieldatei enthält keine
// Umlaute außerhalb des ASCII-Bereichs (im Sample durchgehend "ue"/"ae"/"oe"
// geschrieben), daher reicht ein einfacher Latin1-Read in Node aus — die
// eigentliche Windows-1252-Dekodierung (gaeb90DateiLesen) läuft nur im
// Browser über TextDecoder und wird hier nicht erneut getestet.
const beispielDatei = readFileSync(join(hier, "__fixtures__", "gaeb-sample.d83"), "latin1");

test("parseGaeb90 liest alle 19 Positionen der Beispieldatei ohne Warnungen", () => {
  const { positionen, warnungen } = parseGaeb90(beispielDatei);
  assert.equal(warnungen.length, 0);
  assert.equal(positionen.filter(p => p.typ === "position").length, 15);
  assert.equal(positionen.filter(p => p.typ === "unterposition").length, 3);
  assert.equal(positionen.filter(p => p.typ === "hinweis").length, 1);
});

test("parseGaeb90 erkennt Projekttitel und Titel-/Untertitel-Hierarchie", () => {
  const { projektTitel, positionen } = parseGaeb90(beispielDatei);
  assert.equal(projektTitel, "ROHBAUARBEITEN");
  const erstePosition = positionen.find(p => p.typ === "position");
  assert.match(erstePosition.titelPfad, /^T01: MAUERARBEITEN \/ T0101: WAENDE$/);
});

test("parseGaeb90 dekodiert Menge (11-stellig) und Einheit korrekt", () => {
  const { positionen } = parseGaeb90(beispielDatei);
  const mauerwerk = positionen.find(p => p.oz === "0101.30");
  assert.equal(mauerwerk.menge, 104);
  assert.equal(mauerwerk.einheit, "m3");
});

test("parseGaeb90 markiert Grund-/Alternativ-/Bedarfs-/Leitposition korrekt", () => {
  const { positionen } = parseGaeb90(beispielDatei);
  const arten = positionen.filter(p => p.typ === "position").map(p => p.art).filter(Boolean);
  assert.ok(arten.includes("Grundposition"));
  assert.ok(arten.includes("Alternativposition"));
  assert.ok(arten.includes("Bedarfsposition"));
  assert.ok(arten.includes("Leitposition"));
});

test("gaeb90Schreiben + parseGaeb90 round-trip: Struktur und Texte bleiben erhalten", () => {
  const geparst = parseGaeb90(beispielDatei);
  const positionenListe = gaeb90ZuPositionen(geparst);

  const exportiert = gaeb90Schreiben(positionenListe, { projektTitel: geparst.projektTitel });

  // Jede Zeile muss exakt 80 Zeichen lang sein (2 Satzart + 72 Inhalt + 6 Satznummer).
  for (const zeile of exportiert.split("\r\n").filter(Boolean)) {
    assert.equal(zeile.length, 80, `Zeile hat falsche Länge: "${zeile}"`);
  }

  const zurueckImportiert = gaeb90ZuPositionen(parseGaeb90(exportiert));
  assert.equal(zurueckImportiert.length, positionenListe.length);

  // Bezeichnungstexte (inkl. Wortumbruch über mehrere Satzart-26-Zeilen)
  // müssen exakt erhalten bleiben — keine verschluckten/eingefügten Leerzeichen.
  const originalTexte = positionenListe.map(p => p.bez);
  const zurueckTexte = zurueckImportiert.map(p => p.bez);
  assert.deepEqual(zurueckTexte, originalTexte);
});
