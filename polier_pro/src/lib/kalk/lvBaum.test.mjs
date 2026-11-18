import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gpCent, summen, zeilen, einfuegen, loeschen, einruecken, ausruecken, verschieben,
  aenderungenAnwenden, aenderungenUmkehren, ozNeuVergeben, pruefen, sortZwischen, rundeCent,
} from "./lvBaum.js";

const T = (id, felder = {}) => ({ id, parent_id: null, sort: 1, typ: "titel", oz: "", art: "normal", kurztext: id, menge: 0, einheit: "", ep: 0, rabatt: 0, ...felder });
const P = (id, felder = {}) => ({ id, parent_id: null, sort: 1, typ: "position", oz: "", art: "normal", kurztext: id, menge: 1, einheit: "St", ep: 1, rabatt: 0, ...felder });

test("GP je Position exakt auf Cent, wie die Datenbank-View", () => {
  assert.equal(gpCent(P("a", { menge: 123.456, ep: 12.35 })), 152468); // 1524,6816
  assert.equal(gpCent(P("b", { menge: 3, ep: 33.33, rabatt: 5 })), 9498); // UP 31,6635 → 31,66; × 3 = 94,98 (wie GAEB)
  assert.equal(gpCent(P("c", { menge: 0.1, ep: 0.05 })), 1); // 0,005 → 0,01 (halber Cent weg von null)
  assert.equal(gpCent(P("d", { menge: -2, ep: 1.005 })), -202); // EP wird wie in der Datenbank auf 1,01 gerundet
  assert.equal(gpCent(T("t")), 0);
  assert.equal(rundeCent(1.005), 1.01);
});

test("Summen je Titel rekursiv, Bedarf ohne GB und Alternativen außerhalb", () => {
  const k = [
    T("t1", { sort: 1 }), T("t11", { parent_id: "t1", sort: 1 }),
    P("p1", { parent_id: "t11", menge: 2, ep: 10 }),
    P("p2", { parent_id: "t1", sort: 2, menge: 1, ep: 5, art: "bedarf" }),
    P("p3", { parent_id: "t1", sort: 3, menge: 1, ep: 7, art: "bedarf_mit" }),
    P("p4", { parent_id: "t1", sort: 4, menge: 1, ep: 99, art: "alternativ" }),
    T("t2", { sort: 2 }), P("p5", { parent_id: "t2", menge: 1, ep: 3 }),
  ];
  const s = summen(k);
  assert.equal(s.gesamtCent, 3000);
  assert.equal(s.jeKnoten.get("t11"), 2000);
  assert.equal(s.jeKnoten.get("t1"), 2700);
  assert.equal(s.jeKnoten.get("p4"), 9900); // GP angezeigt, nicht summiert
  assert.equal(s.positionen, 5);
});

test("Zeilen in Lesereihenfolge, zugeklappte Titel blenden Kinder aus", () => {
  const k = [T("t1", { sort: 2 }), P("p1", { parent_id: "t1" }), T("t0", { sort: 1 }), P("p0", { parent_id: "t0" })];
  assert.deepEqual(zeilen(k).map(z => `${z.k.id}:${z.tiefe}`), ["t0:0", "p0:1", "t1:0", "p1:1"]);
  assert.deepEqual(zeilen(k, { zugeklappt: new Set(["t0"]) }).map(z => z.k.id), ["t0", "t1", "p1"]);
});

test("Einfügen: unter Titel ans Ende, hinter Position als Geschwister, mit OZ", () => {
  let k = [T("t1", { oz: "01" }), P("p1", { parent_id: "t1", oz: "01.0010", sort: 10 }), P("p2", { parent_id: "t1", oz: "01.0020", sort: 20 })];
  const a = einfuegen(k, { nachId: "p1" });
  assert.equal(a.neu[0].parent_id, "t1");
  assert.equal(a.neu[0].sort, 15);
  assert.equal(a.neu[0].oz, "01.0015");
  const b = einfuegen(k, { nachId: "t1" });
  assert.equal(b.neu[0].sort, 20 + 1024);
  assert.equal(b.neu[0].oz, "01.0030");
  const c = einfuegen([], {});
  assert.equal(c.neu[0].oz, "0010");
});

test("Löschen nimmt den Unterbaum mit, Rückgängig stellt ihn wieder her", () => {
  const k = [T("t1"), P("p1", { parent_id: "t1" }), T("t2", { sort: 2 })];
  const ae = loeschen(k, ["t1"]);
  assert.deepEqual(ae.loeschen.sort(), ["p1", "t1"]);
  const danach = aenderungenAnwenden(k, ae);
  assert.equal(danach.length, 1);
  const zurueck = aenderungenAnwenden(danach, aenderungenUmkehren(k, ae));
  assert.deepEqual(zurueck.map(x => x.id).sort(), ["p1", "t1", "t2"]);
});

test("Rückgängig einer Feldänderung", () => {
  const k = [P("p1", { ep: 5 })];
  const ae = { aendern: [{ id: "p1", felder: { ep: 7 } }] };
  const neu = aenderungenAnwenden(k, ae);
  assert.equal(neu[0].ep, 7);
  assert.equal(aenderungenAnwenden(neu, aenderungenUmkehren(k, ae))[0].ep, 5);
});

test("Ein- und Ausrücken, Verschieben nicht in sich selbst", () => {
  const k = [T("t1", { sort: 1 }), P("p1", { sort: 2 })];
  const e = einruecken(k, "p1");
  assert.equal(e.aendern[0].felder.parent_id, "t1");
  const k2 = aenderungenAnwenden(k, e);
  const a = ausruecken(k2, "p1");
  assert.equal(a.aendern[0].felder.parent_id, null);
  assert.ok(a.aendern[0].felder.sort > 1);
  assert.equal(einruecken(k, "t1"), null);
  const k3 = [T("t1"), T("t2", { parent_id: "t1" })];
  assert.equal(verschieben(k3, "t1", { parentId: "t2" }), null);
});

test("OZ neu vergeben nach Maske", () => {
  const k = [T("t1", { sort: 1 }), T("t11", { parent_id: "t1", sort: 1 }), P("p1", { parent_id: "t11", sort: 1 }), P("p2", { parent_id: "t11", sort: 2 }), T("t2", { sort: 2 }), P("p3", { parent_id: "t2" })];
  const oz = Object.fromEntries(aenderungenAnwenden(k, ozNeuVergeben(k)).map(x => [x.id, x.oz]));
  assert.deepEqual(oz, { t1: "01", t11: "01.01", p1: "01.01.0010", p2: "01.01.0020", t2: "02", p3: "02.0010" });
});

test("Prüfung findet doppelte OZ, fehlende Texte, Mengen und Preise", () => {
  const k = [P("a", { oz: "1", kurztext: "" }), P("b", { oz: "1", ep: 0 }), P("c", { oz: "2", menge: 0, einheit: "" }), P("d", { oz: "3", art: "bedarf", menge: 0, ep: 0 })];
  const texte = pruefen(k).map(h => h.text);
  assert.ok(texte.some(t => t.includes("OZ 1 ist doppelt")));
  assert.ok(texte.some(t => t.includes("ohne Kurztext")));
  assert.ok(texte.some(t => t.includes("ohne Preis")));
  assert.ok(texte.some(t => t.includes("ohne Einheit")));
  assert.ok(texte.some(t => t.includes("ohne Menge")));
  assert.equal(pruefen(k).filter(h => h.id === "d").length, 0);
});

test("Sortwerte zwischen Nachbarn", () => {
  assert.equal(sortZwischen(null, null), 1024);
  assert.equal(sortZwischen(10, 20), 15);
  assert.equal(sortZwischen(null, 10), 10 - 1024);
});

test("Fehlende OZ vergeben, vorhandene bleiben", async () => {
  const { ozFehlendeVergeben, aenderungenAnwenden: anw } = await import("./lvBaum.js");
  const k = [T("t1", { oz: "01" }), P("a", { parent_id: "t1", oz: "01.0010", sort: 1 }), P("b", { parent_id: "t1", sort: 2 }), P("c", { parent_id: "t1", sort: 3 }), P("d", { parent_id: "t1", oz: "01.0100", sort: 4 })];
  const oz = Object.fromEntries(anw(k, ozFehlendeVergeben(k)).map(x => [x.id, x.oz]));
  assert.deepEqual(oz, { t1: "01", a: "01.0010", b: "01.0020", c: "01.0030", d: "01.0100" });
});
