import { test } from "node:test";
import assert from "node:assert/strict";
import { regieSummen, werktageDazu, regieStand, regieAlsPositionen, naechsteNummer, regieHtml } from "./regie.js";

const einst = { lohnsaetze: [], materialZuschlag: 10, fristWerktage: 6 };
const b = { nummer: 3, datum: "2026-11-10", beschreibung: "Leitung freilegen",
  personal: [{ name: "A", lohngruppe: "Facharbeiter", stunden: 8, satz: 58 }, { name: "B", lohngruppe: "Facharbeiter", stunden: 6.5, satz: 58 }, { name: "C", lohngruppe: "Helfer", stunden: 8, satz: 49 }],
  geraete: [{ bezeichnung: "Minibagger", stunden: 5, satz: 32 }], material: [{ bezeichnung: "Kies 0/32", menge: 4, einheit: "t", preis: 21 }] };

test("regieSummen mit Materialzuschlag", () => {
  const s = regieSummen(b, einst);
  assert.equal(s.stunden, 22.5);
  assert.equal(s.lohn, 14.5 * 58 + 8 * 49);
  assert.equal(s.geraete, 160);
  assert.equal(s.material, 92.4);
  assert.equal(s.netto, 14.5 * 58 + 392 + 160 + 92.4);
});

test("6 Werktage: Samstag zählt, Sonntag und Feiertag nicht", () => {
  assert.equal(werktageDazu("2026-11-10", 6), "2026-11-17");   // Di → Di (So 15. übersprungen)
  assert.equal(werktageDazu("2026-12-22", 6, "NW"), "2026-12-31"); // 25./26.12. und 27.12. (So) übersprungen
});

test("regieStand: offene Frist und Anerkennung nach Ablauf", () => {
  const e = { status: "eingereicht", eingereicht_am: "2026-11-10" };
  assert.equal(regieStand(e, "2026-11-17").stand, "offen");
  const r = regieStand(e, "2026-11-18");
  assert.equal(r.stand, "anerkannt"); assert.equal(r.fristAbgelaufen, true);
  assert.equal(regieStand({ status: "unterschrieben" }, "2026-11-12").stand, "anerkannt");
  assert.equal(regieStand({ status: "unterschrieben", abgerechnet_in: { angebot_id: 1 } }, "2026-11-12").stand, "abgerechnet");
  assert.equal(regieStand({ status: "entwurf" }, "2026-11-12").stand, "entwurf");
});

test("regieAlsPositionen fasst Lohngruppen zusammen und schlägt Material auf", () => {
  const p = regieAlsPositionen([b], einst, 100);
  assert.equal(p[0].bez, "── Regiebericht Nr. 3 vom 10.11.2026 ──");
  const fa = p.find(x => x.bez === "Stundenlohn Facharbeiter");
  assert.equal(fa.menge, 14.5); assert.equal(fa.ep, 58);
  assert.equal(p.find(x => x.bez === "Material: Kies 0/32").ep, 23.1);
  assert.equal(p.length, 5);
  assert.equal(naechsteNummer([{ nummer: 2 }, { nummer: 7 }]), 8);
});

test("regieHtml escaped Eingaben", () => {
  const html = regieHtml({ ...b, beschreibung: "<script>x</script>" }, { projekt: { name: "P" }, firma: { name: "F" }, einst, esc: s => String(s ?? "").replace(/</g, "&lt;") });
  assert.ok(!html.includes("<script>x"));
  assert.ok(html.includes("Regiebericht Nr. 3"));
});
