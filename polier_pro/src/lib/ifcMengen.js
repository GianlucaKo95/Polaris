// Mengen aus einem BIM-Modell (IFC): liest die Mengenangaben (IfcElement-
// Quantity, "Qto_…BaseQuantities"), die CAD-Programme beim IFC-Export an
// die Bauteile hängen, und summiert sie je Bauteilart und Material — z.B.
// "Wände · Kalksandstein: 38 Stk, 412 m² Nettofläche, 72 m³".
//
// Das Ergebnis geht als Text an den KI-Angebots-Agenten (Anhang im
// KI-Assistenten), der daraus Positionen und Mengen ableitet. Polaris
// rechnet keine Geometrie nach: Bauteile ohne exportierte Mengen werden nur
// gezählt (und als solche gemeldet).
//
// Aufgeteilt in zwei Teile, damit die Aggregation ohne WebAssembly testbar
// ist: mengenAggregieren() arbeitet auf einfachen Objekten, ifcElementeLesen()
// holt sie mit web-ifc aus der Datei.

export const BAUTEILARTEN = {
  IFCWALL: "Wände", IFCWALLSTANDARDCASE: "Wände", IFCSLAB: "Decken/Platten", IFCROOF: "Dächer",
  IFCCOLUMN: "Stützen", IFCBEAM: "Unterzüge/Träger", IFCFOOTING: "Fundamente", IFCPILE: "Pfähle",
  IFCSTAIR: "Treppen", IFCSTAIRFLIGHT: "Treppenläufe", IFCDOOR: "Türen", IFCWINDOW: "Fenster",
  IFCCOVERING: "Bekleidungen/Beläge", IFCCURTAINWALL: "Vorhangfassaden", IFCRAMP: "Rampen",
};

// Welche Mengenangabe zählt — Netto vor Brutto, Seitenfläche bei Wänden.
const FLAECHE = ["NetSideArea", "NetArea", "NetFootprintArea", "GrossSideArea", "GrossArea", "GrossFootprintArea", "Area"];
const VOLUMEN = ["NetVolume", "GrossVolume", "Volume"];
const LAENGE = ["Length", "NetLength", "GrossLength", "Perimeter"];

function erster(mengen, namen) {
  for (const n of namen) if (Number.isFinite(mengen[n])) return mengen[n];
  return null;
}

// elemente: [{ typ: "IFCWALL", material: "Kalksandstein", mengen: { NetSideArea: 12.5, NetVolume: 2.2, … } }]
export function mengenAggregieren(elemente) {
  const gruppen = new Map();
  for (const e of elemente || []) {
    const art = BAUTEILARTEN[e.typ] || e.typ;
    const key = `${art}|${e.material || ""}`;
    const g = gruppen.get(key) || { bauteil: art, material: e.material || "", anzahl: 0, flaeche: 0, volumen: 0, laenge: 0, ohneMengen: 0 };
    g.anzahl++;
    const f = erster(e.mengen || {}, FLAECHE), v = erster(e.mengen || {}, VOLUMEN), l = erster(e.mengen || {}, LAENGE);
    if (f == null && v == null && l == null) g.ohneMengen++;
    g.flaeche += f || 0; g.volumen += v || 0; g.laenge += l || 0;
    gruppen.set(key, g);
  }
  return [...gruppen.values()].sort((a, b) => a.bauteil.localeCompare(b.bauteil) || a.material.localeCompare(b.material));
}

const z = n => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

export function mengenAlsText(gruppen, dateiname = "") {
  if (!gruppen.length) return `IFC-Modell ${dateiname}: keine auswertbaren Bauteile gefunden.`;
  const zeilen = gruppen.map(g => {
    const teile = [`${g.anzahl} Stk`];
    if (g.flaeche) teile.push(`${z(g.flaeche)} m² Fläche`);
    if (g.volumen) teile.push(`${z(g.volumen)} m³`);
    if (g.laenge) teile.push(`${z(g.laenge)} m Länge`);
    if (g.ohneMengen) teile.push(`${g.ohneMengen} ohne Mengenangabe`);
    return `- ${g.bauteil}${g.material ? ` · ${g.material}` : ""}: ${teile.join(", ")}`;
  });
  return `Mengen aus dem BIM-Modell ${dateiname} (IFC-Mengenangaben des CAD-Exports, Netto vor Brutto):\n${zeilen.join("\n")}`;
}

// ── Einlesen mit web-ifc ────────────────────────────────────────────────
// api: initialisierte IfcAPI-Instanz; typen: { IFCWALL: <Typnummer>, … }
// aus dem web-ifc-Modul (die Nummern kommen aus dem IFC-Schema).
export async function ifcElementeLesen(api, modelID, typen) {
  const elemente = [];
  const einheiten = ifcEinheiten(api, modelID, typen);
  for (const [name, typNr] of Object.entries(typen)) {
    if (!BAUTEILARTEN[name]) continue;
    const ids = api.GetLineIDsWithType(modelID, typNr);
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i);
      elemente.push({ typ: name, id, ...(await mengenUndMaterial(api, modelID, id, einheiten)) });
    }
  }
  return elemente;
}

// Mengenangaben (IfcElementQuantity) und erstes Material eines Bauteils.
// einheiten: Umrechnungsfaktoren auf m / m² / m³ (siehe ifcEinheiten()).
export async function mengenUndMaterial(api, modelID, id, einheiten = { laenge: 1, flaeche: 1, volumen: 1 }) {
  const mengen = {};
  const sets = await api.properties.getPropertySets(modelID, id, true);
  for (const s of sets || []) {
    for (const q of s?.Quantities || []) {
      const n = q?.Name?.value;
      const wert = q?.AreaValue?.value != null ? q.AreaValue.value * einheiten.flaeche
        : q?.VolumeValue?.value != null ? q.VolumeValue.value * einheiten.volumen
        : q?.LengthValue?.value != null ? q.LengthValue.value * einheiten.laenge
        : q?.CountValue?.value;
      if (n && Number.isFinite(Number(wert))) mengen[n] = Number(wert);
    }
  }
  let material = "";
  try {
    const mats = await api.properties.getMaterialsProperties(modelID, id, true);
    const m = mats?.[0];
    material = m?.Name?.value || m?.ForLayerSet?.MaterialLayers?.[0]?.Material?.Name?.value
      || m?.MaterialLayers?.[0]?.Material?.Name?.value || "";
  } catch { /* Material optional */ }
  return { mengen, material };
}

// Eine Fläche, ein Volumen, eine Länge je Bauteil (Netto vor Brutto).
export function hauptmengen(mengen) {
  return { flaeche: erster(mengen || {}, FLAECHE), volumen: erster(mengen || {}, VOLUMEN), laenge: erster(mengen || {}, LAENGE) };
}

// Projekteinheiten (IfcUnitAssignment): Faktor auf m, m², m³. Fehlt die
// Flächen-/Volumeneinheit, gilt m² bzw. m³ (so exportieren Revit, Archicad,
// Allplan die Basismengen auch in mm-Projekten).
const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 10,
  DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };
export function ifcEinheiten(api, modelID, typen) {
  const e = { laenge: 1, flaeche: 1, volumen: 1 };
  let unitIds = [];
  try {
    const projekte = api.GetLineIDsWithType(modelID, typen.IFCPROJECT);
    const projekt = projekte.size() ? api.GetLine(modelID, projekte.get(0), false) : null;
    const zuordnung = projekt?.UnitsInContext?.value ? api.GetLine(modelID, projekt.UnitsInContext.value, false) : null;
    unitIds = (zuordnung?.Units || []).map(u => u.value).filter(Boolean);
  } catch { /* ohne Projekt: Standard */ }
  for (const id of unitIds) {
    const u = api.GetLine(modelID, id, false);
    if (u?.type !== typen.IFCSIUNIT) continue;
    const art = u?.UnitType?.value, pre = u?.Prefix?.value;
    const f = pre ? SI_PREFIX[pre] ?? 1 : 1;
    if (art === "LENGTHUNIT") e.laenge = f;
    if (art === "AREAUNIT") e.flaeche = f * f;
    if (art === "VOLUMEUNIT") e.volumen = f * f * f;
  }
  return e;
}
