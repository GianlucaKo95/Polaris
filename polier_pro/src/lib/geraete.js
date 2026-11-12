// Geräteverwaltung: Inventar, Standort (Baustelle oder Bauhof), Prüffristen,
// Wartung und interne Gerätemiete je Baustelle.
//
// Ein Gerät (Tabelle geraete, siehe supabase-kalkulation.sql):
//   { id, inventarnr, bezeichnung, kategorie, grundlage_id, tagessatz,
//     stunden_je_tag, status, projekt_id, pruefungen: [{ art, intervall_monate,
//     zuletzt }], wartungen: [{ datum, text, kosten }], einsaetze: [{ projekt_id,
//     von, bis }], notiz }
//
// Die interne Miete rechnet je Arbeitstag (Mo–Fr ohne gesetzliche Feiertage)
// mit dem Tagessatz des Geräts; ohne eigenen Tagessatz mit dem BGL-
// Stundensatz aus den Kalkulationsgrundlagen × Stunden je Tag (Standard 8).
// So landen dieselben Werte in der Nachkalkulation, mit denen das Angebot
// kalkuliert wurde.

import { geraetekostenJeStunde } from "./kalkulationsgrundlagen.js";
import { feiertage } from "./lohnvorerfassung.js";

// Vorschläge für Prüfarten mit üblichem Intervall. Das verbindliche Intervall
// ergibt sich aus Gefährdungsbeurteilung und Herstellerangaben (BetrSichV) —
// deshalb ist es je Gerät änderbar.
export const PRUEFARTEN = [
  { art: "uvv", label: "UVV-Prüfung", monate: 12 },
  { art: "hu", label: "Hauptuntersuchung", monate: 24 },
  { art: "elektro", label: "Elektroprüfung DGUV V3", monate: 12 },
  { art: "kran", label: "Kranprüfung", monate: 12 },
  { art: "wartung", label: "Wartung nach Hersteller", monate: 12 },
];
export const pruefLabel = art => PRUEFARTEN.find(p => p.art === art)?.label || art;

export const GERAETE_STATUS = {
  verfuegbar: "Bauhof",
  einsatz: "Auf Baustelle",
  werkstatt: "Werkstatt",
  ausgemustert: "Ausgemustert",
};

const r2 = n => Math.round(n * 100) / 100;
const tagMs = 86400000;
const datum = s => new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);

export function monateDazu(isoDatum, monate) {
  const d = datum(isoDatum);
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Number(monate || 0));
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return iso(d);
}

// Stand jeder Prüfung: überfällig, bald fällig (Vorlauf), ok oder offen
// (noch nie geprüft — gilt als fällig).
export function pruefStand(geraet, heute, vorlaufTage = 30) {
  return (geraet?.pruefungen || []).map(p => {
    const faellig = p.zuletzt ? monateDazu(p.zuletzt, p.intervall_monate) : null;
    const tage = faellig ? Math.round((datum(faellig) - datum(heute)) / tagMs) : null;
    const stand = !faellig ? "offen" : tage < 0 ? "ueberfaellig" : tage <= vorlaufTage ? "bald" : "ok";
    return { ...p, label: pruefLabel(p.art), faellig, tage, stand };
  }).sort((a, b) => (a.faellig || "0000") < (b.faellig || "0000") ? -1 : 1);
}

const RANG = { ueberfaellig: 0, offen: 1, bald: 2, ok: 3 };
// Die dringendste Prüfung eines Geräts (für Liste und Warnungen).
export function naechstePruefung(geraet, heute, vorlaufTage = 30) {
  const liste = pruefStand(geraet, heute, vorlaufTage);
  return liste.sort((a, b) => RANG[a.stand] - RANG[b.stand] || (a.tage ?? -1e9) - (b.tage ?? -1e9))[0] || null;
}

// Ein Gerät darf nicht eingesetzt werden, wenn eine Prüfung überfällig oder
// nie erfolgt ist (BetrSichV § 14) — die Planung warnt dann.
export function einsatzbereit(geraet, heute) {
  if (geraet?.status === "werkstatt" || geraet?.status === "ausgemustert") return false;
  return !pruefStand(geraet, heute).some(p => p.stand === "ueberfaellig" || p.stand === "offen");
}

// Umsetzen auf eine Baustelle (projektId) oder zurück auf den Bauhof (null).
// Schließt den laufenden Einsatz am Vortag ab, damit kein Tag doppelt zählt.
export function umsetzen(geraet, projektId, amIso) {
  const einsaetze = (geraet.einsaetze || []).map(e => ({ ...e }));
  const offen = einsaetze.find(e => !e.bis);
  if (offen && String(offen.projekt_id) === String(projektId ?? "")) return geraet;
  if (offen) {
    const vortag = iso(new Date(datum(amIso) - tagMs));
    if (vortag < offen.von) einsaetze.splice(einsaetze.indexOf(offen), 1); // am selben Tag zurückgenommen
    else offen.bis = vortag;
  }
  if (projektId != null && projektId !== "") einsaetze.push({ projekt_id: projektId, von: amIso, bis: null });
  return {
    ...geraet, einsaetze, projekt_id: projektId ?? null,
    status: projektId != null && projektId !== "" ? "einsatz" : geraet.status === "einsatz" ? "verfuegbar" : geraet.status,
  };
}

// Prüfung als erledigt eintragen.
export function pruefungErledigt(geraet, art, amIso) {
  return { ...geraet, pruefungen: (geraet.pruefungen || []).map(p => p.art === art ? { ...p, zuletzt: amIso } : p) };
}

export function arbeitstage(vonIso, bisIso, land = "NW") {
  if (!vonIso || !bisIso || bisIso < vonIso) return 0;
  const ft = {};
  let n = 0;
  for (let d = datum(vonIso); d <= datum(bisIso); d = new Date(+d + tagMs)) {
    const j = d.getUTCFullYear();
    if (!ft[j]) ft[j] = feiertage(j, land);
    const wt = d.getUTCDay();
    if (wt !== 0 && wt !== 6 && !ft[j][iso(d)]) n++;
  }
  return n;
}

export function tagessatz(geraet, grundlagen) {
  if (Number(geraet?.tagessatz) > 0) return Number(geraet.tagessatz);
  const g = (grundlagen?.geraete || []).find(x => String(x.id) === String(geraet?.grundlage_id));
  if (!g) return 0;
  return r2(geraetekostenJeStunde(g).gesamt * (Number(geraet?.stunden_je_tag) || 8));
}

// Interne Gerätemiete im Zeitraum [von, bis] je Baustelle und Gerät. Ein
// offener Einsatz läuft bis „bis“ (heute).
export function mieteJeBaustelle(geraete, grundlagen, { von, bis, land = "NW", projektId = null } = {}) {
  const zeilen = [];
  for (const g of geraete || []) {
    const satz = tagessatz(g, grundlagen);
    for (const e of g.einsaetze || []) {
      if (projektId != null && String(e.projekt_id) !== String(projektId)) continue;
      const a = e.von > (von || e.von) ? e.von : (von || e.von);
      const b = !e.bis ? bis : e.bis < bis ? e.bis : bis;
      const tage = arbeitstage(a, b, land);
      if (!tage) continue;
      zeilen.push({ projekt_id: e.projekt_id, geraet_id: g.id, bezeichnung: g.bezeichnung, inventarnr: g.inventarnr, von: a, bis: b, tage, satz, betrag: r2(tage * satz) });
    }
  }
  return zeilen;
}

export function summeMiete(zeilen) {
  return r2((zeilen || []).reduce((s, z) => s + z.betrag, 0));
}

export function neuesGeraet(teil = {}) {
  return {
    inventarnr: "", bezeichnung: "", kategorie: "", grundlage_id: null, tagessatz: null, stunden_je_tag: 8,
    status: "verfuegbar", projekt_id: null, pruefungen: [{ art: "uvv", intervall_monate: 12, zuletzt: null }],
    wartungen: [], einsaetze: [], notiz: "", ...teil,
  };
}
