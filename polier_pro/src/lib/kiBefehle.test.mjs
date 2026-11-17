import { test } from "node:test";
import assert from "node:assert/strict";
import { befehleAnwenden, befehlKontext, befehlAuswerten, netto } from "./kiBefehle.js";

const kp = [
  { id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 50 },
  { id: 2, kategorie: "material", bezeichnung: "XPS", einheit: "m²", preis: 20 },
  { id: 3, kategorie: "geraet", bezeichnung: "Rüttler", einheit: "h", preis: 10 },
];
const kalk = (h, mat, ger) => ({ lohnposten: [{ stammId: 1, menge: h }], materialposten: [{ stammId: 2, menge: mat }], geraetPosten: [{ stammId: 3, menge: ger }], fremdleistung: 0, zuschlagLohn: 0, zuschlagMaterial: 0, zuschlagGeraet: 0, zuschlagFremdleistung: 0 });
const lv = () => [
  { id: "t", bez: "── Dämmung ──" },
  { id: "a", oz: "01.10", bez: "Perimeterdämmung", einheit: "m²", menge: 100, ep: 32, kalk: kalk(20, 100, 10), preisquelle: { art: "stammposition", ref: "SP:1" } },
  { id: "b", oz: "01.20", bez: "Sockeldämmung", einheit: "m²", menge: 10, ep: 15 },
];

test("Kontext für die KI", () => {
  const t = befehlKontext(lv(), kp);
  assert.match(t, /— Dämmung —/);
  assert.match(t, /#1 OZ 01.10 \| Perimeterdämmung \| 100 m² \| EP 32,00 € \| Aufbau je Einheit: 0,2 h Facharbeiter \+ 1 m² XPS \+ 0,1 h Rüttler/);
  assert.match(t, /#2 OZ 01.20 .* ohne Kalkulation/);
});

test("Zeitansatz, Material, Gerät raus, Zuschlag", () => {
  const r = befehleAnwenden(lv(), [
    { op: "zeitansatz_setzen", positionen: [1], wert: 0.3 },
    { op: "material_aufschlag", positionen: [1], wert: 5 },
    { op: "kostenart_entfernen", positionen: [1], kostenart: "geraet" },
    { op: "zuschlag_setzen", kostenart: "lohn", wert: 20 },
  ], { kalkulationspreise: kp });
  const a = r.positionen.find(p => p.id === "a");
  assert.equal(a.kalk.lohnposten[0].menge, 30);
  assert.equal(a.kalk.materialposten[0].menge, 105);
  assert.deepEqual(a.kalk.geraetPosten, []);
  // 0,3 h × 50 € × 1,2 + 1,05 × 20 € = 18 + 21
  assert.equal(Math.round(a.ep * 100) / 100, 39);
  assert.equal(a.preisquelle.art, "manuell");
  assert.equal(r.protokoll.length, 4);
  assert.match(r.protokoll[0].text, /Pos. 01.10: Zeitansatz 0,2 → 0,3 h\/m²/);
  assert.equal(r.fehler.length, 0, "Zuschlag ohne Positionen trifft nur kalkulierte");
});

test("Menge über den Editor, EP von Hand, Fehler, Löschen, Hinzufügen", () => {
  const r = befehleAnwenden(lv(), [
    { op: "menge_setzen", positionen: [2], wert: 12 },
    { op: "ep_setzen", positionen: [2], wert: 17.5 },
    { op: "zeitansatz_setzen", positionen: [2], wert: 0.3 },
    { op: "menge_setzen", positionen: [9], wert: 1 },
    { op: "position_hinzufuegen", nach: 1, kurztext: "Noppenbahn", einheit: "m²", wert: 100 },
    { op: "position_loeschen", positionen: [1] },
  ], { kalkulationspreise: kp, mengeSetzen: (p, m) => ({ ...p, menge: m, ueberEditor: true }), neueId: () => "neu" });
  const b = r.positionen.find(p => p.id === "b");
  assert.equal(b.menge, 12); assert.equal(b.ueberEditor, true); assert.equal(b.ep, 17.5);
  assert.deepEqual(r.positionen.map(p => p.id), ["t", "neu", "b"]);
  assert.equal(r.fehler.length, 2);
  assert.match(r.fehler[0], /keine Lohnstunden/);
  assert.match(r.fehler[1], /Keine Position gefunden/);
  assert.equal(netto(r.positionen), 210);
});

test("KI-Antwort und Rückfrage", async () => {
  let inhalt;
  const r = await befehlAuswerten({ text: "Pos zwei Menge zwölf", positionen: lv(), kalkulationspreise: kp,
    rufeKi: async (s, m) => { inhalt = m[0].content; return { content: [{ type: "tool_use", name: "aenderungen_abgeben", input: { aenderungen: [], rueckfrage: "Welche Position?" } }] }; } });
  assert.match(inhalt, /Befehl: Pos zwei Menge zwölf$/);
  assert.equal(r.rueckfrage, "Welche Position?");
  await assert.rejects(befehlAuswerten({ text: "x", positionen: [], rufeKi: async () => ({ content: [] }) }), /nicht verstanden/);
});
