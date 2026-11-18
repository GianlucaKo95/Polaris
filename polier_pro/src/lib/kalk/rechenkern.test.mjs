import { test } from "node:test";
import assert from "node:assert/strict";
import {
  standBerechnen, positionEk, zuschlaegeFuerZiel, bausteinZuAnsaetze, ansaetzeZuBaustein, altKalkZuAnsaetze,
  efbAuswertung, ressourcenListe, preisabgleich, ansatzFormelFehler, MITTELLOHN_ID, saetzeAusAltKalk,
} from "./rechenkern.js";
import { aenderungenAnwenden, summen } from "./lvBaum.js";

const P = (id, felder = {}) => ({ id, parent_id: null, sort: 1, typ: "position", oz: id, art: "normal", kurztext: id, menge: 10, einheit: "m3", ep: 0, rabatt: 0, extra: {}, ...felder });
let n = 0;
const A = (knoten_id, felder) => ({ id: `a${++n}`, knoten_id, sort: n, kostenart: "material", ressource_id: null, bezeichnung: "", einheit: "", menge_je_me: 0, faktor: 1, preis: 0, formel: null, ...felder });
const Z = { modell: "saetze", saetze: { lohn: 20, material: 10, geraet: 10, fremd: 5, sonstiges: 0 }, mittellohn: 50 };

test("EP aus Ansätzen und Sätzen je Kostenart, Mittellohn aus dem Stand", () => {
  const k = [P("p1")];
  const a = [A("p1", { kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 0.5 }), A("p1", { menge_je_me: 1.05, preis: 80, einheit: "m3" })];
  const r = standBerechnen(k, a, Z);
  const e = r.je.get("p1");
  assert.equal(e.ekJeMe.lohn, 25);
  assert.equal(Math.round(e.ekJeMe.material * 100) / 100, 84);
  assert.equal(e.stundenJeMe, 0.5);
  assert.equal(e.epKalk, 122.4); // 25 × 1,2 + 84 × 1,1
  assert.deepEqual(r.epAenderungen, [{ id: "p1", felder: { ep: 122.4 } }]);
  assert.equal(r.stunden, 5);
  assert.equal(r.angebotssumme, 1224);
});

test("Formel mit Variablen der Position, Faktor, Fehler bei unbekannter Variable", () => {
  const k = P("p", { extra: { variablen: { d: 0.25 } } });
  const a = [A("p", { formel: "d * 1,02", preis: 120, faktor: 1 }), A("p", { formel: "h * 2", preis: 1 })];
  const r = positionEk(k, a, Z);
  assert.equal(Math.round(r.ekJeMe.material * 1000) / 1000, 30.6);
  assert.equal(r.fehler.length, 1);
  assert.match(r.fehler[0].text, /Unbekannte Variable: h/);
  assert.equal(ansatzFormelFehler({ formel: "d*(2" }, { d: 1 }) != null, true);
});

test("Positionen ohne Ansätze und mit manuellem EP sind Festpreise", () => {
  const k = [P("kalk"), P("fest", { ep: 100 }), P("manuell", { ep: 50, extra: { epManuell: true } })];
  const a = [A("kalk", { menge_je_me: 1, preis: 10 }), A("manuell", { menge_je_me: 1, preis: 999 })];
  const r = standBerechnen(k, a, Z);
  assert.equal(r.festpreise, 1500);
  assert.equal(r.kalkuliertePositionen, 1);
  assert.deepEqual(r.epAenderungen.map(x => x.id), ["kalk"]);
  assert.equal(r.angebotssumme, 110 + 1500);
});

test("Endsumme nach EFB 222: Umlage auf den Lohn", () => {
  const k = [P("l", { menge: 100 }), P("m", { menge: 100 }), P("fest", { menge: 1, ep: 500 })];
  const a = [A("l", { kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 0.2 }), A("m", { menge_je_me: 1, preis: 20 })];
  const z = { modell: "endsumme", mittellohn: 50, endsumme: { bgk: [{ bez: "Container", betrag: 300 }], agkProzent: 10, wgProzent: 5, umlageAuf: "lohn" } };
  const r = standBerechnen(k, a, z);
  assert.equal(r.endsumme.hk, 3300);
  assert.equal(Math.round(r.endsumme.angebotssumme * 100) / 100, 3811.5);
  assert.equal(Math.round(r.endsumme.umlageSatz * 100) / 100, 81.15);
  assert.equal(r.saetze.material, 0);
  assert.ok(Math.abs(r.angebotssumme - (3811.5 + 500)) <= 0.5, "Summe der gerundeten EP"); // EP 18,115 → 18,12 × 100
  assert.ok(Math.abs(r.rundungsdifferenz) <= 0.5);
});

test("Zielpreis trifft die Summe bei Sätzen und bei Endsumme", () => {
  const k = [P("a", { menge: 37 }), P("b", { menge: 12.5 }), P("c", { menge: 3, ep: 99 })];
  const a = [A("a", { kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 0.7 }), A("a", { menge_je_me: 1.1, preis: 41.37 }), A("b", { kostenart: "geraet", menge_je_me: 0.3, preis: 87 })];
  for (const z of [Z, { modell: "endsumme", mittellohn: 52, endsumme: { bgk: [{ betrag: 400 }], agkProzent: 9, wgProzent: 4, umlageAuf: "alle" } }]) {
    const r = zuschlaegeFuerZiel(k, a, z, 5000);
    assert.ok(r, z.modell);
    // EP sind auf Cent gerundet: bei 37 m³ ist die Summe nur in Schritten von 0,37 € einstellbar
    assert.ok(Math.abs(r.abweichung) <= 0.37 / 2 + 0.01, `${z.modell}: ${r.abweichung}`);
    assert.equal(Math.round((standBerechnen(k, a, r.zuschlaege).angebotssumme - 5000) * 100) / 100, r.abweichung);
  }
});

test("Baustein mit Formel und eingebettetem Baustein wird zu Ansätzen, und zurück", () => {
  const kp = [{ id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 52 }, { id: 3, kategorie: "material", bezeichnung: "Beton C25/30", einheit: "m³", preis: 120 }, { id: 4, kategorie: "geraet", bezeichnung: "Rüttler", einheit: "h", preis: 9 }];
  const sp = [
    { id: 10, bez: "Verdichten", einheit: "m³", rezeptur: [{ stammId: 4, mengeJeEinheit: 0.1 }] },
    { id: 11, bez: "Bodenplatte", einheit: "m²", variablen: [{ name: "d", bez: "Dicke", standard: 0.2 }],
      rezeptur: [{ stammId: 1, mengeJeEinheit: 0.3 }, { stammId: 3, formel: "d * 1,02" }, { unterpositionId: 10, formel: "d" }], fremdleistungJeEinheit: 2 },
  ];
  const { ansaetze, variablen } = bausteinZuAnsaetze(sp[1], { knotenId: "p", stammpositionen: sp, kalkulationspreise: kp });
  assert.deepEqual(variablen, { d: 0.2 });
  assert.deepEqual(ansaetze.map(a => [a.kostenart, a.ressource_id, a.formel]), [["lohn", "1", null], ["material", "3", "d * 1,02"], ["geraet", "4", null], ["fremd", null, null]]);
  assert.ok(Math.abs(ansaetze[2].menge_je_me - 0.02) < 1e-9); // 0,1 × d
  const k = P("p", { extra: { variablen } });
  const ek = positionEk(k, ansaetze, Z);
  assert.ok(Math.abs(ek.summeJeMe - (0.3 * 52 + 0.204 * 120 + 0.02 * 9 + 2)) < 1e-9);
  const zurueck = ansaetzeZuBaustein({ ...k, kurztext: "Bodenplatte", einheit: "m²" }, ansaetze);
  assert.deepEqual(zurueck.stammposition.rezeptur[1], { stammId: 3, formel: "d * 1,02" });
  assert.equal(zurueck.stammposition.fremdleistungJeEinheit, 2);
  assert.deepEqual(zurueck.stammposition.variablen, [{ name: "d", bez: "d", standard: 0.2 }]);
});

test("Alte Positionskalkulation wird zu Ansätzen je ME", () => {
  const kp = [{ id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 52 }];
  const k = P("p", { menge: 80 });
  const a = altKalkZuAnsaetze(k, { lohnposten: [{ stammId: 1, menge: 40 }], fremdleistung: 800, zuschlagLohn: 25 }, kp);
  assert.equal(a[0].menge_je_me, 0.5);
  assert.equal(a[0].preis, 52);
  assert.equal(a[1].kostenart, "fremd");
  assert.equal(a[1].preis, 10);
  assert.deepEqual(saetzeAusAltKalk({ zuschlagLohn: 25, zuschlagGemeinkosten: 10, zuschlagWagnis: 3, zuschlagGewinn: 2 }), { lohn: 25, material: 15, geraet: 15, fremd: 15, sonstiges: 0 });
});

test("Formblatt-Auswertung, Ressourcenliste und Preisabgleich", () => {
  const k0 = [P("a", { menge: 10 }), P("b", { menge: 5 }), P("f", { menge: 1, ep: 100 })];
  const a = [A("a", { kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 1 }), A("a", { ressource_id: "3", bezeichnung: "Beton", einheit: "m³", menge_je_me: 1, preis: 100 }), A("b", { ressource_id: "3", bezeichnung: "Beton", einheit: "m³", menge_je_me: 2, preis: 100 })];
  const r = standBerechnen(k0, a, Z);
  const k = aenderungenAnwenden(k0, { aendern: r.epAenderungen });
  const efb = efbAuswertung(k, a, Z);
  assert.equal(efb.summe.ek.lohn, 500);
  assert.equal(efb.summe.ek.material, 2000);
  assert.equal(efb.summe.stunden, 10);
  assert.equal(efb.mittellohn, 50);
  assert.equal(Math.round(efb.zuschlagProzent.lohn * 100) / 100, 20);
  assert.equal(efb.angebotssumme, summen(k).gesamt);
  assert.equal(efb.warnungen.length, 1);
  const res = ressourcenListe(k, a, Z);
  const beton = res.find(x => x.ressource_id === "3");
  assert.equal(beton.menge, 20);
  assert.equal(beton.positionen, 2);
  assert.equal(res.find(x => x.ressource_id === MITTELLOHN_ID).menge, 10);
  const abgl = preisabgleich(a, [{ id: 3, preis: 104.5, bezeichnung: "Beton" }]);
  assert.equal(abgl.abweichungen.length, 2);
  assert.deepEqual(abgl.aenderungen[0].felder, { preis: 104.5 });
});
