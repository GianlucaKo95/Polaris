import { test } from "node:test";
import assert from "node:assert/strict";
import { lokalSpeicher } from "./speicherLokal.js";
import { einfuegen } from "./lvBaum.js";
import { migrationsPlan } from "./migration.js";

test("Projekt anlegen, Positionen speichern, sperren, neuer Stand", async () => {
  const s = lokalSpeicher();
  const p = await s.projektAnlegen({ name: "Kita" });
  const [st] = await s.staendeLaden(p.id);
  const ae = einfuegen([], { felder: { kurztext: "Aushub", menge: 10, ep: 12.5, einheit: "m3" } });
  await s.knotenSpeichern(st.id, ae);
  assert.equal((await s.projekteLaden())[0].summe, 125);
  await s.standSperren(st.id);
  await assert.rejects(s.knotenSpeichern(st.id, { aendern: [{ id: ae.neu[0].id, felder: { ep: 1 } }] }), /gesperrt/);
  const neu = await s.standKopieren(st.id, "auftrag", "Auftrag");
  assert.equal(neu.nummer, 2);
  const k2 = await s.knotenLaden(neu.id);
  assert.notEqual(k2[0].id, ae.neu[0].id);
  await s.knotenSpeichern(neu.id, { aendern: [{ id: k2[0].id, felder: { ep: 13 } }] });
  const staende = await s.staendeLaden(p.id);
  assert.deepEqual(staende.map(x => x.summe), [125, 130]);
  const prot = await s.protokollLaden(p.id);
  assert.ok(prot.some(e => e.aenderung.ep));
});

test("Persistenz über ein Speicherobjekt", async () => {
  const m = new Map();
  const ls = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  await lokalSpeicher({ speicher: ls }).projektAnlegen({ name: "A" });
  assert.equal((await lokalSpeicher({ speicher: ls }).projekteLaden()).length, 1);
});

test("Übernahme legt gesperrte Stände mit eingefrorener Summe an und ist wiederholbar", async () => {
  const s = lokalSpeicher();
  const angebote = [{ id: 5, projekt_id: 1, status: "versendet", positionen: [{ bez: "A", menge: 2, einheit: "St", ep: 3 }] }];
  await s.planUebernehmen(migrationsPlan(angebote, [{ id: 1, name: "Bau 1" }]));
  const [p] = await s.projekteLaden();
  assert.equal(p.name, "Bau 1");
  assert.equal(p.summe, 6);
  const [st] = await s.staendeLaden(p.id);
  assert.equal(st.gesperrt, true);
  const zweiterPlan = migrationsPlan(angebote, [], { bereitsMigriert: await s.bereitsMigriert() });
  assert.equal(zweiterPlan.length, 0);
});
