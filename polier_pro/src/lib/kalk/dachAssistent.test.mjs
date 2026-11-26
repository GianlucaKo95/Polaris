import { test } from "node:test";
import assert from "node:assert/strict";
import { dachErkennen, versatz, umfang, randstreifenAusFuellungen, zuordnungVorschlagen, durchfuehrungenZaehlen } from "./dachAssistent.js";
import { linienGraph, umrissUmPunkt } from "./umriss.js";
import { polygonFlaeche } from "./planAbschnitt.js";

const nah = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const P = (x, y) => ({ x, y });
const linienAus = (poly, zu = true) => poly.slice(0, zu ? poly.length : -1).map((p, i) => ({ p1: p, p2: poly[(i + 1) % poly.length] }));
const rechteck = (x0, y0, x1, y1) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];

// Dach 20 × 10 m mit abgeschrägter Ecke, Attika 0,5 m, Kiesstreifen 0,5 m (Füllfläche),
// Lichtkuppel 1,2 × 1,2 mit „BD / 120 x 120“, PV-Modul ohne Beschriftung, Schraffur und Bemaßung.
function plan() {
  const innen = [P(0, 0), P(20, 0), P(20, 10), P(3, 10), P(0, 6)];
  const aussen = versatz(innen, -0.5);
  const lk = rechteck(8, 4, 9.2, 5.2);
  const linien = [
    ...linienAus(innen), ...linienAus(aussen),
    // Gehrungen an den Ecken (teilen den Attikaring in Stücke)
    ...innen.map((p, i) => ({ p1: p, p2: aussen[i] })),
    ...linienAus(lk),
    // Schraffur, die nur auf Linien endet, und eine Bemaßung quer durchs Dach
    { p1: P(5, 0), p2: P(5.4, 0.4) }, { p1: P(-3, 3), p2: P(23, 3) },
    ...linienAus(rechteck(12, 2, 13.76, 3.07)),
  ];
  const flaechen = [{ punkte: rechteck(0, 0, 20, 10) }, { punkte: rechteck(0.5, 0.5, 19.5, 9.5) }, { punkte: rechteck(12, 2, 13.76, 3.07) }];
  const texte = [{ text: "BD /", x: 8.2, y: 4.8 }, { text: "120 x 120", x: 8.2, y: 4.6 }, { text: "DD r'/ SW Entlüftung", x: 15, y: 7 },
    { text: "DD r'/ RLT LüftungDD r'/ RLT Lüftung", x: 16, y: 8 }, { text: "RW DN 100 - LX 485", x: 10, y: -1.5 }];
  const umrisse = [lk, rechteck(12, 2, 13.76, 3.07)];
  return { linien, flaechen, texte, umrisse, innen, aussen };
}

test("Umriss: kleinster geschlossener Linienzug um den Punkt, trotz Bemaßung und Schraffur", () => {
  const p = plan();
  const g = linienGraph(p.linien);
  const u = umrissUmPunkt(g, P(10, 7), { minFlaeche: 10 });
  nah(u.flaeche, polygonFlaeche(p.innen), 1e-6);
  assert.equal(u.punkte.length, 5);
  assert.equal(umrissUmPunkt(g, P(50, 50), { minFlaeche: 10 }), null);
});

test("Versatz: innen und außen, Umfang und Fläche", () => {
  const r = rechteck(0, 0, 10, 5);
  nah(polygonFlaeche(versatz(r, 1)), 8 * 3);
  nah(polygonFlaeche(versatz(r, -1)), 12 * 7);
  nah(umfang(versatz([...r].reverse(), 1)), 22);
});

test("Randstreifenbreite aus gleichmäßig eingerückter Füllfläche", () => {
  const p = plan();
  assert.equal(randstreifenAusFuellungen(p.innen, p.flaechen), 0.5);
  assert.equal(randstreifenAusFuellungen(p.innen, [{ punkte: rechteck(0.5, 2, 19.5, 9.5) }]), null);
});

test("Dach erkennen: Flächen, Längen, Öffnung abgezogen, Durchführungen gezählt", () => {
  const p = plan();
  const e = dachErkennen(p, {});
  assert.equal(e.fehler, undefined);
  const m = id => e.mengen.find(x => x.id === id)?.menge;
  const fi = polygonFlaeche(p.innen);
  nah(m("dach"), Math.round((fi - 1.44) * 100) / 100, 0.011);
  assert.equal(e.randstreifen, 0.5);
  assert.equal(e.attikaBreite, 0.5);
  nah(m("attika_innen"), Math.round(umfang(p.innen) * 100) / 100, 0.011);
  nah(m("attika_aussen"), Math.round(umfang(p.aussen) * 100) / 100, 0.011);
  nah(m("rand"), Math.round((fi - polygonFlaeche(versatz(p.innen, 0.5))) * 100) / 100, 0.011);
  assert.equal(m("attika_ecken"), 5);
  assert.equal(m("oeffnungen"), 1);
  nah(m("oeffnungen_umfang"), 4.8, 0.011);
  assert.equal(m("df_sw"), 1);
  assert.equal(m("df_rlt"), 2);
  assert.match(e.hinweise.join(" "), /LX 485/);
  // Startpunkt per Klick, Randstreifen vorgegeben
  const k = dachErkennen(p, { start: P(10, 7), randstreifen: 0 });
  assert.equal(k.mengen.find(x => x.id === "rand"), undefined);
  assert.match(dachErkennen({ ...p, linien: [] }, { start: P(10, 7) }).fehler, /kein geschlossener Linienzug/);
});

test("Zuordnung: Titelregeln, Ausschlüsse, Vorposition, Abweichung", () => {
  const e = dachErkennen(plan(), {});
  const pos = [
    { key: "a", kurztext: "Wärmedämmschicht Umkehrdach 24cm, Ausführung mit Begrünung", einheit: "m2", mengeLv: 160 },
    { key: "b", kurztext: "Extensivsubstrat E (H=12cm)", einheit: "m2", mengeLv: 150 },
    { key: "c", kurztext: "Attikaabdeckung Zink, 1,0 mm", einheit: "m", mengeLv: 60 },
    { key: "d", kurztext: "Zulage zur Vorposition Attikaabdeckung in Zink vorbewittert", einheit: "m", mengeLv: 60 },
    { key: "e", kurztext: "Zulage Eckausbildungen Attikaabdeckung", einheit: "St", mengeLv: 5 },
    { key: "f", kurztext: "Dach- und Deckendurchführung für WU-Beton DN70", einheit: "Stck", mengeLv: 1 },
    { key: "g", kurztext: "WU-Attikaablauf DN 100 System LX3003", einheit: "Stck", mengeLv: 2 },
    { key: "h", kurztext: "Regenhaube für Dachentlüftungen DN125 Regenhaube", einheit: "Stck", mengeLv: 2 },
    { key: "i", kurztext: "Kiesleiste ZP 100 A", einheit: "m", mengeLv: 55 },
    { key: "j", kurztext: "Stundenlohn Facharbeiter", einheit: "h", mengeLv: 10 },
    { key: "k", kurztext: "Wärmedämmung an aufgehenden Bauteilen", einheit: "m2", mengeLv: 20 },
  ];
  const z = Object.fromEntries(zuordnungVorschlagen(pos, e.mengen).map(x => [x.key, x]));
  assert.equal(z.a.id, "dach");
  assert.equal(z.b.id, "feld");
  assert.equal(z.c.id, "attika_aussen");
  assert.equal(z.d.id, "attika_aussen");
  assert.equal(z.e.id, "attika_ecken");
  assert.equal(z.f.id, "df_sw");
  assert.equal(z.g.id, null);
  assert.equal(z.h.id, "df_rlt");
  assert.equal(z.i.id, "randgrenze");
  assert.equal(z.j.id, null);
  assert.equal(z.k.id, null);
  assert.equal(z.a.pruefen, false);
  assert.equal(z.e.pruefen, false);
  assert.ok(durchfuehrungenZaehlen([{ text: "BD r'/ Elektro PV", x: 1, y: 1 }], rechteck(0, 0, 2, 2))[0].id === "pv");
});
