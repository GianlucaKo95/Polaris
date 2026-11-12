import { test } from "node:test";
import assert from "node:assert/strict";
import { preisstandAnlegen, preiseFuer, istEingefroren, preisSetzen, mittellohnSetzen, abweichungen, firmenpreiseNachziehen, lieferantenangebotSetzen, lieferantWaehlen, bedarfJePreis, preisZuruecksetzen } from "./preisstand.js";
import { kalkulationEp } from "./kalkulation.js";

const firma = [
  { id: 1, kategorie: "lohn", bezeichnung: "Mittellohn (Kalkulationslohn)", einheit: "h", preis: 52, herkunft: { typ: "mittellohn" } },
  { id: 2, kategorie: "material", bezeichnung: "Beton C30/37", einheit: "m³", preis: 128 },
];
const ml = { lohngruppen: [{ bez: "FA", anzahl: 4, stundenlohn: 25 }], zulagen: 0, sozialkostenProzent: 100, lohnnebenkosten: 2 };

test("Kopie entkoppelt Angebot von späteren Firmenpreisänderungen", () => {
  const ps = preisstandAnlegen({ firmenpreise: firma, grundlagen: { mittellohn: ml }, zuschlaege: { zuschlagLohn: 30 }, heute: "2026-11-12" });
  const a = { preisstand: ps, positionen: [] };
  const kalk = { lohnposten: [{ stammId: 1, menge: 10 }], materialposten: [{ stammId: 2, menge: 2 }], geraetPosten: [], fremdleistung: 0 };
  const vorher = kalkulationEp(kalk, preiseFuer(a, firma), 1);
  const firmaNeu = firma.map(k => k.id === 2 ? { ...k, preis: 150 } : k);
  assert.equal(kalkulationEp(kalk, preiseFuer(a, firmaNeu), 1), vorher);
  assert.deepEqual(abweichungen(ps, firmaNeu).map(x => [x.id, x.art, x.firma]), [[2, "firma", 150]]);
  const nach = firmenpreiseNachziehen(ps, firmaNeu);
  assert.equal(nach.kalkulationspreise.find(k => k.id === 2).preis, 150);
});

test("Projektpreis, Lieferant und Projektmittellohn", () => {
  let ps = preisstandAnlegen({ firmenpreise: firma, grundlagen: { mittellohn: ml }, heute: "2026-11-12" });
  ps = lieferantenangebotSetzen(ps, 2, [{ lieferant: "Transbeton Nord", preis: 119.5 }, { lieferant: "Heidelberg", preis: 124 }]);
  ps = lieferantWaehlen(ps, 2, 0, "2026-11-12");
  const b = ps.kalkulationspreise.find(k => k.id === 2);
  assert.equal(b.preis, 119.5); assert.equal(b.quelle.name, "Transbeton Nord");
  ps = mittellohnSetzen(ps, { ...ml, lohnnebenkosten: 6 }); // Auslöse auf Fernbaustelle
  assert.equal(ps.kalkulationspreise.find(k => k.id === 1).preis, 56);
  assert.deepEqual(abweichungen(ps, firma).map(x => x.art), ["projekt", "projekt"]);
  // im Projekt geänderte Preise bleiben beim Nachziehen stehen
  assert.equal(firmenpreiseNachziehen(ps, firma.map(k => ({ ...k, preis: 200 }))).kalkulationspreise.find(k => k.id === 2).preis, 119.5);
  assert.equal(preisZuruecksetzen(ps, 2, firma).kalkulationspreise.find(k => k.id === 2).preis, 128);
  assert.equal(preisSetzen(ps, 2, 121.234).kalkulationspreise.find(k => k.id === 2).preis, 121.23);
});

test("Nachtrag übernimmt Preisstand des Hauptauftrags, eingefroren nur durch Annahme", () => {
  const haupt = { id: 9, status: "angenommen", preisstand: { ...preisstandAnlegen({ firmenpreise: firma, heute: "2026-03-01" }), eingefroren_am: "2026-03-20" } };
  const n = preisstandAnlegen({ firmenpreise: firma.map(k => ({ ...k, preis: 999 })), hauptauftrag: haupt, heute: "2026-11-12" });
  assert.equal(n.quelle, "hauptauftrag"); assert.equal(n.eingefroren_am, null);
  assert.equal(n.kalkulationspreise.find(k => k.id === 2).preis, 128);
  assert.equal(istEingefroren(haupt), true);
  assert.equal(istEingefroren({ status: "entwurf", preisstand: n }), false);
});

test("Bedarf je Material über alle summenwirksamen Positionen", () => {
  const m = bedarfJePreis([
    { kalk: { materialposten: [{ stammId: 2, menge: 12 }] } },
    { kalk: { materialposten: [{ stammId: 2, menge: 3.5 }] } },
    { art: "alternativ", kalk: { materialposten: [{ stammId: 2, menge: 100 }] } },
  ]);
  assert.equal(m.get("2"), 15.5);
});
