// Rechenkern der Ansatzkalkulation (Phase 2).
//
// Eine Position hat Ansätze (Tabelle kalk_ansaetze) JE MENGENEINHEIT:
//   { kostenart: lohn|material|geraet|fremd|sonstiges, ressource_id, bezeichnung,
//     einheit, menge_je_me | formel, faktor, preis }
// Kosten je ME eines Ansatzes = Menge je ME × Faktor × Preis. Lohnansätze
// rechnen in Stunden je ME; ressource_id "ml" nimmt den Mittellohn des Stands.
// Formeln nutzen die Variablen der Position (extra.variablen, z. B. d = 0,25).
//
// Zuschläge je Stand (kalk_staende.zuschlaege):
//   { modell: "saetze" | "endsumme",
//     saetze: { lohn, material, geraet, fremd, sonstiges }   // % auf die Einzelkosten
//     endsumme: { bgk: [{ bez, betrag }], agkProzent, wgProzent, umlageAuf: "lohn"|"alle" },
//     mittellohn }                                         // €/h (Kalkulationslohn)
//
// Endsumme (EFB 222): HK = Σ EKT + BGK; AGK = HK × AGK %; W+G = (HK + AGK) × W+G %;
// Angebotssumme = HK + AGK + W+G; Umlage = Angebotssumme − Σ EKT, als Satz auf
// den Lohn oder auf alle Kostenarten. Positionen ohne Ansätze oder mit
// manuellem EP sind Festpreise und tragen keine Umlage.
//
// EP kalkuliert = Σ Kostenart (EK je ME × (1 + Satz)), auf Cent. Die Summe der
// GP kann deshalb um Rundungscent von der rechnerischen Angebotssumme abweichen;
// sie wird ausgewiesen.

import { zeilenMenge, formelFehler, rezepturAufloesen, variablenWerte } from "../stammpositionen.js";
import { gpCent, rundeCent, neueId } from "./lvBaum.js";

export const KOSTENARTEN = ["lohn", "material", "geraet", "fremd", "sonstiges"];
export const KOSTENART_LABEL = { lohn: "Lohn", material: "Stoffe", geraet: "Geräte", fremd: "Nachunternehmer", sonstiges: "Sonstiges" };
export const MITTELLOHN_ID = "ml";

export const STANDARD_ZUSCHLAEGE = {
  modell: "saetze",
  saetze: { lohn: 0, material: 0, geraet: 0, fremd: 0, sonstiges: 0 },
  endsumme: { bgk: [], agkProzent: 0, wgProzent: 0, umlageAuf: "lohn" },
  mittellohn: 0,
};

export function zuschlaegeNormalisieren(z) {
  const s = STANDARD_ZUSCHLAEGE;
  return {
    modell: z?.modell === "endsumme" ? "endsumme" : "saetze",
    saetze: { ...s.saetze, ...(z?.saetze || {}) },
    endsumme: { ...s.endsumme, ...(z?.endsumme || {}), bgk: z?.endsumme?.bgk || [] },
    mittellohn: Number(z?.mittellohn) || 0,
  };
}

const zaehltInSumme = k => k?.typ === "position" && k.art !== "bedarf" && k.art !== "alternativ";

export function variablenVon(k) {
  const v = k?.extra?.variablen || {};
  return Object.fromEntries(Object.entries(v).map(([n, w]) => [n, Number(w) || 0]));
}

export function ansatzMenge(a, variablen = {}) {
  const basis = a?.formel && String(a.formel).trim() ? zeilenMenge({ formel: a.formel }, variablen) : Number(a?.menge_je_me) || 0;
  return basis * (a?.faktor == null || a.faktor === "" ? 1 : Number(a.faktor));
}

export function ansatzFormelFehler(a, variablen = {}) {
  if (!a?.formel || !String(a.formel).trim()) return null;
  const unbekannt = String(a.formel).replace(/\d+[.,]?\d*/g, " ").match(/[A-Za-zÄÖÜäöüß_]\w*/g)?.filter(n => !(n in variablen));
  if (unbekannt?.length) return `Unbekannte Variable: ${[...new Set(unbekannt)].join(", ")}`;
  return formelFehler({ formel: a.formel }, variablen);
}

export function ansatzPreis(a, z) {
  return a?.ressource_id === MITTELLOHN_ID ? Number(z?.mittellohn) || 0 : Number(a?.preis) || 0;
}

export function ansatzKostenJeMe(a, variablen, z) {
  return ansatzMenge(a, variablen) * ansatzPreis(a, z);
}

// Einzelkosten je ME einer Position nach Kostenart, Stunden je ME
export function positionEk(k, ansaetze, z) {
  const vars = variablenVon(k);
  const ekJeMe = Object.fromEntries(KOSTENARTEN.map(ka => [ka, 0]));
  let stundenJeMe = 0;
  const fehler = [];
  for (const a of ansaetze || []) {
    const ka = KOSTENARTEN.includes(a.kostenart) ? a.kostenart : "sonstiges";
    const f = ansatzFormelFehler(a, vars);
    if (f) fehler.push({ ansatzId: a.id, text: f });
    const menge = ansatzMenge(a, vars);
    ekJeMe[ka] += menge * ansatzPreis(a, z);
    if (ka === "lohn" && (a.ressource_id === MITTELLOHN_ID || String(a.einheit).toLowerCase() === "h")) stundenJeMe += menge;
  }
  const summeJeMe = KOSTENARTEN.reduce((s, ka) => s + ekJeMe[ka], 0);
  return { ekJeMe, stundenJeMe, summeJeMe, fehler };
}

export function epAusSaetzen(ekJeMe, saetze) {
  return rundeCent(KOSTENARTEN.reduce((s, ka) => s + (ekJeMe[ka] || 0) * (1 + (Number(saetze?.[ka]) || 0) / 100), 0));
}

const ansaetzeNachKnoten = ansaetze => {
  const m = new Map();
  for (const a of ansaetze || []) {
    if (!m.has(a.knoten_id)) m.set(a.knoten_id, []);
    m.get(a.knoten_id).push(a);
  }
  for (const l of m.values()) l.sort((x, y) => (x.sort - y.sort) || String(x.id).localeCompare(String(y.id)));
  return m;
};

export function istKalkuliert(k, ans) {
  return k?.typ === "position" && (ans?.length || 0) > 0 && !k.extra?.epManuell;
}

// Endsumme (EFB 222) aus den Einzelkosten
export function endsummeAusEkt(ekt, festpreise, es) {
  const ektSumme = KOSTENARTEN.reduce((s, ka) => s + (ekt[ka] || 0), 0);
  const bgk = (es?.bgk || []).reduce((s, b) => s + (Number(b.betrag) || 0), 0);
  const hk = ektSumme + bgk;
  const agk = hk * (Number(es?.agkProzent) || 0) / 100;
  const wg = (hk + agk) * (Number(es?.wgProzent) || 0) / 100;
  const angebotssumme = hk + agk + wg;
  const umlage = angebotssumme - ektSumme;
  const alle = es?.umlageAuf === "alle";
  const basis = alle ? ektSumme : ekt.lohn || 0;
  const satz = basis > 0 ? umlage / basis * 100 : null;
  return {
    ekt, ektSumme, bgk, hk, agk, wg, angebotssumme, umlage, festpreise, gesamt: angebotssumme + festpreise, umlageSatz: satz, umlageAuf: alle ? "alle" : "lohn",
    fehler: satz == null ? (alle ? "Noch keine kalkulierten Positionen." : "Keine Lohnkosten in den kalkulierten Positionen. Umlage auf alle Kostenarten wählen.") : null,
  };
}

export function saetzeAusEndsumme(e) {
  const s = Object.fromEntries(KOSTENARTEN.map(ka => [ka, 0]));
  if (e.umlageSatz == null) return s;
  const satz = Math.round(e.umlageSatz * 1e6) / 1e6;
  for (const ka of KOSTENARTEN) if (e.umlageAuf === "alle" || ka === "lohn") s[ka] = satz;
  return s;
}

// Ganzer Stand: Ergebnis je Position, Summen, wirksame Sätze, EP-Änderungen
export function standBerechnen(knoten, ansaetze, zRoh) {
  const z = zuschlaegeNormalisieren(zRoh);
  const nachKnoten = ansaetzeNachKnoten(ansaetze);
  const je = new Map();
  const ekt = Object.fromEntries(KOSTENARTEN.map(ka => [ka, 0]));
  let stunden = 0, festpreise = 0, festpreisPositionen = 0, kalkuliertePositionen = 0;
  const fehler = [];

  for (const k of knoten) {
    if (k.typ !== "position") continue;
    const ans = nachKnoten.get(k.id) || [];
    const r = positionEk(k, ans, z);
    const kalk = istKalkuliert(k, ans);
    je.set(k.id, { ...r, kalkuliert: kalk, ansaetze: ans.length });
    for (const f of r.fehler) fehler.push({ id: k.id, ...f });
    const menge = Number(k.menge) || 0;
    if (!zaehltInSumme(k)) continue;
    const rabatt = 1 - (Number(k.rabatt) || 0) / 100;
    if (kalk) {
      kalkuliertePositionen++;
      for (const ka of KOSTENARTEN) ekt[ka] += r.ekJeMe[ka] * menge * rabatt;
      stunden += r.stundenJeMe * menge * rabatt;
    } else {
      festpreisPositionen++;
      festpreise += gpCent(k) / 100;
    }
  }

  let endsumme = null, saetze;
  if (z.modell === "endsumme") {
    endsumme = endsummeAusEkt(ekt, festpreise, z.endsumme);
    saetze = saetzeAusEndsumme(endsumme);
  } else {
    saetze = { ...z.saetze };
  }

  const epAenderungen = [];
  let gpKalkuliert = 0;
  for (const k of knoten) {
    const r = je.get(k.id);
    if (!r) continue;
    r.epKalk = epAusSaetzen(r.ekJeMe, saetze);
    if (r.kalkuliert) {
      if (Math.round(r.epKalk * 100) !== Math.round((Number(k.ep) || 0) * 100)) epAenderungen.push({ id: k.id, felder: { ep: r.epKalk } });
      if (zaehltInSumme(k)) gpKalkuliert += gpCent({ ...k, ep: r.epKalk }) / 100;
    }
  }
  const ektSumme = KOSTENARTEN.reduce((s, ka) => s + ekt[ka], 0);
  const zielKalkuliert = endsumme ? endsumme.angebotssumme : KOSTENARTEN.reduce((s, ka) => s + ekt[ka] * (1 + (Number(saetze[ka]) || 0) / 100), 0);
  return {
    z, je, ekt, ektSumme, stunden, festpreise, festpreisPositionen, kalkuliertePositionen, saetze, endsumme,
    gpKalkuliert: rundeCent(gpKalkuliert), angebotssumme: rundeCent(gpKalkuliert + festpreise),
    rundungsdifferenz: rundeCent(gpKalkuliert - zielKalkuliert),
    deckung: rundeCent(gpKalkuliert - ektSumme),
    mittellohnIst: stunden ? ekt.lohn / stunden : 0,
    epAenderungen, fehler,
  };
}

// Zielpreis: wie müssen die Zuschläge aussehen, damit die Netto-Summe stimmt?
// Endsumme: W+G-Satz; Sätze: alle Sätze gleichmäßig skaliert (Faktor auf 1 + Satz).
// Wegen Cent-Rundung je EP wird anschließend nachjustiert.
export function zuschlaegeFuerZiel(knoten, ansaetze, zRoh, ziel) {
  const z = zuschlaegeNormalisieren(zRoh);
  const zielZahl = Number(ziel);
  if (!(zielZahl > 0)) return null;
  const summeBei = zz => standBerechnen(knoten, ansaetze, zz).angebotssumme;
  let kandidat;
  if (z.modell === "endsumme") {
    const basis = standBerechnen(knoten, ansaetze, { ...z, endsumme: { ...z.endsumme, wgProzent: 0 } });
    const hkAgk = basis.endsumme.hk + basis.endsumme.agk;
    if (!(hkAgk > 0)) return null;
    const wg = ((zielZahl - basis.festpreise) / hkAgk - 1) * 100;
    kandidat = p => ({ ...z, endsumme: { ...z.endsumme, wgProzent: Math.round(p * 10000) / 10000 } });
    return feinjustieren(kandidat, wg, summeBei, zielZahl);
  }
  const r = standBerechnen(knoten, ansaetze, z);
  const mitZuschlag = KOSTENARTEN.reduce((s, ka) => s + r.ekt[ka] * (1 + (Number(z.saetze[ka]) || 0) / 100), 0);
  if (!(mitZuschlag > 0)) return null;
  const faktor = (zielZahl - r.festpreise) / mitZuschlag;
  kandidat = f => ({ ...z, saetze: Object.fromEntries(KOSTENARTEN.map(ka => [ka, Math.round(((1 + (Number(z.saetze[ka]) || 0) / 100) * f - 1) * 1e6) / 1e4])) });
  return feinjustieren(kandidat, faktor, summeBei, zielZahl);
}

function feinjustieren(kandidat, start, summeBei, ziel) {
  let x = start, beste = kandidat(x), besteAbw = Math.abs(summeBei(beste) - ziel);
  for (let i = 0; i < 8 && besteAbw > 0.004; i++) {
    const s1 = summeBei(kandidat(x));
    const h = Math.abs(x) * 1e-4 || 1e-4;
    const s2 = summeBei(kandidat(x + h));
    if (s2 === s1) break;
    x = x + (ziel - s1) * h / (s2 - s1);
    const k = kandidat(x), abw = Math.abs(summeBei(k) - ziel);
    if (abw < besteAbw) { beste = k; besteAbw = abw; }
  }
  return { zuschlaege: beste, abweichung: rundeCent(summeBei(beste) - ziel) };
}

// ── Ressourcen und Preise ─────────────────────────────────────────────────

const KATEGORIE_ZU_KOSTENART = { lohn: "lohn", material: "material", geraet: "geraet", fremdleistung: "fremd", sonstiges: "sonstiges" };
export const kostenartAusKategorie = kat => KATEGORIE_ZU_KOSTENART[kat] || "sonstiges";

// Gesamtbedarf über den Stand: je Ressource Menge und Kosten
export function ressourcenListe(knoten, ansaetze, zRoh) {
  const z = zuschlaegeNormalisieren(zRoh);
  const nachId = new Map(knoten.map(k => [k.id, k]));
  const m = new Map();
  for (const a of ansaetze || []) {
    const k = nachId.get(a.knoten_id);
    if (!k || !zaehltInSumme(k)) continue; // auch bei manuellem EP: die Mengen sind real
    const schluessel = a.ressource_id ? `r:${a.ressource_id}` : `t:${a.kostenart}:${String(a.bezeichnung).trim().toLowerCase()}:${a.einheit}`;
    const menge = ansatzMenge(a, variablenVon(k)) * (Number(k.menge) || 0);
    const e = m.get(schluessel) || { schluessel, kostenart: a.kostenart, ressource_id: a.ressource_id || null,
      bezeichnung: a.ressource_id === MITTELLOHN_ID ? "Mittellohn" : a.bezeichnung, einheit: a.ressource_id === MITTELLOHN_ID ? "h" : a.einheit, menge: 0, kosten: 0, positionen: new Set() };
    e.menge += menge;
    e.kosten += menge * ansatzPreis(a, z);
    e.positionen.add(k.id);
    m.set(schluessel, e);
  }
  return [...m.values()].map(e => ({ ...e, positionen: e.positionen.size, preisMittel: e.menge ? e.kosten / e.menge : 0 }))
    .sort((a, b) => KOSTENARTEN.indexOf(a.kostenart) - KOSTENARTEN.indexOf(b.kostenart) || b.kosten - a.kosten);
}

// Preise der Ansätze mit den Stammdaten abgleichen: Liste der Abweichungen
// und die Änderungen, um sie zu übernehmen
export function preisabgleich(ansaetze, kalkulationspreise) {
  const nachId = new Map((kalkulationspreise || []).map(p => [String(p.id), p]));
  const abweichungen = [];
  for (const a of ansaetze || []) {
    if (!a.ressource_id || a.ressource_id === MITTELLOHN_ID) continue;
    const p = nachId.get(String(a.ressource_id));
    if (!p) continue;
    if (Math.abs((Number(p.preis) || 0) - (Number(a.preis) || 0)) > 0.00005) abweichungen.push({ id: a.id, bezeichnung: p.bezeichnung, alt: Number(a.preis) || 0, neu: Number(p.preis) || 0 });
  }
  return { abweichungen, aenderungen: abweichungen.map(x => ({ id: x.id, felder: { preis: x.neu } })) };
}

// ── Bausteine (Stammpositionen) ───────────────────────────────────────────

// Stammposition → Ansätze für eine Position (+ Variablen). Oberste
// Rezepturzeilen behalten ihre Formel; eingebettete Bausteine werden mit den
// aktuellen Variablenwerten aufgelöst.
export function bausteinZuAnsaetze(sp, { knotenId, stammpositionen = [], kalkulationspreise = [], startSort = 1024 } = {}) {
  const preise = new Map((kalkulationspreise || []).map(p => [String(p.id), p]));
  const variablen = variablenWerte(sp, null);
  const aus = [];
  let sort = startSort;
  const ansatz = (felder) => aus.push({ id: neueId(), knoten_id: knotenId, sort: (sort += 1024) - 1024, ressource_id: null, faktor: 1, formel: null, kommentar: "", menge_je_me: 0, ...felder });
  for (const zeile of sp?.rezeptur || []) {
    if (zeile.unterpositionId != null) {
      const unter = (stammpositionen || []).find(s => s.id === zeile.unterpositionId);
      if (!unter) continue;
      const faktor = zeilenMenge(zeile, variablen);
      const r = rezepturAufloesen(unter, stammpositionen, variablen, 1, [sp.id]);
      for (const z2 of r.zeilen) {
        const p = preise.get(String(z2.stammId));
        if (!p) continue;
        ansatz({ kostenart: kostenartAusKategorie(p.kategorie), ressource_id: String(p.id), bezeichnung: p.bezeichnung, einheit: p.einheit || "",
          menge_je_me: z2.mengeJeEinheit * faktor, preis: Number(p.preis) || 0, kommentar: `aus Baustein ${unter.bez}` });
      }
      if (r.fremdleistungJeEinheit) ansatz({ kostenart: "fremd", bezeichnung: `Nachunternehmer ${unter.bez}`, einheit: sp.einheit || "", menge_je_me: faktor, preis: r.fremdleistungJeEinheit });
      continue;
    }
    const p = preise.get(String(zeile.stammId));
    if (!p) continue;
    const formel = zeile.formel && String(zeile.formel).trim() ? String(zeile.formel) : null;
    ansatz({ kostenart: kostenartAusKategorie(p.kategorie), ressource_id: String(p.id), bezeichnung: p.bezeichnung, einheit: p.einheit || "",
      formel, menge_je_me: formel ? 0 : Number(zeile.mengeJeEinheit) || 0, preis: Number(p.preis) || 0 });
  }
  if (Number(sp?.fremdleistungJeEinheit)) ansatz({ kostenart: "fremd", bezeichnung: "Nachunternehmerleistung", einheit: sp.einheit || "", menge_je_me: 1, preis: Number(sp.fremdleistungJeEinheit) });
  return { ansaetze: aus, variablen: Object.keys(variablen).length ? variablen : null };
}

// Position mit Ansätzen → Stammposition. Nur Ansätze mit Stammdaten-Ressource
// lassen sich als Rezeptur speichern; NU-Ansätze werden zu fremdleistungJeEinheit.
export function ansaetzeZuBaustein(k, ansaetze) {
  const vars = variablenVon(k);
  const rezeptur = [];
  let fremd = 0;
  const uebersprungen = [];
  for (const a of ansaetze) {
    if (a.kostenart === "fremd" && !a.ressource_id) { fremd += ansatzMenge(a, vars) * (Number(a.preis) || 0); continue; }
    if (!a.ressource_id || a.ressource_id === MITTELLOHN_ID) { uebersprungen.push(a.bezeichnung || KOSTENART_LABEL[a.kostenart]); continue; }
    const id = Number.isFinite(Number(a.ressource_id)) ? Number(a.ressource_id) : a.ressource_id;
    const faktor = a.faktor == null ? 1 : Number(a.faktor);
    if (a.formel && String(a.formel).trim()) rezeptur.push({ stammId: id, formel: faktor === 1 ? a.formel : `(${a.formel}) * ${faktor}` });
    else rezeptur.push({ stammId: id, mengeJeEinheit: (Number(a.menge_je_me) || 0) * faktor });
  }
  const sp = {
    bez: k.kurztext, langtext: k.langtext || "", einheit: k.einheit || "",
    variablen: Object.entries(vars).map(([name, standard]) => ({ name, bez: name, standard })),
    rezeptur, ...(fremd ? { fremdleistungJeEinheit: Math.round(fremd * 10000) / 10000 } : {}),
  };
  return { stammposition: sp, uebersprungen };
}

// Alte Positionskalkulation (lib/kalkulation.js: Posten mit Mengen für die
// GANZE Position) → Ansätze je ME. Preise aus den Kalkulationspreisen.
export function altKalkZuAnsaetze(k, kalk, kalkulationspreise) {
  const menge = Number(k.menge) || 0;
  if (!kalk || !(menge > 0)) return [];
  const preise = new Map((kalkulationspreise || []).map(p => [String(p.id), p]));
  const aus = [];
  let sort = 0;
  const felder = [["lohnposten", "lohn"], ["materialposten", "material"], ["geraetPosten", "geraet"]];
  for (const [feld, ka] of felder) {
    for (const p of kalk[feld] || []) {
      const st = preise.get(String(p.stammId));
      aus.push({ id: neueId(), knoten_id: k.id, sort: (sort += 1024), kostenart: ka, ressource_id: st ? String(st.id) : null,
        bezeichnung: st?.bezeichnung || p.bez || KOSTENART_LABEL[ka], einheit: st?.einheit || p.einheit || "",
        menge_je_me: (Number(p.menge) || 0) / menge, faktor: 1, preis: Number(st?.preis ?? p.preis) || 0, formel: null, kommentar: "" });
    }
  }
  if (Number(kalk.fremdleistung)) aus.push({ id: neueId(), knoten_id: k.id, sort: (sort += 1024), kostenart: "fremd", ressource_id: null,
    bezeichnung: "Nachunternehmerleistung", einheit: k.einheit || "", menge_je_me: 1, faktor: 1, preis: Number(kalk.fremdleistung) / menge, formel: null, kommentar: "" });
  return aus;
}

// Sätze einer alten Positionskalkulation (für den Stand übernehmen)
export function saetzeAusAltKalk(kalk) {
  const gemeinsam = ["zuschlagGemeinkosten", "zuschlagWagnis", "zuschlagGewinn"].reduce((s, f) => s + (Number(kalk?.[f]) || 0), 0);
  const satz = f => (kalk?.[f] != null ? Number(kalk[f]) || 0 : gemeinsam);
  return { lohn: satz("zuschlagLohn"), material: satz("zuschlagMaterial"), geraet: satz("zuschlagGeraet"), fremd: satz("zuschlagFremdleistung"), sonstiges: 0 };
}

// ── Formblätter: Auswertung im Format von lib/efb.js (efbHtml) ─────────────
export function efbAuswertung(knoten, ansaetze, zRoh) {
  const r = standBerechnen(knoten, ansaetze, zRoh);
  const KA_EFB = { lohn: "lohn", material: "material", geraet: "geraet", fremd: "fremdleistung" };
  const summe = { ek: { lohn: 0, material: 0, geraet: 0, fremdleistung: 0 }, gesamt: { lohn: 0, material: 0, geraet: 0, fremdleistung: 0, sonstiges: 0 }, stunden: r.stunden };
  const zeilen = [];
  const warnungen = [];
  const lauf = [...knoten].filter(k => k.typ === "position");
  for (const k of lauf) {
    const e = r.je.get(k.id);
    const menge = Number(k.menge) || 0;
    if (!menge) continue;
    const rabatt = 1 - (Number(k.rabatt) || 0) / 100;
    const zaehlt = zaehltInSumme(k);
    if (!e?.kalkuliert) {
      const ep = (Number(k.ep) || 0) * rabatt;
      if (zaehlt) summe.gesamt.sonstiges += ep * menge;
      warnungen.push(`${k.oz ? k.oz + " " : ""}„${k.kurztext}“ ist nicht kalkuliert — EP steht vollständig unter Sonstiges.`);
      zeilen.push({ oz: k.oz || "", bez: k.kurztext, menge, einheit: k.einheit, zeitansatz: null, lohn: 0, material: 0, geraet: 0, fremdleistung: 0, sonstiges: ep, ep, kalkuliert: false });
      continue;
    }
    const je = { lohn: 0, material: 0, geraet: 0, fremdleistung: 0, sonstiges: 0 };
    for (const ka of KOSTENARTEN) {
      const mitZ = e.ekJeMe[ka] * (1 + (Number(r.saetze[ka]) || 0) / 100) * rabatt;
      const ziel = KA_EFB[ka] || "sonstiges";
      je[ziel] += mitZ;
      if (zaehlt) {
        if (KA_EFB[ka]) summe.ek[ziel] += e.ekJeMe[ka] * menge * rabatt;
        summe.gesamt[ziel] += mitZ * menge;
      }
    }
    zeilen.push({ oz: k.oz || "", bez: k.kurztext, menge, einheit: k.einheit, zeitansatz: e.stundenJeMe, ...je, ep: Number(k.ep) * rabatt, kalkuliert: true });
  }
  const zuschlagProzent = {};
  for (const ka of ["lohn", "material", "geraet", "fremdleistung"]) zuschlagProzent[ka] = summe.ek[ka] ? (summe.gesamt[ka] / summe.ek[ka] - 1) * 100 : 0;
  const mittellohn = summe.stunden ? summe.ek.lohn / summe.stunden : 0;
  const verrechnungslohn = summe.stunden ? summe.gesamt.lohn / summe.stunden : 0;
  if (summe.ek.lohn > 0 && !summe.stunden) warnungen.push("Lohnkosten ohne Stundenansätze (Mittellohn oder Einheit h) — Mittellohn nicht ermittelbar.");
  const endsumme = r.endsumme ? { ...r.endsumme, ekt: { lohn: r.ekt.lohn, material: r.ekt.material, geraet: r.ekt.geraet, fremdleistung: r.ekt.fremd + r.ekt.sonstiges } } : null;
  return { zeilen, summe, zuschlagProzent, mittellohn, verrechnungslohn, angebotssumme: r.angebotssumme, warnungen, endsumme };
}
