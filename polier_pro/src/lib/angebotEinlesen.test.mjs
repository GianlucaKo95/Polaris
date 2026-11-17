import { test } from "node:test";
import assert from "node:assert/strict";
import { nuAngebotEinlesen, lieferantenangebotEinlesen, alsLieferantenangebote, lvFuerKi, dokumentInhalt } from "./angebotEinlesen.js";
import { preisspiegelBauen } from "./preisspiegel.js";

const lv = [
  { id: 0, bez: "── Abdichtung ──" },
  { id: 1, oz: "02.10", bez: "Abdichtung PMBC", einheit: "m²", menge: 180, ep: 0 },
  { id: 2, oz: "02.20", bez: "Hohlkehle", einheit: "m", menge: 60, ep: 0 },
  { id: 3, oz: "02.30", bez: "Noppenbahn", einheit: "m²", menge: 180, ep: 0 },
];

test("NU-Angebot aus PDF: Zuordnung, Summenkontrolle, Preisspiegel", async () => {
  let inhalt;
  const r = await nuAngebotEinlesen({ anhang: { bloecke: [{ type: "document" }] }, positionen: lv, rufeKi: async (s, m) => {
    inhalt = m[0].content;
    return { content: [{ type: "tool_use", name: "nu_angebot_abgeben", input: {
      bieter: "Abdichtung Weber GmbH", gueltig_bis: "31.12.2026",
      positionen: [{ nr: 1, ep: 34.5 }, { nr: 2, ep: 12, hinweis: "je lfm" }, { nr: 9, ep: 1 }, { nr: 3, ep: 0 }],
      nicht_angeboten: [3], vorbehalte: ["ohne Gerüst", "Mindermengenzuschlag unter 100 m²"], summe_netto: 6930 } }] };
  } });
  assert.equal(inhalt[0].type, "document");
  assert.match(inhalt[1].text, /#1 \| OZ 02.10 \| 180 m² \| Abdichtung PMBC/);
  assert.equal(r.name, "Abdichtung Weber GmbH");
  assert.equal(r.positionen.length, 2);
  assert.deepEqual(r.nichtAngeboten, ["02.30"]);
  assert.equal(r.summe.berechnet, 6930); assert.equal(r.summe.ok, true);
  const sp = preisspiegelBauen(lv, [r]);
  assert.deepEqual(sp.zeilen.map(z => z.preise[0]), [34.5, 12, null]);
  assert.equal(sp.fehlend[0], 1);
});

test("Summenkontrolle schlägt bei Lesefehler an", async () => {
  const r = await nuAngebotEinlesen({ text: "Angebot per Mail …", positionen: lv, rufeKi: async () => ({ content: [{ type: "tool_use", name: "nu_angebot_abgeben",
    input: { bieter: "X", positionen: [{ nr: 1, ep: 3.45 }], summe_netto: 6210 } }] }) });
  assert.equal(r.summe.ok, false);
  assert.ok(r.summe.abweichung < -0.8);
  assert.match(dokumentInhalt(null, "Text")[0].text, /^Angebotstext/);
  assert.equal(lvFuerKi(lv).map.size, 3);
});

test("Lieferantenangebot: Bausteine, Umrechnung, Übernahme", async () => {
  const kp = [
    { id: 5, kategorie: "material", bezeichnung: "Bitumendickbeschichtung", einheit: "l", preis: 4.2, lieferantenangebote: [{ lieferant: "Alt AG", preis: 4.4 }, { lieferant: "Baustoff Nord", preis: 9 }] },
    { id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 50 },
  ];
  let bausteine;
  const r = await lieferantenangebotEinlesen({ text: "…", kalkulationspreise: kp, rufeKi: async (s, m) => {
    bausteine = m[0].content.at(-1).text;
    return { content: [{ type: "tool_use", name: "lieferantenangebot_abgeben", input: { lieferant: "Baustoff Nord", gueltig_bis: "15.12.2026",
      artikel: [{ text: "PMBC 2K 30 l Eimer", preis: 112.5, einheit: "Eimer", baustein: "5", preis_je_baustein: 3.75, umrechnung: "112,50 € / 30 l" },
        { text: "Hohlkehlenmörtel 25 kg", preis: 18.9, einheit: "Sack" }, { text: "Fantasie", preis: 1, einheit: "Stk", baustein: "99", preis_je_baustein: 1 }],
      vorbehalte: ["Fracht frei ab 1.500 €"] } }] };
  } });
  assert.match(bausteine, /5 \| material \| Bitumendickbeschichtung \| l/);
  assert.doesNotMatch(bausteine, /Facharbeiter/);
  assert.equal(r.artikel[0].preisJeBaustein, 3.75); assert.equal(r.artikel[0].bisher, 4.2);
  assert.equal(r.artikel[1].bausteinId, null);
  assert.equal(r.artikel[2].bausteinId, null, "unbekannter Baustein verworfen");
  const neu = alsLieferantenangebote(kp, r, ["a0", "a1"], "2026-11-17");
  assert.deepEqual(neu[0].lieferantenangebote.map(x => `${x.lieferant}:${x.preis}`), ["Alt AG:4.4", "Baustoff Nord:3.75"], "gleicher Lieferant ersetzt");
  assert.equal(neu[0].lieferantenangebote[1].gueltigBis, "15.12.2026");
  assert.equal(neu[1], kp[1]);
});
