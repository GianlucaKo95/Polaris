import { test } from "node:test";
import assert from "node:assert/strict";
import { migrationsPlan, planZusammenfassung, projektStatusAusAngeboten, standPruefen } from "./migration.js";
import { altePositionenZuKnoten } from "./lvFlach.js";

const pos = (bez, menge, ep, extra = {}) => ({ id: Math.random(), bez, menge, einheit: "St", ep, ...extra });

test("Je Baustelle ein Projekt, je Angebot ein Stand, Nachträge als eigener Stand", () => {
  const projekte = [{ id: 7, name: "Kita Süd", auftraggeber: "Stadt", ort: "Duisburg" }];
  const angebote = [
    { id: 101, projekt_id: 7, titel: "Angebot Rohbau", datum: "2026-03-01", status: "angenommen", rabatt: 3, mwst: 19, positionen: [pos("A", 2, 10)] },
    { id: 102, projekt_id: 7, titel: "NT 1 Mehrmengen", datum: "2026-05-01", status: "entwurf", nachtrag_zu: 101, positionen: [pos("B", 1, 5)] },
    { id: 201, projekt_id: 8, titel: "Garage", datum: "2026-04-01", status: "versendet", positionen: [] },
  ];
  const plan = migrationsPlan(angebote, projekte);
  assert.equal(plan.length, 2);
  const kita = plan.find(p => p.projekt.projekt_id === 7);
  assert.equal(kita.projekt.name, "Kita Süd");
  assert.equal(kita.projekt.status, "auftrag");
  assert.deepEqual(kita.staende.map(s => [s.altes_angebot_id, s.art, s.nummer, s.gesperrt, s.nachlass]), [["101", "angebot", 1, true, 3], ["102", "nachtrag", 2, false, 0]]);
  assert.equal(kita.aktuellerStandIndex, 0);
  const garage = plan.find(p => p.projekt.projekt_id === 8);
  assert.equal(garage.projekt.name, "Garage");
  assert.equal(garage.projekt.status, "abgegeben");
});

test("Bereits übernommene Angebote werden übersprungen", () => {
  const plan = migrationsPlan([{ id: 1, projekt_id: 1, positionen: [] }, { id: 2, projekt_id: 1, positionen: [] }], [], { bereitsMigriert: new Set(["1"]) });
  assert.equal(plan[0].staende.length, 1);
  assert.equal(plan[0].staende[0].altes_angebot_id, "2");
});

test("Projektstatus aus den Hauptangeboten", () => {
  assert.equal(projektStatusAusAngeboten([{ status: "abgelehnt" }, { status: "abgelehnt" }]), "verloren");
  assert.equal(projektStatusAusAngeboten([{ status: "entwurf" }]), "in_bearbeitung");
  assert.equal(projektStatusAusAngeboten([{ status: "entwurf" }, { status: "angenommen", nachtrag_zu: 1 }]), "in_bearbeitung");
});

test("Summenprüfung: centgenau bei 2 Nachkommastellen, Abweichung und Hinweis bei mehr", () => {
  const sauber = [pos("A", 3, 33.33), pos("B", 123.456, 12.35)];
  const p1 = standPruefen(sauber, altePositionenZuKnoten(sauber));
  assert.equal(p1.abweichungCent, 0);
  assert.deepEqual(p1.hinweise, []);
  const unsauber = [pos("C", 10, 1.2345)];
  const p2 = standPruefen(unsauber, altePositionenZuKnoten(unsauber));
  assert.equal(p2.altCent, 1235);
  assert.equal(p2.neuCent, 1230);
  assert.ok(p2.hinweise[0].includes("gerundet"));
});

test("Positionsrabatt: Einheitspreis nach Rabatt wird wie in GAEB auf Cent gerundet", () => {
  const alt = [pos("A", 3, 33.33, { rabatt: 5 })];
  const p = standPruefen(alt, altePositionenZuKnoten(alt));
  assert.equal(p.abweichungCent, -1);
  assert.ok(p.hinweise.some(h => h.includes("Rabatt")));
});

test("Zusammenfassung über alle Stände", () => {
  const plan = migrationsPlan([
    { id: 1, projekt_id: 1, positionen: [pos("A", 1, 1), pos("B", 10, 1.2345)] },
    { id: 2, projekt_id: 2, positionen: [pos("C", 2, 2)] },
  ], []);
  const z = planZusammenfassung(plan);
  assert.equal(z.projekte, 2);
  assert.equal(z.staende, 2);
  assert.equal(z.positionen, 3);
  assert.equal(z.mitAbweichung, 1);
});

test("Alte Positionskalkulationen werden Ansätze; abweichende EP bleiben als EP manuell", async () => {
  const { lokalSpeicher } = await import("./speicherLokal.js");
  const kp = [{ id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 50 }, { id: 2, kategorie: "material", bezeichnung: "Beton", einheit: "m³", preis: 100 }];
  const kalkA = { lohnposten: [{ stammId: 1, menge: 20 }], materialposten: [{ stammId: 2, menge: 10 }], zuschlagLohn: 20, zuschlagMaterial: 10 };
  const kalkB = { ...kalkA, zuschlagLohn: 50 }; // andere Sätze als der Stand
  const angebot = { id: 1, projekt_id: 1, status: "entwurf", positionen: [
    pos("A", 10, 230, { kalk: kalkA }), // 20 h × 50 × 1,2 + 10 × 100 × 1,1 = 2300 → EP 230
    pos("B", 10, 260, { kalk: kalkB }),
  ] };
  const plan = migrationsPlan([angebot], [], { kalkulationspreise: kp });
  const st = plan[0].staende[0];
  assert.equal(st.ansaetze.length, 4);
  assert.deepEqual(st.zuschlaege.saetze, { lohn: 20, material: 10, geraet: 0, fremd: 0, sonstiges: 0 });
  assert.equal(st.knoten.find(k => k.kurztext === "A").extra.epManuell, undefined);
  assert.equal(st.knoten.find(k => k.kurztext === "B").extra.epManuell, true);
  assert.ok(st.pruefung.hinweise.some(h => h.includes("1 von 2")));
  const s = lokalSpeicher();
  await s.planUebernehmen(plan);
  const [p] = await s.projekteLaden();
  const [stand] = await s.staendeLaden(p.id);
  assert.equal((await s.ansaetzeLaden(stand.id)).length, 4);
  assert.equal(stand.zuschlaege.saetze.lohn, 20);
});
