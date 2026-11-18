import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseGaebXml } from "../gaebXml.js";
import { parseGaeb90 } from "../gaeb90.js";
import { gaebX84Schreiben } from "../gaebX84.js";
import { gaebZuKnoten, altePositionenZuKnoten, knotenZuFlach, texteTeilen } from "./lvFlach.js";
import { summen, zeilen, pruefen } from "./lvBaum.js";

const fx = join(dirname(fileURLToPath(import.meta.url)), "..", "__fixtures__");

test("Text teilen: erste Zeile als Kurztext, Rest im Langtext", () => {
  assert.deepEqual(texteTeilen("Aushub"), { kurztext: "Aushub", langtext: "" });
  const t = texteTeilen("Mauerwerk KS 17,5 cm\nWand innen, Mörtelgruppe IIa");
  assert.equal(t.kurztext, "Mauerwerk KS 17,5 cm");
  assert.ok(t.langtext.includes("Mörtelgruppe"));
  const lang = texteTeilen("Sehr langer erster Satz ohne Zeilenumbruch, der weit über siebzig Zeichen hinausgeht und gekürzt werden muss");
  assert.ok(lang.kurztext.length <= 72 && lang.kurztext.endsWith("…"));
  assert.ok(lang.langtext.startsWith("Sehr langer"));
});

test("GAEB XML X83 wird zum Baum mit Titeln, OZ und Arten", () => {
  const parsed = parseGaebXml(readFileSync(join(fx, "gaeb-xml-sample.X83"), "utf-8"));
  const k = gaebZuKnoten(parsed);
  const titel = k.filter(x => x.typ === "titel");
  const pos = k.filter(x => x.typ === "position");
  assert.equal(pos.length, parsed.positionen.filter(p => p.typ === "position").length);
  assert.ok(titel.length >= 1);
  for (const t of titel) assert.ok(t.oz, `Titel ${t.kurztext} ohne OZ`);
  for (const p of pos) {
    const eltern = k.find(x => x.id === p.parent_id);
    assert.ok(eltern, `Position ${p.oz} ohne Titel`);
    assert.ok(p.oz.startsWith(eltern.oz + "."), `${p.oz} passt nicht zu Titel ${eltern.oz}`);
    assert.ok(!p.kurztext.startsWith("["), "Art-Präfix entfernt");
  }
  assert.ok(pos.some(p => p.art === "bedarf" || p.art === "bedarf_mit"), "Bedarfsposition erkannt");
  assert.equal(pruefen(k).filter(h => h.text.includes("doppelt")).length, 0);
});

test("GAEB 90 D83 wird zum Baum", () => {
  const parsed = parseGaeb90(readFileSync(join(fx, "gaeb-sample.d83"), "latin1"));
  const k = gaebZuKnoten(parsed);
  const pos = k.filter(x => x.typ === "position");
  assert.equal(pos.length, parsed.positionen.filter(p => p.typ === "position").length);
  const ub = k.filter(x => x.extra?.unterbeschreibung);
  assert.deepEqual(ub.map(x => x.extra.unterNr), ["01", "02", "03"]);
  assert.ok(ub[0].kurztext.startsWith("Unterbeschreibung 01: Kalksandst"));
  assert.equal(ub[2].extra.menge, 120);
  assert.deepEqual(k.filter(x => x.typ === "titel").map(x => x.oz), ["01", "0101", "02", "0201", "0202", "0203"]);
  assert.ok(zeilen(k).length === k.length, "jeder Knoten erreichbar");
  assert.ok(pos.some(p => p.art === "alternativ"));
});

test("Rundreise: GAEB X83 → Baum → flach → X84 behält Positionen und Summe", () => {
  const parsed = parseGaebXml(readFileSync(join(fx, "gaeb-xml-sample.X83"), "utf-8"));
  const k = gaebZuKnoten(parsed).map((x, i) => (x.typ === "position" ? { ...x, ep: 10 + i } : x));
  const flach = knotenZuFlach(k);
  const xml = gaebX84Schreiben(flach, { projektTitel: "Test" });
  assert.deepEqual(xml.warnungen, []);
  const zurueck = gaebZuKnoten(parseGaebXml(xml.text));
  assert.equal(zurueck.filter(x => x.typ === "position").length, k.filter(x => x.typ === "position").length);
  assert.equal(summen(zurueck).gesamtCent, summen(k).gesamtCent);
});

test("Alte Angebotspositionen mit Kopfzeilen, Hinweisen, Unterpositionen und Kalkulation", () => {
  const alt = [
    { id: 1, bez: "── Rohbau / Mauerwerk ──", menge: 0, ep: 0 },
    { id: 2, oz: "01.01.0010", bez: "Mauerwerk KS", langtext: "17,5 cm, innen", menge: 120.5, einheit: "m2", ep: 48.2, kalk: { lohnposten: [] } },
    { id: 3, bez: "↳ Zulage Sturz", oz: "01.01.0020", menge: 4, einheit: "St", ep: 12 },
    { id: 4, bez: "Vorbemerkung: Arbeiten nach VOB/C", menge: 0, ep: 0 },
    { id: 5, bez: "[Bedarfsposition (nicht in Angebotssumme enthalten)] Wasserhaltung", oz: "01.01.0030", menge: 1, einheit: "psch", ep: 500 },
    { id: 6, bez: "── Rohbau / Beton ──", menge: 0, ep: 0 },
    { id: 7, oz: "01.02.0010", bez: "Decke C25/30", menge: 30, einheit: "m3", ep: 180, art: "alternativ" },
  ];
  const k = altePositionenZuKnoten(alt);
  const titel = k.filter(x => x.typ === "titel").map(x => `${x.oz} ${x.kurztext}`);
  assert.deepEqual(titel, ["01 Rohbau", "01.01 Mauerwerk", "01.02 Beton"]);
  const mw = k.find(x => x.oz === "01.01.0010");
  assert.equal(mw.langtext, "17,5 cm, innen");
  assert.deepEqual(mw.extra.altKalk, { lohnposten: [] });
  assert.equal(mw.extra.alteId, 2);
  assert.equal(k.find(x => x.oz === "01.01.0020").extra.unterposition, true);
  assert.equal(k.filter(x => x.typ === "hinweis").length, 1);
  assert.equal(k.find(x => x.oz === "01.01.0030").art, "bedarf");
  assert.equal(k.find(x => x.oz === "01.01.0030").kurztext, "Wasserhaltung");
  assert.equal(k.find(x => x.oz === "01.02.0010").art, "alternativ");
  assert.equal(summen(k).gesamtCent, Math.round((120.5 * 48.2 + 4 * 12) * 100));
});

test("Alte Angebote ohne Titel und ohne OZ", () => {
  const k = altePositionenZuKnoten([{ id: 1, bez: "Stundenlohn", menge: 8, einheit: "h", ep: 52 }]);
  assert.equal(k.length, 1);
  assert.equal(k[0].parent_id, null);
  assert.equal(summen(k).gesamt, 416);
});

test("Export eines GAEB-90-LVs: Gliederung, Titelnamen und Unterbeschreibungen bleiben erhalten", () => {
  const k = gaebZuKnoten(parseGaeb90(readFileSync(join(fx, "gaeb-sample.d83"), "latin1"))).map((x, i) => (x.typ === "position" ? { ...x, ep: 10 + i } : x));
  const r = gaebX84Schreiben(knotenZuFlach(k), { projektTitel: "Test" });
  assert.deepEqual(r.warnungen, []);
  const zurueck = parseGaebXml(r.text).positionen.filter(p => p.typ === "position");
  assert.equal(zurueck.length, k.filter(x => x.typ === "position").length);
  const wand = zurueck.find(p => p.oz === "01.01.10");
  assert.ok(wand, "OZ 0101.10 wird zu 01.01.10");
  assert.ok(wand.titelPfad.includes("MAUERARBEITEN") && wand.titelPfad.includes("WAENDE"), wand.titelPfad);
  const leit = zurueck.find(p => p.oz === "01.01.60");
  assert.ok(leit.bez.includes("Unterbeschreibung 01") && leit.bez.includes("Unterbeschreibung 03"), "Unterbeschreibungen im Langtext der Leitposition");
  assert.equal(Math.round(r.summe * 100), summen(k).gesamtCent);
});

test("Export: Positionen ohne Titel, X83 ohne Preise, Rabatt wie im Rechenkern", () => {
  const k = [
    { id: "a", parent_id: null, sort: 1, typ: "position", oz: "0010", art: "normal", kurztext: "Stundenlohn", langtext: "", menge: 8, einheit: "h", ep: 52, rabatt: 0 },
    { id: "b", parent_id: null, sort: 2, typ: "position", oz: "0020", art: "normal", kurztext: "Rabattiert", langtext: "", menge: 3, einheit: "St", ep: 33.33, rabatt: 5 },
  ];
  const r84 = gaebX84Schreiben(knotenZuFlach(k));
  assert.deepEqual(r84.warnungen, []);
  assert.equal(Math.round(r84.summe * 100), summen(k).gesamtCent);
  assert.ok(r84.text.includes("<UP>31.66</UP><IT>94.98</IT>"));
  const r83 = gaebX84Schreiben(knotenZuFlach(k), { phase: 83 });
  assert.ok(r83.text.includes("<DP>83</DP>") && r83.text.includes("DA83/3.3"));
  assert.ok(!r83.text.includes("<UP>") && !r83.text.includes("<Total>"));
  assert.equal(parseGaebXml(r83.text).positionen.filter(p => p.typ === "position").length, 2);
});
