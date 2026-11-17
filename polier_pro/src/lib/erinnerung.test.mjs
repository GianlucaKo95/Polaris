import { test } from "node:test";
import assert from "node:assert/strict";
import { erinnerungsPunkte, erinnerungPlanen, erinnerungBetreff, erinnerungHtml } from "./erinnerung.js";

const heute = "2026-11-17"; // Dienstag
const daten = {
  heute,
  projekte: [{ id: 7, name: "Kita Am Hafen", abnahme_datum: "2022-12-05" }, { id: 8, name: "Parkhaus" }],
  fristen: [{ id: 1, projekt_id: 7, art: "gewaehrleistung", jahre: 4 }, { id: 2, projekt_id: 8, art: "vertrag", datum: "2027-03-01" }],
  sicherheiten: [],
  geraete: [
    { id: 3, inventarnr: "G-014", bezeichnung: "Mobilbagger", status: "einsatz", projekt_id: 8, pruefungen: [{ art: "uvv", intervall_monate: 12, zuletzt: "2025-11-10" }] },
    { id: 4, bezeichnung: "Rüttler", status: "ausgemustert", pruefungen: [{ art: "uvv", intervall_monate: 12, zuletzt: null }] },
  ],
  regieberichte: [
    { id: 5, projekt_id: 8, nummer: 3, status: "eingereicht", eingereicht_am: "2026-11-11" },  // Frist 18.11.
    { id: 6, projekt_id: 8, nummer: 2, status: "eingereicht", eingereicht_am: "2026-11-02" },  // Frist 09.11. abgelaufen
    { id: 9, projekt_id: 8, nummer: 1, status: "unterschrieben" },
  ],
};

test("Punkte aus Fristen, Geräten und Regie, nach Dringlichkeit sortiert", () => {
  const p = erinnerungsPunkte(daten);
  assert.deepEqual(p.map(x => [x.bereich, x.stand, x.titel]), [
    ["frist", "ueberfaellig", "Begehung vor Gewährleistungsende"],
    ["geraet", "ueberfaellig", "UVV-Prüfung: G-014 Mobilbagger"],
    ["regie", "bald", "Regiebericht 3: Rückgabe durch den Auftraggeber"],
    ["frist", "bald", "Gewährleistung endet"],
    ["regie", "info", "Regiebericht 2 gilt als anerkannt"],
  ]);
  assert.equal(p[1].baustelle, "Parkhaus");
  assert.equal(p[0].baustelle, "Kita Am Hafen");
});

test("Rhythmus: nur Neues, täglich, montags", () => {
  const punkte = erinnerungsPunkte(daten);
  const gemeldet = punkte.slice(0, 2).map(x => x.schluessel);
  const r = erinnerungPlanen({ punkte, gemeldet, heute });
  assert.equal(r.senden, true); assert.equal(r.neu.length, 3); assert.equal(r.weiter.length, 2);
  assert.equal(erinnerungPlanen({ punkte, gemeldet: punkte.map(x => x.schluessel), heute }).senden, false);
  assert.equal(erinnerungPlanen({ punkte, gemeldet: punkte.map(x => x.schluessel), heute, rhythmus: "taeglich" }).senden, true);
  assert.equal(erinnerungPlanen({ punkte, heute, rhythmus: "woechentlich" }).senden, false);
  assert.equal(erinnerungPlanen({ punkte, heute: "2026-11-16", rhythmus: "woechentlich" }).senden, true);
  assert.equal(erinnerungBetreff(r), "Polaris: 2 überfällig, 2 bald fällig, 1 Hinweis");
});

test("Mail escaped Inhalte", () => {
  const html = erinnerungHtml({ firmaName: "<b>X</b>", neu: [{ bereich: "frist", stand: "bald", titel: "<script>", baustelle: "", text: "" }], heute, esc: s => String(s ?? "").replace(/</g, "&lt;") });
  assert.ok(!html.includes("<script>")); assert.ok(!html.includes("<b>X"));
});

test("gebündelte Fassung der Edge Function rechnet wie die Quelle (npm run funktionen nach Änderungen)", async () => {
  const bundle = await import("../../supabase/functions/fristen-erinnerung/logik.js");
  assert.deepEqual(bundle.erinnerungsPunkte(daten), erinnerungsPunkte(daten));
});
