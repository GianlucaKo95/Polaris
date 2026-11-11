import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfOperatorenAuswerten, texteZusammenfassen, massstabFinden, raumstempelLesen, pdfObjekteInMeter,
  linienVerbinden, raumstempelAlsText } from "./pdfPlan.js";
import { dxfRasterAuswerten, abschnittVerstehen, abschnittAuswerten, rasterBauen } from "./achsraster.js";

const hier = dirname(fileURLToPath(import.meta.url));
const nah = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

async function plan() {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(hier, "__fixtures__", "plan.pdf"))), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const geo = pdfOperatorenAuswerten(await page.getOperatorList(), pdfjs.OPS);
  const texte = texteZusammenfassen((await page.getTextContent()).items);
  return { ...geo, texte };
}

test("PDF: Maßstab und Raumstempel aus dem Plantext", async () => {
  const p = await plan();
  assert.equal(massstabFinden(p.texte), 100);
  const r = raumstempelLesen(p.texte);
  const wohnen = r.find(x => x.raum === "Wohnen");
  assert.equal(wohnen.flaeche, 23.45); assert.equal(wohnen.umfang, 19.6);
  assert.equal(r.find(x => x.raum === "Küche").flaeche, 12.1);
  assert.match(raumstempelAlsText(r), /Summe: 35,55 m² in 2 Räumen/);
});

test("PDF: Achsen erkennen, gefüllte Decke im Abschnitt A–B / 1–2 messen (M 1:100)", async () => {
  const p = await plan();
  const m = dxfRasterAuswerten(pdfObjekteInMeter(p, 100), { skala: 1, alleLinien: true });
  assert.deepEqual(m.achsen.map(a => a.tag).sort(), ["1", "2", "A", "B", "C"]);
  const decke = m.elemente.find(e => e.bauteil.startsWith("Füllfarbe"));
  nah(decke.flaeche, 96, 0.2);
  const r = abschnittAuswerten(m, abschnittVerstehen("A bis B, 1 bis 2", rasterBauen(m.achsen), []));
  nah(r.gruppen.find(g => g.bauteil.startsWith("Füllfarbe")).flaeche, 48, 0.2);
});

test("Gestrichelte Achse aus Einzelstrichen wird eine Linie", () => {
  const striche = [0, 2, 4, 6, 8].map(x => ({ layer: "", p1: { x, y: 5 }, p2: { x: x + 1.5, y: 5 } }));
  const l = linienVerbinden(striche, 0.5);
  assert.equal(l.length, 1); nah(l[0].p1.x, 0); nah(l[0].p2.x, 9.5);
});

test("Raumstempel: Name und Fläche in einer Zeile, NGF-Kennung", () => {
  const r = raumstempelLesen([{ text: "Bad NGF: 6,80 m²", x: 0, y: 0, h: 10 }, { text: "Flur", x: 100, y: 20, h: 10 }, { text: "8,25 m2", x: 100, y: 8, h: 10 }]);
  assert.deepEqual(r.map(x => [x.raum, x.flaeche]), [["Bad", 6.8], ["Flur", 8.25]]);
  assert.equal(r[0].art, "NGF");
});
