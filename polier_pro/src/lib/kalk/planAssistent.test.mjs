import { test } from "node:test";
import assert from "node:assert/strict";
import { planErkennen, zuordnen, profilVorschlagen, PROFILE } from "./planAssistent.js";
import { neigungAusTexten } from "./steildach.js";
import { stellplaetzeFinden } from "./parkflaeche.js";

const nah = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const P = (x, y) => ({ x, y });
const L = (a, b) => ({ p1: a, p2: b });
const ring = poly => poly.map((p, i) => L(p, poly[(i + 1) % poly.length]));
const rechteck = (x0, y0, x1, y1) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
const m = (e, id) => e.mengen.find(x => x.id === id)?.menge;

test("Steildach Walm 12 × 8 m, 30°: wahre Fläche, Traufe, First, Grate", () => {
  const plan = {
    linien: [...ring(rechteck(0, 0, 12, 8)), L(P(0, 0), P(4, 4)), L(P(12, 0), P(8, 4)), L(P(12, 8), P(8, 4)), L(P(0, 8), P(4, 4)), L(P(4, 4), P(8, 4)),
      L(P(-3, -1), P(15, -1))],
    flaechen: [], umrisse: [], texte: [{ text: "DN 30°", x: 5, y: 2 }],
  };
  const e = planErkennen("steildach", plan, { start: P(6, 1) });
  assert.equal(e.fehler, undefined);
  assert.equal(e.neigung, 30);
  const cos = Math.cos(Math.PI / 6), tan = Math.tan(Math.PI / 6);
  nah(m(e, "grund"), 96);
  nah(m(e, "dach"), Math.round(96 / cos * 100) / 100);
  nah(m(e, "traufe"), 40);
  nah(m(e, "first"), 4);
  const grat = Math.hypot(4 * Math.SQRT2, 4 * tan);
  nah(m(e, "grat"), Math.round(4 * grat * 100) / 100);
  nah(m(e, "first_grat"), Math.round((4 + 4 * grat) * 100) / 100);
  assert.equal(m(e, "ortgang"), undefined);
  assert.equal(m(e, "kehle"), undefined);
});

test("Steildach Sattel 10 × 6 m, 45°: First trotz Ziegelschraffur, Ortgang wahr", () => {
  const schraffur = [0.5, 1, 1.5, 2, 2.5, 3.5, 4, 4.5, 5, 5.5].map(y => L(P(0, y), P(10, y)));
  const plan = { linien: [...ring(rechteck(0, 0, 10, 6)), L(P(0, 3), P(10, 3)), ...schraffur], flaechen: [], umrisse: [], texte: [] };
  const e = planErkennen("steildach", plan, { start: P(5, 1.2), neigung: 45 });
  const c = Math.cos(Math.PI / 4);
  nah(m(e, "dach"), Math.round(60 / c * 100) / 100);
  nah(m(e, "first"), 10);
  nah(m(e, "traufe"), 20);
  nah(m(e, "ortgang"), Math.round(12 / c * 100) / 100);
  assert.equal(e.dachlinien.filter(d => d.typ === "first").length, 1);
});

test("Steildach L-Form: Kehle an der einspringenden Ecke", () => {
  // L aus 10 × 6 und 6 × 10, Walm mit Kehle an (6,6)
  const um = [P(0, 0), P(10, 0), P(10, 6), P(6, 6), P(6, 10), P(0, 10)];
  const plan = { linien: [...ring(um), L(P(0, 0), P(3, 3)), L(P(10, 0), P(7, 3)), L(P(10, 6), P(7, 3)), L(P(3, 3), P(7, 3)),
    L(P(6, 6), P(3, 3)), L(P(6, 10), P(3, 7)), L(P(0, 10), P(3, 7)), L(P(3, 3), P(3, 7))], flaechen: [], umrisse: [], texte: [] };
  const e = planErkennen("steildach", plan, { start: P(1, 5), neigung: 40 });
  assert.equal(e.dachlinien.filter(d => d.typ === "kehle").length, 1);
  assert.ok(m(e, "kehle") > Math.hypot(3, 3));
  nah(m(e, "grund"), 84);
});

test("Neigung aus Texten, Annahme ohne Angabe", () => {
  assert.equal(neigungAusTexten([{ text: "Dachneigung 42,5°" }, { text: "90°" }, { text: "Winkel 12°" }]), 42.5);
  assert.equal(neigungAusTexten([{ text: "M 1:100" }]), null);
  const e = planErkennen("steildach", { linien: ring(rechteck(0, 0, 8, 6)), flaechen: [], umrisse: [], texte: [] }, { start: P(4, 3) });
  assert.equal(e.neigung, 35);
  assert.match(e.hinweise.join(" "), /35° angenommen/);
});

test("Parkfläche: Stellplätze aus Trennlinien, Markierung, Fahrgasse, Treppenhaus abgezogen", () => {
  // Deck 30 × 20; Reihe unten: 8 Plätze à 2,5 m (9 Trennlinien 5 m lang), Treppenhaus 4 × 4
  const trenn = Array.from({ length: 9 }, (_, i) => L(P(2 + i * 2.5, 0), P(2 + i * 2.5, 5)));
  const th = rechteck(24, 14, 28, 18);
  const plan = { linien: [...ring(rechteck(0, 0, 30, 20)), ...trenn, ...ring(th)], flaechen: [], umrisse: [th],
    texte: [{ text: "Treppenhaus", x: 25, y: 16 }, { text: "BA", x: 15, y: 10 }, { text: "BA", x: 5, y: 12 }, { text: "Entwässerungsrinne", x: 10, y: 8 }] };
  const e = planErkennen("parkflaeche", plan, { start: P(15, 12) });
  assert.equal(e.fehler, undefined);
  nah(m(e, "flaeche"), 600 - 16);
  assert.equal(m(e, "stellplaetze"), 8);
  nah(m(e, "markierung"), 45);
  nah(m(e, "stellplatzflaeche"), 8 * 2.5 * 5);
  nah(m(e, "fahrgasse"), 600 - 16 - 100);
  nah(m(e, "rand"), 100 + 16);
  assert.equal(m(e, "ablaeufe"), 2);
  assert.match(e.hinweise.join(" "), /Rinnen/);
});

test("Parkfläche: Stellplätze aus Rechtecken, gemeinsame Kanten einmal", () => {
  const r = [0, 1, 2].map(i => rechteck(i * 2.5, 0, (i + 1) * 2.5, 5));
  const sp = stellplaetzeFinden(rechteck(-1, -1, 20, 20), { umrisse: [...r, rechteck(10, 10, 11.76, 11.07)], linien: [] });
  assert.equal(sp.methode, "rechtecke");
  assert.equal(sp.plaetze.length, 3);
  nah(sp.markierung.reduce((s, [a, b]) => s + Math.hypot(b.x - a.x, b.y - a.y), 0), 4 * 5 + 6 * 2.5);
});

test("Zuordnung je Profil und Profilvorschlag", () => {
  const steil = planErkennen("steildach", { linien: [...ring(rechteck(0, 0, 10, 6)), L(P(0, 3), P(10, 3))], flaechen: [], umrisse: [], texte: [] }, { start: P(5, 1), neigung: 40 });
  const pos = [
    { key: "a", kurztext: "Dacheindeckung Tondachziegel Frankfurter Pfanne", einheit: "m2", mengeLv: 80 },
    { key: "b", kurztext: "Firstausbildung trocken mit Firstrolle", einheit: "m", mengeLv: 10 },
    { key: "c", kurztext: "Ortgangziegel links/rechts", einheit: "m", mengeLv: 16 },
    { key: "d", kurztext: "Traufblech Zink", einheit: "m", mengeLv: 20 },
    { key: "e", kurztext: "Konterlattung 30/50", einheit: "m2", mengeLv: 80 },
  ];
  const z = Object.fromEntries(zuordnen("steildach", pos, steil.mengen).map(x => [x.key, x.id]));
  assert.deepEqual(z, { a: "dach", b: "first", c: "ortgang", d: "traufe", e: "dach" });
  const park = [
    { key: "p", kurztext: "Oberflächenschutzsystem OS 8 Stellplätze", einheit: "m2" },
    { key: "q", kurztext: "Fahrgasse OS 11a Beschichtung", einheit: "m2" },
    { key: "r", kurztext: "Stellplatzmarkierung weiß 12 cm", einheit: "m" },
    { key: "s", kurztext: "Hohlkehle PU-Mörtel", einheit: "m" },
    { key: "t", kurztext: "Bodenablauf anschließen", einheit: "Stk" },
  ];
  assert.equal(profilVorschlagen(park), "parkflaeche");
  assert.equal(profilVorschlagen(pos), "steildach");
  assert.equal(profilVorschlagen([{ kurztext: "Dampfsperre Bitumen", einheit: "m2" }]), "flachdach");
  assert.equal(profilVorschlagen([]), "flachdach");
  assert.deepEqual(PROFILE.map(p => p.id), ["flachdach", "steildach", "parkflaeche"]);
});
