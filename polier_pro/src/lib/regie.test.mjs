import { test } from "node:test";
import assert from "node:assert/strict";
import { regieSummen, werktageDazu, regieStand, regieAlsPositionen, naechsteNummer, regieHtml, regieSaetzeFuer, freigabeAnlegen, freigabeSperre, freigabeEntscheiden, freigabeLink, neuerFreigabeToken } from "./regie.js";

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

test("regieSaetzeFuer: Baustelle überschreibt Firma, Rest bleibt", () => {
  const firma = { lohnsaetze: [{ bez: "Facharbeiter", satz: 52 }], materialZuschlag: 15, fristWerktage: 6 };
  assert.equal(regieSaetzeFuer(firma, {}).quelle, "firma");
  assert.equal(regieSaetzeFuer(firma, { regie_saetze: null }).lohnsaetze[0].satz, 52);
  const e = regieSaetzeFuer(firma, { regie_saetze: { lohnsaetze: [{ bez: "Facharbeiter", satz: 58.5 }] } });
  assert.equal(e.quelle, "baustelle");
  assert.equal(e.lohnsaetze[0].satz, 58.5);
  assert.equal(e.materialZuschlag, 15);
  assert.equal(regieSaetzeFuer(firma, { regie_saetze: { lohnsaetze: [], materialZuschlag: 8 } }).lohnsaetze[0].satz, 52);
  assert.equal(regieSaetzeFuer(null, null).fristWerktage, 6);
});

test("Freigabe-Link: anlegen, einmal entscheiden, Ablauf", () => {
  const jetzt = new Date("2026-11-17T10:00:00Z");
  const tok = neuerFreigabeToken();
  assert.match(tok, /^[0-9a-f]{48}$/);
  assert.notEqual(tok, neuerFreigabeToken());
  assert.equal(freigabeLink("ab c", "https://x.de/"), "https://x.de/?regie=ab%20c");
  const f = freigabeAnlegen({ status: "entwurf" }, "2026-11-17", jetzt, "t1");
  assert.equal(f.status, "eingereicht");
  assert.equal(f.eingereicht_am, "2026-11-17");
  assert.equal(f.freigabe_bis, "2026-12-01T10:00:00.000Z");
  // erneuter Link behält das Zugangsdatum (Frist läuft ab erstem Zugang)
  assert.equal(freigabeAnlegen({ status: "eingereicht", eingereicht_am: "2026-11-10" }, "2026-11-17", jetzt, "t2").eingereicht_am, "2026-11-10");
  assert.equal(freigabeSperre(f, jetzt), null);
  assert.equal(freigabeSperre(f, new Date("2026-12-02T00:00:00Z")), "Der Link ist abgelaufen");
  assert.equal(freigabeEntscheiden(f, { entscheidung: "unterschreiben", name: "", bild: "x" }, jetzt).fehler, "Bitte den eigenen Namen eintragen");
  assert.equal(freigabeEntscheiden(f, { entscheidung: "unterschreiben", name: "M. Weber" }, jetzt).fehler, "Bitte im Feld unterschreiben");
  const u = freigabeEntscheiden(f, { entscheidung: "unterschreiben", name: " M. Weber ", bild: "data:x" }, jetzt).bericht;
  assert.equal(u.status, "unterschrieben");
  assert.deepEqual(u.unterschrift, { name: "M. Weber", am: jetzt.toISOString(), bild: "data:x", per: "link" });
  assert.equal(u.freigabe_token, null);
  assert.equal(freigabeEntscheiden(u, { entscheidung: "beanstanden", name: "X", grund: "y" }, jetzt).fehler, "Der Bericht ist bereits unterschrieben");
  const be = freigabeEntscheiden(f, { entscheidung: "beanstanden", name: "M. Weber", grund: "2 h zu viel" }, jetzt).bericht;
  assert.equal(be.status, "beanstandet");
  assert.equal(be.beanstandung, "2 h zu viel (M. Weber)");
  assert.equal(freigabeSperre({ ...f, abgerechnet_in: { angebot_id: 1 } }, jetzt), "Der Bericht ist bereits abgerechnet");
});
