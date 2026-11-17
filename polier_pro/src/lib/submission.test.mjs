import { test } from "node:test";
import assert from "node:assert/strict";
import { submissionAuswerten, positionsVergleich, firmenAuswertung, musterText, musterErklaeren, bestbieterAusEinlesung } from "./submission.js";

const angebot = (id, status, positionen, submission) => ({ id, titel: `Angebot ${id}`, status, positionen, submission });
const lvA = [
  { id: 1, bez: "── Erdarbeiten ──" },
  { id: 2, bez: "Aushub", einheit: "m³", menge: 500, ep: 14 },
  { id: 3, bez: "Verfüllen", einheit: "m³", menge: 200, ep: 9 },
  { id: 4, bez: "── Rohbau ──" },
  { id: 5, bez: "Mauerwerk", einheit: "m²", menge: 300, ep: 70, stammpositionId: 7 },
  { id: 6, bez: "Bedarf", einheit: "psch", menge: 1, ep: 999, art: "bedarf" },
];

test("Auswertung je Angebot", () => {
  const a = angebot("a", "abgelehnt", lvA, { bieter: [{ name: "Müller", summe: 26000 }, { name: "Schmidt", summe: 29000 }] });
  const r = submissionAuswerten(a);
  assert.equal(r.eigen, 29800);
  assert.equal(r.best, 26000); assert.equal(r.rang, 3); assert.equal(r.bieter, 3);
  assert.equal(r.abstand, 0.1462);
  const g = submissionAuswerten(angebot("b", "angenommen", lvA, { bieter: [{ summe: 32000 }] }));
  assert.equal(g.rang, 1); assert.equal(g.bester, true); assert.ok(g.abstand < 0);
  assert.equal(submissionAuswerten(angebot("c", "versendet", lvA, null)), null);
});

test("Positionsvergleich und Firmenauswertung je Gewerk", () => {
  const sp = [{ id: 7, gewerk: "Mauerwerksbau" }];
  const a = angebot("a", "abgelehnt", lvA, { bieter: [{ summe: 26000 }], bestbieterEp: { 2: 10, 3: 9, 5: 66.5, 6: 500 } });
  const z = positionsVergleich(a, sp);
  assert.deepEqual(z.map(x => [x.gewerk, x.abweichung]), [["Erdarbeiten", 0.4], ["Erdarbeiten", 0], ["Mauerwerksbau", 0.0526]]);
  const b = angebot("b", "angenommen", lvA, { bieter: [{ summe: 31000 }], bestbieterEp: { 2: 13 } });
  const f = firmenAuswertung([a, b, angebot("c", "versendet", lvA, null)], sp);
  assert.equal(f.angebote, 2); assert.equal(f.entschieden, 2); assert.equal(f.quote, 0.5);
  const erd = f.jeGewerk.find(g => g.gewerk === "Erdarbeiten");
  // (500×14 + 200×9 + 500×14) / (500×10 + 200×9 + 500×13) = 15800 / 13300
  assert.equal(erd.abweichung, 0.188);
  assert.equal(erd.angebote, 2); assert.equal(erd.beispiele[0].abweichung, 0.4);
  assert.equal(f.jeGewerk[0].gewerk, "Erdarbeiten");
  assert.match(musterText(f), /Quote 50 %/);
  assert.match(musterText(f), /- Erdarbeiten: \+18,8 % aus 3 Positionen in 2 Angeboten/);
});

test("KI und Preisspiegel-Einlesung", async () => {
  const r = await musterErklaeren({ angebote: 0, entschieden: 0, gewonnen: 0, quote: null, abstandMittel: null, knappVerloren: 0, jeGewerk: [] },
    async (system) => { assert.match(system, /Keine Empfehlung, Preise unter Kosten/); return { content: [{ type: "tool_use", name: "muster_abgeben", input: { zusammenfassung: "vorläufig", muster: [{ gewerk: "Erd", befund: "zu teuer", empfehlung: "Gerät prüfen" }, { gewerk: "x" }] } }] }; });
  assert.equal(r.muster.length, 1);
  assert.deepEqual(bestbieterAusEinlesung({ positionen: [{ quellPosId: 2, ep: 10 }, { quellPosId: null, ep: 3 }, { quellPosId: 3, ep: 0 }] }), { 2: 10 });
});
