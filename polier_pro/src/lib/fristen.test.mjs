import { test } from "node:test";
import assert from "node:assert/strict";
import { gewaehrleistungsEnde, rueckgabeDatum, avalkostenJahr, terminListe, dringend, stand } from "./fristen.js";

test("Gewährleistungsende und Rückgabe nach VOB/B", () => {
  assert.equal(gewaehrleistungsEnde("2026-03-31", 4), "2030-03-31");
  assert.equal(gewaehrleistungsEnde("2024-02-29", 5), "2029-02-28");
  assert.equal(rueckgabeDatum({ art: "vertragserfuellung" }, { abnahme: "2026-05-04" }), "2026-05-04");
  assert.equal(rueckgabeDatum({ art: "gewaehrleistung" }, { abnahme: "2026-05-04" }), "2028-05-04");
  assert.equal(rueckgabeDatum({ art: "gewaehrleistung", rueckgabe_am: "2030-05-04" }, { abnahme: "2026-05-04" }), "2030-05-04");
  assert.equal(rueckgabeDatum({ art: "vertragserfuellung" }), null);
});

test("Avalkosten nur für gestellte, nicht zurückgegebene Bürgschaften", () => {
  assert.equal(avalkostenJahr([
    { richtung: "gestellt", art: "vertragserfuellung", betrag: 120000, aval_prozent: 1.2, status: "gestellt" },
    { richtung: "gestellt", art: "gewaehrleistung", betrag: 50000, aval_prozent: 1, status: "zurueck" },
    { richtung: "erhalten", art: "gewaehrleistung", betrag: 30000, aval_prozent: 1 },
    { richtung: "gestellt", art: "einbehalt", betrag: 9000, aval_prozent: 1 },
  ]), 1440);
});

test("Terminliste: Begehung, Gewährleistungsende, Rückgabe, Befristung, manuelle Frist", () => {
  const t = terminListe({
    heute: "2026-11-12",
    abnahmeJeProjekt: { 7: "2022-12-01" },
    fristen: [
      { id: 1, projekt_id: 7, art: "gewaehrleistung", jahre: 4 },
      { id: 2, projekt_id: 8, art: "schlusszahlung", datum: "2026-11-30", titel: "Schlusszahlung Kita" },
      { id: 3, projekt_id: 8, art: "vertrag", datum: "2026-10-01", erledigt_am: "2026-09-30" },
    ],
    sicherheiten: [
      { id: 9, projekt_id: 7, art: "gewaehrleistung", richtung: "gestellt", partner: "Stadtwerke", status: "gestellt", befristet_bis: "2027-06-30" },
    ],
  });
  assert.deepEqual(t.map(x => [x.datum, x.art, x.stand]), [
    ["2024-12-01", "rueckgabe", "ueberfaellig"],
    ["2026-09-01", "begehung", "ueberfaellig"],
    ["2026-11-30", "schlusszahlung", "bald"],
    ["2026-12-01", "gewaehrleistung", "bald"],
    ["2027-06-30", "befristung", "ok"],
  ]);
  assert.equal(t[0].titel, "Gewährleistungsbürgschaft an Stadtwerke zurückfordern");
  assert.equal(dringend(t), 4);
  assert.equal(stand("2026-11-12", "2026-11-12").stand, "bald");
});
