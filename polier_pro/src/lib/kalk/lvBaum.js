// LV als Baum: Titel, Positionen und Hinweise eines Kalkulationsstands
// (Tabelle lv_knoten, siehe supabase-kalkulation-v2.sql).
//
// Ein Knoten: { id, parent_id, sort, typ: "titel"|"position"|"hinweis", oz,
//   art, kurztext, langtext, menge, einheit, ep, rabatt, stlk, extra }
//
// Geldregel (gleich wie die Datenbank-View kalk_stand_summen und GAEB):
// GP je Position = Menge × EP × (1 − Rabatt %), auf Cent gerundet, kaufmännisch
// (halbe Cent weg von null). Gerechnet wird exakt mit Ganzzahlen, damit
// Bildschirm, Datenbank, Rechnung und GAEB-Export nie um einen Cent abweichen.

export const KNOTEN_TYPEN = ["titel", "position", "hinweis"];

export const ARTEN = [
  ["normal", "Normal"],
  ["zulage", "Zulage"],
  ["bedarf_mit", "Bedarf mit GB"],
  ["bedarf", "Bedarf ohne GB"],
  ["alternativ", "Alternativ"],
  ["pauschal", "Pauschal"],
];
export const ART_KURZ = { normal: "", zulage: "Z", bedarf_mit: "B", bedarf: "E", alternativ: "A", pauschal: "P" };

export function inSumme(k) {
  return k?.typ === "position" && k.art !== "bedarf" && k.art !== "alternativ";
}

// ── Exakte Geldrechnung ─────────────────────────────────────────────────────
// Dezimalwert × Faktor als Ganzzahl, kaufmännisch gerundet wie Postgres
// numeric (halbe Einheit weg von null). toPrecision fängt Gleitkomma-Reste
// ab: 1.005 × 100 = 100.49999… wird so korrekt zu 101.
const ganz = (x, faktor) => {
  const v = Number((((Number(x) || 0) * faktor)).toPrecision(12));
  return BigInt(Math.sign(v) * Math.round(Math.abs(v)));
};

function teileGerundet(zaehler, nenner) {
  const neg = zaehler < 0n;
  const a = neg ? -zaehler : zaehler;
  const q = (a * 2n + nenner) / (2n * nenner);
  return neg ? -q : q;
}

// GP in Cent (Number, ganzzahlig)
export function gpCent(k) {
  if (!k || k.typ !== "position") return 0;
  const roh = ganz(k.menge, 1000) * ganz(k.ep, 100) * (100000n - ganz(k.rabatt, 1000)); // Einheit 1e-10 €
  return Number(teileGerundet(roh, 100000000n));
}

export const gp = k => gpCent(k) / 100;
export const rundeCent = x => Number(teileGerundet(ganz(x, 1e6), 10000n)) / 100;
export const rundeMenge = x => Math.round((Number(x) || 0) * 1000) / 1000;

// ── Baumstruktur ────────────────────────────────────────────────────────────
export function baumIndex(knoten) {
  const nachId = new Map();
  const kinder = new Map();
  for (const k of knoten || []) nachId.set(k.id, k);
  for (const k of knoten || []) {
    const p = k.parent_id && nachId.has(k.parent_id) ? k.parent_id : null;
    if (!kinder.has(p)) kinder.set(p, []);
    kinder.get(p).push(k);
  }
  for (const liste of kinder.values()) liste.sort((a, b) => (a.sort - b.sort) || String(a.id).localeCompare(String(b.id)));
  return { nachId, kinder, kinderVon: id => kinder.get(id ?? null) || [] };
}

// Knoten in Lesereihenfolge mit Tiefe; zugeklappte Titel blenden ihre Kinder aus.
export function zeilen(knoten, { zugeklappt = new Set(), index = baumIndex(knoten) } = {}) {
  const aus = [];
  const lauf = (parent, tiefe) => {
    for (const k of index.kinderVon(parent)) {
      const hatKinder = index.kinderVon(k.id).length > 0;
      aus.push({ k, tiefe, hatKinder });
      if (hatKinder && !zugeklappt.has(k.id)) lauf(k.id, tiefe + 1);
    }
  };
  lauf(null, 0);
  return aus;
}

export function nachfahren(knoten, id, index = baumIndex(knoten)) {
  const ids = [];
  const lauf = p => { for (const k of index.kinderVon(p)) { ids.push(k.id); lauf(k.id); } };
  lauf(id);
  return ids;
}

export function pfad(index, id) {
  const p = [];
  for (let k = index.nachId.get(id); k; k = k.parent_id ? index.nachId.get(k.parent_id) : null) p.unshift(k);
  return p;
}

// Summen in Cent je Titel (rekursiv) und gesamt
export function summen(knoten, index = baumIndex(knoten)) {
  const jeKnoten = new Map();
  let positionen = 0;
  const lauf = parent => {
    let s = 0;
    for (const k of index.kinderVon(parent)) {
      if (k.typ === "titel") {
        const t = lauf(k.id);
        jeKnoten.set(k.id, t);
        s += t;
      } else if (k.typ === "position") {
        positionen++;
        const g = gpCent(k);
        jeKnoten.set(k.id, g);
        if (inSumme(k)) s += g;
        lauf(k.id); // Unterpositionen zählen nicht doppelt
      }
    }
    return s;
  };
  const gesamt = lauf(null);
  return { gesamtCent: gesamt, gesamt: gesamt / 100, jeKnoten, positionen };
}

// ── Sortierung ──────────────────────────────────────────────────────────────
// Bruchzahl-Sortierung: Einfügen zwischen zwei Nachbarn ändert keine anderen Zeilen.
export function sortZwischen(vorher, nachher) {
  if (vorher == null && nachher == null) return 1024;
  if (vorher == null) return nachher - 1024;
  if (nachher == null) return vorher + 1024;
  return (vorher + nachher) / 2;
}

// Sortwert für "nach Knoten X" (oder als erstes Kind von parent, wenn nachId null)
export function sortNach(index, parentId, nachId) {
  const geschwister = index.kinderVon(parentId);
  if (nachId == null) return sortZwischen(null, geschwister[0]?.sort ?? null);
  const i = geschwister.findIndex(k => k.id === nachId);
  if (i < 0) return sortZwischen(geschwister.at(-1)?.sort ?? null, null);
  return sortZwischen(geschwister[i].sort, geschwister[i + 1]?.sort ?? null);
}

// ── Bearbeiten (liefert Änderungen, mutiert nichts) ─────────────────────────
// Ergebnis: { neu: [knoten], aendern: [{ id, felder }], loeschen: [id] }

export function neueId() {
  return globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16);
  });
}

export function leererKnoten(typ, felder = {}) {
  return {
    id: neueId(), parent_id: null, sort: 1024, typ, oz: "", art: "normal",
    kurztext: "", langtext: "", menge: 0, einheit: typ === "position" ? "" : "", ep: 0, rabatt: 0, stlk: null, extra: {},
    ...felder,
  };
}

// Neuer Knoten hinter der Zeile `nachId`. Ein Titel nimmt neue Positionen als
// Kinder auf (ans Ende); eine Position bekommt einen Geschwisterknoten.
export function einfuegen(knoten, { nachId = null, typ = "position", felder = {} } = {}) {
  const index = baumIndex(knoten);
  const bezug = nachId ? index.nachId.get(nachId) : null;
  let parentId, nach;
  if (!bezug) { parentId = null; nach = index.kinderVon(null).at(-1)?.id ?? null; }
  else if (bezug.typ === "titel" && typ !== "titel") { parentId = bezug.id; nach = index.kinderVon(bezug.id).at(-1)?.id ?? null; }
  else { parentId = bezug.parent_id ?? null; nach = bezug.id; }
  const k = leererKnoten(typ, { parent_id: parentId, sort: sortNach(index, parentId, nach), ...felder });
  if (typ === "position" && !k.oz) k.oz = naechsteOz(knoten, k, index);
  return { neu: [k], aendern: [], loeschen: [] };
}

export function loeschen(knoten, ids) {
  const index = baumIndex(knoten);
  const alle = new Set();
  for (const id of ids) { alle.add(id); nachfahren(knoten, id, index).forEach(x => alle.add(x)); }
  return { neu: [], aendern: [], loeschen: [...alle] };
}

// Eine Ebene tiefer: unter den vorherigen Titel-Geschwister hängen
export function einruecken(knoten, id) {
  const index = baumIndex(knoten);
  const k = index.nachId.get(id);
  if (!k) return null;
  const geschwister = index.kinderVon(k.parent_id ?? null);
  const i = geschwister.findIndex(x => x.id === id);
  const ziel = [...geschwister.slice(0, i)].reverse().find(x => x.typ === "titel");
  if (!ziel) return null;
  const sort = sortZwischen(index.kinderVon(ziel.id).at(-1)?.sort ?? null, null);
  return { neu: [], aendern: [{ id, felder: { parent_id: ziel.id, sort } }], loeschen: [] };
}

// Eine Ebene höher: hinter den bisherigen Eltern-Titel
export function ausruecken(knoten, id) {
  const index = baumIndex(knoten);
  const k = index.nachId.get(id);
  const eltern = k?.parent_id ? index.nachId.get(k.parent_id) : null;
  if (!eltern) return null;
  const parentId = eltern.parent_id ?? null;
  return { neu: [], aendern: [{ id, felder: { parent_id: parentId, sort: sortNach(index, parentId, eltern.id) } }], loeschen: [] };
}

// Verschieben: Knoten (mit Unterbaum) hinter `nachId` bzw. als erstes Kind von `parentId`
export function verschieben(knoten, id, { parentId = null, nachId = null }) {
  const index = baumIndex(knoten);
  if (id === parentId || nachfahren(knoten, id, index).includes(parentId)) return null; // nicht in sich selbst
  return { neu: [], aendern: [{ id, felder: { parent_id: parentId, sort: sortNach(index, parentId, nachId === id ? null : nachId) } }], loeschen: [] };
}

export function aenderungenAnwenden(knoten, { neu = [], aendern = [], loeschen = [] } = {}) {
  const weg = new Set(loeschen);
  const felder = new Map(aendern.map(a => [a.id, a.felder]));
  return [
    ...knoten.filter(k => !weg.has(k.id)).map(k => (felder.has(k.id) ? { ...k, ...felder.get(k.id) } : k)),
    ...neu.filter(k => !weg.has(k.id)),
  ];
}

// Umkehrung für Rückgängig
export function aenderungenUmkehren(knoten, { neu = [], aendern = [], loeschen = [] } = {}) {
  const nachId = new Map(knoten.map(k => [k.id, k]));
  return {
    neu: loeschen.map(id => nachId.get(id)).filter(Boolean),
    aendern: aendern.filter(a => nachId.has(a.id)).map(a => ({
      id: a.id, felder: Object.fromEntries(Object.keys(a.felder).map(f => [f, nachId.get(a.id)[f]])),
    })),
    loeschen: neu.map(k => k.id),
  };
}

// ── Ordnungszahlen ──────────────────────────────────────────────────────────
// Maske wie "11.11.1111": je Titelebene eine Stellenzahl, zuletzt die Position.
export function ozMaskeAusLv(knoten, index = baumIndex(knoten)) {
  let tiefe = 0;
  const lauf = (p, t) => { for (const k of index.kinderVon(p)) if (k.typ === "titel") { tiefe = Math.max(tiefe, t + 1); lauf(k.id, t + 1); } };
  lauf(null, 0);
  return [...Array(tiefe).fill("11"), "1111"].join(".");
}

function stellen(maske) { return String(maske || "11.1111").split(".").map(t => t.length); }

// Alle OZ neu vergeben (Titel 01, 02 …; Positionen 0010, 0020 …)
export function ozNeuVergeben(knoten, { maske = ozMaskeAusLv(knoten), schritt = 10 } = {}) {
  const index = baumIndex(knoten);
  const st = stellen(maske);
  const posStellen = st.at(-1);
  const aendern = [];
  const lauf = (parent, praefix, ebene) => {
    let t = 0, p = 0;
    for (const k of index.kinderVon(parent)) {
      let oz = k.oz;
      if (k.typ === "titel") {
        t++;
        oz = [...praefix, String(t).padStart(st[ebene] || 2, "0")].join(".");
        lauf(k.id, [...praefix, String(t).padStart(st[ebene] || 2, "0")], ebene + 1);
      } else if (k.typ === "position") {
        p++;
        oz = [...praefix, String(p * schritt).padStart(posStellen, "0")].join(".");
      } else oz = "";
      if (oz !== k.oz) aendern.push({ id: k.id, felder: { oz } });
    }
  };
  lauf(null, [], 0);
  return { neu: [], aendern, loeschen: [] };
}

// OZ für eine neu eingefügte Position: hinter der vorherigen Geschwister-OZ
export function naechsteOz(knoten, neu, index = baumIndex(knoten)) {
  const geschwister = index.kinderVon(neu.parent_id ?? null).filter(k => k.typ === "position" && k.sort < neu.sort);
  const vorher = geschwister.at(-1)?.oz;
  const eltern = neu.parent_id ? index.nachId.get(neu.parent_id) : null;
  if (vorher && /\d+$/.test(vorher)) {
    const m = vorher.match(/^(.*?)(\d+)$/);
    const nachfolger = index.kinderVon(neu.parent_id ?? null).find(k => k.typ === "position" && k.sort > neu.sort)?.oz;
    const schritt = 10;
    let n = Number(m[2]) + schritt;
    const nmax = nachfolger?.match(/(\d+)$/) ? Number(nachfolger.match(/(\d+)$/)[1]) : Infinity;
    if (n >= nmax) n = Number(m[2]) + Math.max(1, Math.floor((nmax - Number(m[2])) / 2));
    if (n >= nmax) return "";
    return m[1] + String(n).padStart(m[2].length, "0");
  }
  const praefix = eltern?.oz ? eltern.oz + "." : "";
  return praefix + "0010";
}

// Nur Positionen ohne OZ bekommen eine (hinter der vorherigen Geschwister-OZ);
// vorhandene OZ, etwa aus einer Ausschreibung, bleiben unverändert.
export function ozFehlendeVergeben(knoten) {
  let aktuell = knoten;
  const aendern = [];
  const index = baumIndex(knoten);
  const lauf = parent => {
    for (const k of index.kinderVon(parent)) {
      if (k.typ === "titel") { lauf(k.id); continue; }
      if (k.typ !== "position" || k.oz) continue;
      const oz = naechsteOz(aktuell, k);
      if (!oz) continue;
      aendern.push({ id: k.id, felder: { oz } });
      aktuell = aktuell.map(x => (x.id === k.id ? { ...x, oz } : x));
    }
  };
  lauf(null);
  return { neu: [], aendern, loeschen: [] };
}

// ── Prüfung ─────────────────────────────────────────────────────────────────
export function pruefen(knoten) {
  const index = baumIndex(knoten);
  const hinweise = [];
  const ozGesehen = new Map();
  for (const k of knoten) {
    if (k.typ !== "position") continue;
    if (k.oz) {
      if (ozGesehen.has(k.oz)) hinweise.push({ id: k.id, text: `OZ ${k.oz} ist doppelt` });
      ozGesehen.set(k.oz, k.id);
    }
    if (!String(k.kurztext || "").trim()) hinweise.push({ id: k.id, text: `Position ${k.oz || ""} ohne Kurztext`.replace("  ", " ") });
    if (!k.einheit && k.art !== "pauschal") hinweise.push({ id: k.id, text: `Position ${k.oz || k.kurztext} ohne Einheit` });
    if (inSumme(k) && !(Number(k.menge) > 0)) hinweise.push({ id: k.id, text: `Position ${k.oz || k.kurztext} ohne Menge` });
    if (inSumme(k) && !(Number(k.ep) > 0)) hinweise.push({ id: k.id, text: `Position ${k.oz || k.kurztext} ohne Preis`, preis: true });
  }
  for (const k of knoten) if (k.parent_id && !index.nachId.has(k.parent_id)) hinweise.push({ id: k.id, text: "Knoten ohne gültigen Titel" });
  return hinweise;
}
