import { test } from "node:test";
import assert from "node:assert/strict";
import {
  neueAufmassZeile, aufmassZeileAendern, zeilenAusWerkzeug, aufmassJePosition, abrechnungsZeilen, mengenvergleich, rechnungsNummer, rechnungTitel,
  rechnungBerechnen, pruefbarkeit, rechnungHtml, aufmassX31, x31Lesen, x31ZuAufmass, nachtragUebersicht, begruendungKi, nuRechnungPruefen,
  nuRechnungAuswerten, pruefvermerkHtml, formelFehler,
} from "./abrechnung.js";
import { neueVergabe, neuerBieter, vergeben } from "./vergabe.js";

const T = (id, f = {}) => ({ id, parent_id: null, sort: 1, typ: "titel", oz: id, kurztext: `Titel ${id}`, extra: {}, ...f });
const P = (id, f = {}) => ({ id, parent_id: null, sort: 1, typ: "position", oz: id, art: "normal", kurztext: `Pos ${id}`, langtext: "", menge: 100, einheit: "m2", ep: 10, rabatt: 0, extra: {}, ...f });
const stand = { id: "s1", bezeichnung: "Auftrag", nachlass: 3 };
const knoten = [T("01"), P("01.10", { parent_id: "01", menge: 100, ep: 25.5 }), P("01.20", { parent_id: "01", sort: 2, menge: 40, ep: 12, einheit: "m" }),
  P("01.30", { parent_id: "01", sort: 3, menge: 1, einheit: "psch", ep: 2400, art: "pauschal" }), P("01.40", { parent_id: "01", sort: 4, menge: 5, art: "bedarf", ep: 80, einheit: "St" })];
const nStand = { id: "s2", bezeichnung: "Nachtrag 1" };
const nKnoten = [P("N1.10", { menge: 20, ep: 30, kurztext: "Zusätzliche Abdichtung" })];
const nachtrag = { id: "n1", nummer: 1, titel: "Mehrabdichtung", status: "beauftragt", stand_id: "s2" };
const A = (standId, knotenId, formel, f = {}) => neueAufmassZeile({ stand_id: standId, knoten_id: knotenId, formel, ...f });

test("Aufmaßzeile: Menge aus Rechenansatz, Abzüge, Werkzeugzeilen", () => {
  const z = A("s1", "01.10", "12,40*2,75");
  assert.equal(z.menge, 34.1);
  assert.equal(aufmassZeileAendern(z, { formel: "(3+2)*2" }).menge, 10);
  assert.equal(formelFehler({ formel: "3*" }), "Rechenansatz nicht lesbar");
  const w = zeilenAusWerkzeug([{ bez: "Wand Nord", formel: "5,2*2,6", menge: 13.52, quelle: "messung" }, { bez: "Fenster", menge: 1.5, abzug: true, quelle: "foto", toleranz: 0.12 }], { standId: "s1", knotenId: "01.10" });
  assert.equal(w[1].abzug, true);
  assert.equal(w[1].quelle, "foto");
  const m = aufmassJePosition(w).get("s1|01.10");
  assert.equal(m.menge, 12.02);
  assert.equal(m.zeilen, 2);
});

const aufmass = [A("s1", "01.10", "60"), A("s1", "01.10", "52,5"), A("s1", "01.10", "2", { abzug: true }), A("s1", "01.20", "18"), A("s1", "01.30", "0,5"),
  A("s1", "01.40", "2"), A("s2", "N1.10", "20")];
const teile = [{ stand, knoten }, { stand: nStand, knoten: nKnoten, nachtrag }];

test("Abrechnungszeilen und Mengenvergleich mit § 2 Abs. 3 VOB/B", () => {
  const z = abrechnungsZeilen(teile, aufmass);
  assert.equal(z.length, 5);
  const p1 = z.find(x => x.knotenId === "01.10");
  assert.equal(p1.mengeKum, 110.5);
  assert.equal(p1.betragKum, 2817.75);
  assert.equal(p1.vob, "mehr"); // +10,5 %
  assert.equal(z.find(x => x.knotenId === "01.30").betragKum, 1200);
  assert.equal(z.find(x => x.knotenId === "01.40").gpLv, 0); // Bedarf nicht im Auftragswert
  assert.equal(z.find(x => x.knotenId === "01.40").betragKum, 160);   // ausgeführt → abgerechnet
  assert.equal(z.find(x => x.knotenId === "N1.10").nachtrag.nummer, 1);
  const mv = mengenvergleich(z);
  assert.equal(mv.lv, 5430);  // 2550 + 480 + 2400
  assert.equal(mv.nachtraege, 600);
  assert.equal(mv.abgerechnet, 2817.75 + 216 + 1200 + 160 + 600);
  assert.equal(mv.mehr, 1);
});

test("Rechnung kumuliert: Nachlass, Einbehalt, bisherige Rechnungen, § 13b", () => {
  const z = abrechnungsZeilen(teile, aufmass);
  const r1 = rechnungBerechnen(z, { nachlassProzent: 3, einbehaltProzent: 10, mwst: 19 });
  assert.equal(r1.summen.leistung, 4993.75);
  assert.equal(r1.summen.nachlass, 149.81);
  assert.equal(r1.summen.einbehalt, 484.39);  // 10 % von 4843,94
  assert.equal(r1.netto, 4359.55);
  assert.equal(r1.summen.steuer, 828.31);
  assert.equal(r1.brutto, 5187.86);
  // zweite Rechnung: mehr Aufmaß, die erste ist gestellt
  const vor = [{ id: "r1", status: "gestellt", lfd_nr: 1, nummer: "AR-1", datum: "2026-10-01", netto: r1.netto, positionen: r1.positionen }];
  const z2 = abrechnungsZeilen(teile, [...aufmass, A("s1", "01.20", "20"), A("s1", "01.30", "0,5")]);
  const r2 = rechnungBerechnen(z2, { nachlassProzent: 3, einbehaltProzent: 10, mwst: 19, umkehr: true, vorherige: [...vor, { status: "storniert", netto: 999 }] });
  assert.equal(r2.summen.bisher, 4359.55);
  const p = r2.positionen.find(x => x.knotenId === "01.30");
  assert.equal(p.betragVorher, 1200);
  assert.equal(p.betragKum, 2400);
  assert.equal(r2.summen.steuer, 0);
  assert.equal(r2.brutto, r2.netto);
  // 240 + 1200 = 1440 mehr Leistung → nach 3 % und 10 %: 1257,12 (Cent-genau aus kumulierten Werten)
  assert.equal(r2.netto, 5616.67 - 4359.55);
});

test("Nummern und Titel", () => {
  assert.deepEqual(rechnungsNummer({ nummer: "2026-041" }, [{ status: "gestellt" }, { status: "storniert" }], "abschlag"), { lfd: 2, nummer: "AR-2026-041-02" });
  assert.equal(rechnungsNummer({}, [], "schluss").nummer.startsWith("SR-"), true);
  const alle = [{ id: "a", art: "abschlag", lfd_nr: 1, status: "gestellt" }, { id: "b", art: "abschlag", lfd_nr: 2, status: "storniert" }, { id: "c", art: "abschlag", lfd_nr: 3, status: "entwurf" }];
  assert.equal(rechnungTitel(alle[2], alle), "2. Abschlagsrechnung");
  assert.equal(rechnungTitel({ art: "schluss" }), "Schlussrechnung");
});

test("Prüfbarkeit: Pflichtangaben, Aufmaß je Position, Rechenansätze, Hinweise", () => {
  const z = abrechnungsZeilen(teile, aufmass);
  const b = rechnungBerechnen(z, {});
  const r = { ...b, nummer: "AR-1", datum: "2026-11-19", leistung_bis: "2026-11-15", art: "schluss" };
  const firma = { name: "Demo Bau", strasse: "Hafenstraße 12", plz: "47119", ort: "Duisburg", steuernummer: "134/5678/9012" };
  let p = pruefbarkeit(r, { zeilen: z, aufmass, firma, projekt: { auftraggeber: "Stadt Duisburg" }, nachtraege: [nachtrag, { status: "angeboten" }] });
  assert.equal(p.ok, true, p.fehler.join(" | "));
  assert.ok(p.hinweise.some(h => h.includes("§ 2 Abs. 3")));
  assert.ok(p.hinweise.some(h => h.includes("nicht beauftragt")));
  p = pruefbarkeit({ ...r, leistung_bis: null }, { zeilen: z, aufmass: [...aufmass.slice(1), { ...aufmass[0], menge: 61 }], firma: { name: "X" }, projekt: {} });
  assert.equal(p.ok, false);
  assert.ok(p.fehler.some(f => f.includes("Steuernummer")));
  assert.ok(p.fehler.some(f => f.includes("Auftraggeber")));
  assert.ok(p.fehler.some(f => f.includes("Leistungszeitraum")));
  assert.ok(p.fehler.some(f => f.includes("nicht zum Rechenansatz")));
  const ohne = pruefbarkeit(r, { zeilen: z, aufmass: aufmass.filter(a => a.knoten_id !== "01.20"), firma, projekt: { auftraggeber: "x" } });
  assert.ok(ohne.fehler.some(f => f.includes("ohne Aufmaß")));
});

test("Rechnung als Druck mit Aufmaß-Anlage und Nachtrag getrennt", () => {
  const z = abrechnungsZeilen(teile, aufmass);
  const b = rechnungBerechnen(z, { nachlassProzent: 3, einbehaltProzent: 10, umkehr: true });
  const h = rechnungHtml({ ...b, art: "abschlag", lfd_nr: 1, nummer: "AR-1", datum: "2026-11-19", leistung_bis: "2026-11-15" }, { projekt: { name: "Kita", auftraggeber: "Stadt" }, firma: { name: "Demo Bau", steuernummer: "1" }, aufmass });
  assert.ok(h.includes("1. Abschlagsrechnung Nr. AR-1"));
  assert.ok(h.includes("Nachtrag 1: Mehrabdichtung"));
  assert.ok(h.includes("§ 13b UStG"));
  assert.ok(h.includes("Anlage: Aufmaß"));
  assert.ok(h.includes("52,5"));
});

test("GAEB X31 schreiben und wieder lesen", () => {
  const x = aufmassX31(stand, knoten, aufmass, { projekt: { name: "Kita" } });
  assert.ok(x.text.includes("DA31"));
  assert.equal(x.anzahl, 4);
  const l = x31Lesen(x.text);
  assert.deepEqual(l.find(e => e.oz === "01.10"), { oz: "01.10", menge: 110.5 });
  const { zeilen, fehlend } = x31ZuAufmass([...l, { oz: "09.99", menge: 1 }], stand, knoten, { datei: "nu.x31" });
  assert.equal(zeilen.length, 4);
  assert.deepEqual(fehlend, ["09.99"]);
  assert.equal(zeilen[0].quelle, "import");
});

test("Nachtragsübersicht", () => {
  const u = nachtragUebersicht([{ status: "beauftragt", betrag_beauftragt: 600 }, { status: "angeboten", betrag_angeboten: 1000 }, { status: "abgelehnt", betrag_angeboten: 400 }, { status: "zurueckgezogen", betrag_angeboten: 50 }]);
  assert.equal(u.beauftragt, 600);
  assert.equal(u.offen, 1000);
  assert.equal(u.quote, 0.6);
  assert.equal(u.anzahl, 3);
});

test("KI-Begründung erfindet nichts und meldet Lücken", async () => {
  let gesendet;
  const rufeKi = async (sys, msgs) => { gesendet = msgs[0].content; return { content: [{ type: "tool_use", name: "begruendung_abgeben", input: { begruendung: " Text ", fehlende_angaben: ["Datum der Anordnung"] } }] }; };
  const r = await begruendungKi({ nachtrag: { nummer: 1, titel: "Mehrabdichtung", grund: "zusaetzlich" }, knoten: nKnoten, rufeKi });
  assert.equal(r.begruendung, "Text");
  assert.deepEqual(r.fehlend, ["Datum der Anordnung"]);
  assert.ok(gesendet.includes("§ 2 Abs. 6 VOB/B"));
  assert.ok(gesendet.includes("Anmeldedatum: nicht angegeben"));
});

test("NU-Rechnung prüfen: Menge gegen eigenes Aufmaß, EP gegen Vertrag, Nachlass, bisher, Rechenprüfung", () => {
  const v0 = neueVergabe({ art: "nu", titel: "Abdichtung", zeilen: [
    { key: "01.10", knotenId: "01.10", oz: "01.10", kurztext: "Abdichtung", menge: 100, einheit: "m2", budgetEp: 20, inSumme: true },
    { key: "01.20", knotenId: "01.20", oz: "01.20", kurztext: "Hohlkehle", menge: 40, einheit: "m", budgetEp: 10, inSumme: true }] });
  v0.bieter = [neuerBieter({ id: "b", name: "Dicht GmbH", preise: { "01.10": 18, "01.20": 9 }, nachlass: 2 })];
  const v = vergeben(v0, "b");
  const r = { id: "nr2", art: "abschlag", positionen: [{ key: "01.10", menge: 112, ep: 18.5 }, { key: "01.20", menge: 18, ep: 9 }, { key: "99", menge: 1, ep: 500 }], gefordert: 1000 };
  const e = nuRechnungPruefen(v, r, { eigeneMengen: new Map([["01.10", 110.5], ["01.20", 18]]), einbehaltProzent: 5,
    vorherige: [{ id: "nr1", status: "freigegeben", geprueft: 800 }, { id: "nr0", status: "zurueckgewiesen", geprueft: 5000 }] });
  const z1 = e.zeilen[0];
  assert.equal(z1.mengeGeprueft, 110.5);
  assert.equal(z1.epGeprueft, 18);
  assert.equal(z1.befunde.length, 3); // EP, Menge, >10 % über Auftragsmenge
  assert.equal(e.zeilen[2].betragGeprueft, 0);
  assert.equal(e.summen.geprueftKum, 1989 + 162);
  assert.equal(e.summen.nachNachlass, 2107.98);
  assert.equal(e.summen.einbehalt, 105.4);
  assert.equal(e.summen.bisher, 800);
  assert.equal(e.summen.geprueft, 1202.58);
  assert.ok(e.befunde.some(b => b.includes("passt nicht")));
  const h = pruefvermerkHtml(v, { ...r, nummer: "R-17" }, e, { projekt: { name: "Kita" } });
  assert.ok(h.includes("Prüfvermerk") && h.includes("1.202,58"));
});

test("NU-Rechnung aus KI-Antwort", () => {
  const map = new Map([[1, { key: "a" }], [2, { key: "b" }]]);
  const r = nuRechnungAuswerten({ rechnungsnummer: "R-17", datum: "2026-11-10", art: "schluss", positionen: [{ nr: 1, menge: 10.0004, ep: 18.499 }, { nr: 9, menge: 1, ep: 1 }], betrag_netto: 185 }, map);
  assert.deepEqual(r.positionen, [{ key: "a", menge: 10, ep: 18.5 }]);
  assert.equal(r.art, "schluss");
  assert.equal(r.gefordert, 185);
});
