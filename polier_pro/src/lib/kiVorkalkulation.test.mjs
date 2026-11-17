import { test } from "node:test";
import assert from "node:assert/strict";
import { katalogBauen } from "./katalog.js";
import {
  zuKalkulieren, vorschlagPruefen, vorschlagAnwenden, vorschlagVorschau, rezepturMengeAendern, blockVorkalkulieren,
  bloecke, zusammenfassung, rezepturText, alsStammposition, blockText, kandidatenFuer,
} from "./kiVorkalkulation.js";

const kp = [
  { id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 50 },
  { id: 2, kategorie: "material", bezeichnung: "XPS-Platte 120 mm", einheit: "m²", preis: 20 },
  { id: 3, kategorie: "geraet", bezeichnung: "Rüttelplatte", einheit: "h", preis: 10 },
];
const sp = [{ id: 7, bez: "Perimeterdämmung XPS 120 mm", einheit: "m²", rezeptur: [{ stammId: 1, mengeJeEinheit: 0.2 }, { stammId: 2, mengeJeEinheit: 1.05 }] }];
const ep = [{ id: 4, gewerk: "Erdarbeiten", beschreibung: "Baugrube ausheben", einheit: "m³", preis: 18 }];
const zuschlaege = { zuschlagLohn: 20, zuschlagMaterial: 10, zuschlagGeraet: 10, zuschlagFremdleistung: 5 };
const katalog = katalogBauen({ stammpositionen: sp, einheitspreise: ep, kalkulationspreise: kp, standardZuschlaege: zuschlaege });
const ctx = { stammpositionen: sp, kalkulationspreise: kp, standardZuschlaege: zuschlaege, jetzt: new Date("2026-11-17T10:00:00Z") };

const posDaemm = { id: 11, oz: "01.0010", bez: "Perimeterdämmung XPS 120 mm", langtext: "liefern und kleben", einheit: "m2", menge: 100, ep: 0 };
const posVerdicht = { id: 12, oz: "01.0020", bez: "Planum verdichten", einheit: "m²", menge: 200, ep: 0 };

test("zuKalkulieren: ohne Titel, ohne Preis", () => {
  const l = [{ id: 1, bez: "── Titel ──" }, posDaemm, { id: 3, bez: "x", ep: 12 }, { id: 4, bez: "  " }];
  assert.deepEqual(zuKalkulieren(l).map(p => p.id), [11]);
  assert.deepEqual(zuKalkulieren(l, { alle: true }).map(p => p.id), [11, 3]);
});

test("Kandidaten und Blocktext", () => {
  const k = kandidatenFuer(posDaemm, katalog);
  assert.equal(k[0].ref, "SP:7");
  const t = blockText([{ nr: 1, pos: posDaemm, kandidaten: k }]);
  assert.match(t, /#1 \| OZ 01.0010 \| 100 m2 \| Perimeterdämmung/);
  assert.match(t, /SP:7/);
  assert.equal(bloecke([1, 2, 3, 4, 5], 2).length, 3);
});

test("vorschlagPruefen: Katalog, Einheit, unbekannte Referenz", () => {
  assert.equal(vorschlagPruefen({ art: "katalog", ref: "SP:7", sicherheit: "hoch", begruendung: "passt" }, posDaemm, { katalog, kalkulationspreise: kp }).ref, "SP:7");
  const falsch = vorschlagPruefen({ art: "katalog", ref: "EP:4", sicherheit: "hoch", begruendung: "" }, posDaemm, { katalog, kalkulationspreise: kp });
  assert.equal(falsch.art, "offen");
  assert.match(falsch.begruendung, /m³/);
  assert.equal(vorschlagPruefen({ art: "katalog", ref: "SP:99", sicherheit: "hoch" }, posDaemm, { katalog, kalkulationspreise: kp }).art, "offen");
  // Pauschalposition darf jede Einheit nehmen
  assert.equal(vorschlagPruefen({ art: "katalog", ref: "EP:4", sicherheit: "mittel" }, { ...posDaemm, einheit: "psch" }, { katalog, kalkulationspreise: kp }).art, "katalog");
});

test("vorschlagPruefen: Rezeptur", () => {
  const ok = vorschlagPruefen({ art: "rezeptur", rezeptur: [{ baustein: "1", mengeJeEinheit: 0.04 }, { baustein: 3, mengeJeEinheit: 0.02 }], sicherheit: "hoch", begruendung: "Aufwandswert", fehlt: ["Material: Schotter"] }, posVerdicht, { katalog, kalkulationspreise: kp });
  assert.equal(ok.art, "rezeptur");
  assert.deepEqual(ok.rezeptur, [{ stammId: 1, mengeJeEinheit: 0.04 }, { stammId: 3, mengeJeEinheit: 0.02 }]);
  assert.equal(ok.sicherheit, "mittel", "mit fehlenden Bausteinen nie hoch");
  assert.equal(vorschlagPruefen({ art: "rezeptur", rezeptur: [{ baustein: 99, mengeJeEinheit: 1 }] }, posVerdicht, { katalog, kalkulationspreise: kp }).art, "offen");
  assert.equal(vorschlagPruefen({ art: "rezeptur", rezeptur: [{ baustein: 1, mengeJeEinheit: 0 }] }, posVerdicht, { katalog, kalkulationspreise: kp }).art, "offen");
  assert.equal(vorschlagPruefen({ art: "rezeptur", rezeptur: [{ baustein: 1, mengeJeEinheit: 500 }] }, posVerdicht, { katalog, kalkulationspreise: kp }).art, "offen");
  assert.equal(vorschlagPruefen({ art: "rezeptur", rezeptur: [] }, posVerdicht, { katalog, kalkulationspreise: kp }).art, "offen");
  assert.equal(vorschlagPruefen({ art: "quatsch" }, posVerdicht, { katalog, kalkulationspreise: kp }).art, "offen");
});

test("vorschlagAnwenden: Stammposition behält LV-Text und Menge", () => {
  const v = vorschlagPruefen({ art: "katalog", ref: "SP:7", sicherheit: "hoch", begruendung: "gleich" }, posDaemm, { katalog, kalkulationspreise: kp });
  const p = vorschlagAnwenden(posDaemm, v, ctx);
  assert.equal(p.id, 11); assert.equal(p.oz, "01.0010"); assert.equal(p.einheit, "m2"); assert.equal(p.menge, 100); assert.equal(p.langtext, "liefern und kleben");
  assert.equal(p.stammpositionId, 7);
  // (0,2 h × 50 € × 1,2) + (1,05 × 20 € × 1,1) = 12 + 23,1
  assert.equal(Math.round(p.ep * 100) / 100, 35.1);
  assert.equal(p.kiKalkulation.sicherheit, "hoch");
  assert.equal(p.preisquelle.ref, "SP:7");
  assert.equal(vorschlagVorschau(v, posDaemm, ctx).stunden, 0.2);
});

test("vorschlagAnwenden: Rezeptur, Menge ändern, Einheitspreis, offen", () => {
  const v = vorschlagPruefen({ art: "rezeptur", rezeptur: [{ baustein: 1, mengeJeEinheit: 0.04 }, { baustein: 3, mengeJeEinheit: 0.02 }], sicherheit: "mittel", begruendung: "b" }, posVerdicht, { katalog, kalkulationspreise: kp });
  const p = vorschlagAnwenden(posVerdicht, v, ctx);
  // 0,04 × 50 × 1,2 + 0,02 × 10 × 1,1 = 2,4 + 0,22
  assert.equal(Math.round(p.ep * 100) / 100, 2.62);
  assert.equal(p.preisquelle.art, "ki_rezeptur");
  assert.equal(vorschlagVorschau(v, posVerdicht, ctx).ep, 2.62);
  assert.equal(rezepturText(v.rezeptur, kp), "0,04 h Facharbeiter + 0,02 h Rüttelplatte");
  const mehr = rezepturMengeAendern(p, 400, kp);
  assert.equal(Math.round(mehr.ep * 100) / 100, 2.62, "EP bleibt bei anderer Menge gleich");
  assert.equal(rezepturMengeAendern({ ...p, stammpositionId: 7 }, 400, kp), null);
  const ep4 = vorschlagAnwenden({ ...posDaemm, einheit: "m³", kalk: { alt: 1 }, stammpositionId: 3 }, vorschlagPruefen({ art: "katalog", ref: "EP:4", sicherheit: "hoch" }, { ...posDaemm, einheit: "m³" }, { katalog, kalkulationspreise: kp }), ctx);
  assert.equal(ep4.ep, 18); assert.equal(ep4.kalk, undefined); assert.equal(ep4.stammpositionId, undefined);
  assert.equal(vorschlagAnwenden(posDaemm, { art: "offen" }, ctx), posDaemm);
  const neu = alsStammposition(posVerdicht, v, "Erdbau");
  assert.equal(neu.einheit, "m²"); assert.equal(neu.rezeptur.length, 2); assert.equal(neu.herkunft.art, "ki_vorkalkulation");
});

test("blockVorkalkulieren: KI-Antwort wird zugeordnet und geprüft", async () => {
  let aufruf;
  const rufeKi = async (system, messages, tools, toolChoice) => {
    aufruf = { system, messages, tools, toolChoice };
    return { content: [{ type: "tool_use", name: "vorkalkulation_abgeben", input: { positionen: [
      { nr: 1, art: "katalog", ref: "SP:7", sicherheit: "hoch", begruendung: "gleiche Leistung" },
    ] } }] };
  };
  const erg = await blockVorkalkulieren({ block: [posDaemm, posVerdicht], katalog, kalkulationspreise: kp, kontext: { projekt: { name: "P" } }, rufeKi });
  assert.equal(aufruf.toolChoice.name, "vorkalkulation_abgeben");
  assert.match(aufruf.messages[0].content, /1 \| lohn \| Facharbeiter \| h/);
  assert.doesNotMatch(aufruf.messages[0].content, /50/, "keine Preise an die KI");
  assert.match(aufruf.system, /NIEMALS einen Preis/);
  assert.equal(erg.get(11).art, "katalog");
  assert.equal(erg.get(12).art, "offen");
  const s = zusammenfassung(erg);
  assert.deepEqual([s.gesamt, s.katalog, s.offen, s.hoch], [2, 1, 1, 1]);
});
