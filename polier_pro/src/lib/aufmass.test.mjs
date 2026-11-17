import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formelAuswerten, polygonFlaeche, polygonUmfang, linienzugLaenge, massstabAusKalibrierung, massstabAusPdf, PT_IN_M,
  zeileAusMessung, aufmassSumme, zeilenAusRaumstempeln, neueZeile, zeileAendern, fotoToleranz, kiAufmass,
} from "./aufmass.js";

test("Formeln", () => {
  assert.equal(formelAuswerten("12,40*2,75"), 34.1);
  assert.equal(formelAuswerten("2 * (3,5 + 1,25) - 1,01×2,01"), 7.47);
  assert.equal(formelAuswerten("10:4"), 2.5);
  assert.equal(formelAuswerten("-3+5"), 2);
  assert.equal(formelAuswerten("3x2"), 6);
  assert.equal(formelAuswerten(""), null);
  assert.equal(formelAuswerten("alert(1)"), null);
  assert.equal(formelAuswerten("2*(3"), null);
  assert.equal(formelAuswerten("1/0"), null);
});

test("Geometrie und Maßstab", () => {
  const q = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  assert.equal(polygonFlaeche(q), 5000);
  assert.equal(polygonUmfang(q), 300);
  assert.equal(linienzugLaenge(q), 250);
  assert.ok(Math.abs(massstabAusKalibrierung({ x: 0, y: 0 }, { x: 200, y: 0 }, 2.01) - 0.01005) < 1e-12);
  assert.equal(massstabAusKalibrierung({ x: 0, y: 0 }, { x: 0, y: 0 }, 2), null);
  // 1:100, Seite mit Faktor 2 gerendert: 1 px = 0,5 pt = 0,176 mm Papier = 17,6 mm echt
  assert.ok(Math.abs(massstabAusPdf(100, 2) - PT_IN_M * 50) < 1e-12);
  const z = zeileAusMessung({ art: "flaeche", punkte: q }, 0.02);
  assert.equal(z.menge, 2); assert.equal(z.einheit, "m²"); assert.equal(z.quelle, "messung"); assert.equal(z.formel, "2");
  assert.equal(zeileAusMessung({ art: "strecke", punkte: q.slice(0, 2) }, 0.02).menge, 2);
  assert.equal(zeileAusMessung({ art: "zaehlen", punkte: q }, 0.02).menge, 4);
});

test("Foto-Toleranz wächst mit Abstand zum Bezugsmaß", () => {
  const nah = fotoToleranz({ art: "strecke", punkte: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }, 200);
  const fern = fotoToleranz({ art: "strecke", punkte: [{ x: 0, y: 0 }, { x: 1600, y: 0 }] }, 200);
  assert.equal(nah, 0.06); assert.equal(fern, 0.15);
  assert.ok(fotoToleranz({ art: "flaeche", punkte: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }] }, 200) === 0.12);
  assert.equal(zeileAusMessung({ art: "strecke", punkte: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }, 0.01, { foto: true, referenzPx: 200 }).toleranz, 0.06);
});

test("Summe mit Übermessung und Toleranz", () => {
  const zeilen = [
    neueZeile({ bez: "Wand", formel: "12,40*2,75", einheit: "m²" }),
    neueZeile({ bez: "Fenster", formel: "1,01*1,26", einheit: "m²", abzug: true }),
    neueZeile({ bez: "Tor", formel: "3,01*2,51", einheit: "m²", abzug: true }),
    neueZeile({ bez: "Sockel", formel: "12,40", einheit: "m" }),
    neueZeile({ bez: "Giebel", menge: 10, einheit: "qm", toleranz: 0.2 }),
  ];
  assert.equal(zeilen[0].menge, 34.1);
  assert.deepEqual(aufmassSumme(zeilen, "m²"), { summe: 35.272, uebermessen: 0, toleranz: 0.06 });
  const putz = aufmassSumme(zeilen, "m²", 2.5);
  assert.equal(putz.summe, 36.545); assert.equal(putz.uebermessen, 1);
  assert.equal(aufmassSumme(zeilen, "m").summe, 12.4);
  assert.equal(zeileAendern(zeilen[0], { formel: "2*3" }).menge, 6);
  assert.equal(zeileAendern(zeilen[0], { formel: "2*" }).menge, 0);
  const rs = zeilenAusRaumstempeln([{ raum: "Wohnen", flaeche: 23.45, umfang: 19.6, art: "NUF" }, { raum: "Bad", flaeche: 6.1 }]);
  assert.equal(rs.length, 3); assert.equal(rs[0].bez, "Wohnen (NUF)"); assert.equal(rs[0].formel, "23,45"); assert.equal(rs[1].einheit, "m");
});

test("KI-Aufmaß: ungültige Formeln raus, Foto immer mit Toleranz", async () => {
  const rufeKi = async (system) => {
    assert.match(system, /FOTO/);
    return { content: [{ type: "tool_use", name: "aufmass_abgeben", input: { zeilen: [
      { bez: "Wand", formel: "4,20*2,60", einheit: "m²", grundlage: "über Tür 2,01 m", toleranz: 0.02 },
      { bez: "Kaputt", formel: "ca. 4", einheit: "m²" },
      { bez: "Tür", formel: "1,01*2,01", einheit: "m²", abzug: true },
    ], hinweise: ["Rückwand nicht sichtbar"] } }] };
  };
  const r = await kiAufmass({ bildBlock: { type: "image" }, art: "foto", referenz: "Tür 2,01 m", rufeKi });
  assert.equal(r.zeilen.length, 2);
  assert.equal(r.zeilen[0].toleranz, 0.1, "nie genauer als ±10 % aus einem Foto");
  assert.equal(r.zeilen[1].toleranz, 0.15);
  assert.equal(r.zeilen[1].abzug, true);
  assert.deepEqual(r.hinweise, ["Rückwand nicht sichtbar"]);
});
