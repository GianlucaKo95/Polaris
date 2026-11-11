import { test } from "node:test";
import assert from "node:assert/strict";
import { gaebX31Schreiben } from "./gaebX31.js";

test("X31: erbrachte Menge = Vertragsmenge × Leistungsstand, OZ-Struktur erhalten", () => {
  const auftrag = { id: 1, titel: "Rohbau", positionen: [
    { id: 10, oz: "01.0010", bez: "Beton", menge: 120, einheit: "m³", ep: 100 },
    { id: 11, oz: "01.0020", bez: "Schalung", menge: 50, einheit: "m²", ep: 30 },
    { id: 12, oz: "02.0010", bez: "Bedarf", art: "bedarf", menge: 10, einheit: "m", ep: 5 },
  ] };
  const { text, anzahl, warnungen } = gaebX31Schreiben({ auftrag, fortschritt: [{ position_id: 10, prozent: 25 }, { position_id: 12, prozent: 100 }], datum: "2026-11-30" });
  assert.equal(warnungen.length, 0);
  assert.equal(anzahl, 3);
  assert.match(text, /DA31\/3\.3/);
  assert.match(text, /<DP>31<\/DP>/);
  assert.match(text, /<Item ID="I\d+" RNoPart="0010"><QtyDeterm><Qty>30\.000<\/Qty>/);
  assert.match(text, /RNoPart="0020"><QtyDeterm><Qty>0\.000/);
  assert.equal((text.match(/<BoQCtgy /g) || []).length, 2);
});
