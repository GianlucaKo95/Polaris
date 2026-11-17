import { test } from "node:test";
import assert from "node:assert/strict";
import { stoffgruppeVon, materialJeGruppe, risikoBewerten, aufschlagAnwenden, vorbehaltText, bausteineZuordnen } from "./materialrisiko.js";
import { preisSetzen } from "./preisstand.js";

const kp = [
  { id: 1, kategorie: "material", bezeichnung: "Betonstahl B500 Matten", einheit: "t", preis: 1000 },
  { id: 2, kategorie: "material", bezeichnung: "Transportbeton C25/30", einheit: "m³", preis: 130 },
  { id: 3, kategorie: "material", bezeichnung: "Kleinteile", einheit: "psch", preis: 50 },
  { id: 4, kategorie: "lohn", bezeichnung: "FA", einheit: "h", preis: 50 },
];
const pos = [
  { id: 1, bez: "── Rohbau ──" },
  { id: 2, bez: "Bodenplatte", menge: 100, ep: 300, kalk: { materialposten: [{ stammId: 2, menge: 100 }, { stammId: 1, menge: 8 }, { stammId: 3, menge: 1 }], lohnposten: [{ stammId: 4, menge: 100 }] } },
  { id: 3, bez: "Wasserhaltung", art: "bedarf", menge: 1, ep: 900, kalk: { materialposten: [{ stammId: 1, menge: 50 }] } },
];

test("Stoffgruppen und Mengen", () => {
  assert.equal(stoffgruppeVon(kp[0]), "stahl", "Betonstahl ist Stahl, nicht Beton");
  assert.equal(stoffgruppeVon(kp[1]), "beton");
  assert.equal(stoffgruppeVon(kp[2]), "sonstige");
  assert.equal(stoffgruppeVon(kp[2], { "3": "holz" }), "holz");
  const m = materialJeGruppe(pos, kp);
  assert.equal(m.netto, 30000);
  const g = Object.fromEntries(m.gruppen.map(x => [x.gruppe, x.kosten]));
  assert.deepEqual(g, { beton: 13000, stahl: 8000, sonstige: 50 }, "Bedarfsposition zählt nicht");
});

test("Risiko, Empfehlung, Aufschlag, Vorbehalt", () => {
  const b = risikoBewerten(materialJeGruppe(pos, kp), { monateBisBeginn: 6, dauerMonate: 6 });
  // 9 Monate: Stahl 20 % × √0,75 = 17,3 % → 1.385,64 €
  const stahl = b.find(x => x.gruppe === "stahl");
  assert.equal(stahl.risiko, 1385.64);
  assert.equal(stahl.empfehlung, "gleitklausel");
  assert.equal(stahl.aufschlagProzent, 8.7);
  assert.equal(b[0].gruppe, "stahl", "nach Risiko sortiert");
  assert.equal(b.find(x => x.gruppe === "sonstige").empfehlung, "keine");
  assert.equal(risikoBewerten(materialJeGruppe(pos, kp), { monateBisBeginn: 6, dauerMonate: 6, schwankung: { stahl: 0 } }).find(x => x.gruppe === "stahl").risiko, 0);
  const ps = { kalkulationspreise: kp.map(k => ({ ...k })) };
  const neu = aufschlagAnwenden(ps, stahl, preisSetzen);
  assert.equal(neu.kalkulationspreise[0].preis, 1087);
  assert.deepEqual(neu.kalkulationspreise[0].quelle, { art: "risiko", basis: 1000, prozent: 8.7 });
  // Erneut anwenden rechnet von der Basis, nicht doppelt
  assert.equal(aufschlagAnwenden(neu, stahl, preisSetzen).kalkulationspreise[0].preis, 1087);
  assert.match(vorbehaltText(stahl, "17.11.2026"), /Stahl, Betonstahl beruhen auf dem Preisstand vom 17\.11\.2026\. Für diese Stoffe gilt eine Stoffpreisgleitklausel/);
});

test("KI-Zuordnung nur gültige Gruppen und Bausteine", async () => {
  const z = await bausteineZuordnen([kp[2]], async () => ({ content: [{ type: "tool_use", name: "stoffe_zuordnen", input: { zuordnung: [{ id: "3", gruppe: "kupfer" }, { id: "9", gruppe: "holz" }, { id: "3", gruppe: "gold" }] } }] }));
  assert.deepEqual(z, { "3": "kupfer" });
  assert.deepEqual(await bausteineZuordnen([], null), {});
});
