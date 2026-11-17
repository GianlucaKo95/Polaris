import { test } from "node:test";
import assert from "node:assert/strict";
import { vergleich, summen, bewertungText, bieterfragenAusAbweichungen, kiMengenErmitteln, positionenText, eigeneMengeAusAufmass } from "./mengenpruefung.js";
import { neueZeile } from "./aufmass.js";

const pos = [
  { id: 0, bez: "── Rohbau ──" },
  { id: 1, oz: "01.10", bez: "Mauerwerk", einheit: "m²", menge: 100, ep: 60, eigeneMenge: { menge: 124 } },
  { id: 2, oz: "01.20", bez: "Putz", einheit: "m²", menge: 200, ep: 20, eigeneMenge: { menge: 170 } },
  { id: 3, oz: "01.30", bez: "Estrich", einheit: "m²", menge: 80, ep: 25, eigeneMenge: { menge: 84 } },
  { id: 4, oz: "01.40", bez: "Sockel", einheit: "m", menge: 40, ep: 10, eigeneMenge: { menge: 47, toleranz: 0.25 } },
  { id: 5, oz: "01.50", bez: "BE", einheit: "psch", menge: 1, ep: 900 },
];

test("Vergleich und Summen", () => {
  const z = vergleich(pos);
  assert.deepEqual(z.map(x => x.bewertung), ["mehrmenge", "mindermenge", "passt", "passt", "offen"]);
  assert.equal(z[3].unsicher, true, "Schätzung ±25 % deckt +17,5 % ab");
  const s = summen(z);
  assert.equal(s.mehrerloes, 1440); assert.equal(s.deckungsluecke, -600);
  assert.match(bewertungText(z[0]), /Mehrmenge \+24 %/);
  assert.match(bewertungText(z[1]), /Mindermenge -15 %/);
  const f = bieterfragenAusAbweichungen(z);
  assert.equal(f.length, 2);
  assert.match(f[0].frage, /ca\. 124 m² statt 100 m²/);
  assert.equal(vergleich([{ id: 9, bez: "x", einheit: "m", menge: 0, eigeneMenge: { menge: 5 } }])[0].bewertung, "mehrmenge");
});

test("Eigene Menge aus Aufmaß", () => {
  const e = eigeneMengeAusAufmass({ zeilen: [neueZeile({ formel: "10*2,5", einheit: "m²" }), neueZeile({ formel: "1*2", einheit: "m²", abzug: true })], einheit: "m²", abzugsregelGrenze: 2.5 });
  assert.equal(e.menge, 25); assert.equal(e.quelle, "aufmass");
});

test("KI sieht keine LV-Mengen, Pauschalen bleiben draußen", async () => {
  let text;
  const r = await kiMengenErmitteln({ positionen: pos, anhangBloecke: [{ type: "document" }], rufeKi: async (s, m) => {
    text = m[0].content[1].text;
    return { content: [{ type: "tool_use", name: "mengen_je_position", input: { positionen: [
      { nr: 1, formel: "2*(12,40+8,00)*2,75", grundlage: "Maßketten, LH 2,75", sicherheit: "hoch" },
      { nr: 2, formel: "kaputt", grundlage: "", sicherheit: "hoch" },
      { nr: 4, formel: "2*(12,4+8)", grundlage: "Umfang", sicherheit: "niedrig" },
    ], hinweise: ["Schnitt fehlt"] } }] };
  } });
  assert.doesNotMatch(text, /100|200|Menge/i, "keine LV-Mengen");
  assert.doesNotMatch(text, /BE/, "Pauschale nicht gefragt");
  assert.match(positionenText([{ nr: 1, pos: pos[1] }]), /#1 \| OZ 01.10 \| Einheit m² \| Mauerwerk/);
  assert.equal(r.ergebnis.get(1).menge, 112.2);
  assert.equal(r.ergebnis.get(1).toleranz, 0.03);
  assert.equal(r.ergebnis.has(2), false);
  assert.equal(r.ergebnis.get(4).toleranz, 0.25);
  assert.deepEqual(r.hinweise, ["Schnitt fehlt"]);
});
