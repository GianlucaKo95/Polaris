import { test } from "node:test";
import assert from "node:assert/strict";
import { agentStarten, agentFortsetzen, vorschlagZuPositionen, werkzeugAusfuehren, vorschlagPruefen } from "./kiAngebotAgent.js";
import { katalogBauen } from "./katalog.js";

const kalkulationspreise = [
  { id: 1, kategorie: "lohn", bezeichnung: "Facharbeiter", einheit: "h", preis: 48 },
  { id: 2, kategorie: "material", bezeichnung: "XPS-Platte", einheit: "m²", preis: 18 },
];
const stammpositionen = [{
  id: 10, bez: "Perimeterdämmung XPS 120 mm", einheit: "m²", gewerk: "Abdichtung",
  rezeptur: [{ stammId: 1, mengeJeEinheit: 0.25 }, { stammId: 2, mengeJeEinheit: 1.05 }],
}];
const einheitspreise = [{ id: 1, gewerk: "Baustelleneinrichtung", beschreibung: "Einrichten und Räumen", einheit: "Psch", preis: 850 }];
const katalog = katalogBauen({ stammpositionen, einheitspreise, kalkulationspreise, standardZuschlaege: null });

// Skriptbare Fake-KI: liefert nacheinander die vorgegebenen Antworten und
// merkt sich, was sie zu sehen bekam.
function fakeKi(antworten) {
  const gesehen = [];
  let i = 0;
  const rufeKi = async (system, messages, tools) => {
    gesehen.push({ system, messages: JSON.parse(JSON.stringify(messages)), tools });
    return antworten[Math.min(i++, antworten.length - 1)];
  };
  return { rufeKi, gesehen };
}
const tu = (id, name, input) => ({ type: "tool_use", id, name, input });

test("katalog_suchen liefert Referenzen mit Preis aus dem Katalog", () => {
  const r = werkzeugAusfuehren("katalog_suchen", { suchbegriff: "Dämmung XPS", einheit: "m²" }, katalog);
  assert.equal(r.treffer[0].ref, "SP:10");
  assert.equal(r.treffer[0].ep, 30.9); // 12 + 18,90, ohne Zuschläge
});

test("Agent sucht, fragt nach, und schließt nach der Antwort mit einem Vorschlag ab", async () => {
  const { rufeKi, gesehen } = fakeKi([
    { stop_reason: "tool_use", content: [tu("a", "katalog_suchen", { suchbegriff: "Perimeterdämmung" })] },
    { stop_reason: "tool_use", content: [
      tu("b", "katalog_suchen", { suchbegriff: "Baustelleneinrichtung" }),
      tu("c", "rueckfragen_stellen", { fragen: ["Wie hoch sind die Kellerwände?"] }),
    ] },
    { stop_reason: "tool_use", content: [tu("d", "angebot_vorschlagen", {
      titel: "Kellerabdichtung", positionen: [
        { bez: "Perimeterdämmung XPS 120 mm", menge: 100, einheit: "m²", ref: "SP:10", mengen_herleitung: "40 m × 2,5 m" },
        { bez: "Baustelleneinrichtung", menge: 1, einheit: "Psch", ref: "EP:1", mengen_herleitung: "pauschal" },
        { bez: "Noppenbahn", menge: 100, einheit: "m²", ref: null, mengen_herleitung: "wie Dämmung" },
      ] })] },
  ]);
  const kontext = { projekt: { name: "EFH Müller" } };
  const erst = await agentStarten({ anfrage: "Keller abdichten, 40 m Wand", katalog, kontext, rufeKi });
  assert.equal(erst.status, "rueckfrage");
  assert.deepEqual(erst.fragen, ["Wie hoch sind die Kellerwände?"]);
  // Das erste Suchergebnis ging als tool_result an die KI zurück
  const zweiterAufruf = gesehen[1].messages;
  assert.equal(zweiterAufruf.at(-1).content[0].tool_use_id, "a");
  assert.match(zweiterAufruf.at(-1).content[0].content, /SP:10/);

  const fertig = await agentFortsetzen({ messages: erst.messages, offen: erst.offen, fragen: erst.fragen,
    antworten: ["2,50 m"], katalog, kontext, rufeKi });
  assert.equal(fertig.status, "fertig");
  // Nach der Rückfrage bekommt die KI BEIDE ausstehenden Ergebnisse (b und c)
  const letzte = gesehen[2].messages.at(-1).content;
  assert.deepEqual(letzte.map(x => x.tool_use_id).sort(), ["b", "c"]);
  assert.match(letzte.find(x => x.tool_use_id === "c").content, /2,50 m/);
  assert.match(gesehen[0].system, /EFH Müller/);
});

test("Antwort ohne Werkzeug wird einmal zur Werkzeugnutzung aufgefordert", async () => {
  const { rufeKi, gesehen } = fakeKi([
    { stop_reason: "end_turn", content: [{ type: "text", text: "Hier ist mein Angebot …" }] },
    { stop_reason: "tool_use", content: [tu("x", "angebot_vorschlagen", { titel: "T", positionen: [] })] },
  ]);
  const r = await agentStarten({ anfrage: "x", katalog, kontext: {}, rufeKi });
  assert.equal(r.status, "fertig");
  assert.match(gesehen[1].messages.at(-1).content, /angebot_vorschlagen/);
});

test("Agent bricht nach maximaler Rundenzahl mit Fehler ab", async () => {
  const endlos = Array.from({ length: 20 }, (_, i) => ({ stop_reason: "tool_use", content: [tu(`s${i}`, "katalog_suchen", { suchbegriff: "x" })] }));
  const { rufeKi } = fakeKi(endlos);
  const r = await agentStarten({ anfrage: "x", katalog, kontext: {}, rufeKi });
  assert.equal(r.status, "fehler");
});

test("Vorschlag → Positionen: Preis kommt aus dem Katalog, nie von der KI", () => {
  const { positionen, warnungen, titel } = vorschlagZuPositionen({
    titel: "Kellerabdichtung",
    positionen: [
      { bez: "Perimeterdämmung", menge: 100, einheit: "m²", ref: "SP:10", mengen_herleitung: "40 × 2,5", ep: 1 },
      { bez: "BE", menge: 1, einheit: "Psch", ref: "EP:1", mengen_herleitung: "" },
      { bez: "Noppenbahn", menge: 100, einheit: "m²", ref: null, mengen_herleitung: "" },
      { bez: "Erfunden", menge: 5, einheit: "m", ref: "SP:999", mengen_herleitung: "" },
    ],
  }, { katalog, stammpositionen, kalkulationspreise });
  assert.equal(titel, "Kellerabdichtung");
  const [daemmung, be, noppen, erfunden] = positionen;
  assert.equal(daemmung.stammpositionId, 10);
  assert.equal(Math.round(daemmung.ep * 100) / 100, 30.9);
  assert.equal(daemmung.kalk.lohnposten[0].menge, 25);
  assert.equal(daemmung.preisquelle.art, "stammposition");
  assert.equal(daemmung.ki.herleitung, "40 × 2,5");
  assert.equal(be.ep, 850);
  assert.equal(be.preisquelle.ref, "EP:1");
  assert.equal(noppen.ep, 0);
  assert.equal(noppen.preisquelle.art, "ki_ohne_preis");
  assert.equal(erfunden.ep, 0);
  assert.equal(warnungen.length, 1);
});

test("Abweichende Einheit wird auf die Katalogeinheit gesetzt und gemeldet", () => {
  const { positionen, warnungen } = vorschlagZuPositionen({
    positionen: [{ bez: "BE", menge: 1, einheit: "Stk", ref: "EP:1", mengen_herleitung: "" }],
  }, { katalog, stammpositionen, kalkulationspreise });
  assert.equal(positionen[0].einheit, "Psch");
  assert.ok(positionen[0].ki.hinweis);
  assert.equal(warnungen.length, 1);
});

test("Zweimal ohne Werkzeug bricht sofort mit Hinweis auf den ki-proxy ab", async () => {
  const text = { stop_reason: "end_turn", content: [{ type: "text", text: "…" }] };
  const { rufeKi, gesehen } = fakeKi([text, text, text]);
  const r = await agentStarten({ anfrage: "x", katalog, kontext: {}, rufeKi });
  assert.equal(r.status, "fehler");
  assert.match(r.fehler, /ki-proxy/);
  assert.equal(gesehen.length, 2);
});

test("Anhänge gehen als Content-Blöcke vor dem Text an die KI", async () => {
  const { rufeKi, gesehen } = fakeKi([{ stop_reason: "tool_use", content: [tu("v", "angebot_vorschlagen", { titel: "T", positionen: [] })] }]);
  const bild = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } };
  await agentStarten({ anfrage: "Keller", anhaenge: [bild], katalog, kontext: { nachtragZu: { titel: "Rohbau EFH" } }, rufeKi });
  const content = gesehen[0].messages[0].content;
  assert.equal(content[0].type, "image");
  assert.match(content[1].text, /Anhang/);
  assert.match(gesehen[0].system, /NACHTRAG/);
  assert.match(gesehen[0].system, /Rohbau EFH/);
});


test("Rechnen- und Checklisten-Werkzeug", () => {
  assert.deepEqual(werkzeugAusfuehren("rechnen", { ausdruck: "40 × 2,5" }, katalog), { ergebnis: 100 });
  assert.ok(werkzeugAusfuehren("rechnen", { ausdruck: "rm -rf" }, katalog).fehler);
  assert.ok(werkzeugAusfuehren("checkliste_abrufen", { leistung: "Kellerabdichtung" }, katalog).checklisten.length > 0);
});

test("Vorschlagsprüfung findet fehlende Preise, falsche Einheiten, Doppelte und fehlende Herleitungen", () => {
  const p = vorschlagPruefen({ positionen: [
    { bez: "A", menge: 10, einheit: "m", ref: "SP:10", mengen_herleitung: "x" },
    { bez: "B", menge: 10, einheit: "m²", ref: "SP:10", mengen_herleitung: "" },
    { bez: "C", menge: 0, einheit: "Stk", ref: null, mengen_herleitung: "y" },
  ] }, katalog);
  assert.equal(p.filter(x => x.includes("Einheit")).length, 1);
  assert.equal(p.filter(x => x.includes("doppelt")).length, 1);
  assert.equal(p.filter(x => x.includes("herleitung")).length, 1);
  assert.equal(p.filter(x => x.includes("Menge fehlt")).length, 1);
  assert.equal(p.filter(x => x.includes("ohne Preisreferenz")).length, 1);
});

test("Fehlerhafter Vorschlag bekommt genau eine Korrekturrunde", async () => {
  const schlecht = { stop_reason: "tool_use", content: [tu("v1", "angebot_vorschlagen", { titel: "T", positionen: [
    { bez: "BE", menge: 1, einheit: "Stk", ref: "EP:1", mengen_herleitung: "pauschal" }] })] };
  const gut = { stop_reason: "tool_use", content: [tu("v2", "angebot_vorschlagen", { titel: "T", positionen: [
    { bez: "BE", menge: 1, einheit: "Psch", ref: "EP:1", mengen_herleitung: "pauschal" }] })] };
  const { rufeKi, gesehen } = fakeKi([schlecht, gut]);
  const r = await agentStarten({ anfrage: "x", katalog, kontext: {}, rufeKi });
  assert.equal(r.status, "fertig");
  assert.equal(r.vorschlag.positionen[0].einheit, "Psch");
  assert.equal(r.probleme.length, 0);
  assert.match(gesehen[1].messages.at(-1).content[0].content, /Automatische Prüfung/);

  const { rufeKi: stur, gesehen: g2 } = fakeKi([schlecht]);
  const r2 = await agentStarten({ anfrage: "x", katalog, kontext: {}, rufeKi: stur });
  assert.equal(r2.status, "fertig");
  assert.equal(r2.probleme.length, 1);
  assert.equal(g2.length, 2);
});
