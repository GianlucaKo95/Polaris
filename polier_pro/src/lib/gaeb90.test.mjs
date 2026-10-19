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
import {
  parseGaeb90, gaeb90ZuPositionen, gaeb90Schreiben,
  parseGaeb90Preise, gaeb90PreiseZuPositionen, gaeb90PreiseEinspielen,
} from "./gaeb90.js";

const hier = dirname(fileURLToPath(import.meta.url));
// Die Datei liegt als ANSI/Windows-1252 vor; die Beispieldatei enthält keine
// Umlaute außerhalb des ASCII-Bereichs (im Sample durchgehend "ue"/"ae"/"oe"
// geschrieben), daher reicht ein einfacher Latin1-Read in Node aus — die
// eigentliche Windows-1252-Dekodierung (gaeb90DateiLesen) läuft nur im
// Browser über TextDecoder und wird hier nicht erneut getestet.
const beispielDatei = readFileSync(join(hier, "__fixtures__", "gaeb-sample.d83"), "latin1");
// Echte, bepreiste D84-Datei (Kaufland Freiberg Bebelplatz 2, Projekt
// 2025-074a) — Summen hier gegen das dazugehörige Angebots-PDF desselben
// Projekts abgeglichen (Angebotssumme Netto 64.548,62 €, 54 Positionen).
const beispielDateiD84 = readFileSync(join(hier, "__fixtures__", "gaeb-priced-sample.D84"), "latin1");

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

test("parseGaeb90Preise liest alle 54 Preispositionen der echten D84-Datei ohne Warnungen", () => {
  const { preise, warnungen } = parseGaeb90Preise(beispielDateiD84);
  assert.equal(warnungen.length, 0);
  assert.equal(preise.length, 54);
});

test("parseGaeb90Preise dekodiert EP (11-stellig) und GP (12-stellig) korrekt — gegen das echte Angebots-PDF abgeglichen", () => {
  const { preise } = parseGaeb90Preise(beispielDateiD84);
  const nachOz = Object.fromEntries(preise.map(p => [p.oz, p]));
  assert.equal(nachOz["01.01.0010"].ep, 4482);
  assert.equal(nachOz["01.01.0010"].gp, 4482);
  // "a"-Suffix (Bedarfs-/Zulagevariante derselben Position) wird an die OZ angehängt.
  assert.equal(nachOz["01.01.0010a"].ep, 889.39);
  assert.equal(nachOz["01.01.0010a"].gp, 3557.56);
  assert.equal(nachOz["03.02.0040"].ep, 146.82);
  assert.equal(nachOz["03.02.0040"].gp, 10277.40);
});

test("Summe aller Gesamtpreise aus der D84-Datei ergibt die echte Angebotssumme Netto (64.548,62 €)", () => {
  const { preise } = parseGaeb90Preise(beispielDateiD84);
  const summe = preise.reduce((s, p) => s + p.gp, 0);
  assert.ok(Math.abs(summe - 64548.62) < 0.01, `Summe war ${summe}, erwartet 64548.62`);
});

test("gaeb90PreiseEinspielen aktualisiert nur Positionen mit passender OZ, lässt den Rest unangetastet", () => {
  const { preise } = parseGaeb90Preise(beispielDateiD84);
  const vorhanden = [
    { id: 1, bez: "Baustelle einrichten", einheit: "Psch", menge: 1, ep: 0, rabatt: 0, oz: "01.01.0010" },
    { id: 2, bez: "Position ohne Treffer", einheit: "Stk", menge: 1, ep: 0, rabatt: 0, oz: "99.99.9999" },
    { id: 3, bez: "Manuell angelegt, keine OZ", einheit: "Stk", menge: 1, ep: 42, rabatt: 0 },
  ];
  const { positionen, treffer, fehlend } = gaeb90PreiseEinspielen(vorhanden, preise);
  assert.equal(treffer, 1);
  assert.equal(fehlend, 53);
  assert.equal(positionen[0].ep, 4482);
  assert.equal(positionen[1].ep, 0); // keine passende OZ gefunden -> unverändert
  assert.equal(positionen[2].ep, 42); // keine OZ -> unverändert
});

test("gaeb90PreiseZuPositionen rechnet die Menge aus GP/EP zurück (D84 hat kein eigenes Mengenfeld)", () => {
  const { preise } = parseGaeb90Preise(beispielDateiD84);
  const positionen = gaeb90PreiseZuPositionen({ preise });
  const vorhalten = positionen.find(p => p.oz === "01.01.0010a");
  assert.equal(vorhalten.menge, 4); // 3557.56 / 889.39 = 4
});
