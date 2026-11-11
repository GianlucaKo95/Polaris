import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as WebIFC from "web-ifc";
import { ifcElementeLesen, mengenAggregieren, mengenAlsText } from "./ifcMengen.js";

const hier = dirname(fileURLToPath(import.meta.url));

test("Aggregation: Netto vor Brutto, Gruppen je Bauteil und Material", () => {
  const g = mengenAggregieren([
    { typ: "IFCWALL", material: "KS", mengen: { NetSideArea: 10, GrossSideArea: 11 } },
    { typ: "IFCWALLSTANDARDCASE", material: "KS", mengen: { GrossSideArea: 5, NetVolume: 1 } },
    { typ: "IFCDOOR", material: "", mengen: {} },
  ]);
  assert.equal(g.length, 2);
  const w = g.find(x => x.bauteil === "Wände");
  assert.equal(w.anzahl, 2); assert.equal(w.flaeche, 15); assert.equal(w.volumen, 1);
  assert.equal(g.find(x => x.bauteil === "Türen").ohneMengen, 1);
  assert.match(mengenAlsText(g, "haus.ifc"), /Wände · KS: 2 Stk, 15 m² Fläche, 1 m³/);
});

test("Echtes IFC mit web-ifc: Mengen und Material der Bauteile", async () => {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const modelID = api.OpenModel(new Uint8Array(readFileSync(join(hier, "__fixtures__", "mini.ifc"))));
  const typen = Object.fromEntries(Object.keys(WebIFC).filter(k => /^IFC[A-Z]+$/.test(k)).map(k => [k, WebIFC[k]]));
  const elemente = await ifcElementeLesen(api, modelID, typen);
  api.CloseModel(modelID);
  const g = mengenAggregieren(elemente);
  const waende = g.find(x => x.bauteil === "Wände");
  assert.equal(waende.material, "Kalksandstein");
  assert.equal(waende.anzahl, 2);
  assert.equal(waende.flaeche, 22.5);
  assert.equal(waende.volumen, 2.1875);
  const decke = g.find(x => x.bauteil === "Decken/Platten");
  assert.equal(decke.flaeche, 120);
  assert.equal(decke.volumen, 24);
});
