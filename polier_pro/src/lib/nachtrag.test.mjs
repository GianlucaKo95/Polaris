import { test } from "node:test";
import assert from "node:assert/strict";
import { nachtragUebersicht, nachtragStatus, begruendungPrompt, mehrkostenanzeigeHtml } from "./nachtrag.js";

const auftrag = { id: 1, titel: "Rohbau", positionen: [{ bez: "A", menge: 100, ep: 100 }] };
const angebote = [auftrag,
  { id: 2, nachtrag_zu: 1, status: "angenommen", positionen: [{ bez: "N1", menge: 1, ep: 500 }] },
  { id: 3, nachtrag_zu: 1, status: "entwurf", nachtrag_info: { status: "angekuendigt", grund: "zusaetzlich" }, positionen: [{ bez: "N2", menge: 1, ep: 300 }] },
  { id: 4, nachtrag_zu: 1, nachtrag_info: { status: "abgelehnt" }, positionen: [{ bez: "N3", menge: 1, ep: 200 }] },
];

test("Nachtragsübersicht je Auftrag", () => {
  const u = nachtragUebersicht(auftrag, angebote);
  assert.equal(u.anzahl, 3);
  assert.equal(u.beauftragt, 500);
  assert.equal(u.offen, 300);
  assert.equal(u.abgelehnt, 200);
  assert.equal(u.quote, 5);
  assert.equal(u.ohneAnkuendigung, 1); // zusätzliche Leistung ohne Ankündigungsdatum
});

test("Status fällt auf den Angebotsstatus zurück", () => {
  assert.equal(nachtragStatus({ status: "versendet" }), "angeboten");
  assert.equal(nachtragStatus({ status: "angenommen" }), "beauftragt");
});

test("Prompt und Mehrkostenanzeige enthalten Grund und Positionen, Texte escaped", () => {
  const info = { grund: "zusaetzlich", beschreibung: "Wasserhaltung nötig", begruendung: "Zeile 1\nZeile <2>" };
  assert.match(begruendungPrompt({ nachtrag: angebote[2], auftrag, projekt: { name: "EFH" }, info }), /§ 2 Abs\. 6/);
  const esc = s => String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = mehrkostenanzeigeHtml({ nachtrag: angebote[2], auftrag, projekt: { name: "EFH" }, eigeneFirma: { name: "Bau" }, info, esc });
  assert.match(html, /Ankündigung von Mehrkosten/);
  assert.match(html, /Zeile &lt;2&gt;/);
});
