import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kalkKatalog, zuVorkalkulieren, vorkalkulieren, vorschlagZuAenderung, vorschauEp, aenderungenBuendeln, regelPruefungKalk,
  kiPruefenKalk, risikoEingabe, risikenPruefen, befehleKalkAnwenden, befehlAuswertenKalk, nettoNach, vkPrompt,
} from "./kiKalk.js";
import { aenderungenAnwenden } from "./lvBaum.js";
import { standBerechnen, MITTELLOHN_ID } from "./rechenkern.js";

const P = (id, felder = {}) => ({ id, parent_id: null, sort: 1, typ: "position", oz: id, art: "normal", kurztext: id, langtext: "", menge: 10, einheit: "m²", ep: 0, rabatt: 0, extra: {}, ...felder });
const kp = [{ id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 52 }, { id: 3, kategorie: "material", bezeichnung: "XPS-Platte 120 mm", einheit: "m²", preis: 21.5 }];
const sp = [{ id: 7, bez: "Perimeterdämmung XPS 120 mm", einheit: "m²", rezeptur: [{ stammId: 1, mengeJeEinheit: 0.2 }, { stammId: 3, mengeJeEinheit: 1.05 }] }];
const ep = [{ id: 9, gewerk: "Rohbau", beschreibung: "Baustelleneinrichtung", einheit: "psch", preis: 2500 }];
const stammdaten = { kalkulationspreise: kp, stammpositionen: sp, einheitspreise: ep };
const vergleiche = [{ projektName: "Kita Süd", standNummer: 2, knoten: [P("alt1", { kurztext: "Abdichtung erdberührter Wände PMBC", einheit: "m²", ep: 31.2, extra: { variablen: { d: 3 } } })],
  ansaetze: [{ id: "va", knoten_id: "alt1", stand_id: "s0", sort: 1, kostenart: "lohn", ressource_id: MITTELLOHN_ID, bezeichnung: "Mittellohn", einheit: "h", menge_je_me: 0.15, faktor: 1, preis: 0, formel: null }] }];
const Z = { modell: "saetze", saetze: { lohn: 20, material: 10, geraet: 10, fremd: 5, sonstiges: 0 }, mittellohn: 50 };
const kiAntwort = (name, input) => async () => ({ content: [{ type: "tool_use", name, input }] });

test("Katalog enthält frühere eigene Kalkulationen zuerst", () => {
  const { katalog, vergleich } = kalkKatalog(stammdaten, vergleiche);
  assert.equal(katalog[0].ref, "KP:alt1");
  assert.equal(katalog[0].quelle, "kalkulation");
  assert.ok(vergleich.get("KP:alt1").herkunft.includes("Kita Süd"));
  assert.ok(katalog.some(e => e.ref === "SP:7") && katalog.some(e => e.ref === "EP:9"));
  assert.match(vkPrompt({}), /KP: sind frühere eigene Kalkulationen/);
});

test("Vorkalkulation: Katalogtreffer, Rezeptur, ungültige Referenz wird offen", async () => {
  const k = [P("a", { kurztext: "Abdichtung erdberührter Wände PMBC" }), P("b", { kurztext: "Perimeterdämmung XPS 120 mm" }), P("c", { kurztext: "Baustelle einrichten", einheit: "psch", menge: 1 }),
    P("d", { kurztext: "Dämmung kleben" }), P("e", { kurztext: "Unklar" }), P("f", { kurztext: "fertig", ep: 12 })];
  assert.deepEqual(zuVorkalkulieren(k, []).map(x => x.id), ["a", "b", "c", "d", "e"]);
  const { katalog, vergleich } = kalkKatalog(stammdaten, vergleiche);
  let gesehen = "";
  const rufeKi = async (system, messages) => {
    gesehen = messages[0].content;
    return { content: [{ type: "tool_use", name: "vorkalkulation_abgeben", input: { positionen: [
      { nr: 1, art: "katalog", ref: "KP:alt1", sicherheit: "hoch", begruendung: "gleiche Leistung" },
      { nr: 2, art: "katalog", ref: "SP:7", sicherheit: "hoch", begruendung: "Stammposition" },
      { nr: 3, art: "katalog", ref: "EP:9", sicherheit: "mittel", begruendung: "Einheitspreis" },
      { nr: 4, art: "rezeptur", rezeptur: [{ baustein: "1", mengeJeEinheit: 0.25 }, { baustein: "3", mengeJeEinheit: 1.05 }], sicherheit: "mittel", begruendung: "Aufwandswert" },
      { nr: 5, art: "katalog", ref: "SP:999", sicherheit: "hoch", begruendung: "?" },
    ] } }] };
  };
  const v = await vorkalkulieren({ positionen: zuVorkalkulieren(k, []), katalog, kalkulationspreise: kp, kontext: {}, rufeKi });
  assert.ok(gesehen.includes("KP:alt1"), "Kandidat aus früherer Kalkulation im Prompt");
  assert.equal(v.get("e").art, "offen");
  assert.match(v.get("e").begruendung, /gibt es nicht/);

  const ctx = { stammdaten, vergleich, bestehendeAnsaetze: [] };
  const aeA = vorschlagZuAenderung(k[0], v.get("a"), ctx);
  assert.equal(aeA.ansaetze.neu.length, 1);
  assert.equal(aeA.ansaetze.neu[0].knoten_id, "a");
  assert.equal(aeA.ansaetze.neu[0].stand_id, undefined);
  assert.deepEqual(aeA.aendern[0].felder.extra.variablen, { d: 3 });
  assert.equal(aeA.aendern[0].felder.extra.ki.quelle, "KP:alt1");
  const aeC = vorschlagZuAenderung(k[2], v.get("c"), ctx);
  assert.equal(aeC.aendern[0].felder.ep, 2500);
  assert.equal(aeC.ansaetze.neu.length, 0);
  assert.equal(vorschauEp(k[3], v.get("d"), Z, Z.saetze, ctx), 40.43); // 0,25 × 52 × 1,2 + 1,05 × 21,5 × 1,1 = 15,6 + 24,8325
  const paket = aenderungenBuendeln([aeA, vorschlagZuAenderung(k[1], v.get("b"), ctx), aeC, vorschlagZuAenderung(k[3], v.get("d"), ctx)]);
  const k2 = aenderungenAnwenden(k, paket);
  const r = standBerechnen(k2, paket.ansaetze.neu, Z);
  assert.equal(r.kalkuliertePositionen, 3);
  assert.equal(vorschlagZuAenderung(k[4], v.get("e"), ctx), null);
});

test("Vorschlag ersetzt bestehende Ansätze der Position", () => {
  const { vergleich } = kalkKatalog(stammdaten, vergleiche);
  const k = P("x");
  const ae = vorschlagZuAenderung(k, { art: "katalog", ref: "SP:7", eintrag: { quelle: "stammposition" }, sicherheit: "hoch", begruendung: "" }, { stammdaten, vergleich, bestehendeAnsaetze: [{ id: "alt", knoten_id: "x" }, { id: "fremd", knoten_id: "y" }] });
  assert.deepEqual(ae.ansaetze.loeschen, ["alt"]);
});

test("Regelprüfung: ohne Preis, Zuschläge 0, Mittellohn 0, Abweichung zu früheren Kalkulationen", () => {
  const k = [P("a", { kurztext: "Abdichtung erdberührter Wände PMBC", ep: 60 }), P("b")];
  const a = [{ id: "1", knoten_id: "a", kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 0.1, faktor: 1, preis: 0 }];
  const b = regelPruefungKalk(k, a, { modell: "saetze", mittellohn: 0 }, { vergleiche });
  const texte = b.map(x => x.text).join(" | ");
  assert.match(texte, /ohne Preis und ohne Ansätze/);
  assert.match(texte, /Zuschlagssätze stehen auf 0/);
  assert.match(texte, /Mittellohn ist aber 0/);
  assert.match(texte, /über früheren eigenen Kalkulationen/);
  assert.equal(b[0].schwere, "hoch");
});

test("KI-Prüfung bekommt den Aufbau je Einheit und ordnet Befunde zu", async () => {
  const k = [{ id: "t", parent_id: null, sort: 1, typ: "titel", oz: "01", kurztext: "Rohbau" }, P("a", { parent_id: "t", kurztext: "Ortbetonwand", einheit: "m³", ep: 300 })];
  const a = [{ id: "1", knoten_id: "a", kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 1.2, faktor: 1, preis: 0 }];
  let text = "";
  const r = await kiPruefenKalk({ knoten: k, ansaetze: a, z: Z, kontext: {}, rufeKi: async (s, m) => { text = m[0].content; return (await kiAntwort("pruefung_abgeben", { befunde: [{ nr: 1, art: "nebenleistung", schwere: "hoch", text: "Schalung fehlt" }, { nr: 9, art: "text", schwere: "hinweis", text: "gibt es nicht" }], fehlende_leistungen: [{ text: "Baustelleneinrichtung" }] })()); } });
  assert.match(text, /— 01 Rohbau —/);
  assert.match(text, /1,2 h Lohn \(Mittellohn\)/);
  assert.equal(r.befunde.length, 1);
  assert.equal(r.befunde[0].posId, "a");
  assert.equal(r.fehlend[0].text, "Baustelleneinrichtung");
});

test("LV-Risiken: Vorbemerkungen auf oberster Ebene, Positionen mit Arten", async () => {
  const k = [{ id: "h", parent_id: null, sort: 0, typ: "hinweis", kurztext: "Vertragsstrafe 0,3 % je Werktag", langtext: "" },
    { id: "t", parent_id: null, sort: 1, typ: "titel", oz: "01", kurztext: "Erdbau" }, P("a", { parent_id: "t", art: "bedarf", kurztext: "Wasserhaltung" })];
  const e = risikoEingabe(k);
  assert.match(e.vorbemerkungen, /Vertragsstrafe/);
  assert.equal(e.positionen.find(p => p.id === "a").bedarf, true);
  const r = await risikenPruefen({ knoten: k, kontext: {}, rufeKi: kiAntwort("lv_pruefung_abgeben", { risiken: [{ nr: 1, art: "mengenrisiko", schwere: "mittel", text: "Umfang unklar" }], bieterfragen: [{ nr: 1, frage: "Wie lange ist die Wasserhaltung vorzuhalten?" }] }) });
  assert.equal(r.risiken[0].posId, "a");
  assert.equal(r.fragen[0].oz, "a");
});

test("Befehle: Lohn in Titel um 5 % runter, Ressourcenpreis, Zuschlag, Menge, Fehler bei unbekannter OZ", async () => {
  const k = [{ id: "t3", parent_id: null, sort: 1, typ: "titel", oz: "03", kurztext: "Beton" }, P("a", { parent_id: "t3", oz: "03.0010", kurztext: "Wand Beton" }), P("b", { oz: "04.0010", kurztext: "Putz" })];
  const a = [{ id: "1", knoten_id: "a", kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 1, faktor: 1, preis: 0 },
    { id: "2", knoten_id: "a", kostenart: "material", ressource_id: "3", bezeichnung: "Beton C25/30", einheit: "m³", menge_je_me: 1, faktor: 1, preis: 100 },
    { id: "3", knoten_id: "b", kostenart: "lohn", ressource_id: MITTELLOHN_ID, menge_je_me: 0.5, faktor: 1, preis: 0 }];
  const e = befehleKalkAnwenden(k, a, Z, [
    { op: "ansatz_skalieren", titel: "03", kostenart: "lohn", wert: 0.95 },
    { op: "ressource_preis", ressource: "Beton", wert: 112 },
    { op: "zuschlag_setzen", kostenart: "material", wert: 12 },
    { op: "menge_setzen", positionen: ["04.0010"], wert: 22.5 },
    { op: "ep_setzen", positionen: ["99"], wert: 1 },
  ]);
  assert.deepEqual(e.paket.ansaetze.aendern, [{ id: "1", felder: { faktor: 0.95 } }, { id: "2", felder: { preis: 112 } }]);
  assert.equal(e.zuschlaege.saetze.material, 12);
  assert.deepEqual(e.paket.aendern, [{ id: "b", felder: { menge: 22.5 } }]);
  assert.match(e.fehler[0], /OZ 99/);
  assert.equal(e.protokoll.length, 4);
  // vorher: a = 50×1,2 + 100×1,1 = 170 → 1700; b = 25 × 1,2 = 30 → 300 ⇒ 2000
  // nachher: a = 47,5×1,2 + 112×1,12 = 57 + 125,44 = 182,44 → 1824,40; b = 30 × 22,5 = 675 ⇒ 2499,40
  assert.equal(nettoNach(k, a, Z, e), 2499.4);
  const r = await befehlAuswertenKalk({ text: "Lohn in Titel 3 um 5 % runter", knoten: k, ansaetze: a, z: Z, rufeKi: kiAntwort("kalkulation_aendern", { aenderungen: [{ op: "ansatz_skalieren", titel: "03", kostenart: "lohn", wert: 0.95 }] }) });
  assert.equal(r.aenderungen.length, 1);
});
