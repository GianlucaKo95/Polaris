// Sicherheiten (Bürgschaften, Bareinbehalte), Gewährleistung und Vertrags-
// fristen über alle Baustellen.
//
// Bezüge zur VOB/B (Stand 2016):
//   § 17 Abs. 6  Sicherheitseinbehalt höchstens 10 % je Zahlung, bis die
//                vereinbarte Sicherheitssumme erreicht ist
//   § 17 Abs. 8 Nr. 1  Vertragserfüllungssicherheit zurück nach Abnahme und
//                Stellung der Sicherheit für Mängelansprüche
//   § 17 Abs. 8 Nr. 2  nicht verwertete Sicherheit für Mängelansprüche nach
//                2 Jahren zurück, wenn nichts anderes vereinbart ist
//   § 13 Abs. 4  Verjährung der Mängelansprüche: Bauwerke 4 Jahre (BGB 5),
//                feuerberührte und wartungsbedürftige Anlagenteile 2 Jahre
//   § 16 Abs. 3  Schlusszahlung spätestens 30 Tage nach Zugang der
//                Schlussrechnung
// Was im Vertrag steht, geht vor: alle Fristen sind je Eintrag änderbar.

export const SICHERHEIT_ARTEN = [
  { art: "vertragserfuellung", label: "Vertragserfüllungsbürgschaft", hinweis: "üblich 5 % der Auftragssumme" },
  { art: "gewaehrleistung", label: "Gewährleistungsbürgschaft", hinweis: "üblich 3–5 % der Abrechnungssumme" },
  { art: "vorauszahlung", label: "Vorauszahlungsbürgschaft", hinweis: "in Höhe der Vorauszahlung" },
  { art: "abschlag", label: "Abschlagszahlungsbürgschaft", hinweis: "" },
  { art: "einbehalt", label: "Sicherheitseinbehalt (bar)", hinweis: "höchstens 10 % je Zahlung, § 17 Abs. 6 VOB/B" },
];
export const sicherheitLabel = art => SICHERHEIT_ARTEN.find(a => a.art === art)?.label || art;

export const FRIST_ARTEN = [
  { art: "gewaehrleistung", label: "Gewährleistung" },
  { art: "abnahme", label: "Abnahme" },
  { art: "schlusszahlung", label: "Schlusszahlung" },
  { art: "vertrag", label: "Vertragsfrist" },
  { art: "sonstig", label: "Sonstige Frist" },
];
export const fristLabel = art => FRIST_ARTEN.find(a => a.art === art)?.label || art;

const datum = s => new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);
const tagMs = 86400000;

export function plusMonate(isoDatum, monate) {
  const d = datum(isoDatum);
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.round(Number(monate) || 0));
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return iso(d);
}
export const plusTage = (isoDatum, n) => iso(new Date(+datum(isoDatum) + n * tagMs));

export function gewaehrleistungsEnde(abnahmeIso, jahre = 4) {
  return abnahmeIso ? plusMonate(abnahmeIso, Number(jahre) * 12) : null;
}

// Wann eine Bürgschaft zurückzufordern ist. Vereinbartes Datum geht vor.
export function rueckgabeDatum(s, { abnahme = null } = {}) {
  if (s?.rueckgabe_am) return s.rueckgabe_am;
  if (s?.art === "vertragserfuellung") return abnahme || null;
  if (s?.art === "gewaehrleistung" || s?.art === "einbehalt") return abnahme ? plusMonate(abnahme, 24) : null;
  return null;
}

// Avalprovision der Bürgschaften, die wir stellen: Betrag × Satz p. a.
export function avalkostenJahr(sicherheiten) {
  return Math.round((sicherheiten || [])
    .filter(s => s.richtung === "gestellt" && s.status !== "zurueck" && s.art !== "einbehalt")
    .reduce((sum, s) => sum + (Number(s.betrag) || 0) * (Number(s.aval_prozent) || 0) / 100, 0) * 100) / 100;
}

export function stand(datumIso, heute, vorlaufTage = 30) {
  if (!datumIso) return null;
  const tage = Math.round((datum(datumIso) - datum(heute)) / tagMs);
  return { tage, stand: tage < 0 ? "ueberfaellig" : tage <= vorlaufTage ? "bald" : "ok" };
}

// Alle Termine aus Fristen und Sicherheiten als eine Liste.
// abnahmeJeProjekt: { [projekt_id]: iso } (z. B. aus projekte.abschluss_datum)
export function terminListe({ fristen = [], sicherheiten = [], abnahmeJeProjekt = {}, heute, vorlaufTage = 30 }) {
  const t = [];
  const add = (e) => { const st = stand(e.datum, heute, e.vorlauf ?? vorlaufTage); if (st) t.push({ ...e, ...st }); };
  for (const f of fristen) {
    if (f.erledigt_am) continue;
    if (f.art === "gewaehrleistung") {
      const abnahme = f.abnahme_am || abnahmeJeProjekt[f.projekt_id];
      const ende = f.datum || gewaehrleistungsEnde(abnahme, f.jahre ?? 4);
      if (!ende) continue;
      // Begehung vor Ablauf: Mängel noch rechtzeitig feststellen (bei NU-Leistungen: gegenüber dem NU rügen)
      add({ datum: plusMonate(ende, -3), titel: `Begehung vor Gewährleistungsende${f.titel ? `: ${f.titel}` : ""}`, art: "begehung", projekt_id: f.projekt_id, quelle: { typ: "frist", id: f.id }, vorlauf: 30 });
      add({ datum: ende, titel: `Gewährleistung endet${f.titel ? `: ${f.titel}` : ""}`, art: "gewaehrleistung", projekt_id: f.projekt_id, quelle: { typ: "frist", id: f.id }, vorlauf: 90 });
      continue;
    }
    if (f.datum) add({ datum: f.datum, titel: f.titel || fristLabel(f.art), art: f.art, projekt_id: f.projekt_id, quelle: { typ: "frist", id: f.id }, vorlauf: f.erinnerung_tage ?? vorlaufTage });
  }
  for (const s of sicherheiten) {
    if (s.status === "zurueck") continue;
    const name = `${sicherheitLabel(s.art)}${s.partner ? ` ${s.richtung === "erhalten" ? "von" : "an"} ${s.partner}` : ""}`;
    if (s.befristet_bis) add({ datum: s.befristet_bis, titel: `${name} läuft ab`, art: "befristung", projekt_id: s.projekt_id, quelle: { typ: "sicherheit", id: s.id } });
    const r = rueckgabeDatum(s, { abnahme: abnahmeJeProjekt[s.projekt_id] });
    if (r && s.status !== "zurueckgefordert") {
      add({ datum: r, titel: s.richtung === "gestellt" ? `${name} zurückfordern` : `${name} zurückgeben`, art: "rueckgabe", projekt_id: s.projekt_id, quelle: { typ: "sicherheit", id: s.id } });
    }
  }
  return t.sort((a, b) => a.datum.localeCompare(b.datum));
}

export const dringend = (termine) => (termine || []).filter(t => t.stand !== "ok").length;

export function neueSicherheit(teil = {}) {
  return { projekt_id: null, art: "vertragserfuellung", richtung: "gestellt", partner: "", aussteller: "", nummer: "", betrag: null, prozent: null,
    ausgestellt_am: null, befristet_bis: null, rueckgabe_am: null, status: "gestellt", aval_prozent: null, notiz: "", ...teil };
}
export function neueFrist(teil = {}) {
  return { projekt_id: null, art: "gewaehrleistung", titel: "", datum: null, abnahme_am: null, jahre: 4, erinnerung_tage: 30, erledigt_am: null, notiz: "", ...teil };
}
