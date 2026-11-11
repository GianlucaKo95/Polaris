// Browser-Teil des IFC-Imports: lädt web-ifc (WebAssembly, ~1,5 MB) erst,
// wenn wirklich eine IFC-Datei gewählt wird.
import { ifcElementeLesen, mengenAggregieren, mengenAlsText } from "./ifcMengen.js";

export async function ifcMengenAusDatei(datei) {
  const WebIFC = await import("web-ifc");
  const { default: wasmUrl } = await import("web-ifc/web-ifc.wasm?url");
  const api = new WebIFC.IfcAPI();
  await api.Init(() => wasmUrl, true);
  const daten = new Uint8Array(await datei.arrayBuffer());
  const modelID = api.OpenModel(daten);
  try {
    const typen = Object.fromEntries(Object.keys(WebIFC).filter(k => /^IFC[A-Z]+$/.test(k)).map(k => [k, WebIFC[k]]));
    const elemente = await ifcElementeLesen(api, modelID, typen);
    const gruppen = mengenAggregieren(elemente);
    const { co2AusModell } = await import("./co2.js");
    const co2 = co2AusModell(gruppen).filter(g => g.co2 != null);
    const co2Text = co2.length ? `\nCO₂ Herstellung (Richtwerte): ${co2.map(g => `${g.bauteil}${g.material ? ` · ${g.material}` : ""} ≈ ${(g.co2 / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} t`).join("; ")}` : "";
    return { gruppen, text: mengenAlsText(gruppen, datei.name) + co2Text };
  } finally {
    api.CloseModel(modelID);
  }
}

// Modell für "Mengen nach Achsabschnitt" (lib/ifcRaster.js, lib/achsraster.js).
export async function ifcRasterAusDatei(datei) {
  const WebIFC = await import("web-ifc");
  const { default: wasmUrl } = await import("web-ifc/web-ifc.wasm?url");
  const { ifcRasterModell } = await import("./ifcRaster.js");
  const api = new WebIFC.IfcAPI();
  await api.Init(() => wasmUrl, true);
  const modelID = api.OpenModel(new Uint8Array(await datei.arrayBuffer()));
  try {
    const typen = Object.fromEntries(Object.keys(WebIFC).filter(k => /^IFC[A-Z]+$/.test(k)).map(k => [k, WebIFC[k]]));
    return await ifcRasterModell(api, modelID, typen);
  } finally {
    api.CloseModel(modelID);
  }
}
