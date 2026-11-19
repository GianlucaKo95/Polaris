// Controlling (Phase 6): Soll-Ist, Ergebnisprognose, Leistungsmeldung, Nachkalkulation.
//
// Begriffe wie in der Bauwirtschaft (KLR Bau):
//   Erlös (Bauleistung)  = Menge × Einheitspreis des Auftrags, nach Nachlass
//   Kalkulierte Kosten   = Einzelkosten der Auftragskalkulation (+ BGK aus der Endsumme)
//   Soll-Kosten          = Einzelkosten der Arbeitskalkulation (ohne sie: Auftragskalkulation)
//   Soll der Leistung    = Soll-Kosten je Einheit × aufgemessene Menge
//   Ist-Kosten           = gebuchte Kosten je Kostenart (Eingabe, Stunden aus der Zeiterfassung,
//                          NU-Kosten aus geprüften NU-Rechnungen)
//   Prognose             = Ist + Restkosten; Restkosten nach Plan oder hochgerechnet mit dem
//                          bisherigen Ist/Soll-Verhältnis je Kostenart ("Trend")
//
// Ergebnisbrücke (geht exakt auf):
//   kalkuliertes Ergebnis
//   + Arbeitskalkulation   (kalkulierte − Soll-Kosten auf LV-Menge)
//   + Mengen               (Mehr-/Mindererlös abzüglich Soll-Kosten der Mengenänderung)
//   + Nachträge            (Erlös − Soll-Kosten beauftragter, offene mit Wahrscheinlichkeit)
//   + Leistung             (Soll − Prognose der Kosten: Effizienz auf der Baustelle)
//   = Prognose-Ergebnis

import { ozNorm, rundeCent, rundeMenge, gpCent, upCent } from "./lvBaum.js";
import { standBerechnen, zuschlaegeNormalisieren, KOSTENARTEN, MITTELLOHN_ID } from "./rechenkern.js";
import { aufmassJePosition, schluessel, istBeauftragt } from "./abrechnung.js";

export const KOSTENARTEN_CO = [...KOSTENARTEN, "bgk"];
export const KOSTENART_CO_LABEL = { lohn: "Lohn", material: "Stoffe", geraet: "Geräte", fremd: "Nachunternehmer", sonstiges: "Sonstiges", bgk: "Baustellengemeinkosten" };
export const MIN_SOLL_ANTEIL = 0.1;   // Trend erst ab 10 % erbrachter Soll-Kosten
export const MIN_SOLL_STUNDEN = 40;
export const STANDARD_EINSTELLUNGEN = { methode: "plan", ntQuote: 50, prognoseMengen: {} };

const leer = () => Object.fromEntries(KOSTENARTEN_CO.map(k => [k, 0]));
const r2 = x => rundeCent(x);
const zaehlt = k => k.typ === "position" && k.art !== "bedarf" && k.art !== "alternativ";

// Soll/kalk-Kosten je Position eines Stands: Map knotenId → { ekJeMe{}, stundenJeMe }
function kostenJePosition(knoten, ansaetze, zuschlaege) {
  const r = standBerechnen(knoten, ansaetze, zuschlaege);
  const m = new Map();
  for (const k of knoten) {
    if (k.typ !== "position") continue;
    const e = r.je.get(k.id);
    // Festpreis ohne Ansätze: Kosten unbekannt → als Fremdleistung zum EP (kein Scheingewinn)
    const ohne = !e || !e.ansaetze;
    m.set(k.id, ohne
      ? { ekJeMe: { ...leer(), fremd: Number(upCent(k)) / 100 }, stundenJeMe: 0, geschaetzt: true }
      : { ekJeMe: { ...leer(), ...e.ekJeMe }, stundenJeMe: e.stundenJeMe, geschaetzt: false });
  }
  return { je: m, bgk: r.endsumme ? r.endsumme.bgk : 0, mittellohn: zuschlaegeNormalisieren(zuschlaege).mittellohn };
}

// Positionszuordnung zwischen Auftrag und Arbeitskalkulation: gleiche ID, sonst OZ
function zuordnung(von, nach) {
  const nachId = new Map(nach.map(k => [k.id, k]));
  const nachOz = new Map(nach.filter(k => k.typ === "position" && k.oz).map(k => [ozNorm(k.oz), k]));
  return k => nachId.get(k.id) || (k.oz ? nachOz.get(ozNorm(k.oz)) : null) || null;
}

const summeKosten = o => KOSTENARTEN_CO.reduce((s, k) => s + (o[k] || 0), 0);
const plus = (a, b, f = 1) => { for (const k of KOSTENARTEN_CO) a[k] += (b[k] || 0) * f; return a; };

// teile: { auftrag: {stand, knoten, ansaetze}, arbeit?: {...}, nachtraege: [{nachtrag, stand, knoten, ansaetze}] }
// ist: { lohn, material, geraet, fremd, sonstiges, bgk, stunden } (kumuliert)
export function controlling({ auftrag, arbeit = null, nachtraege = [], aufmass = [], ist = {}, einstellungen = {} }) {
  const e = { ...STANDARD_EINSTELLUNGEN, ...einstellungen, prognoseMengen: { ...(einstellungen.prognoseMengen || {}) } };
  const jePos = aufmassJePosition(aufmass);
  const kalk = kostenJePosition(auftrag.knoten, auftrag.ansaetze, auftrag.stand.zuschlaege);
  const soll = arbeit ? kostenJePosition(arbeit.knoten, arbeit.ansaetze, arbeit.stand.zuschlaege) : kalk;
  const finde = arbeit ? zuordnung(auftrag.knoten, arbeit.knoten) : k => k;
  const nachlassHaupt = (Number(auftrag.stand.nachlass) || 0) / 100;

  const positionen = [];
  const s = { erloesLv: 0, erloesKum: 0, erloesPrognose: 0, kalkLv: leer(), sollLv: leer(), sollKum: leer(), sollPrognose: leer(), stundenSollKum: 0, stundenSollGesamt: 0,
    ntErloes: 0, ntSoll: leer(), ntOffenErloes: 0, ntOffenSoll: leer(), geschaetzt: 0 };

  const posZeile = (k, stand, kj, sj, nachtrag, nachlass) => {
    const key = schluessel(stand.id, k.id);
    const mengeLv = rundeMenge(k.menge);
    const mengeKum = jePos.get(key)?.menge || 0;
    const vorgabe = e.prognoseMengen[key];
    const mengePrognose = vorgabe != null ? rundeMenge(vorgabe) : zaehlt(k) ? Math.max(mengeLv, mengeKum) : mengeKum;
    const up = Number(upCent(k)) / 100;
    const f = 1 - nachlass;
    const erl = m => (gpCent({ ...k, menge: m }) / 100) * f;
    const z = { key, standId: stand.id, knotenId: k.id, oz: k.oz || "", kurztext: k.kurztext || "", einheit: k.einheit || "", nachtrag: nachtrag ? { id: nachtrag.id, nummer: nachtrag.nummer } : null,
      mengeLv, mengeKum, mengePrognose, vorgabe: vorgabe != null, up, erloesLv: zaehlt(k) ? erl(mengeLv) : 0, erloesKum: erl(mengeKum), erloesPrognose: erl(mengePrognose),
      kalkJeMe: kj?.ekJeMe || leer(), sollJeMe: sj?.ekJeMe || kj?.ekJeMe || leer(), stundenJeMe: sj?.stundenJeMe ?? kj?.stundenJeMe ?? 0, geschaetzt: !!(sj || kj)?.geschaetzt };
    z.sollKum = summeKosten(z.sollJeMe) * mengeKum;
    z.sollPrognose = summeKosten(z.sollJeMe) * mengePrognose;
    z.db = z.erloesPrognose - z.sollPrognose;
    return z;
  };

  for (const k of auftrag.knoten) {
    if (k.typ !== "position") continue;
    const a = finde(k);
    const z = posZeile(k, auftrag.stand, kalk.je.get(k.id), a ? soll.je.get(a.id) : null, null, nachlassHaupt);
    positionen.push(z);
    s.erloesLv += z.erloesLv; s.erloesKum += z.erloesKum; s.erloesPrognose += z.erloesPrognose;
    if (zaehlt(k)) { plus(s.kalkLv, z.kalkJeMe, z.mengeLv); plus(s.sollLv, z.sollJeMe, z.mengeLv); s.stundenSollGesamt += z.stundenJeMe * z.mengePrognose; }
    plus(s.sollKum, z.sollJeMe, z.mengeKum); plus(s.sollPrognose, z.sollJeMe, z.mengePrognose);
    s.stundenSollKum += z.stundenJeMe * z.mengeKum;
    if (z.geschaetzt && z.mengePrognose) s.geschaetzt++;
  }

  // Nachträge: beauftragte voll, offene mit Wahrscheinlichkeit (nur Prognose, nicht Soll der Leistung)
  const quote = Math.min(1, Math.max(0, (Number(e.ntQuote) || 0) / 100));
  for (const t of nachtraege) {
    const n = t.nachtrag;
    if (["abgelehnt", "zurueckgezogen"].includes(n.status)) continue;
    const kj = kostenJePosition(t.knoten, t.ansaetze || [], t.stand.zuschlaege);
    const nl = (Number(t.stand.nachlass) || 0) / 100;
    const beauftragt = istBeauftragt(n);
    let erl = 0; const kost = leer();
    for (const k of t.knoten) {
      if (k.typ !== "position") continue;
      const z = posZeile(k, t.stand, kj.je.get(k.id), null, n, nl);
      if (beauftragt) {
        positionen.push(z);
        plus(s.sollKum, z.sollJeMe, z.mengeKum);
        s.erloesKum += z.erloesKum; s.stundenSollKum += z.stundenJeMe * z.mengeKum; s.stundenSollGesamt += z.stundenJeMe * z.mengePrognose;
      }
      erl += z.erloesPrognose; plus(kost, z.sollJeMe, z.mengePrognose);
    }
    // Beauftragter Betrag hat Vorrang vor dem LV des Nachtrags
    if (beauftragt && n.betrag_beauftragt != null) erl = Number(n.betrag_beauftragt);
    else if (!beauftragt && n.betrag_angeboten != null && !erl) erl = Number(n.betrag_angeboten);
    if (beauftragt) { s.ntErloes += erl; plus(s.ntSoll, kost); }
    else { s.ntOffenErloes += erl * quote; plus(s.ntOffenSoll, kost, quote); }
  }

  // BGK: Plan aus der Endsumme (Arbeitskalkulation, sonst Auftrag), Soll nach Leistungsfortschritt
  const bgkKalk = kalk.bgk || 0;
  const bgkSoll = arbeit ? soll.bgk || 0 : bgkKalk;
  const erloesGesamt = s.erloesPrognose + s.ntErloes;
  const fortschritt = erloesGesamt > 0 ? Math.min(1, s.erloesKum / erloesGesamt) : 0;
  s.kalkLv.bgk = bgkKalk; s.sollLv.bgk = bgkSoll; s.sollPrognose.bgk = bgkSoll; s.sollKum.bgk = bgkSoll * fortschritt;

  // Soll gesamt auf Prognosemengen inkl. Nachträgen
  const sollGesamt = leer();
  plus(sollGesamt, s.sollPrognose); plus(sollGesamt, s.ntSoll); plus(sollGesamt, s.ntOffenSoll);
  const sollKum = s.sollKum;

  // Ist: Lohn aus Stunden × Mittellohn, wenn kein Betrag eingegeben. Ohne Eingabe gilt Ist = Soll
  // (angenommen, nicht gebucht) — sonst wirkt ein Projekt ohne Buchungen wie ein Gewinn.
  const mittellohn = Number(soll.mittellohn) || Number(kalk.mittellohn) || 0;
  const gesetzt = v => v != null && v !== "" && Number.isFinite(Number(v));
  const istK = leer();
  const angenommen = new Set();
  const stundenIst = Number(ist.stunden) || 0;
  for (const k of KOSTENARTEN_CO) {
    if (gesetzt(ist[k])) istK[k] = Number(ist[k]);
    else if (k === "lohn" && stundenIst > 0) istK.lohn = stundenIst * mittellohn;
    else { istK[k] = sollKum[k]; if (sollKum[k]) angenommen.add(k); }
  }

  // Rest und Prognose je Kostenart
  const kostenarten = KOSTENARTEN_CO.map(ka => {
    const sk = sollKum[ka], sg = sollGesamt[ka], ik = istK[ka];
    const restPlan = Math.max(0, sg - sk);
    const faktor = sk > 0 && sg > 0 && sk / sg >= MIN_SOLL_ANTEIL ? ik / sk : null;
    const trend = e.methode === "trend" && faktor != null;
    const rest = trend ? restPlan * faktor : restPlan;
    const korrektur = Number(ist.restKorrektur?.[ka]) || 0;
    return { kostenart: ka, label: KOSTENART_CO_LABEL[ka], kalk: s.kalkLv[ka], sollLv: s.sollLv[ka], sollKum: sk, istKum: ik, abweichung: sk - ik, faktor,
      sollGesamt: sg, rest: rest + korrektur, prognose: ik + rest + korrektur, trend, angenommen: angenommen.has(ka) };
  });
  const sum = f => kostenarten.reduce((a, x) => a + x[f], 0);

  const kalkErgebnis = s.erloesLv - summeKosten(s.kalkLv);
  const K_s = summeKosten(s.sollLv);
  const K_sP = summeKosten(s.sollPrognose);
  const E_NT = s.ntErloes + s.ntOffenErloes;
  const K_NT = summeKosten(s.ntSoll) + summeKosten(s.ntOffenSoll);
  const K_P = sum("prognose");
  const bruecke = [
    { id: "kalk", label: "Kalkuliertes Ergebnis", wert: r2(kalkErgebnis), summe: true },
    { id: "arbeit", label: "Arbeitskalkulation", wert: r2(summeKosten(s.kalkLv) - K_s) },
    { id: "mengen", label: "Mengen", wert: r2((s.erloesPrognose - s.erloesLv) - (K_sP - K_s)) },
    { id: "nachtraege", label: "Nachträge", wert: r2(E_NT - K_NT) },
    { id: "leistung", label: "Leistung auf der Baustelle", wert: r2(sum("sollGesamt") - K_P) },
  ];
  const prognoseErgebnis = r2(s.erloesPrognose + E_NT - K_P);
  // Cent-Rest aus Rundungen in die Leistung legen, damit die Brücke exakt aufgeht
  const rest = r2(prognoseErgebnis - bruecke.reduce((a, b) => a + b.wert, 0));
  if (rest) bruecke[4].wert = r2(bruecke[4].wert + rest);
  bruecke.push({ id: "prognose", label: "Prognose", wert: prognoseErgebnis, summe: true });

  const istSumme = sum("istKum");
  const sollKumSumme = sum("sollKum");
  return {
    positionen,
    kostenarten,
    erloes: { lv: r2(s.erloesLv), kum: r2(s.erloesKum), prognoseHaupt: r2(s.erloesPrognose), nachtraege: r2(s.ntErloes), nachtraegeOffen: r2(s.ntOffenErloes), prognose: r2(s.erloesPrognose + E_NT) },
    kosten: { kalk: r2(summeKosten(s.kalkLv)), sollLv: r2(K_s), sollKum: r2(sollKumSumme), istKum: r2(istSumme), prognose: r2(K_P) },
    ergebnis: { kalkuliert: r2(kalkErgebnis), prognose: prognoseErgebnis, abweichung: r2(prognoseErgebnis - kalkErgebnis),
      kalkProzent: s.erloesLv ? kalkErgebnis / s.erloesLv : null, prognoseProzent: s.erloesPrognose + E_NT ? prognoseErgebnis / (s.erloesPrognose + E_NT) : null,
      leistungsergebnis: r2(s.erloesKum - istSumme), sollIst: r2(sollKumSumme - istSumme) },
    bruecke,
    stunden: { sollKum: Math.round(s.stundenSollKum * 10) / 10, sollGesamt: Math.round(s.stundenSollGesamt * 10) / 10, ist: stundenIst,
      faktor: s.stundenSollKum >= MIN_SOLL_STUNDEN && stundenIst > 0 ? stundenIst / s.stundenSollKum : null, mittellohn },
    fortschritt, geschaetzt: s.geschaetzt, methode: e.methode, istAngenommen: [...angenommen],
  };
}

// ── Ist aus Polaris-Daten ─────────────────────────────────────────────────

// NU-Kosten kumuliert: je Vergabe die letzte geprüfte NU-Rechnung (Leistung nach Nachlass, vor Einbehalt)
export function nuKostenAusRechnungen(nuRechnungen, { bis = null } = {}) {
  const jeVergabe = new Map();
  for (const r of nuRechnungen || []) {
    if (!["geprueft", "freigegeben", "bezahlt"].includes(r.status)) continue;
    if (bis && r.datum && r.datum > bis) continue;
    const wert = Number(r.pruefung?.summen?.nachNachlass);
    if (!Number.isFinite(wert)) continue;
    const alt = jeVergabe.get(r.vergabe_id);
    if (!alt || String(r.datum || r.eingang) >= String(alt.datum || alt.eingang)) jeVergabe.set(r.vergabe_id, { ...r, wert });
  }
  return r2([...jeVergabe.values()].reduce((s, r) => s + r.wert, 0));
}

// Zeitbuchungen (Polaris) → Stunden kumuliert bis Monatsende und je Monat
export function stundenAusZeitbuchungen(buchungen, { bis = null } = {}) {
  const jeMonat = new Map();
  let summe = 0;
  for (const z of buchungen || []) {
    if (z.status && z.status !== "abgeschlossen") continue;
    const tag = String(z.eingestempelt_at || z.datum || "").slice(0, 10);
    if (bis && tag > bis) continue;
    const h = (Number(z.netto_minuten) || 0) / 60;
    summe += h;
    const m = tag.slice(0, 7);
    jeMonat.set(m, (jeMonat.get(m) || 0) + h);
  }
  return { summe: Math.round(summe * 10) / 10, jeMonat: [...jeMonat.entries()].sort().map(([monat, h]) => ({ monat, stunden: Math.round(h * 10) / 10 })) };
}

export const monatsErster = d => `${String(d).slice(0, 7)}-01`;
export function monatsEnde(monat) {
  const [j, m] = String(monat).slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
}
export const monatName = m => new Date(`${String(m).slice(0, 7)}-15T12:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

// Werte, die beim Melden eingefroren werden
export function meldungWerte(c, { abgerechnet = 0 } = {}) {
  return {
    erloes: c.erloes, kosten: c.kosten, ergebnis: c.ergebnis, stunden: c.stunden, fortschritt: c.fortschritt, methode: c.methode,
    kostenarten: c.kostenarten.map(({ kostenart, sollKum, istKum, prognose }) => ({ kostenart, sollKum: r2(sollKum), istKum: r2(istKum), prognose: r2(prognose) })),
    bruecke: c.bruecke, abgerechnet: r2(abgerechnet), nichtAbgerechnet: r2(c.erloes.kum - abgerechnet),
  };
}

// Verlauf der Prognose aus gemeldeten Meldungen
export function verlauf(meldungen) {
  return (meldungen || []).filter(m => m.status === "gemeldet" && m.werte?.ergebnis).sort((a, b) => String(a.monat).localeCompare(String(b.monat)))
    .map(m => ({ monat: m.monat, prognose: m.werte.ergebnis.prognose, kalkuliert: m.werte.ergebnis.kalkuliert, leistung: m.werte.erloes.kum, ist: m.werte.kosten.istKum }));
}

// ── Nachkalkulation ───────────────────────────────────────────────────────

// Ansätze für einen Nachkalkulationsstand: Lohnstunden mit dem Ist-Faktor, sonst unverändert.
// Die Ansätze gehören zu den Knoten der Kopie (gleiche Reihenfolge wie die Vorlage).
export function nachkalkulationAnsaetze(ansaetze, faktor) {
  if (!faktor || !Number.isFinite(faktor)) return { aendern: [] };
  const f = Math.round(faktor * 1000) / 1000;
  const aendern = [];
  for (const a of ansaetze || []) {
    const istLohnStunde = a.kostenart === "lohn" && (a.ressource_id === MITTELLOHN_ID || String(a.einheit).toLowerCase() === "h");
    if (!istLohnStunde) continue;
    if (a.formel && String(a.formel).trim()) aendern.push({ id: a.id, felder: { formel: `(${a.formel})*${String(f).replace(".", ",")}`, kommentar: `Ist-Faktor ${String(f).replace(".", ",")}` } });
    else aendern.push({ id: a.id, felder: { menge_je_me: Math.round((Number(a.menge_je_me) || 0) * f * 10000) / 10000, kommentar: `Ist-Faktor ${String(f).replace(".", ",")}` } });
  }
  return { aendern };
}
