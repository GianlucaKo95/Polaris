import { test } from "node:test";
import assert from "node:assert/strict";
import { feiertage, nachtMinuten, monatAuswerten, bewegungsdaten, lodasDatei, lohnPruefen } from "./lohnvorerfassung.js";

test("Feiertage: bewegliche und länderspezifische", () => {
  const nw = feiertage(2026, "NW");
  assert.equal(nw["2026-04-03"], "Karfreitag");      // Ostern 2026 = 5. April
  assert.equal(nw["2026-06-04"], "Fronleichnam");
  assert.equal(nw["2026-11-01"], "Allerheiligen");
  assert.equal(nw["2026-10-31"], undefined);
  assert.equal(feiertage(2026, "SN")["2026-11-18"], "Buß- und Bettag");
  assert.equal(feiertage(2026, "BE")["2026-03-08"], "Internationaler Frauentag");
});

test("Nachtminuten über Mitternacht", () => {
  assert.equal(nachtMinuten("2026-11-02T18:00:00", "2026-11-03T02:00:00"), 360);
  assert.equal(nachtMinuten("2026-11-02T07:00:00", "2026-11-02T16:00:00"), 0);
});

const b = (tag, von, bis, min, projekt = 1, profil = "p1") => ({ profil_id: profil, projekt_id: projekt, status: "abgeschlossen",
  eingestempelt_at: `2026-11-${tag}T${von}:00`, ausgestempelt_at: `2026-11-${tag}T${bis}:00`, netto_minuten: min, profile: { vorname: "Max", nachname: "Muster" } });

test("Monat: Baustellen, Wochen-Überstunden, Sonntag, Urlaub, Feiertag, Eingaben", () => {
  // KW 45 (2.–6.11.2026): 5 × 9 h = 45 h → 5 h Überstunden; Sonntag 8.11.: 4 h
  const buchungen = [2, 3, 4, 5].map(t => b(`0${t}`, "07:00", "16:30", 540)).concat([b("06", "07:00", "16:30", 540, 2), b("08", "08:00", "12:00", 240)]);
  const abw = [{ profile_id: "p1", typ: "urlaub", status: "genehmigt", von_datum: "2026-11-09", bis_datum: "2026-11-15" }];
  const [m] = monatAuswerten({ monat: "2026-11", buchungen, abwesenheiten: abw, eingaben: { p1: { schlechtwetter: 6 } },
    einstellungen: { personalnummern: { p1: "4711" }, beraterNr: "1", mandantenNr: "2" }, projekte: [{ id: 1, projektnummer: "B-101" }, { id: 2, projektnummer: "B-102" }] });
  assert.equal(m.stunden, 49);
  assert.deepEqual(m.baustellen, [{ kostenstelle: "B-101", stunden: 40 }, { kostenstelle: "B-102", stunden: 9 }]);
  assert.equal(m.werte.ueberstunden, 9); // Woche 2.–8.11.: 49 h − 40 h (Sonntag gehört zur selben ISO-Woche)
  assert.equal(m.werte.sonntag, 4);
  assert.equal(m.werte.urlaub, 5);       // 9.–13.11. Arbeitstage
  assert.equal(m.werte.feiertagBezahlt, 0); // 1.11. ist Sonntag
  assert.equal(m.werte.schlechtwetter, 6);
  const z = bewegungsdaten([m], { personalnummern: { p1: "4711" } });
  assert.equal(z.filter(x => x.key === "grund").length, 2);
  const datei = lodasDatei(z, { monat: "2026-11", einstellungen: { beraterNr: "12345", mandantenNr: "99" } });
  assert.match(datei, /\[Satzbeschreibung\]\r\n10;u_lod_bwd_buchung_standard;pnr#bwd;abrechnung_zeitraum#bwd;bs_wert_butab#bwd;bs_nr#bwd;la_eigene#bwd;kostenstelle#bwd;bemerkung#bwd;/);
  assert.match(datei, /10;4711;01\.11\.2026;40;1;100;"B-101";"Polaris grund";/);
  assert.deepEqual(lohnPruefen([m], {}), ["Berater- und Mandantennummer fehlen (Einstellungen).", "Max Muster: Personalnummer fehlt — wird im LODAS-Export übersprungen."]);
});

test("Feiertag an einem Werktag wird bezahlt, Arbeit daran zählt als Feiertagsarbeit", () => {
  // 1.5.2026 ist Freitag
  const [m] = monatAuswerten({ monat: "2026-05", buchungen: [{ ...b("04", "07:00", "15:30", 480), eingestempelt_at: "2026-05-04T07:00:00", ausgestempelt_at: "2026-05-04T15:30:00" }], einstellungen: {} });
  assert.equal(m.werte.feiertagBezahlt, 8 * 3); // 1.5., 14.5. Himmelfahrt, 25.5. Pfingstmontag
});
