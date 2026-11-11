import { test } from "node:test";
import assert from "node:assert/strict";
import { datevBuchungsstapel } from "./datev.js";

test("EXTF-Buchungsstapel: Header mit 31 Feldern, Spaltenzeile, eine Buchung je Rechnung", () => {
  const { text, dateiname, fehler } = datevBuchungsstapel(
    [{ nummer: "2026-001", datum: "2026-11-05", bruttoBetrag: 11900, text: "AR EFH Müller" },
     { nummer: "2026-002", datum: "2026-11-20", bruttoBetrag: 595.5, text: "Nachtrag \"1\"" }],
    { beraternummer: "29098", mandantennummer: "55003" },
    { erstellt: new Date("2026-11-30T14:04:40.439Z") });
  assert.deepEqual(fehler, []);
  assert.equal(dateiname, "EXTF_Buchungsstapel_20261105_20261120.csv");
  const zeilen = text.split("\r\n");
  assert.equal(zeilen[0].split(";").length, 31);
  assert.ok(zeilen[0].startsWith('"EXTF";700;21;"Buchungsstapel";13;20261130140440439;;"RE";"";"";29098;55003;20260101;4;20261105;20261120;'));
  assert.ok(zeilen[1].startsWith("Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen"));
  assert.equal(zeilen[2], '11900,00;"S";"EUR";;;;10000;8400;"";0511;"2026-001";"";;"AR EFH Müller"');
  assert.match(zeilen[3], /^595,50;.*;2011;.*"Nachtrag ""1"""$/);
});

test("Fehlende Berater-/Mandantennummer wird gemeldet", () => {
  assert.equal(datevBuchungsstapel([{ nummer: "1", datum: "2026-01-01", bruttoBetrag: 1 }], {}).fehler.length, 2);
});
