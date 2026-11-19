import { test } from "node:test";
import assert from "node:assert/strict";
import { argePruefen, eigeneQuote, aufteilen, argeAufteilung, argeBerichtHtml, neuerPartner } from "./arge.js";
import { projektZeilen, konzernBaum, ampel } from "./konzern.js";
import { zuordnungVorschlagen, mengenJePosition, bimInsLv, bimInsAufmass, kiZuordnungAuswerten, groesseFuerEinheit, gruppenSchluessel } from "./bim.js";
import { datevAusgang, datevEingangNu, controllingCsv, rechnungenCsv, erpJson, csv } from "./erpExport.js";
import { neueAufmassZeile } from "./abrechnung.js";

const arge = { aktiv: true, partner: [neuerPartner({ id: "a", name: "Demo Bau", quote: 33.33, eigene: true, federfuehrend: true }), neuerPartner({ id: "b", name: "Partner Tief", quote: 33.33 }), neuerPartner({ id: "c", name: "Dritte GmbH", quote: 33.34 })] };

test("ARGE: Prüfung, eigene Quote, centgenaue Aufteilung", () => {
  assert.deepEqual(argePruefen(arge), []);
  assert.equal(eigeneQuote(arge), 0.3333);
  assert.equal(eigeneQuote({ aktiv: false }), 1);
  assert.equal(eigeneQuote({ aktiv: true, partner: [{ name: "x", quote: 50, eigene: true }] }), 1); // ungültig → voll
  const f = argePruefen({ aktiv: true, partner: [{ name: "A", quote: 60 }, { name: "", quote: 30, eigene: true }, { name: "C", quote: 10, eigene: true, federfuehrend: true }] });
  assert.ok(f.some(x => x.includes("Genau ein Partner")) && f.some(x => x.includes("Namen")));
  const t = aufteilen(100, arge.partner);
  assert.equal(t.reduce((s, x) => s + x.betrag, 0), 100);
  assert.deepEqual(t.map(x => x.betrag), [33.33, 33.33, 33.34]);
  const n = aufteilen(-0.05, arge.partner);
  assert.equal(Math.round(n.reduce((s, x) => s + x.betrag, 0) * 100), -5);
  const a = argeAufteilung({ auftrag: 1000000, ergebnisPrognose: -1234.57 }, arge);
  assert.equal(Math.round(a.reduce((s, x) => s + x.werte.ergebnisPrognose, 0) * 100), -123457);
  assert.ok(argeBerichtHtml({ name: "Brücke" }, "November 2026", { auftrag: 1000000 }, arge).includes("Partner Tief"));
});

const meld = (id, monat, prognose, abw, auftrag = 100000) => ({ kalk_projekt_id: id, monat, status: "gemeldet", werte: { erloes: { prognose: auftrag, kum: auftrag / 2 }, kosten: { istKum: auftrag / 2 - 1000 }, ergebnis: { kalkuliert: prognose - abw, prognose, abweichung: abw }, nichtAbgerechnet: 500 } });

test("Konzern: letzte Meldung je Projekt, ARGE-Anteil, Ampel, Summen über Niederlassungen", () => {
  const projekte = [{ id: "p1", name: "Kita", gesellschaft_id: "g1" }, { id: "p2", name: "Brücke", gesellschaft_id: "n1", arge }, { id: "p3", name: "Schule", gesellschaft_id: "g1" }, { id: "p4", name: "Angebot", gesellschaft_id: "n1" }];
  const meldungen = [meld("p1", "2026-10-01", 5000, 0), meld("p1", "2026-11-01", 3000, -2000), meld("p2", "2026-11-01", -9000, -15000, 900000), { ...meld("p3", "2026-12-01", 1, 0), status: "entwurf" }];
  const z = projektZeilen({ projekte, meldungen, auftragssummen: new Map([["p3", 250000]]), angebotssummen: new Map([["p4", 80000]]), heute: "2026-12-10" });
  const p1 = z.find(x => x.id === "p1");
  assert.equal(p1.ergebnisPrognose, 3000);
  assert.equal(p1.ampel, "gelb");
  const p2 = z.find(x => x.id === "p2");
  assert.equal(p2.auftrag, 299970);   // 900.000 × 33,33 %
  assert.equal(p2.ampel, "rot");
  assert.equal(z.find(x => x.id === "p3").ampel, "grau");
  assert.equal(z.find(x => x.id === "p3").auftrag, 250000);
  assert.equal(z.find(x => x.id === "p4").angebote, 80000);
  assert.equal(ampel({ meldung: "2026-09-01", ergebnisPrognose: 1, abweichung: 0, auftrag: 1 }, { heute: "2026-12-10" }), "gelb");
  assert.equal(ampel({ meldung: "2026-11-01", ergebnisPrognose: 1, abweichung: 0, auftrag: 1 }, { heute: "2026-12-10" }), "gruen");
  const b = konzernBaum([{ id: "g1", name: "Demo Bau" }, { id: "n1", name: "NL Duisburg", parent_id: "g1" }], z);
  assert.equal(b.wurzeln.length, 1);
  assert.equal(b.wurzeln[0].alleProjekte.length, 4);
  assert.equal(b.wurzeln[0].unter[0].summen.auftrag, 299970);
  assert.equal(b.wurzeln[0].rot, 1);
  assert.equal(b.gesamt.ergebnisPrognose, 0.3);  // 3000 − 2999,70 (eigener ARGE-Anteil)
});

const gruppen = [
  { bauteil: "Wände", material: "Kalksandstein", anzahl: 38, flaeche: 412.5, volumen: 72.19, laenge: 160, ohneMengen: 0 },
  { bauteil: "Decken/Platten", material: "Beton C25/30", anzahl: 4, flaeche: 310, volumen: 77.5, laenge: 0, ohneMengen: 0 },
  { bauteil: "Fenster", material: "", anzahl: 24, flaeche: 0, volumen: 0, laenge: 0, ohneMengen: 24 },
];
const K = (id, kurztext, einheit, menge = 0) => ({ id, typ: "position", oz: id, kurztext, einheit, menge, extra: {} });
const lv = [K("1", "Mauerwerk Kalksandstein 17,5 cm", "m2", 400), K("2", "Stahlbetondecke C25/30 d=25 cm", "m3", 70), K("3", "Fenster Kunststoff", "St", 20), K("4", "Baustelleneinrichtung", "psch", 1)];

test("BIM: Einheit → Größe, Vorschlag, Mengen, LV und Aufmaß", () => {
  assert.equal(groesseFuerEinheit("m²"), "flaeche");
  assert.equal(groesseFuerEinheit("Stk"), "anzahl");
  assert.equal(groesseFuerEinheit("psch"), null);
  const v = zuordnungVorschlagen(gruppen, lv);
  assert.deepEqual(v.map(x => x.knotenId), ["1", "2", "3"]);
  assert.deepEqual(v.map(x => x.groesse), ["flaeche", "volumen", "anzahl"]);
  const z = [...v, { gruppe: gruppenSchluessel(gruppen[0]), knotenId: "2", groesse: "volumen", faktor: 0 }];
  const m = mengenJePosition(gruppen, z);
  assert.equal(m.get("1").menge, 412.5);
  assert.equal(m.get("2").menge, 77.5 + 72.19);
  const ae = bimInsLv(lv, gruppen, v, { datei: "Haus.ifc", datum: "2026-11-19" });
  const e1 = ae.aendern.find(x => x.id === "1");
  assert.equal(e1.felder.menge, 412.5);
  assert.equal(e1.felder.extra.bim.vorher, 400);
  const am = bimInsAufmass(gruppen, v, { standId: "s", datei: "Haus.ifc", neueZeile: neueAufmassZeile });
  assert.equal(am.length, 3);
  assert.equal(am[2].menge, 24);
  assert.equal(am[0].quelle, "import");
});

test("BIM-KI: nur passende Einheiten, Faktor begrenzt", () => {
  const pos = lv.filter(k => k.typ === "position");
  const r = kiZuordnungAuswerten({ zuordnungen: [{ gruppe: 1, position: 1, groesse: "flaeche", faktor: 2 }, { gruppe: 2, position: 1, groesse: "volumen" }, { gruppe: 3, position: 3, groesse: "anzahl", faktor: 99 }] }, gruppen, pos);
  assert.equal(r[0].knotenId, "1");
  assert.equal(r[0].faktor, 2);
  assert.equal(r[1].knotenId, null);   // m² ≠ Volumen
  assert.equal(r[2].faktor, 1);
});

test("ERP: DATEV Ausgang/Eingang, CSV mit BOM und Semikolon, JSON", () => {
  const projekte = [{ id: "p1", name: "Kita", nummer: "2026-041" }];
  const e = { beraternummer: "12345", mandantennummer: "678", erloeskonto13b: "8337" };
  const d = datevAusgang([{ kalk_projekt_id: "p1", status: "gestellt", art: "abschlag", nummer: "AR-1", datum: "2026-11-19", brutto: 1190, steuerschuld_umkehr: false },
    { kalk_projekt_id: "p1", status: "bezahlt", art: "schluss", nummer: "SR-1", datum: "2026-12-01", brutto: 5000, steuerschuld_umkehr: true }, { status: "entwurf", datum: "2026-11-01", brutto: 9 }], projekte, e);
  assert.deepEqual(d.fehler, []);
  assert.ok(d.text.includes("1190,00;\"S\";\"EUR\";;;;10000;8400"));
  assert.ok(d.text.includes("5000,00;\"S\";\"EUR\";;;;10000;8337"));
  assert.ok(d.text.includes("\"2026-041\""));
  const n = datevEingangNu([{ kalk_projekt_id: "p1", vergabe_id: "v", status: "freigegeben", nummer: "KP-1", datum: "2026-11-10", geprueft: 38.8 }],
    [{ id: "v", titel: "Erdbau", vergeben_an: "b", bieter: [{ id: "b", name: "Kanal Profi" }] }], projekte, e);
  assert.ok(n.text.includes("38,80;\"S\";\"EUR\";;;;3100;70000") && n.text.includes("NU Kanal Profi Erdbau"));
  const c = controllingCsv(projekte, [{ kalk_projekt_id: "p1", monat: "2026-11-01", status: "gemeldet", werte: { kostenarten: [{ kostenart: "lohn", sollKum: 1500.5, istKum: 1800, prognose: 3000 }], erloes: { kum: 4000, prognose: 9000 }, ergebnis: { kalkuliert: 500, prognose: 300 } } }]);
  assert.ok(c.startsWith("﻿Projektnummer;"));
  assert.ok(c.includes("2026-041;Kita;2026-11;lohn;Lohn;1500,5;1800;3000"));
  assert.equal(csv(["a"], [["x;y"]]), "﻿a\r\n\"x;y\"\r\n");
  assert.ok(rechnungenCsv(projekte, [{ kalk_projekt_id: "p1", status: "gestellt", art: "abschlag", nummer: "AR-1", netto: 1000, brutto: 1190 }]).includes("AR-1;Abschlagsrechnung"));
  const j = JSON.parse(erpJson({ projekte, meldungen: [], rechnungen: [{ status: "gestellt", positionen: [1, 2] }], nuRechnungen: [] }));
  assert.equal(j.version, 1);
  assert.equal(j.rechnungen[0].positionen, 2);
});
