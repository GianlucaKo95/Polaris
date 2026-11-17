import { test } from "node:test";
import assert from "node:assert/strict";
import { beobachtungen, erfahrungJeStammposition, zeitansatzUebernehmen, abweichungenErklaeren, erklaerText } from "./erfahrungswerte.js";

const kp = [{ id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 50 }, { id: 2, kategorie: "material", bezeichnung: "XPS", einheit: "m²", preis: 20 }];
const sp = [{ id: 7, bez: "Perimeterdämmung", einheit: "m²", rezeptur: [{ stammId: 1, mengeJeEinheit: 0.2 }, { stammId: 2, mengeJeEinheit: 1.05 }] },
  { id: 8, bez: "Planum", einheit: "m²", rezeptur: [{ stammId: 1, mengeJeEinheit: 0.05 }] }];
const pos = (id, spId, menge, stdJeE) => ({ id, bez: "x", einheit: "m²", menge, stammpositionId: spId, kalk: { lohnposten: [{ stammId: 1, menge: menge * stdJeE }] } });
const angebote = [
  { id: "a1", projekt_id: 1, status: "angenommen", positionen: [pos("p1", 7, 500, 0.2), pos("p2", 8, 1000, 0.05)] },
  { id: "a2", projekt_id: 2, status: "angenommen", positionen: [pos("p1", 7, 300, 0.2)] },
  { id: "a3", projekt_id: 3, status: "entwurf", positionen: [pos("p1", 7, 300, 0.2)] },
];
const fortschritt = [
  { angebot_id: "a1", position_id: "p1", prozent: 100 }, { angebot_id: "a1", position_id: "p2", prozent: 50 },
  { angebot_id: "a2", position_id: "p1", prozent: 50 }, { angebot_id: "a3", position_id: "p1", prozent: 100 },
];
const verteilung = [
  { angebot_id: "a1", position_id: "p1", stunden: 80 }, { angebot_id: "a1", position_id: "p1", stunden: 45 },
  { angebot_id: "a1", position_id: "p2", stunden: 25.5 },
  { angebot_id: "a2", position_id: "p1", stunden: 45 }, { angebot_id: "a3", position_id: "p1", stunden: 99 },
];
const projekte = [{ id: 1, name: "Parkhaus" }, { id: 2, name: "Kita" }];

test("Beobachtungen und Erfahrung je Stammposition", () => {
  const b = beobachtungen({ angebote, fortschritt, verteilung, kalkulationspreise: kp, projekte });
  assert.equal(b.length, 3, "nur angenommene Aufträge");
  const p1 = b.find(x => x.key === "a1:p1");
  assert.equal(p1.istJeE, 0.25); assert.equal(p1.sollErbracht, 100); assert.equal(p1.projekt, "Parkhaus");
  const e = erfahrungJeStammposition(b, sp, kp);
  const daemm = e.find(x => x.sp.id === 7);
  // Soll 100 + 30 = 130 h, Ist 125 + 45 = 170 h → Faktor 1,3077
  assert.equal(daemm.status, "anpassen");
  assert.equal(daemm.baustellen, 2);
  assert.equal(Math.round(daemm.faktor * 1000) / 1000, 1.308);
  assert.equal(daemm.aktuell, 0.2);
  // Gewicht 130/170 → 1 + 0,3077 × 0,7647 = 1,2353 → 0,247
  assert.equal(daemm.vorschlag, 0.247);
  assert.equal(Math.round(daemm.istJeE * 1000) / 1000, 0.262);
  assert.deepEqual([Math.round(daemm.spanne.min * 100) / 100, daemm.spanne.max], [0.25, 0.3]);
  const planum = e.find(x => x.sp.id === 8);
  assert.equal(planum.status, "bestaetigt", "25,5 h Ist zu 25 h Soll: innerhalb 5 %");
  assert.equal(e[0].sp.id, 7, "Anpassungsbedarf zuerst");
  assert.equal(erfahrungJeStammposition(b, sp, kp, { minSoll: 500 })[0].status, "zu_wenig");
});

test("Übernehmen skaliert Lohn und zählt Beobachtungen nicht doppelt", () => {
  const b = beobachtungen({ angebote, fortschritt, verteilung, kalkulationspreise: kp, projekte });
  const e = erfahrungJeStammposition(b, sp, kp).find(x => x.sp.id === 7);
  const neu = zeitansatzUebernehmen(sp, e, 0.25, kp, "2026-11-17");
  const d = neu.find(x => x.id === 7);
  assert.equal(d.rezeptur[0].mengeJeEinheit, 0.25);
  assert.equal(d.rezeptur[1].mengeJeEinheit, 1.05, "Material bleibt");
  assert.deepEqual(d.nachkalkulation[0].positionen, ["a1:p1", "a2:p1"]);
  assert.equal(d.nachkalkulation[0].von, 0.2); assert.equal(d.nachkalkulation[0].auf, 0.25);
  assert.equal(neu.find(x => x.id === 8), sp[1]);
  const danach = erfahrungJeStammposition(b, neu, kp).find(x => x.sp.id === 7);
  assert.equal(danach.status, "eingeflossen");
  assert.equal(danach.eingeflosseneAnzahl, 2);
});

test("KI-Bewertung wird zugeordnet und begrenzt", async () => {
  const b = beobachtungen({ angebote, fortschritt, verteilung, kalkulationspreise: kp, projekte });
  const e = erfahrungJeStammposition(b, sp, kp).filter(x => x.status === "anpassen");
  assert.match(erklaerText(e), /Parkhaus: 500 m² erbracht \(100 %\), Ist 0,25 h\/E, kalkuliert 0,2 h\/E/);
  const r = await abweichungenErklaeren(e, async () => ({ content: [{ type: "tool_use", name: "erfahrung_bewerten", input: { bewertungen: [
    { nr: 1, empfehlung: "teilweise", zeitansatz: 0.24, erklaerung: "Kita mit kleinen Teilflächen", ausreisser: ["Kita"] }, { nr: 9, empfehlung: "uebernehmen", erklaerung: "?" }] } }] }));
  assert.equal(r.get(7).zeitansatz, 0.24);
  assert.deepEqual(r.get(7).ausreisser, ["Kita"]);
  assert.equal(r.size, 1);
});
