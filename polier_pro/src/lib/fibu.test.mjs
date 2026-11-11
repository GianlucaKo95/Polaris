import { test } from "node:test";
import assert from "node:assert/strict";
import { ausgangsPosten, eingangsPosten, opUebersicht, mahnVorschlag, datevBuchungenFinanzen, mahnungHtml, scanPlausibel, kostenJeBaustelle } from "./fibu.js";
import { datevStapel } from "./datev.js";

const projekt = { id: 7, name: "EFH Müller", auftraggeber: "Familie Müller", projektnummer: "B-107" };
const ar = { id: 1, projekt_id: 7, typ: "abschlag", nummer: "2026-001", datum: "2026-10-01", status: "versendet", netto_betrag: 10000, mwst: 19, sicherheitseinbehalt_prozent: 0,
  zahlungen: [{ datum: "2026-10-20", betrag: 5000 }] };
const er = { id: 9, projekt_id: 7, lieferant: "Rohbau Sub GmbH", rechnungsnr: "R-55", datum: "2026-10-10", netto: 1000, ust_satz: 0, brutto: 1000,
  bauleistung: true, freistellung: false, skonto_prozent: 2, skonto_tage: 10, zahlungen: [] };

test("Forderung: Fälligkeit nach VOB/B (21 Tage), offen nach Teilzahlung", () => {
  const p = ausgangsPosten(ar, projekt);
  assert.equal(p.faellig, "2026-10-22"); assert.equal(p.betrag, 11900); assert.equal(p.offen, 6900); assert.equal(p.kostenstelle, "B-107");
});

test("Verbindlichkeit: Bauabzugsteuer 15 % ohne Freistellung, Skonto", () => {
  const p = eingangsPosten(er, projekt);
  assert.equal(p.bauabzug, 150); assert.equal(p.betrag, 850); assert.equal(p.skontoBis, "2026-10-20"); assert.equal(p.skontoBetrag, 20);
  assert.equal(eingangsPosten({ ...er, freistellung: true }).bauabzug, 0);
});

test("Übersicht, Altersklassen, Mahnvorschlag", () => {
  const posten = [ausgangsPosten(ar, projekt), eingangsPosten(er, projekt)];
  const u = opUebersicht(posten, "2026-11-11");
  assert.equal(u.forderungen, 6900); assert.equal(u.verbindlichkeiten, 850);
  assert.equal(u.klassen["1–30 Tage"].forderung, 6900);
  const m = mahnVorschlag(posten[0], "2026-11-11"); // 20 Tage überfällig → Stufe 1
  assert.equal(m.stufe, 1);
  assert.equal(mahnVorschlag({ ...posten[0], mahnungen: [{ stufe: 1, datum: "2026-11-05" }] }, "2026-11-11"), null); // < 10 Tage seit letzter
  assert.match(mahnungHtml(posten[0], m, { eigeneFirma: { name: "Bau GmbH" }, heute: "2026-11-11" }), /Zahlungserinnerung[\s\S]*6\.900,00 €/);
  assert.deepEqual(kostenJeBaustelle([er]), { 7: 1000 });
});

test("DATEV: Eingangsrechnung mit Kostenstelle, Zahlungen", () => {
  const b = datevBuchungenFinanzen({ ausgang: [ausgangsPosten(ar, projekt)], eingang: [eingangsPosten(er, projekt)], von: "2026-10-01", bis: "2026-10-31" });
  assert.deepEqual(b.map(x => [x.sh, x.konto, x.gegenkonto, x.betrag]), [["H", "70000", "3100", 1000], ["H", "10000", "1200", 5000]]);
  const { text } = datevStapel(b, { beraternummer: "29098", mandantennummer: "55003" });
  const z = text.split("\r\n");
  assert.equal(z[1].split(";").length, 37); assert.ok(z[1].endsWith("KOST1 - Kostenstelle"));
  assert.ok(z[2].endsWith(';"B-107"'));
});

test("KI-Scan plausibilisieren", () => {
  assert.equal(scanPlausibel({ netto: 100, ust_satz: 19, brutto: 119 }).length, 0);
  assert.equal(scanPlausibel({ netto: 100, ust_satz: 19, brutto: 120 }).length, 1);
});
