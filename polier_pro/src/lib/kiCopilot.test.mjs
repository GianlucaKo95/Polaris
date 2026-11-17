import { test } from "node:test";
import assert from "node:assert/strict";
import { verstehen, mengenErmitteln, positionenBilden, positionMenge, alsAngebotspositionen, verstaendnisText, mengenText, annahmenListe, eingabeInhalt } from "./kiCopilot.js";

const antwort = (name, input) => async () => ({ content: [{ type: "tool_use", name, input }] });

test("Copilot: Verstehen → Mengen → Positionen", async () => {
  let gesendet;
  const v = await verstehen({ eingabe: { text: "Garage 6 x 3 m, Bodenplatte und Mauerwerk" }, anhaenge: [{ name: "plan.pdf", bloecke: [{ type: "document" }, { type: "text", text: "Raumstempel" }] }],
    projekt: { name: "EFH" }, rufeKi: async (system, messages) => { gesendet = messages[0].content; return antwort("verstaendnis_abgeben", {
      zusammenfassung: "Fertiggarage auf Bodenplatte", bauteile: [{ bez: "Bodenplatte", beschreibung: "C25/30, 20 cm" }, { bez: "Wände" }, { beschreibung: "ohne Namen" }],
      annahmen: ["Boden tragfähig"], rueckfragen: [{ frage: "Dämmung unter der Platte?", vorschlag: "nein" }] })(); } });
  assert.equal(gesendet[0].type, "document"); assert.equal(gesendet[1].type, "text"); assert.match(gesendet[2].text, /Anhänge: plan.pdf/);
  assert.equal(v.bauteile.length, 2);
  assert.equal(v.rueckfragen[0].antwort, "nein");
  assert.match(verstaendnisText(v), /B1 Bodenplatte: C25\/30, 20 cm/);
  assert.match(verstaendnisText(v), /Dämmung unter der Platte\? → nein/);
  assert.deepEqual(annahmenListe(v), ["Boden tragfähig", "Dämmung unter der Platte? nein"]);

  const m = await mengenErmitteln({ eingabe: { text: "x" }, anhaenge: [], verstaendnis: v, rufeKi: antwort("mengen_abgeben", { bauteile: [
    { nr: 1, zeilen: [{ bez: "Platte", formel: "6,24*3,24*0,20", einheit: "m³", grundlage: "Anfrage + Überstand 12 cm" }, { bez: "Kaputt", formel: "?", einheit: "m³" }] },
    { nr: 2, zeilen: [{ bez: "Wand lang", formel: "2*6,00*2,50", einheit: "m²" }, { bez: "Tor", formel: "2,50*2,125", einheit: "m²", abzug: true }, { bez: "Foto", formel: "3*2,5", einheit: "m²", toleranz: 0.2 }] },
    { nr: 9, zeilen: [{ bez: "x", formel: "1", einheit: "m" }] },
  ], hinweise: ["Fundamente nicht angegeben"] }) });
  const [b1, b2] = v.bauteile;
  assert.equal(m.jeBauteil[b1.id].length, 1);
  assert.equal(m.jeBauteil[b1.id][0].menge, 4.044);
  assert.equal(m.jeBauteil[b2.id][2].quelle, "foto");
  assert.match(mengenText(v, m), /B1 Bodenplatte: 4,044 m³\nB2 Wände: 32,187 m²/);

  const p = await positionenBilden({ verstaendnis: v, mengen: m, rufeKi: antwort("positionen_abgeben", { positionen: [
    { titel: "Rohbau", kurztext: "Beton Bodenplatte C25/30", einheit: "m³", bauteil: 1, mengeEinheit: "m³", faktor: 1 },
    { titel: "Rohbau", kurztext: "Bewehrung", einheit: "t", bauteil: 1, mengeEinheit: "m³", faktor: 0.08 },
    { titel: "Allgemein", kurztext: "Baustelleneinrichtung", einheit: "psch", menge: 1 },
    { kurztext: "", einheit: "m" },
  ] }) });
  assert.equal(p.length, 3);
  assert.equal(positionMenge(p[0], m), 4.044);
  assert.equal(positionMenge(p[1], m), 0.324);
  assert.equal(positionMenge(p[2], m), 1);
  const ap = alsAngebotspositionen(p, m, v);
  assert.deepEqual(ap.map(x => x.bez), ["── Rohbau ──", "Beton Bodenplatte C25/30", "Bewehrung", "── Allgemein ──", "Baustelleneinrichtung"]);
  assert.equal(ap[2].aufmass.faktor, 0.08);
  assert.equal(ap[2].copilot.mengenHerkunft, "Bodenplatte, Summe m³ × 0,08");
  assert.equal(ap[4].aufmass, undefined);
  assert.equal(ap[4].copilot.mengenHerkunft, "direkt");
});

test("Leere KI-Antwort wird als Fehler gemeldet", async () => {
  await assert.rejects(verstehen({ eingabe: { text: "x" }, rufeKi: async () => ({ content: [] }) }), /kein Verständnis/);
  assert.equal(eingabeInhalt({ text: "" }, [])[0].text, "Anfrage:\n(nur Anhänge)");
});
