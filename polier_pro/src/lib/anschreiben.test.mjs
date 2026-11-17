import { test } from "node:test";
import assert from "node:assert/strict";
import { anschreibenKontext, anschreibenEntwerfen, anschreibenHtml, anschreibenPrompt } from "./anschreiben.js";

const angebot = { titel: "Rohbau Garage", empfaenger: "Familie Weber", gueltig_bis: "2026-12-31", positionen: [
  { id: 1, bez: "── Rohbau ──" }, { id: 2, bez: "Beton Bodenplatte", kiKalkulation: { fehlt: ["Schalung Stirnseiten"] } },
  { id: 3, bez: "Wasserhaltung", art: "bedarf" } ] };

test("Kontext und Prompt", () => {
  const k = anschreibenKontext({ angebot, projekt: { name: "EFH Huckingen", ort: "Duisburg" }, firma: { name: "Demo GmbH" },
    annahmen: ["Baugrund tragfähig"], risiken: [{ text: "Vertragsstrafe ohne Obergrenze" }], vorbehalte: ["NU: ohne Gerüst"], netto: 12345.6 });
  assert.match(k, /Bauvorhaben: EFH Huckingen, Duisburg/);
  assert.match(k, /2 Positionen \(davon 1 Bedarfs-\/Alternativpositionen\), netto 12\.345,60 €/);
  assert.match(k, /Abschnitte: Rohbau/);
  assert.match(k, /- Baugrund tragfähig/);
  assert.match(k, /offene Bausteine: Schalung Stirnseiten/);
  assert.match(k, /- NU: ohne Gerüst/);
  assert.match(k, /Bindefrist bis 31\.12\.2026/);
  assert.match(anschreibenPrompt({ vob: true }), /§ 16 VOB\/B/);
  assert.match(anschreibenPrompt({ vob: false }), /§ 632a BGB/);
});

test("Entwurf und HTML", async () => {
  const e = await anschreibenEntwerfen({ kontext: "x", vob: true, rufeKi: async () => ({ content: [{ type: "tool_use", name: "anschreiben_abgeben", input: {
    einleitung: "Sehr geehrte Familie Weber,\nvielen Dank für Ihre Anfrage.", annahmen: ["Baugrund tragfähig", " "], ausschluesse: ["Gerüst"], zahlung: "Abschläge nach Leistungsstand", schluss: "" } }] }) });
  assert.deepEqual(e.annahmen, ["Baugrund tragfähig"]);
  const h = anschreibenHtml({ ...e, ausschluesse: ["<script>"] }, s => String(s).replace(/</g, "&lt;"));
  assert.match(h.vorTabelle, /Weber,<br>vielen Dank/);
  assert.match(h.nachSummen, /Grundlagen und Annahmen.*Baugrund tragfähig/);
  assert.match(h.nachSummen, /&lt;script>/);
  assert.match(h.nachSummen, /Zahlungsbedingungen/);
  assert.deepEqual(anschreibenHtml(null, String), { vorTabelle: "", nachSummen: "" });
  await assert.rejects(anschreibenEntwerfen({ kontext: "", rufeKi: async () => ({}) }), /keinen Entwurf/);
});
