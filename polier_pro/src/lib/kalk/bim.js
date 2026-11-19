// BIM 5D: Mengen aus dem IFC-Modell (lib/ifcMengen.js, Gruppen je Bauteilart
// und Material) den LV-Positionen zuordnen und als LV-Menge (Kalkulation)
// oder als Aufmaß (Abrechnung) übernehmen. Jede Zuordnung bleibt an der
// Position nachvollziehbar (extra.bim).

import { aehnlichkeit, einheitNormalisieren } from "../katalog.js";
import { rundeMenge } from "./lvBaum.js";

export const GROESSEN = [["flaeche", "Fläche"], ["volumen", "Volumen"], ["laenge", "Länge"], ["anzahl", "Anzahl"]];
const GROESSE_EINHEIT = { flaeche: "m2", volumen: "m3", laenge: "m", anzahl: "stk" };

export const gruppenSchluessel = g => `${g.bauteil}|${g.material || ""}`;

export function groesseFuerEinheit(einheit) {
  const e = einheitNormalisieren(einheit);
  return Object.entries(GROESSE_EINHEIT).find(([, v]) => v === e)?.[0] || null;
}

export const gruppenWert = (g, groesse) => (groesse === "anzahl" ? g.anzahl : Number(g[groesse]) || 0);

// Wörter, die in Positionstexten für die Bauteilarten stehen
const STICH = { "Wände": "wand mauerwerk wandschalung", "Decken/Platten": "decke platte bodenplatte sohle", "Stützen": "stütze stützen", "Unterzüge/Träger": "unterzug träger balken",
  "Fundamente": "fundament streifenfundament einzelfundament", "Dächer": "dach", "Türen": "tür türen", "Fenster": "fenster", "Treppen": "treppe", "Treppenläufe": "treppe treppenlauf",
  "Bekleidungen/Beläge": "belag estrich fliesen bekleidung putz", "Vorhangfassaden": "fassade", "Pfähle": "pfahl", "Rampen": "rampe" };

// Deterministischer Vorschlag: je Gruppe die Position mit passender Einheit und ähnlichstem Text
export function zuordnungVorschlagen(gruppen, knoten) {
  const pos = (knoten || []).filter(k => k.typ === "position");
  return (gruppen || []).map(g => {
    let best = null, bestS = 0.25;
    for (const k of pos) {
      const groesse = groesseFuerEinheit(k.einheit);
      if (!groesse || (groesse !== "anzahl" && !gruppenWert(g, groesse))) continue;
      const text = `${k.kurztext} ${k.langtext || ""}`.toLowerCase();
      const s = Math.max(aehnlichkeit(`${STICH[g.bauteil] || g.bauteil} ${g.material}`, k.kurztext), (STICH[g.bauteil] || g.bauteil.toLowerCase()).split(" ").some(w => text.includes(w)) ? 0.35 : 0)
        + (g.material && text.includes(String(g.material).toLowerCase().split(" ")[0]) ? 0.3 : 0);
      if (s > bestS) { bestS = s; best = { knotenId: k.id, groesse, faktor: 1, sicher: Math.min(1, s) }; }
    }
    return { gruppe: gruppenSchluessel(g), ...(best || { knotenId: null, groesse: null, faktor: 1, sicher: 0 }) };
  });
}

// Zuordnungen → Menge je Position (mehrere Gruppen auf eine Position werden addiert)
export function mengenJePosition(gruppen, zuordnung) {
  const nachKey = new Map((gruppen || []).map(g => [gruppenSchluessel(g), g]));
  const m = new Map();
  for (const z of zuordnung || []) {
    const g = nachKey.get(z.gruppe);
    if (!g || !z.knotenId || !z.groesse) continue;
    const wert = gruppenWert(g, z.groesse) * (Number(z.faktor) || 1);
    const e = m.get(z.knotenId) || { menge: 0, quellen: [] };
    e.menge += wert;
    e.quellen.push({ gruppe: z.gruppe, groesse: z.groesse, faktor: Number(z.faktor) || 1, wert: rundeMenge(wert) });
    m.set(z.knotenId, e);
  }
  for (const e of m.values()) e.menge = rundeMenge(e.menge);
  return m;
}

// LV-Mengen setzen (Änderungspaket für useLvStand)
export function bimInsLv(knoten, gruppen, zuordnung, { datei = "IFC", datum = new Date().toISOString().slice(0, 10) } = {}) {
  const m = mengenJePosition(gruppen, zuordnung);
  const nachId = new Map(knoten.map(k => [k.id, k]));
  const aendern = [];
  for (const [id, e] of m) {
    const k = nachId.get(id);
    if (!k) continue;
    aendern.push({ id, felder: { menge: e.menge, extra: { ...(k.extra || {}), bim: { datei, datum, quellen: e.quellen, vorher: Number(k.menge) || 0 } } } });
  }
  return { aendern };
}

// Aufmaßzeilen (Abrechnung): eine Zeile je Gruppe
export function bimInsAufmass(gruppen, zuordnung, { standId, datei = "IFC", neueZeile }) {
  const nachKey = new Map((gruppen || []).map(g => [gruppenSchluessel(g), g]));
  return (zuordnung || []).filter(z => z.knotenId && z.groesse && nachKey.get(z.gruppe)).map((z, i) => {
    const g = nachKey.get(z.gruppe);
    const wert = rundeMenge(gruppenWert(g, z.groesse) * (Number(z.faktor) || 1));
    return neueZeile({ stand_id: standId, knoten_id: z.knotenId, blatt: "BIM", ort: g.material || "", bezeichnung: `${datei}: ${g.bauteil}`,
      formel: String(wert).replace(".", ","), menge: wert, quelle: "import", sort: Date.now() + i, extra: { bim: { gruppe: z.gruppe, groesse: z.groesse, faktor: Number(z.faktor) || 1 } } });
  });
}

// KI-Zuordnung: Gruppen → Positionsnummern, nur gültige Einheit-Größen-Paare werden übernommen
export const BIM_WERKZEUG = {
  name: "zuordnung_abgeben",
  description: "Ordnet Bauteilgruppen aus dem Modell den LV-Positionen zu.",
  input_schema: { type: "object", properties: { zuordnungen: { type: "array", items: { type: "object", properties: {
    gruppe: { type: "integer", description: "Gruppennummer (G…)" }, position: { type: "integer", description: "Positionsnummer (#…)" },
    groesse: { type: "string", enum: ["flaeche", "volumen", "laenge", "anzahl"] }, faktor: { type: "number", description: "z. B. 2 für beidseitige Schalung, sonst 1" },
    begruendung: { type: "string" } }, required: ["gruppe", "position", "groesse"] } } }, required: ["zuordnungen"] },
};

export async function bimZuordnungKi({ gruppen, knoten, rufeKi }) {
  const pos = knoten.filter(k => k.typ === "position");
  const gText = gruppen.map((g, i) => `G${i + 1} | ${g.bauteil}${g.material ? ` · ${g.material}` : ""} | ${g.anzahl} Stk, ${Math.round(g.flaeche * 100) / 100} m², ${Math.round(g.volumen * 1000) / 1000} m³, ${Math.round(g.laenge * 100) / 100} m`).join("\n");
  const pText = pos.map((k, i) => `#${i + 1} | ${k.oz || ""} | ${k.einheit || ""} | ${k.kurztext}`).join("\n");
  const a = await rufeKi(`Du ordnest Bauteilgruppen eines BIM-Modells den Positionen eines Leistungsverzeichnisses zu.
- Nur zuordnen, wenn Leistung und Einheit wirklich zusammenpassen (m² → Fläche, m³ → Volumen, m → Länge, St → Anzahl).
- Faktor nur, wenn die Leistung es verlangt (Schalung beidseitig = 2, Abdichtung einer Seite = 1).
- Lieber keine Zuordnung als eine falsche. Rufe genau einmal ${BIM_WERKZEUG.name} auf.`,
    [{ role: "user", content: `Gruppen:\n${gText}\n\nPositionen:\n${pText}` }], [BIM_WERKZEUG], { type: "tool", name: BIM_WERKZEUG.name });
  const input = (a?.content || []).find(b => b.type === "tool_use" && b.name === BIM_WERKZEUG.name)?.input;
  return kiZuordnungAuswerten(input, gruppen, pos);
}

export function kiZuordnungAuswerten(input, gruppen, pos) {
  const aus = new Map();
  for (const z of input?.zuordnungen || []) {
    const g = gruppen[Number(z.gruppe) - 1], k = pos[Number(z.position) - 1];
    if (!g || !k || !GROESSE_EINHEIT[z.groesse]) continue;
    if (groesseFuerEinheit(k.einheit) !== z.groesse) continue;
    const f = Number(z.faktor);
    aus.set(gruppenSchluessel(g), { gruppe: gruppenSchluessel(g), knotenId: k.id, groesse: z.groesse, faktor: f > 0 && f <= 10 ? f : 1, sicher: 0.7, begruendung: z.begruendung || "" });
  }
  return gruppen.map(g => aus.get(gruppenSchluessel(g)) || { gruppe: gruppenSchluessel(g), knotenId: null, groesse: null, faktor: 1, sicher: 0 });
}
