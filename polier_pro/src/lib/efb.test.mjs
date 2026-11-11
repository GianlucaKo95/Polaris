import { test } from "node:test";
import assert from "node:assert/strict";
import { efbAuswerten, efbHtml } from "./efb.js";
import { stammpositionKalk } from "./stammpositionen.js";
import { kalkulationEp } from "./kalkulation.js";

const kalkulationspreise = [
  { id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 48 },
  { id: 2, kategorie: "material", bezeichnung: "XPS", einheit: "m²", preis: 18 },
  { id: 3, kategorie: "geraet", bezeichnung: "Rüttelplatte", einheit: "h", preis: 12 },
];
const zuschlaege = { zuschlagLohn: 35, zuschlagMaterial: 25, zuschlagGeraet: 25, zuschlagFremdleistung: 15 };
const sp = { id: 1, bez: "Dämmung", einheit: "m²", rezeptur: [
  { stammId: 1, mengeJeEinheit: 0.25 }, { stammId: 2, mengeJeEinheit: 1.05 }, { stammId: 3, mengeJeEinheit: 0.02 }] };
const kalk = stammpositionKalk(sp, 100, kalkulationspreise, zuschlaege);
const positionen = [
  { id: 1, bez: "── Titel ──", menge: 0, ep: 0 },
  { id: 2, oz: "01.0010", bez: "Perimeterdämmung", einheit: "m²", menge: 100, kalk, ep: kalkulationEp(kalk, kalkulationspreise, 100) },
  { id: 3, oz: "01.0020", bez: "Baustelleneinrichtung", einheit: "Psch", menge: 1, ep: 850 },
];

test("EFB 221: Mittellohn, Verrechnungslohn, Zuschläge und Angebotssumme aus der Kalkulation", () => {
  const r = efbAuswerten(positionen, kalkulationspreise);
  assert.equal(r.summe.stunden, 25);
  assert.equal(r.mittellohn, 48);
  assert.equal(Math.round(r.verrechnungslohn * 100) / 100, 64.8);
  assert.equal(Math.round(r.zuschlagProzent.lohn), 35);
  assert.equal(Math.round(r.zuschlagProzent.material), 25);
  // 100 × 40,125 + 850
  assert.equal(Math.round(r.angebotssumme * 100) / 100, 4862.5);
  assert.equal(r.warnungen.length, 1); // Baustelleneinrichtung nicht kalkuliert
});

test("EFB 223: Teilkosten je Einheit summieren sich zum EP", () => {
  const { zeilen } = efbAuswerten(positionen, kalkulationspreise);
  assert.equal(zeilen.length, 2);
  const z = zeilen[0];
  assert.equal(z.zeitansatz, 0.25);
  assert.equal(Math.round(z.lohn * 100) / 100, 16.2);
  assert.equal(Math.round((z.lohn + z.material + z.geraet + z.fremdleistung) * 1000) / 1000, Math.round(z.ep * 1000) / 1000);
  assert.equal(zeilen[1].sonstiges, 850);
  assert.equal(zeilen[1].kalkuliert, false);
});

test("Positionsrabatt mindert alle Anteile anteilig", () => {
  const r = efbAuswerten([{ ...positionen[1], rabatt: 10 }], kalkulationspreise);
  assert.equal(Math.round(r.zeilen[0].lohn * 100) / 100, 14.58);
  assert.equal(r.summe.stunden, 22.5);
  assert.equal(r.mittellohn, 48);
});

test("HTML enthält beide Formblätter und escaped Texte", () => {
  const html = efbHtml(efbAuswerten([{ ...positionen[1], bez: "A <b>&" }], kalkulationspreise), { angebot: { titel: "T" }, eigeneFirma: { name: "Bau GmbH" } });
  assert.match(html, /221/);
  assert.match(html, /Aufgliederung der Einheitspreise/);
  assert.match(html, /A &lt;b&gt;&amp;/);
  assert.match(html, /48,00 €\/h/);
});

test("Zuschlagsaufteilung BGK/AGK/W&G erscheint nur bei Summe 100", () => {
  const r = efbAuswerten([positionen[1]], kalkulationspreise);
  const mit = efbHtml(r, { aufteilung: { bgk: 40, agk: 40, wg: 20 } });
  assert.match(mit, /BGK %/);
  assert.match(mit, /<td class="r">14,00<\/td><td class="r">14,00<\/td><td class="r">7,00<\/td>/); // 35 % Lohnzuschlag
  assert.doesNotMatch(efbHtml(r, { aufteilung: { bgk: 40, agk: 40, wg: 10 } }), /BGK %/);
});
