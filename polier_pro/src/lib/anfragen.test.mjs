import { test } from "node:test";
import assert from "node:assert/strict";
import { paketeVorschlagen, paketZeilen, anfrageText, paketKontext } from "./anfragen.js";

const kp = [{ id: 5, kategorie: "material", bezeichnung: "Beton C25/30", einheit: "m³" }, { id: 6, kategorie: "material", bezeichnung: "Betonstahl B500", einheit: "t" },
  { id: 7, kategorie: "material", bezeichnung: "Ungenutzt", einheit: "Stk" }, { id: 1, kategorie: "lohn", bezeichnung: "FA", einheit: "h" }];
const bedarf = new Map([["5", 24.72], ["6", 1.084]]);
const lv = [
  { id: 0, bez: "── Rohbau ──" },
  { id: 1, oz: "01.10", bez: "Beton Bodenplatte", einheit: "m³", menge: 24, kalk: { fremdleistung: 0 } },
  { id: 2, oz: "02.10", bez: "Abdichtung PMBC", langtext: "zweilagig", einheit: "m²", menge: 180, kalk: { fremdleistung: 6000 } },
  { id: 3, oz: "02.20", bez: "Hohlkehle", einheit: "m", menge: 60 },
  { id: 4, oz: "03.10", bez: "Fassadengerüst", einheit: "m²", menge: 320 },
];

test("Pakete: Kontext, Zuordnung, keine Doppelungen", async () => {
  const { text } = paketKontext(lv, bedarf, kp);
  assert.match(text, /#2 \| OZ 02.10 \| 180 m² \| Abdichtung PMBC \| als Fremdleistung kalkuliert/);
  assert.match(text, /5 \| Beton C25\/30 \| Bedarf 24,72 m³/);
  assert.doesNotMatch(text, /Ungenutzt/);
  const pakete = await paketeVorschlagen({ positionen: lv, materialBedarf: bedarf, kalkulationspreise: kp, gewerkeFirma: ["Rohbau"], rufeKi: async (system) => {
    assert.match(system, /eigene Gewerke: Rohbau/);
    return { content: [{ type: "tool_use", name: "pakete_abgeben", input: { pakete: [
      { name: "Abdichtung", art: "nu", positionen: [2, 3], begruendung: "typisch vergeben" },
      { name: "Gerüst", art: "nu", positionen: [4, 3] },
      { name: "Leer", art: "nu", positionen: [99] },
      { name: "Betonwerk", art: "lieferant", bausteine: ["5", "7", "1"] },
      { name: "Stahl", art: "lieferant", bausteine: ["6", "5"] },
    ] } }] };
  } });
  assert.deepEqual(pakete.map(p => p.name), ["Abdichtung", "Gerüst", "Betonwerk", "Stahl"]);
  assert.deepEqual(pakete[1].positionIds, [4], "Hohlkehle schon im Paket Abdichtung");
  assert.deepEqual(pakete[2].bausteinIds, [5], "nur Material mit Bedarf");
  assert.deepEqual(pakete[3].bausteinIds, [6]);
  const z = paketZeilen(pakete[0], lv, kp, bedarf);
  assert.deepEqual(z.map(x => x.oz), ["02.10", "02.20"]);
  assert.equal(paketZeilen(pakete[3], lv, kp, bedarf)[0].menge, 1.09);
  const a = anfrageText(pakete[0], z, { projekt: { name: "Kita Am Park", adresse: "Parkstr. 4", plz: "47051", ort: "Duisburg" }, firma: { name: "Demo GmbH" }, absender: "Luca", abgabe: "2026-11-30", ausfuehrung: "KW 10–12/2027" });
  assert.equal(a.betreff, "Anfrage Abdichtung – Kita Am Park");
  assert.match(a.text, /Kita Am Park, Parkstr. 4, 47051 Duisburg/);
  assert.match(a.text, /- 02.10 Abdichtung PMBC: 180 m²/);
  assert.match(a.text, /GAEB-Datei \(D83\)/);
  assert.match(a.text, /bis zum 30\.11\.2026/);
  assert.match(a.text, /Luca\nDemo GmbH$/);
  assert.match(anfrageText(pakete[2], [], {}).text, /frei Baustelle/);
});
