// Personal- und Geräteplanung über alle Baustellen nach Kalenderwochen.
//
// Ressourcen: Kolonnen (firmenweit nach Namen zusammengefasst, weil jede
// Baustelle ihre Kolonnen als eigene Zeilen führt) und Geräte aus der
// Geräteverwaltung. Je Ressource und Woche höchstens eine Baustelle
// (Tabelle einsatzplan, unique auf ressource + woche).
//
// Konflikte je Zelle:
//   Kolonne — Mitglieder mit Urlaub/Krankheit in der Woche (Mo–Fr)
//   Gerät   — Werkstatt/ausgemustert, Prüfung überfällig oder in der Woche
//             fällig, steht laut Geräteverwaltung auf einer anderen Baustelle

import { kalenderwoche } from "./cockpit.js";
import { pruefStand } from "./geraete.js";

const tagMs = 86400000;
const datum = s => new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);

export function montag(isoDatum) {
  const d = datum(isoDatum);
  return iso(new Date(+d - ((d.getUTCDay() + 6) % 7) * tagMs));
}
export const plusTage = (isoDatum, n) => iso(new Date(+datum(isoDatum) + n * tagMs));

export function wochen(startMontag, anzahl) {
  return Array.from({ length: anzahl }, (_, i) => {
    const m = plusTage(startMontag, i * 7);
    const d = datum(m);
    return { montag: m, freitag: plusTage(m, 4), kw: kalenderwoche(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), jahr: d.getUTCFullYear() };
  });
}

const normName = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

export function kolonnenRessourcen(kolonnen) {
  const map = new Map();
  for (const k of kolonnen || []) {
    const key = normName(k.name);
    if (!key) continue;
    const r = map.get(key) || { schluessel: `kolonne:${key}`, art: "kolonne", name: k.name.trim(), vorarbeiter: k.vorarbeiter || "", mitarbeiter: [] };
    for (const m of k.mitarbeiter || []) if (m?.name && !r.mitarbeiter.some(x => normName(x) === normName(m.name))) r.mitarbeiter.push(m.name);
    if (!r.vorarbeiter && k.vorarbeiter) r.vorarbeiter = k.vorarbeiter;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export function geraeteRessourcen(geraete) {
  return (geraete || []).filter(g => g.status !== "ausgemustert")
    .map(g => ({ schluessel: `geraet:${g.id}`, art: "geraet", name: g.bezeichnung, inventarnr: g.inventarnr, geraet: g }))
    .sort((a, b) => (a.inventarnr || a.name).localeCompare(b.inventarnr || b.name, "de", { numeric: true }));
}

const ueberschneidet = (von, bis, a, b) => von <= b && bis >= a;

// abwesenheiten: [{ name, von, bis, typ, status }]
export function kolonnenKonflikt(ressource, woche, abwesenheiten) {
  const abwesend = (abwesenheiten || []).filter(a => a.status !== "abgelehnt" && ueberschneidet(a.von, a.bis, woche.montag, woche.freitag)
    && ressource.mitarbeiter.some(m => normName(m) === normName(a.name)));
  const namen = [...new Set(abwesend.map(a => a.name))];
  if (!namen.length) return null;
  const alle = ressource.mitarbeiter.length > 0 && namen.length >= ressource.mitarbeiter.length;
  return { schwer: alle, text: alle ? "ganze Kolonne abwesend" : `${namen.length} von ${ressource.mitarbeiter.length} abwesend`, namen,
    unsicher: abwesend.every(a => a.status === "beantragt") };
}

export function geraetKonflikt(ressource, woche, projektId, heute) {
  const g = ressource.geraet;
  const k = [];
  if (g.status === "werkstatt") k.push({ schwer: true, text: "in der Werkstatt" });
  for (const p of pruefStand(g, heute)) {
    if (p.stand === "offen") k.push({ schwer: true, text: `${p.label} nie geprüft` });
    else if (p.faellig <= woche.freitag) k.push({ schwer: p.faellig < woche.montag, text: `${p.label} fällig ${p.faellig.split("-").reverse().join(".")}` });
  }
  // Ist-Standort weicht in der laufenden Woche vom Plan ab
  if (projektId != null && heute >= woche.montag && heute <= plusTage(woche.montag, 6) && g.status === "einsatz" && String(g.projekt_id) !== String(projektId))
    k.push({ schwer: false, text: "steht auf einer anderen Baustelle" });
  return k.length ? k : null;
}

export function zelle(plan, schluessel, montagIso) {
  return (plan || []).find(p => p.ressource === schluessel && p.woche === montagIso) || null;
}

// Zuweisung über mehrere Wochen: liefert die zu speichernden und die zu
// löschenden Planzeilen. projektId null = Woche freigeben.
export function zuweisen(plan, ressource, projektId, montage) {
  const speichern = [], loeschen = [];
  for (const m of montage) {
    const z = zelle(plan, ressource.schluessel, m);
    if (projektId == null) { if (z) loeschen.push(z.id); continue; }
    if (z && String(z.projekt_id) === String(projektId)) continue;
    speichern.push({ ...(z || {}), art: ressource.art, ressource: ressource.schluessel, ressource_name: ressource.name, projekt_id: projektId, woche: m });
  }
  return { speichern, loeschen };
}

// Besetzung je Baustelle und Woche (Anzahl Kolonnen und Geräte).
export function besetzung(plan, montagIso) {
  const je = {};
  for (const p of plan || []) {
    if (p.woche !== montagIso) continue;
    const e = je[p.projekt_id] || (je[p.projekt_id] = { kolonnen: 0, geraete: 0 });
    if (p.art === "kolonne") e.kolonnen++; else e.geraete++;
  }
  return je;
}

export function abwesenheitenNormalisieren(liste) {
  return (liste || []).map(a => ({
    name: a.name || [a.mitarbeiter?.vorname, a.mitarbeiter?.nachname].filter(Boolean).join(" "),
    von: a.von || a.von_datum, bis: a.bis || a.bis_datum, typ: a.typ, status: a.status,
  })).filter(a => a.name && a.von && a.bis);
}
