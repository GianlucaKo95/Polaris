import { test } from "node:test";
import assert from "node:assert/strict";
import {
  positionenAusAuswahl, zeilenNu, zeilenLieferant, ressourcenFuerAnfrage, neueVergabe, neuerBieter, budgetSumme, bieterSumme,
  preisspiegel, vergabeVorschlag, vergeben, vergabeUebersicht, preiseZuordnen, kiErgebnisZuBieter, lieferantErgebnisZuBieter,
  inKalkulationUebernehmen, anfrageGaeb, auftragGaeb, auftragHtml, preisspiegelHtml, anfrageZeilen,
} from "./vergabe.js";
import { aenderungenAnwenden } from "./lvBaum.js";
import { standBerechnen, MITTELLOHN_ID } from "./rechenkern.js";

const T = (id, felder = {}) => ({ id, parent_id: null, sort: 1, typ: "titel", oz: id, kurztext: `Titel ${id}`, extra: {}, ...felder });
const P = (id, felder = {}) => ({ id, parent_id: null, sort: 1, typ: "position", oz: id, art: "normal", kurztext: `Pos ${id}`, langtext: "", menge: 10, einheit: "m2", ep: 0, rabatt: 0, extra: {}, ...felder });
let n = 0;
const A = (knoten_id, felder) => ({ id: `a${++n}`, knoten_id, sort: n, kostenart: "material", ressource_id: null, bezeichnung: "", einheit: "", menge_je_me: 0, faktor: 1, preis: 0, formel: null, ...felder });
const Z = { modell: "saetze", saetze: { lohn: 20, material: 10, geraet: 10, fremd: 5, sonstiges: 0 }, mittellohn: 50 };

const knoten = [
  T("01", { sort: 1 }),
  P("01.10", { parent_id: "01", sort: 1, menge: 100, kurztext: "Abdichtung Bodenplatte", einheit: "m2" }),
  P("01.20", { parent_id: "01", sort: 2, menge: 40, kurztext: "Hohlkehle", einheit: "m", ep: 12.5, rabatt: 0 }),
  P("01.30", { parent_id: "01", sort: 3, menge: 5, kurztext: "Zulage Durchdringung", einheit: "St", art: "bedarf", ep: 30 }),
  T("02", { sort: 2 }),
  P("02.10", { parent_id: "02", sort: 1, menge: 20, kurztext: "Beton C25/30", einheit: "m3" }),
];
const ansaetze = [
  A("01.10", { kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 0.2 }),
  A("01.10", { ressource_id: "7", bezeichnung: "Bitumenbahn", einheit: "m2", menge_je_me: 1.1, preis: 8 }),
  A("02.10", { ressource_id: "9", bezeichnung: "Transportbeton C25/30", einheit: "m3", menge_je_me: 1.03, preis: 120 }),
  A("02.10", { kostenart: "geraet", bezeichnung: "Pumpe", einheit: "h", menge_je_me: 0.1, preis: 150 }),
];

test("Auswahl: Titel holt alle Positionen in LV-Reihenfolge", () => {
  assert.deepEqual(positionenAusAuswahl(knoten, ["02.10", "01"]), ["01.10", "01.20", "01.30", "02.10"]);
  assert.deepEqual(positionenAusAuswahl(knoten, ["01.20"]), ["01.20"]);
});

test("NU-Zeilen: Budget = EK je ME, Festpreis = EP; Bedarf zählt nicht", () => {
  const z = zeilenNu(knoten, ansaetze, Z, ["01"]);
  assert.equal(z.length, 3);
  assert.equal(z[0].budgetEp, 18.8); // 0,2 h × 50 + 1,1 × 8
  assert.equal(z[0].budgetQuelle, "ek");
  assert.equal(z[1].budgetEp, 12.5);
  assert.equal(z[1].budgetQuelle, "ep");
  assert.equal(z[2].inSumme, false);
  assert.equal(budgetSumme(z), 2380); // 1880 + 500
});

test("Lieferanten-Zeilen aus Ressourcen, ohne Lohn, Menge aufgerundet", () => {
  const r = ressourcenFuerAnfrage(knoten, ansaetze, Z);
  assert.ok(r.every(x => !["lohn", "fremd"].includes(x.kostenart)));
  const z = zeilenLieferant(knoten, ansaetze, Z, ["r:9", "r:7"]);
  assert.equal(z.length, 2);
  const beton = z.find(x => x.ressourceId === "9");
  assert.equal(beton.menge, 20.6);
  assert.equal(beton.budgetEp, 120);
  assert.equal(beton.kurztext, "Transportbeton C25/30");
});

function paket() {
  const v = neueVergabe({ art: "nu", titel: "Abdichtung", zeilen: zeilenNu(knoten, ansaetze, Z, ["01"]) });
  v.bieter = [
    neuerBieter({ id: "b1", name: "Dicht GmbH", status: "abgegeben", preise: { "01.10": 17.9, "01.20": 11, "01.30": 25 }, nachlass: 2, skonto: 3 }),
    neuerBieter({ id: "b2", name: "Billig KG", status: "abgegeben", preise: { "01.10": 16 }, vorbehalte: ["ohne Hohlkehle"] }),
    neuerBieter({ id: "b3", name: "Teuer AG", status: "abgegeben", preise: { "01.10": 24, "01.20": 14 } }),
    neuerBieter({ id: "b4", name: "Absage", status: "abgesagt", preise: { "01.10": 1 } }),
  ];
  return v;
}

test("Bietersumme mit Nachlass und Skonto, Bedarf nicht in der Summe", () => {
  const v = paket();
  const s = bieterSumme(v.zeilen, v.bieter[0]);
  assert.equal(s.brutto, 2230);     // 1790 + 440
  assert.equal(s.nachlass, 44.6);
  assert.equal(s.netto, 2185.4);
  assert.equal(s.skonto, 65.56);
  assert.ok(s.vollstaendig);
  assert.deepEqual(bieterSumme(v.zeilen, v.bieter[1]).fehlend, ["01.20"]);
});

test("Preisspiegel: Abgesagte zählen nicht; Lücken werden mit Höchstpreis aufgefüllt", () => {
  const ps = preisspiegel(paket());
  assert.equal(ps.bieter.length, 3);
  const billig = ps.bieter.find(b => b.id === "b2");
  assert.equal(billig.netto, 1600);
  assert.equal(billig.aufgefuellt, 560);   // 40 m × 14 € (Höchstpreis der anderen)
  assert.equal(billig.wertung, 2160);
  assert.equal(ps.guenstigster, "b2");     // 2160 < 2185,40
  assert.equal(ps.budget, 2380);
  const z = ps.zeilen[0];
  assert.equal(z.min, 16);
  assert.equal(z.median, 17.9);
  assert.deepEqual(z.ausreisser, [null, null, "hoch"]); // 24 > 17,9 × 1,3
});

test("Vergabevorschlag nennt Gründe und warnt vor Lücken und Vorbehalten", () => {
  const vs = vergabeVorschlag(paket());
  assert.equal(vs.bieterId, "b2");
  assert.ok(vs.gruende[0].includes("Niedrigste Wertungssumme"));
  assert.ok(vs.gruende.some(g => g.includes("unter dem Budget")));
  assert.ok(vs.warnungen.some(w => w.includes("ohne Preis")));
  assert.ok(vs.warnungen.some(w => w.includes("ohne Hohlkehle")));
  assert.deepEqual(vergabeVorschlag(neueVergabe()).bieterId, null);
});

test("Vergeben friert Summe ein; Übersicht gegen Budget", () => {
  const v = vergeben(paket(), "b1", { jetzt: "2026-11-19T10:00:00Z" });
  assert.equal(v.status, "vergeben");
  assert.equal(v.vergabe_summe, 2185.4);
  assert.equal(v.budget_summe, 2380);
  assert.equal(v.auftrag.nummer, "NU-001");
  const u = vergabeUebersicht([v, { ...paket(), status: "angefragt", budget_summe: 1000 }, { ...paket(), status: "aufgehoben" }]);
  assert.equal(u.anzahl, 2);
  assert.equal(u.vergeben, 2185.4);
  assert.equal(u.ergebnis, 194.6);
  assert.equal(u.budget, 3380);
  assert.throws(() => vergeben(paket(), "gibtsnicht"));
});

test("Preise zuordnen: OZ mit führenden Nullen, sonst Text und Einheit", () => {
  const z = zeilenNu(knoten, ansaetze, Z, ["01"]);
  const r = preiseZuordnen(z, [
    { oz: "01.0010", bez: "irgendwas", einheit: "m2", ep: 17.123 },
    { bez: "── Titel ──", ep: 0 },
    { oz: "", bez: "Hohlkehle aus Mörtel", einheit: "m", ep: 11, hinweis: "Mörtel MG III" },
    { oz: "99", bez: "Fremd", einheit: "kg", ep: 3 },
  ]);
  // "01.0010" ist normiert "1.10", unsere OZ "01.10" auch → Treffer über OZ
  assert.equal(r.preise["01.20"], 11);
  assert.equal(r.hinweise["01.20"], "Mörtel MG III");
  assert.equal(r.preise["01.10"], 17.12);
  assert.equal(r.nichtZugeordnet, 1);
});

test("OZ-Normierung erkennt 01.02.0010 = 1.2.10", () => {
  const r = preiseZuordnen([{ key: "k", oz: "1.2.10", kurztext: "x", einheit: "m" }], [{ oz: "01.02.010", ep: 5, einheit: "m", bez: "y" }]);
  assert.equal(r.preise.k, 5);
});

test("KI-Ergebnisse werden Bietern zugeordnet", () => {
  const z = zeilenNu(knoten, ansaetze, Z, ["01"]);
  const b = kiErgebnisZuBieter(z, { name: "Dicht", positionen: [{ quellPosId: "01.10", oz: "01.10", bez: "Abdichtung", einheit: "m2", ep: 18 }], vorbehalte: ["Bindefrist 4 Wochen"], summe: { ok: true } });
  assert.deepEqual(b.preise, { "01.10": 18 });
  assert.equal(b.status, "abgegeben");
  const zl = zeilenLieferant(knoten, ansaetze, Z, ["r:9"]);
  const l = lieferantErgebnisZuBieter(zl, { lieferant: "Betonwerk", artikel: [{ text: "C25/30 XC1", bausteinId: "9", preisJeBaustein: 112.5 }, { text: "Fracht", bausteinId: null, preisJeBaustein: null }] });
  assert.deepEqual(l.preise, { "r:9": 112.5 });
  assert.equal(l.name, "Betonwerk");
});

test("Übernahme NU: Ansätze ersetzt durch Fremdleistung nach Nachlass, EP neu", () => {
  const v = vergeben(paket(), "b1");
  const { paket: ae, anzahl } = inKalkulationUebernehmen(v, knoten, ansaetze);
  assert.equal(anzahl, 3);
  const ans = aenderungenAnwenden(ansaetze, ae.ansaetze);
  const k = aenderungenAnwenden(knoten, ae);
  const fremd = ans.filter(a => a.knoten_id === "01.10");
  assert.equal(fremd.length, 1);
  assert.equal(fremd[0].kostenart, "fremd");
  assert.equal(fremd[0].preis, 17.542); // 17,90 × 0,98
  assert.equal(k.find(x => x.id === "01.10").extra.vergabe.bieter, "Dicht GmbH");
  const r = standBerechnen(k, ans, Z);
  assert.equal(r.je.get("01.10").epKalk, 18.42); // 17,542 × 1,05
  assert.equal(r.je.get("01.20").kalkuliert, true); // vorher Festpreis
});

test("Übernahme Lieferant: Ressourcenpreis überall gesetzt; Teilvergabe je Zeile", () => {
  const v = neueVergabe({ art: "lieferant", titel: "Beton", zeilen: zeilenLieferant(knoten, ansaetze, Z, ["r:9", "r:7"]) });
  v.bieter = [neuerBieter({ id: "x", name: "Werk A", preise: { "r:9": 110 } }), neuerBieter({ id: "y", name: "Handel B", preise: { "r:7": 7.5, "r:9": 130 } })];
  const { paket: ae, anzahl } = inKalkulationUebernehmen(v, knoten, ansaetze, { bieterId: "x", wahl: { "r:7": "y" } });
  assert.equal(anzahl, 2);
  const ans = aenderungenAnwenden(ansaetze, ae.ansaetze);
  assert.equal(ans.find(a => a.ressource_id === "9").preis, 110);
  assert.equal(ans.find(a => a.ressource_id === "7").preis, 7.5);
});

test("GAEB-Anfrage X83 ohne Preise, Auftrag X86 mit Bieterpreisen und Nachlass", () => {
  const v = paket();
  const x83 = anfrageGaeb(v, knoten, { projektTitel: "Kita" });
  assert.ok(x83.text.includes("DA83"));
  assert.ok(!x83.text.includes("<UP>"));
  assert.equal(x83.anzahl, 3);
  assert.ok(!x83.text.includes("Beton"));
  assert.throws(() => auftragGaeb(v, knoten));
  const x86 = auftragGaeb(vergeben(v, "b1"), knoten, { projektTitel: "Kita" });
  assert.ok(x86.text.includes("<DP>86</DP>"));
  assert.ok(x86.text.includes("Dicht GmbH"));
  assert.ok(x86.text.includes("<UP>17.54</UP>"));  // 17,90 − 2 %
});

test("Auftrag und Preisspiegel als Druck", () => {
  const v = vergeben(paket(), "b1");
  const h = auftragHtml(v, knoten, { projekt: { name: "Kita Süd" }, firma: { name: "Muster Bau" } });
  assert.ok(h.includes("Nachunternehmerauftrag NU-001"));
  assert.ok(h.includes("2.185,40"));
  assert.ok(h.includes("VOB/B"));
  const p = preisspiegelHtml(paket());
  assert.ok(p.includes("Billig KG") && p.includes("Rang"));
  assert.equal(anfrageZeilen(v)[0].text, "Abdichtung Bodenplatte");
});

test("Übernahme in eine Standkopie ordnet über die OZ zu", () => {
  const v = vergeben(paket(), "b1");
  const kopie = knoten.map(k => ({ ...k, id: `n-${k.id}`, parent_id: k.parent_id ? `n-${k.parent_id}` : null }));
  const ans = ansaetze.map(a => ({ ...a, knoten_id: `n-${a.knoten_id}` }));
  const { paket: ae, anzahl } = inKalkulationUebernehmen(v, kopie, ans);
  assert.equal(anzahl, 3);
  assert.ok(ae.ansaetze.neu.every(a => a.knoten_id.startsWith("n-")));
  assert.equal(ae.ansaetze.loeschen.length, 2);
});

test("Lieferant: Bestellung statt NU-Auftrag", () => {
  const v = neueVergabe({ art: "lieferant", titel: "Beton", zeilen: zeilenLieferant(knoten, ansaetze, Z, ["r:9"]), nummer: 4 });
  v.bieter = [neuerBieter({ id: "x", name: "Werk A", preise: { "r:9": 110 } })];
  const vg = vergeben(v, "x");
  assert.equal(vg.auftrag.nummer, "B-004");
  const h = auftragHtml(vg, knoten, {});
  assert.ok(h.includes("Bestellung B-004") && h.includes("frei Baustelle") && h.includes("Lieferant"));
  assert.ok(!h.includes("VOB/B"));
});
