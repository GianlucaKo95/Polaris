import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseGaebXml } from "./gaebXml.js";
import { gaeb90ZuPositionen } from "./gaeb90.js";
import { gaebX84Schreiben } from "./gaebX84.js";

const hier = dirname(fileURLToPath(import.meta.url));
const x83 = readFileSync(join(hier, "__fixtures__", "gaeb-xml-sample.X83"), "utf-8");

test("X83 importieren, bepreisen, als X84 schreiben: gleiche OZ, Mengen und Texte beim Wiedereinlesen", () => {
  const original = parseGaebXml(x83);
  const positionen = gaeb90ZuPositionen(original).map((p, i) => p.oz ? { ...p, ep: 10 + i } : p);
  const { text, warnungen, anzahl, summe } = gaebX84Schreiben(positionen, { projektTitel: original.projektTitel, datum: "2026-11-11" });
  assert.equal(warnungen.length, 0);
  assert.equal(anzahl, 52);
  assert.match(text, /<DP>84<\/DP>/);
  assert.match(text, /DA84\/3\.3/);

  const zurueck = parseGaebXml(text);
  assert.equal(zurueck.warnungen.length, 0);
  assert.equal(zurueck.projektTitel, original.projektTitel);
  const orig = original.positionen.filter(p => p.typ === "position");
  const neu = zurueck.positionen.filter(p => p.typ === "position");
  assert.deepEqual(neu.map(p => p.oz), orig.map(p => p.oz));
  assert.deepEqual(neu.map(p => p.menge), orig.map(p => p.menge));
  assert.deepEqual(neu.map(p => p.stlk), orig.map(p => p.stlk));

  // Summe = Σ Menge × EP, und die Titelbezeichnungen kommen aus den Kopfzeilen
  const erwartet = positionen.filter(p => p.oz).reduce((s, p) => s + Math.round(p.menge * p.ep * 100) / 100, 0);
  assert.equal(summe, Math.round(erwartet * 100) / 100);
  assert.match(text, /<LblTx><p><span>Baustelleneinrichtung<\/span><\/p><\/LblTx>/);
});

test("Eigenes Angebot ohne OZ wird automatisch nummeriert, Rabatt steckt im UP", () => {
  const { text, warnungen, summe } = gaebX84Schreiben([
    { bez: "Perimeterdämmung XPS & Co <120 mm>", menge: 100, einheit: "m²", ep: 40, rabatt: 10 },
    { bez: "Baustelleneinrichtung", menge: 1, einheit: "Psch", ep: 850 },
  ], { projektTitel: "EFH Müller" });
  assert.equal(warnungen.length, 0);
  assert.match(text, /RNoPart="0010"/);
  assert.match(text, /RNoPart="0020"/);
  assert.match(text, /<UP>36\.00<\/UP><IT>3600\.00<\/IT>/);
  assert.match(text, /XPS &amp; Co &lt;120 mm&gt;/);
  assert.equal(summe, 4450);
  const zurueck = parseGaebXml(text);
  assert.equal(zurueck.positionen[0].oz, "01.0010");
  assert.equal(zurueck.positionen[0].bez, "Perimeterdämmung XPS & Co <120 mm>");
});

test("Einzelne Positionen ohne OZ in einem OZ-LV werden übersprungen", () => {
  const { warnungen, anzahl } = gaebX84Schreiben([
    { bez: "A", oz: "01.0010", menge: 1, einheit: "m", ep: 1 },
    { bez: "B ohne OZ", menge: 1, einheit: "m", ep: 1 },
  ]);
  assert.equal(warnungen.length, 1);
  assert.equal(anzahl, 1);
});
