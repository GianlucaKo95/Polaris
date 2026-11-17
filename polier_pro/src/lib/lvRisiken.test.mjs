import { test } from "node:test";
import assert from "node:assert/strict";
import { lvPruefen, lvText, bieterfragenText } from "./lvRisiken.js";

const pos = [
  { id: 1, bez: "── 01 Erdarbeiten ──" },
  { id: 2, typ: "hinweis", bez: "Boden gemäß Gutachten", menge: 0, einheit: "" },
  { id: 3, oz: "01.10", bez: "Baugrube ausheben", langtext: "Boden HB 2, Abfuhr nach Wahl AN", einheit: "m³", menge: 850 },
  { id: 4, oz: "01.20", bez: "Wasserhaltung", einheit: "psch", menge: 1, bedarf: true },
];

test("LV-Text: Titel, Hinweise, Positionen nummeriert", () => {
  const t = lvText([{ nr: null, pos: pos[0] }, { nr: null, pos: pos[1] }, { nr: 1, pos: pos[2] }, { nr: 2, pos: pos[3] }]);
  assert.match(t, /— 01 Erdarbeiten —/);
  assert.match(t, /Hinweis: Boden gemäß Gutachten/);
  assert.match(t, /#1 \| OZ 01.10 \| 850 m³ \| Baugrube ausheben\n   Boden HB 2/);
  assert.match(t, /#2 \| OZ 01.20 \| 1 psch \| Bedarfsposition \| Wasserhaltung/);
});

test("lvPruefen: Zuordnung, Vorbemerkungen, Dubletten", async () => {
  let gesendet;
  const rufeKi = async (system, messages) => {
    gesendet = { system, inhalt: messages[0].content };
    return { content: [{ type: "tool_use", name: "lv_pruefung_abgeben", input: {
      risiken: [
        { nr: 2, art: "mengenrisiko", schwere: "mittel", text: "Wasserhaltung pauschal ohne Grundwasserstand", empfehlung: "Annahme im Angebot nennen" },
        { art: "vertragsrisiko", schwere: "hoch", text: "Vertragsstrafe 0,5 % je Werktag ohne Obergrenze" },
        { nr: 1, art: "quatsch", schwere: "x", text: "Abfuhr ohne Entsorgungsklasse" },
      ],
      bieterfragen: [
        { nr: 1, frage: "Welche Einbauklasse hat der Aushub?", grund: "Entsorgung" },
        { nr: 1, frage: "Welche  Einbauklasse hat der Aushub?" },
        { frage: "Gibt es eine Obergrenze für die Vertragsstrafe?" },
      ],
    } }] };
  };
  const r = await lvPruefen({ positionen: pos, vorbemerkungen: "Vertragsstrafe 0,5 %", kontext: { projekt: { name: "P" } }, rufeKi });
  assert.match(gesendet.inhalt, /^Vorbemerkungen \/ Vertragsbedingungen:\nVertragsstrafe/);
  assert.match(gesendet.system, /Keine Empfehlungen, Preise spekulativ/);
  assert.equal(r.risiken[0].schwere, "hoch");
  assert.equal(r.risiken[0].posId, null);
  assert.equal(r.risiken.find(x => x.posId === 4).oz, "01.20");
  const ohne = r.risiken.find(x => x.posId === 3);
  assert.equal(ohne.art, "unklar"); assert.equal(ohne.schwere, "hinweis");
  assert.equal(r.fragen.length, 2, "gleiche Frage nur einmal");
  assert.equal(r.fragen[0].oz, "01.10");
  const t = bieterfragenText(r.fragen, { projekt: { name: "Parkhaus" }, angebotTitel: "Erdbau", firma: { name: "Demo GmbH" } });
  assert.match(t, /^Bieterfragen zu „Erdbau“, Parkhaus/);
  assert.match(t, /1\. Pos\. 01\.10: Welche Einbauklasse/);
  assert.match(t, /2\. Gibt es eine Obergrenze/);
  assert.match(t, /Demo GmbH$/);
});

test("Nur Vorbemerkungen ohne Positionen", async () => {
  let n = 0;
  const r = await lvPruefen({ positionen: [], vorbemerkungen: "Text", rufeKi: async () => { n++; return { content: [] }; } });
  assert.equal(n, 1); assert.deepEqual(r, { risiken: [], fragen: [] });
});
