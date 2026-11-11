import { test } from "node:test";
import assert from "node:assert/strict";
import { kennzahlen, stundenVerlauf, abschnittTeile, kalenderwoche } from "./cockpit.js";

const projekte = [{ id: 1, name: "Parkhaus", projektnummer: "B-031" }, { id: 2, name: "EFH" }];
const pos = (id, menge, ep) => ({ id, oz: id, bez: `Pos ${id}`, menge, ep, einheit: "m³" });

test("Kennzahlen: offene Angebote, Freigaben, Auftragsbestand, Leistungsstand, Forderungen", () => {
  const angebote = [
    { id: 10, projekt_id: 1, status: "angenommen", positionen: [pos("a", 10, 100), pos("b", 1, 1000)] },
    { id: 11, projekt_id: 1, status: "entwurf", positionen: [pos("c", 1, 500)], interne_freigabe: { status: "angefragt" } },
    { id: 12, projekt_id: 2, status: "versendet", rabatt: 10, positionen: [pos("d", 1, 1000)] },
  ];
  const k = kennzahlen({ projekte, angebote, heute: "2026-11-11",
    baufortschritt: [{ angebot_id: 10, position_id: "a", prozent: 50 }],
    rechnungen: [{ id: 1, projekt_id: 1, typ: "abschlag", nummer: "1", datum: "2026-10-01", status: "versendet", netto_betrag: 500, mwst: 19 }] });
  assert.deepEqual(k.angeboteOffen, { anzahl: 2, netto: 1400, zurFreigabe: 1 });
  assert.equal(k.auftragsbestand, 1500);
  assert.equal(k.baustellen[0].leistungsstand, 0.25);
  assert.equal(k.forderungen, 595);
  assert.equal(k.ueberfaellig.anzahl, 1); assert.equal(k.ueberfaellig.aeltesteTage, 20);
});

test("Stundenverlauf kumuliert je Woche, ältere Stunden als Startwert", () => {
  const heute = new Date(2026, 10, 11);
  const v = stundenVerlauf([
    { eingestempelt_at: new Date(2026, 5, 1, 7).toISOString(), netto_minuten: 600, status: "abgeschlossen" },
    { eingestempelt_at: new Date(2026, 10, 10, 7).toISOString(), netto_minuten: 480, status: "abgeschlossen" },
    { eingestempelt_at: new Date(2026, 10, 3, 7).toISOString(), netto_minuten: 120, status: "abgeschlossen" },
  ], { wochen: 4, heute });
  assert.deepEqual(v.map(w => w.kw), [43, 44, 45, 46]);
  assert.deepEqual(v.map(w => w.stunden), [10, 10, 12, 20]);
  assert.equal(kalenderwoche(new Date(2026, 0, 1)), 1);
});

test("Abschnitt in Achsblasen zerlegen", () => {
  assert.deepEqual(abschnittTeile("C–D / 3–4 · EG · zu 50 %"), { gruppen: [["C", "D"], ["3", "4"]], rest: "EG · zu 50 %" });
  assert.deepEqual(abschnittTeile("ganzes Raster").gruppen, []);
});
