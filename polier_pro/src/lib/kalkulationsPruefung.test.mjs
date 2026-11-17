import { test } from "node:test";
import assert from "node:assert/strict";
import { regelPruefung, positionAufbau, aufbauText, kiPruefen, pruefBlockText, zaehlen, posLabel } from "./kalkulationsPruefung.js";

const kp = [
  { id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 50 },
  { id: 2, kategorie: "material", bezeichnung: "Beton C25/30", einheit: "m³", preis: 120 },
];
const z = { zuschlagLohn: 28, zuschlagMaterial: 12, zuschlagGeraet: 12, zuschlagFremdleistung: 8 };
const kalk = (lohnH, mat, extra = {}) => ({ lohnposten: lohnH ? [{ stammId: 1, menge: lohnH }] : [], materialposten: mat ? [{ stammId: 2, menge: mat }] : [], geraetPosten: [], fremdleistung: 0, ...z, ...extra });

test("Aufbau je Einheit", () => {
  const a = positionAufbau({ menge: 10, kalk: kalk(5, 10.5) }, kp);
  assert.equal(a.stunden, 0.5);
  assert.equal(aufbauText(a), "0,5 h Facharbeiter + 1,05 m³ Beton C25/30");
  assert.equal(positionAufbau({ menge: 0, kalk: kalk(5, 1) }, kp), null);
  assert.equal(aufbauText(null), "kein Aufbau (EP direkt)");
});

test("Regeln", () => {
  const pos = [
    { id: 1, bez: "── Rohbau ──" },
    { id: 2, oz: "01.10", bez: "Fundament betonieren C25/30", einheit: "m³", menge: 10, ep: 160, kalk: kalk(0, 10.5) },
    { id: 3, oz: "01.20", bez: "Bodenplatte", einheit: "m³", menge: 20, ep: 0 },
    { id: 4, oz: "01.30", bez: "Fundament betonieren C25/30", einheit: "m³", menge: 5, ep: 200 },
    { id: 5, oz: "01.40", bez: "Baustelleneinrichtung", einheit: "psch", menge: 1, ep: 900 },
    { id: 6, oz: "01.50", bez: "Wand", einheit: "m²", menge: 0, ep: 30 },
    { id: 7, oz: "01.60", bez: "Mauerwerk", einheit: "m²", menge: 10, ep: 60, kalk: kalk(8, 0, { zuschlagLohn: 20 }) },
    { id: 8, oz: "01.70", bez: "Abdichtung", einheit: "m²", menge: 10, ep: 30, kiKalkulation: { sicherheit: "niedrig", begruendung: "grob" } },
  ];
  const preispruefung = { jePosition: { 4: { ampel: "rot", text: "70 % über Vergleich (Median 117,65 € aus 3 Vergleichswerten)." }, 3: { ampel: "rot", text: "Kein Preis" } } };
  const b = regelPruefung(pos, { kalkulationspreise: kp, standardZuschlaege: z, preispruefung });
  const arten = b.map(x => `${x.posId}:${x.art}`);
  assert.ok(arten.includes("3:ohne_preis"));
  assert.ok(!arten.includes("3:preisvergleich"), "kein doppelter Befund bei fehlendem Preis");
  assert.ok(arten.includes("2:ohne_lohn"));
  assert.ok(arten.includes("4:widerspruch"));
  assert.ok(arten.includes("4:preisvergleich"));
  assert.ok(arten.includes("5:pauschal"));
  assert.ok(arten.includes("6:ohne_menge"));
  assert.ok(arten.includes("7:zuschlag"));
  assert.ok(arten.includes("8:ki_unsicher"));
  assert.equal(b[0].schwere, "hoch", "sortiert nach Schwere");
  assert.match(b.find(x => x.art === "zuschlag").text, /Lohn 20 % statt 28 %/);
  assert.equal(b.find(x => x.art === "preisvergleich").text, "Preis 70 % über Vergleich (Median 117,65 € aus 3 Vergleichswerten)");
  assert.deepEqual(zaehlen(b), { hoch: 2, mittel: 4, hinweis: 2 });
  assert.equal(posLabel({ id: 9 }, [{ bez: "── T" }, { id: 8 }, pos[0]]), "–");
});

test("KI-Prüfung: Zuordnung, Blöcke, fehlende Leistungen", async () => {
  const pos = [{ id: 1, bez: "── Rohbau ──" }, ...Array.from({ length: 45 }, (_, i) => ({ id: 100 + i, bez: `Pos ${i}`, einheit: "m²", menge: 1, ep: 10 }))];
  const aufrufe = [];
  const rufeKi = async (system, messages) => {
    aufrufe.push(messages[0].content);
    return { content: [{ type: "tool_use", name: "pruefung_abgeben", input: {
      befunde: [{ nr: aufrufe.length === 1 ? 1 : 41, art: "zeitansatz", schwere: "mittel", text: "zu knapp", vorschlag: "prüfen" }, { nr: 999, art: "x", schwere: "hoch", text: "gibt es nicht" }],
      fehlende_leistungen: [{ text: "Baustelleneinrichtung", begruendung: "fehlt" }],
    } }] };
  };
  const fort = [];
  const r = await kiPruefen({ positionen: pos, kalkulationspreise: kp, kontext: {}, rufeKi, onFortschritt: (a, b) => fort.push(`${a}/${b}`) });
  assert.deepEqual(fort, ["1/2", "2/2"]);
  assert.match(aufrufe[0], /— Rohbau —/);
  assert.match(aufrufe[1], /#41 \| 1 m² \| EP 10,00 € \| Pos 40/);
  assert.equal(r.befunde.length, 2, "je Block ein gültiger Befund, Unbekanntes verworfen");
  assert.equal(r.befunde[0].posId, 100);
  assert.equal(r.befunde[1].posId, 140);
  assert.equal(r.fehlend.length, 1, "doppelte fehlende Leistungen zusammengefasst");
  assert.match(pruefBlockText([{ nr: 1, pos: { bez: "X", einheit: "m", menge: 2, ep: 5 } }], kp), /Aufbau je m: kein Aufbau/);
});
