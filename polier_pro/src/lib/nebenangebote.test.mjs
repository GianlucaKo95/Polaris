import { test } from "node:test";
import assert from "node:assert/strict";
import { nebenKontext, vorschlaegeAuswerten, vorschlagBepreisen, vergleich, alsNebenangebot } from "./nebenangebote.js";
import { katalogBauen } from "./katalog.js";
import { inSumme } from "./lv.js";

const kp = [{ id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 50 }, { id: 2, kategorie: "material", bezeichnung: "KS-Planstein 17,5", einheit: "m²", preis: 24 }];
const z = { zuschlagLohn: 0, zuschlagMaterial: 0, zuschlagGeraet: 0, zuschlagFremdleistung: 0 };
const lv = [
  { id: 0, bez: "── Rohbau ──" },
  { id: 1, oz: "01.10", bez: "Mauerwerk KS 17,5 Normalmörtel", einheit: "m²", menge: 200, ep: 78 },
  { id: 2, oz: "01.20", bez: "Bedarfsposition Wasserhaltung", einheit: "psch", menge: 1, ep: 900, art: "bedarf" },
];

test("Nebenangebot: Kontext, Bepreisung, Vergleich, Übernahme", async () => {
  const { text, map } = nebenKontext(lv, kp);
  assert.match(text, /#1 \| OZ 01.10 \| 200 m² \| GP 15\.600,00 € \| Mauerwerk/);
  assert.doesNotMatch(text, /Wasserhaltung/, "Positionen außerhalb der Summe nicht ersetzen");
  assert.match(text, /lohn: Facharbeiter \[h\]/);
  const v = vorschlaegeAuswerten({ vorschlaege: [
    { titel: "KS-Plansteine mit Dünnbettmörtel", ersetzt: [1], idee: "Plansteine statt Normalmörtel", gleichwertigkeit: "gleiche Druckfestigkeitsklasse", positionen: [{ kurztext: "KS-Planstein 17,5 Dünnbett", einheit: "m²", bezug: 1, faktor: 1 }] },
    { titel: "Leer", ersetzt: [9], idee: "x", gleichwertigkeit: "y", positionen: [{ kurztext: "a", einheit: "m" }] },
  ] }, map);
  assert.equal(v.length, 1);
  assert.equal(v[0].positionen[0].menge, 200);
  const b = await vorschlagBepreisen(v[0], { katalog: katalogBauen({ kalkulationspreise: kp, standardZuschlaege: z }), stammpositionen: [], kalkulationspreise: kp, standardZuschlaege: z, kontext: {},
    rufeKi: async () => ({ content: [{ type: "tool_use", name: "vorkalkulation_abgeben", input: { positionen: [
      { nr: 1, art: "rezeptur", rezeptur: [{ baustein: "2", mengeJeEinheit: 1.02 }, { baustein: "1", mengeJeEinheit: 0.6 }], sicherheit: "hoch", begruendung: "0,6 h/m² Planstein" } ] } }] }) });
  assert.equal(Math.round(b.positionen[0].ep * 100) / 100, 54.48);
  assert.equal(b.positionen[0].art, "alternativ");
  const vg = vergleich(b, lv);
  assert.equal(vg.alt, 15600); assert.equal(Math.round(vg.neu), 10896); assert.equal(vg.offen, 0);
  assert.ok(vg.anteil > 0.3);
  const neu = alsNebenangebot(lv, b, 1);
  assert.equal(neu.length, 5);
  assert.equal(neu[3].bez, "── Nebenangebot 1: KS-Plansteine mit Dünnbettmörtel ──");
  assert.match(neu[4].langtext, /^Nebenangebot zu Pos\. 01\.10: Plansteine statt Normalmörtel/);
  assert.equal(inSumme(neu[4]), false, "nicht in der Angebotssumme");
});
