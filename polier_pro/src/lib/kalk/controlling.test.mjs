import { test } from "node:test";
import assert from "node:assert/strict";
import { controlling, nuKostenAusRechnungen, stundenAusZeitbuchungen, monatsEnde, monatsErster, meldungWerte, verlauf, nachkalkulationAnsaetze } from "./controlling.js";
import { neueAufmassZeile } from "./abrechnung.js";
import { MITTELLOHN_ID } from "./rechenkern.js";

const P = (id, f = {}) => ({ id, parent_id: null, sort: 1, typ: "position", oz: id, art: "normal", kurztext: `Pos ${id}`, langtext: "", menge: 100, einheit: "m2", ep: 0, rabatt: 0, extra: {}, ...f });
let n = 0;
const A = (knoten_id, f) => ({ id: `a${++n}`, knoten_id, sort: n, kostenart: "material", ressource_id: null, bezeichnung: "", einheit: "", menge_je_me: 0, faktor: 1, preis: 0, formel: null, ...f });
const Z = { modell: "saetze", saetze: { lohn: 20, material: 10, geraet: 10, fremd: 5, sonstiges: 0 }, mittellohn: 50 };
// Auftrag: 2 Positionen; EK je ME: p1 = 0,5 h × 50 + 10 Stoff = 35; p2 = 20 Fremd
const auftragKnoten = [P("01.10", { menge: 100, ep: 42 }), P("01.20", { sort: 2, menge: 50, ep: 21 })];
const auftragAns = [A("01.10", { kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 0.5 }), A("01.10", { menge_je_me: 1, preis: 10 }), A("01.20", { kostenart: "fremd", menge_je_me: 1, preis: 20 })];
const auftrag = { stand: { id: "s1", nachlass: 0, zuschlaege: Z }, knoten: auftragKnoten, ansaetze: auftragAns };
// Arbeitskalkulation (Kopie mit anderen IDs): NU günstiger vergeben (18 statt 20)
const arbeitKnoten = auftragKnoten.map(k => ({ ...k, id: `w-${k.id}` }));
const arbeitAns = auftragAns.map(a => ({ ...a, id: `w${a.id}`, knoten_id: `w-${a.knoten_id}`, ...(a.kostenart === "fremd" ? { preis: 18 } : {}) }));
const arbeit = { stand: { id: "s3", zuschlaege: Z }, knoten: arbeitKnoten, ansaetze: arbeitAns };
const M = (stand, knoten, formel) => neueAufmassZeile({ stand_id: stand, knoten_id: knoten, formel });

test("Kalkuliertes Ergebnis und Soll der Leistung", () => {
  const c = controlling({ auftrag, aufmass: [M("s1", "01.10", "40")] });
  assert.equal(c.erloes.lv, 5250);          // 4200 + 1050
  assert.equal(c.kosten.kalk, 4500);        // 3500 + 1000
  assert.equal(c.ergebnis.kalkuliert, 750);
  assert.equal(c.erloes.kum, 1680);
  assert.equal(c.kosten.sollKum, 1400);     // 40 × 35
  assert.equal(c.stunden.sollKum, 20);
  assert.equal(c.ergebnis.prognose, 750);  // ohne Ist: Ist = Soll angenommen
  assert.deepEqual(c.istAngenommen, ["lohn", "material"]);
});

test("Brücke geht exakt auf: Arbeitskalkulation, Mengen, Nachträge, Leistung", () => {
  const nKnoten = [P("N1", { menge: 10, ep: 60 })];
  const nAns = [A("N1", { kostenart: "fremd", menge_je_me: 1, preis: 40 })];
  const nt = [
    { nachtrag: { id: "n1", nummer: 1, status: "beauftragt" }, stand: { id: "s2", nachlass: 0, zuschlaege: Z }, knoten: nKnoten, ansaetze: nAns },
    { nachtrag: { id: "n2", nummer: 2, status: "angeboten", betrag_angeboten: 1000 }, stand: { id: "s4", nachlass: 0, zuschlaege: Z }, knoten: [], ansaetze: [] },
  ];
  const aufmass = [M("s1", "01.10", "60"), M("s1", "01.20", "60"), M("s2", "N1", "5")];
  const c = controlling({ auftrag, arbeit, nachtraege: nt, aufmass, ist: { stunden: 36, material: 640, fremd: 1200 }, einstellungen: { methode: "trend", ntQuote: 50 } });
  const b = Object.fromEntries(c.bruecke.map(x => [x.id, x.wert]));
  assert.equal(b.kalk, 750);
  assert.equal(b.arbeit, 100);              // 50 × (20 − 18)
  assert.equal(b.mengen, 30);               // 10 m × (21 − 18) Mehrmenge 01.20
  assert.equal(b.nachtraege, 200 + 500);    // N1: 600 − 400; offen: 1000 × 50 %
  const summe = c.bruecke.filter(x => !x.summe).reduce((a, x) => a + x.wert, 0) + b.kalk;
  assert.equal(Math.round(summe * 100) / 100, b.prognose);
  assert.equal(b.prognose, c.ergebnis.prognose);
  // Lohn: 36 h × 50 = 1800 Ist gegen Soll 60 × 25 = 1500 → Faktor 1,2, Rest (40 × 25) × 1,2
  const lohn = c.kostenarten.find(k => k.kostenart === "lohn");
  assert.equal(lohn.istKum, 1800);
  assert.equal(lohn.sollKum, 1500);
  assert.equal(Math.round(lohn.faktor * 100) / 100, 1.2);
  assert.equal(lohn.prognose, 1800 + 1200);
  assert.equal(c.stunden.faktor, null);   // erst ab 40 Soll-Stunden (hier 30)
});

test("Plan-Methode und Prognosemengen von Hand", () => {
  const c = controlling({ auftrag, aufmass: [M("s1", "01.10", "60")], ist: { lohn: 2000, material: 0 }, einstellungen: { methode: "plan", prognoseMengen: { "s1|01.10": 120 } } });
  const lohn = c.kostenarten.find(k => k.kostenart === "lohn");
  assert.equal(lohn.trend, false);
  assert.equal(lohn.rest, 60 * 25);
  assert.equal(c.erloes.prognoseHaupt, 120 * 42 + 1050);
  assert.ok(c.positionen.find(p => p.knotenId === "01.10").vorgabe);
});

test("Festpreise ohne Ansätze gelten als Fremdkosten zum EP (kein Scheingewinn), BGK aus Endsumme", () => {
  const Ze = { modell: "endsumme", endsumme: { bgk: [{ bez: "Kran", betrag: 900 }], agkProzent: 0, wgProzent: 0, umlageAuf: "alle" }, mittellohn: 50 };
  const c = controlling({ auftrag: { stand: { id: "s1", zuschlaege: Ze }, knoten: [...auftragKnoten, P("01.30", { sort: 3, menge: 1, ep: 500, einheit: "psch" })], ansaetze: auftragAns },
    aufmass: [M("s1", "01.10", "50")] });
  assert.equal(c.geschaetzt, 1);
  const bgk = c.kostenarten.find(k => k.kostenart === "bgk");
  assert.equal(bgk.kalk, 900);
  assert.ok(bgk.sollKum > 0 && bgk.sollKum < 900);
});

test("Ist aus NU-Rechnungen und Zeitbuchungen", () => {
  assert.equal(nuKostenAusRechnungen([
    { vergabe_id: "v1", status: "geprueft", datum: "2026-10-31", pruefung: { summen: { nachNachlass: 1000 } } },
    { vergabe_id: "v1", status: "freigegeben", datum: "2026-11-30", pruefung: { summen: { nachNachlass: 2500 } } },
    { vergabe_id: "v2", status: "eingegangen", datum: "2026-11-30", pruefung: { summen: { nachNachlass: 9999 } } },
    { vergabe_id: "v3", status: "bezahlt", datum: "2026-09-30", pruefung: { summen: { nachNachlass: 300 } } }]), 2800);
  assert.equal(nuKostenAusRechnungen([{ vergabe_id: "v1", status: "geprueft", datum: "2026-12-15", pruefung: { summen: { nachNachlass: 5 } } }], { bis: "2026-11-30" }), 0);
  const s = stundenAusZeitbuchungen([{ eingestempelt_at: "2026-10-03T07:00:00Z", netto_minuten: 480, status: "abgeschlossen" }, { eingestempelt_at: "2026-11-02T07:00:00Z", netto_minuten: 450, status: "abgeschlossen" },
    { eingestempelt_at: "2026-11-03T07:00:00Z", netto_minuten: 300, status: "offen" }, { eingestempelt_at: "2026-12-01T07:00:00Z", netto_minuten: 60, status: "abgeschlossen" }], { bis: "2026-11-30" });
  assert.equal(s.summe, 15.5);
  assert.deepEqual(s.jeMonat, [{ monat: "2026-10", stunden: 8 }, { monat: "2026-11", stunden: 7.5 }]);
  assert.equal(monatsEnde("2026-02-01"), "2026-02-28");
  assert.equal(monatsErster("2026-11-19"), "2026-11-01");
});

test("Meldung einfrieren und Verlauf", () => {
  const c = controlling({ auftrag, aufmass: [M("s1", "01.10", "40")] });
  const w = meldungWerte(c, { abgerechnet: 1000 });
  assert.equal(w.nichtAbgerechnet, 680);
  const v = verlauf([{ monat: "2026-11-01", status: "gemeldet", werte: w }, { monat: "2026-10-01", status: "gemeldet", werte: { ...w, ergebnis: { ...w.ergebnis, prognose: 800 } } }, { monat: "2026-12-01", status: "entwurf", werte: w }]);
  assert.deepEqual(v.map(x => x.prognose), [800, 750]);
});

test("Nachkalkulation: Lohnstunden mit Ist-Faktor, Formeln bleiben nachvollziehbar", () => {
  const r = nachkalkulationAnsaetze([A("x", { kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 0.5 }), A("x", { kostenart: "lohn", einheit: "h", formel: "d*2" }), A("x", { menge_je_me: 1 })], 1.234);
  assert.equal(r.aendern.length, 2);
  assert.equal(r.aendern[0].felder.menge_je_me, 0.617);
  assert.equal(r.aendern[1].felder.formel, "(d*2)*1,234");
  assert.deepEqual(nachkalkulationAnsaetze([], null), { aendern: [] });
});
