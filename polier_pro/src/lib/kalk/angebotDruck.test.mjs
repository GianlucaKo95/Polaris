import { test } from "node:test";
import assert from "node:assert/strict";
import { angebotHtml, angebotSummen } from "./angebotDruck.js";

const k = [
  { id: "t", parent_id: null, sort: 1, typ: "titel", oz: "01", kurztext: "Rohbau <Beton>", menge: 0, ep: 0, rabatt: 0 },
  { id: "a", parent_id: "t", sort: 1, typ: "position", oz: "01.0010", art: "normal", kurztext: "Decke", langtext: "C25/30", menge: 10, einheit: "m³", ep: 200, rabatt: 0 },
  { id: "b", parent_id: "t", sort: 2, typ: "position", oz: "01.0020", art: "bedarf", kurztext: "Wasserhaltung", langtext: "", menge: 1, einheit: "psch", ep: 500, rabatt: 0 },
];

test("Summen mit Nachlass und MwSt, kaufmännisch gerundet", () => {
  assert.deepEqual(angebotSummen(k, { nachlass: 3, mwst: 19 }), { netto: 2000, nachlass: 3, nachlassBetrag: 60, nettoNach: 1940, mwst: 19, steuer: 368.6, brutto: 2308.6 });
});

test("HTML enthält Titel, Titelsumme, Bedarf in Klammern und maskiert Text", () => {
  const html = angebotHtml(k, { stand: { bezeichnung: "Angebot Rohbau", nachlass: 0, mwst: 19 }, projekt: { name: "Kita" }, firma: { name: "Demo GmbH" }, datum: "2026-11-18" });
  assert.ok(html.includes("Rohbau &lt;Beton&gt;"));
  assert.ok(html.includes("Summe 01"));
  assert.ok(html.includes("(500,00)"));
  assert.ok(html.includes("2.380,00 €"));
  assert.ok(html.includes("C25/30"));
});

test("Kurztext als Anfang des Langtexts wird nicht doppelt gedruckt", async () => {
  const { druckTexte } = await import("./angebotDruck.js");
  assert.deepEqual(druckTexte({ kurztext: "Beton liefern und …", langtext: "Beton liefern und einbauen, C25/30" }), { kurz: "", lang: "Beton liefern und einbauen, C25/30" });
  assert.deepEqual(druckTexte({ kurztext: "Decke", langtext: "C25/30" }), { kurz: "Decke", lang: "C25/30" });
});
