// AVA und Vergabe (Phase 4).
//
// Ein Vergabepaket (Tabelle kalk_vergaben) bündelt
//   - art "nu":        LV-Positionen eines Stands, die an einen Nachunternehmer gehen
//   - art "lieferant": Ressourcen (Stoffe, Geräte) aus den Ansätzen des Stands
// und hält eine Momentaufnahme der Zeilen mit dem Budget aus der Kalkulation:
//   zeile = { key, knotenId | ressourceId, oz, kurztext, langtext, menge, einheit,
//             budgetEp, budgetQuelle ("ek" | "ep" | "mittel"), inSumme, kostenart }
// NU-Budget ist der Einzelkostenansatz je ME (was die Leistung uns kosten darf),
// bei Festpreis-Positionen ohne Ansätze der EP nach Rabatt.
//
// Bieter: { id, name, email, status ("offen"|"angefragt"|"abgegeben"|"abgesagt"),
//           eingang, preise: { [key]: ep }, hinweise: { [key]: text }, nachlass,
//           skonto, vorbehalte: [], nebenangebote: [{ titel, betrag, text }], quelle }
//
// Wertung (wie bei VOB/A üblich): Summe nach Nachlass; fehlende Preise werden
// mit dem höchsten Preis der anderen Bieter (sonst dem Budget) aufgefüllt, damit
// ein unvollständiges Angebot nicht billiger wirkt, als es ist. Skonto wird
// ausgewiesen, aber nicht gewertet.
// Rechenregel wie überall: GP = Menge × EP auf Cent, Summen aus Cent.

import { baumIndex, nachfahren, inSumme as zaehltInSumme, gpCent as gpCentLv, rundeCent, rundeMenge, neueId, ozNorm } from "./lvBaum.js";
import { standBerechnen, ressourcenListe, KOSTENART_LABEL } from "./rechenkern.js";
import { knotenZuFlach } from "./lvFlach.js";
import { gaebX84Schreiben } from "../gaebX84.js";
import { aehnlichkeit, einheitNormalisieren } from "../katalog.js";
import { druckTexte } from "./angebotDruck.js";

export const VERGABE_STATUS = ["entwurf", "angefragt", "ausgewertet", "vergeben", "aufgehoben"];
export const VERGABE_STATUS_LABEL = { entwurf: "Entwurf", angefragt: "Angefragt", ausgewertet: "Ausgewertet", vergeben: "Vergeben", aufgehoben: "Aufgehoben" };
export const BIETER_STATUS_LABEL = { offen: "Nicht angefragt", angefragt: "Angefragt", abgegeben: "Angebot da", abgesagt: "Abgesagt" };
export const AUSREISSER = 0.3;      // ±30 % vom Median
export const SPEKULATION = 0.5;     // unter 50 % des Medians: Spekulationspreis?

const gpCent = (menge, ep) => gpCentLv({ typ: "position", menge, ep, rabatt: 0 });
const eur = c => c / 100;
const median = l => {
  if (!l.length) return null;
  const s = [...l].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── Zeilen aus dem Stand ──────────────────────────────────────────────────

// Ausgewählte Knoten (Titel oder Positionen) → Positions-IDs in LV-Reihenfolge
export function positionenAusAuswahl(knoten, ids) {
  const index = baumIndex(knoten);
  const gewaehlt = new Set();
  for (const id of ids || []) {
    const k = index.nachId.get(id);
    if (!k) continue;
    if (k.typ === "position") gewaehlt.add(id);
    else for (const n of nachfahren(knoten, id, index)) if (index.nachId.get(n)?.typ === "position") gewaehlt.add(n);
  }
  const reihenfolge = [];
  const lauf = parent => { for (const k of index.kinderVon(parent)) { if (gewaehlt.has(k.id)) reihenfolge.push(k.id); lauf(k.id); } };
  lauf(null);
  return reihenfolge;
}

export function zeilenNu(knoten, ansaetze, z, ids) {
  const r = standBerechnen(knoten, ansaetze, z);
  const nachId = new Map(knoten.map(k => [k.id, k]));
  return positionenAusAuswahl(knoten, ids).map(id => {
    const k = nachId.get(id);
    const je = r.je.get(id);
    const kalk = je?.kalkuliert;
    const budgetEp = kalk ? rundeCent(je.summeJeMe) : rundeCent((Number(k.ep) || 0) * (1 - (Number(k.rabatt) || 0) / 100));
    return { key: id, knotenId: id, oz: k.oz || "", kurztext: k.kurztext || "", langtext: k.langtext || "", menge: rundeMenge(k.menge),
      einheit: k.einheit || "", budgetEp, budgetQuelle: kalk ? "ek" : "ep", inSumme: zaehltInSumme(k) };
  });
}

// Ressourcen (Stoffe/Geräte/Sonstiges) zum Anfragen bei Lieferanten
export function ressourcenFuerAnfrage(knoten, ansaetze, z) {
  return ressourcenListe(knoten, ansaetze, z).filter(r => ["material", "geraet", "sonstiges"].includes(r.kostenart) && r.menge > 0);
}

export function zeilenLieferant(knoten, ansaetze, z, schluessel) {
  const alle = new Map(ressourcenListe(knoten, ansaetze, z).map(r => [r.schluessel, r]));
  return (schluessel || []).map(s => alle.get(s)).filter(Boolean).map(r => ({
    key: r.schluessel, ressourceId: r.ressource_id, oz: "", kurztext: r.bezeichnung || KOSTENART_LABEL[r.kostenart], langtext: "",
    menge: Math.ceil(r.menge * 100 - 1e-9) / 100, einheit: r.einheit || "", budgetEp: Math.round(r.preisMittel * 10000) / 10000,
    budgetQuelle: "mittel", inSumme: true, kostenart: r.kostenart,
  }));
}

export function neueVergabe({ art = "nu", titel = "", zeilen = [], standId = null, nummer = 1 } = {}) {
  return { id: neueId(), art, titel, nummer, stand_id: standId, status: "entwurf", frist: null, zeilen, bieter: [], vergeben_an: null,
    vergeben_am: null, vergabe_summe: null, budget_summe: budgetSumme(zeilen), auftrag: {}, notiz: "" };
}

export function neuerBieter(felder = {}) {
  return { id: neueId(), name: "", email: "", status: "offen", eingang: null, preise: {}, hinweise: {}, nachlass: 0, skonto: 0, vorbehalte: [], nebenangebote: [], quelle: "manuell", ...felder };
}

// ── Summen und Wertung ─────────────────────────────────────────────────────

export function budgetSumme(zeilen) {
  return eur((zeilen || []).reduce((s, z) => s + (z.inSumme === false ? 0 : gpCent(z.menge, z.budgetEp)), 0));
}

const hatPreis = (b, key) => b?.preise && b.preise[key] != null && b.preise[key] !== "" && Number.isFinite(Number(b.preise[key]));

// Rechnerisch nach VOB/A § 16c Abs. 2: Menge × EP, der Einheitspreis ist maßgebend.
// Hat der Bieter Positionen nur mit EP angeboten (nurEp), steht zusätzlich seine
// eigene Summe ohne diese Positionen da — die Differenz ist aufzuklären.
export function bieterSumme(zeilen, b) {
  let bruttoC = 0, nurEpC = 0;
  const fehlend = [], nurEp = [];
  for (const z of zeilen || []) {
    if (!hatPreis(b, z.key)) { if (z.inSumme !== false) fehlend.push(z.key); continue; }
    if (z.inSumme === false) continue;
    const c = gpCent(z.menge, b.preise[z.key]);
    bruttoC += c;
    if (b.nurEp?.[z.key]) { nurEpC += c; nurEp.push(z.key); }
  }
  const nachlassC = Math.round(bruttoC * (Number(b?.nachlass) || 0) / 100);
  const nettoC = bruttoC - nachlassC;
  const skontoC = Math.round(nettoC * (Number(b?.skonto) || 0) / 100);
  return { brutto: eur(bruttoC), nachlass: eur(nachlassC), netto: eur(nettoC), skonto: eur(skontoC), nachSkonto: eur(nettoC - skontoC), fehlend, vollstaendig: fehlend.length === 0,
    nurEp, nurEpBetrag: eur(nurEpC), bruttoLautBieter: eur(bruttoC - nurEpC) };
}

const hatPreise = b => Object.keys(b?.preise || {}).some(k => hatPreis(b, k));
export const gewerteteBieter = v => (v?.bieter || []).filter(b => b.status !== "abgesagt" && hatPreise(b));

// Preisspiegel: je Zeile alle Preise, Min, Median, Ausreißer; je Bieter Summe, Wertung, Rang
// Spalten: alle Bieter außer Absagen (auch ohne Preise, zum Eintippen);
// gewertet und gerankt werden nur Bieter mit Preisen.
export function preisspiegel(v) {
  const bieter = (v?.bieter || []).filter(b => b.status !== "abgesagt");
  const zeilen = (v?.zeilen || []).map(z => {
    const preise = bieter.map(b => (hatPreis(b, z.key) ? Number(b.preise[z.key]) : null));
    const gueltig = preise.filter(p => p != null);
    const min = gueltig.length ? Math.min(...gueltig) : null;
    const max = gueltig.length ? Math.max(...gueltig) : null;
    const med = median(gueltig);
    const ausreisser = preise.map(p => (p != null && med > 0 && gueltig.length >= 3 && Math.abs(p - med) / med > AUSREISSER ? (p > med ? "hoch" : "niedrig") : null));
    const spekulation = preise.map(p => (p != null && med > 0 && gueltig.length >= 3 && p < med * SPEKULATION));
    const budgetAbw = preise.map(p => (p != null && z.budgetEp > 0 ? (p - z.budgetEp) / z.budgetEp : null));
    return { ...z, preise, min, max, median: med, minIndex: min == null ? -1 : preise.indexOf(min), ausreisser, spekulation, budgetAbw };
  });
  const budget = budgetSumme(v?.zeilen);
  const auswertung = bieter.map((b, i) => {
    const s = bieterSumme(v.zeilen, b);
    // Wertung: fehlende Preise mit dem Höchstpreis der anderen (sonst Budget) auffüllen
    let auffuellC = 0;
    for (const z of zeilen) {
      if (z.inSumme === false || z.preise[i] != null) continue;
      const andere = z.preise.filter((p, j) => j !== i && p != null);
      auffuellC += gpCent(z.menge, andere.length ? Math.max(...andere) : z.budgetEp);
    }
    const auffuellNachNachlass = auffuellC - Math.round(auffuellC * (Number(b.nachlass) || 0) / 100);
    const wertung = rundeCent(s.netto + eur(auffuellNachNachlass));
    const neben = (b.nebenangebote || []).filter(n => Number.isFinite(Number(n.betrag)) && n.betrag !== "");
    return { id: b.id, name: b.name, ...s, wertung, gewertet: hatPreise(b), rang: null, aufgefuellt: eur(auffuellNachNachlass),
      gegenBudget: budget > 0 ? (s.netto - budget) / budget : null,
      vorbehalte: b.vorbehalte || [], nebenangebote: neben,
      ausreisser: zeilen.filter(z => z.ausreisser[i]).length, spekulation: zeilen.filter(z => z.spekulation[i]).map(z => z.key) };
  });
  const sortiert = auswertung.filter(a => a.gewertet).sort((a, b) => a.wertung - b.wertung);
  sortiert.forEach((a, r) => { a.rang = r + 1; });
  return { bieter: auswertung, zeilen, budget, guenstigster: sortiert[0]?.id || null };
}

// Deterministischer Vergabevorschlag mit Begründung — keine KI nötig
export function vergabeVorschlag(v) {
  const ps = preisspiegel(v);
  if (!ps.bieter.some(b => b.gewertet)) return { bieterId: null, gruende: [], warnungen: ["Noch keine Angebote mit Preisen."], spiegel: ps };
  const rang = ps.bieter.filter(b => b.gewertet).sort((a, b) => a.rang - b.rang);
  const best = rang[0];
  const gruende = [];
  const warnungen = [];
  gruende.push(`Niedrigste Wertungssumme: ${eurText(best.wertung)} netto${rang[1] ? `, ${prozent((rang[1].wertung - best.wertung) / best.wertung)} unter ${rang[1].name || "Bieter 2"}` : ""}.`);
  if (ps.budget > 0) {
    const d = best.wertung - ps.budget;
    (d <= 0 ? gruende : warnungen).push(d <= 0 ? `${eurText(-d)} unter dem Budget aus der Kalkulation (${eurText(ps.budget)}).` : `${eurText(d)} über dem Budget aus der Kalkulation (${eurText(ps.budget)}, ${prozent(d / ps.budget)}).`);
  }
  if (!best.vollstaendig) warnungen.push(`${best.fehlend.length} Positionen ohne Preis; in der Wertung mit dem Höchstpreis der anderen Bieter aufgefüllt (${eurText(best.aufgefuellt)}).`);
  if (best.vorbehalte.length) warnungen.push(`Vorbehalte: ${best.vorbehalte.join("; ")}.`);
  for (const x of rang.filter(x => x.nurEp?.length)) warnungen.push(`${x.name || "Bieter"}: ${x.nurEp.length} Positionen nur mit Einheitspreis, ohne Gesamtbetrag (${eurText(x.nurEpBetrag)}). Summe laut Bieter ${eurText(x.bruttoLautBieter)}, rechnerisch ${eurText(x.brutto)}. Nach VOB/A § 16c gilt der Einheitspreis; aufklären, ob die Leistungen enthalten sind.`);
  if (best.spekulation.length) warnungen.push(`${best.spekulation.length} Preise unter der Hälfte des Medians (Spekulationspreise prüfen, besonders bei Mengenrisiko).`);
  if (rang[1] && best.netto > rang[1].netto && best.wertung < rang[1].wertung) gruende.push("Ein anderer Bieter ist auf dem Papier billiger, hat aber Lücken.");
  if (best.skonto > 0) gruende.push(`Zusätzlich ${eurText(best.skonto)} Skonto möglich (nicht gewertet).`);
  return { bieterId: best.id, gruende, warnungen, spiegel: ps };
}

const eurText = x => `${(Number(x) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const prozent = x => `${(Math.abs(x) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;

// Vergeben: einfrieren der Summe; wahl = { [key]: bieterId } für Teilvergaben (optional)
export function vergeben(v, bieterId, { jetzt = new Date().toISOString(), bedingungen } = {}) {
  const b = (v.bieter || []).find(x => x.id === bieterId);
  if (!b) throw new Error("Bieter nicht gefunden");
  const s = bieterSumme(v.zeilen, b);
  return { ...v, status: "vergeben", vergeben_an: bieterId, vergeben_am: jetzt, vergabe_summe: s.netto, budget_summe: budgetSumme(v.zeilen),
    auftrag: { ...(v.auftrag || {}), ...(bedingungen != null ? { bedingungen } : {}), nummer: v.auftrag?.nummer || `${v.art === "lieferant" ? "B" : "NU"}-${String(v.nummer).padStart(3, "0")}` } };
}

// Vergaben eines Projekts gegen das Budget (für die Übersicht und später das Controlling)
export function vergabeUebersicht(vergaben) {
  const aktiv = (vergaben || []).filter(v => v.status !== "aufgehoben");
  const vergebenListe = aktiv.filter(v => v.status === "vergeben");
  const budget = rundeCent(aktiv.reduce((s, v) => s + (Number(v.budget_summe) || budgetSumme(v.zeilen)), 0));
  const budgetVergeben = rundeCent(vergebenListe.reduce((s, v) => s + (Number(v.budget_summe) || 0), 0));
  const vergeben = rundeCent(vergebenListe.reduce((s, v) => s + (Number(v.vergabe_summe) || 0), 0));
  return { anzahl: aktiv.length, vergebenAnzahl: vergebenListe.length, budget, budgetVergeben, vergeben, ergebnis: rundeCent(budgetVergeben - vergeben) };
}

// ── Bieterpreise zuordnen (GAEB X84/D84 oder KI) ───────────────────────────


// positionen: [{ oz, bez|kurztext, einheit, ep, quellPosId? }] → { preise, hinweise, zugeordnet, nichtZugeordnet }
export function preiseZuordnen(zeilen, positionen) {
  const preise = {};
  const hinweise = {};
  const nurEp = {};
  const frei = (positionen || []).filter(p => Number(p.ep) > 0 && !String(p.bez || "").startsWith("──"));
  const benutzt = new Set();
  const nachOz = new Map();
  for (const p of frei) if (p.oz) nachOz.set(ozNorm(p.oz), p);
  for (const z of zeilen || []) {
    let t = frei.find(p => p.quellPosId != null && String(p.quellPosId) === String(z.knotenId ?? z.key));
    if (!t && z.oz) t = nachOz.get(ozNorm(z.oz));
    if (!t) {
      let best = 0.6;
      for (const p of frei) {
        if (benutzt.has(p) || einheitNormalisieren(p.einheit) !== einheitNormalisieren(z.einheit)) continue;
        const s = aehnlichkeit(z.kurztext, p.bez || p.kurztext || "");
        if (s >= best) { best = s; t = p; }
      }
    }
    if (!t || benutzt.has(t)) continue;
    benutzt.add(t);
    preise[z.key] = rundeCent(t.ep);
    if (t.hinweis) hinweise[z.key] = String(t.hinweis);
    if (t.nurEp && z.inSumme !== false) nurEp[z.key] = true;
  }
  return { preise, hinweise, nurEp, zugeordnet: Object.keys(preise).length, nichtZugeordnet: frei.length - benutzt.size };
}

// GAEB 90 D84/D86 (parseGaeb90Preise) → Positionen für preiseZuordnen. EP ohne
// Gesamtbetrag (GP 0) heißt: der Bieter nennt den Preis, nimmt die Position aber
// nicht in seine Summe (Stundenlohn, Zulagen, eigene Alternativen …).
export const d84ZuPositionen = ({ preise }) => (preise || []).map(p => ({ oz: p.oz, ep: p.ep, gp: p.gp, nurEp: p.ep > 0 && !p.gp }));

// Paketzeilen im Format, das angebotEinlesen.js (KI) erwartet
export const zeilenFuerKi = zeilen => (zeilen || []).map(z => ({ id: z.key, oz: z.oz, bez: z.kurztext, menge: z.menge, einheit: z.einheit }));

// Ergebnis von nuAngebotEinlesen → Bieterfelder
export function kiErgebnisZuBieter(zeilen, e) {
  const { preise, hinweise } = preiseZuordnen(zeilen, e.positionen);
  return { name: e.name, preise, hinweise, vorbehalte: e.vorbehalte || [], status: "abgegeben", quelle: "ki",
    kiPruefung: { summe: e.summe, nichtAngeboten: e.nichtAngeboten || [] } };
}

// Lieferantenergebnis (lieferantenangebotEinlesen: Artikel mit Baustein und
// Preis je Baustein-Einheit) → Bieterfelder
export function lieferantErgebnisZuBieter(zeilen, e) {
  const preise = {};
  const hinweise = {};
  for (const a of e?.artikel || []) {
    const z = (zeilen || []).find(x => x.ressourceId != null && a.bausteinId != null && String(x.ressourceId) === String(a.bausteinId));
    if (!z || !(Number(a.preisJeBaustein) > 0) || preise[z.key] != null) continue;
    preise[z.key] = Math.round(Number(a.preisJeBaustein) * 10000) / 10000;
    hinweise[z.key] = [a.text, a.umrechnung].filter(Boolean).join(" · ");
  }
  return { name: e?.lieferant || "Lieferant", preise, hinweise, vorbehalte: e?.vorbehalte || [], status: "abgegeben", quelle: "ki",
    ...(e?.datum ? { eingang: e.datum } : {}) };
}

// ── Übernahme in die Kalkulation ──────────────────────────────────────────

// Liefert ein Änderungspaket für useLvStand (ein Rückgängig-Schritt).
// NU: Ansätze der Position werden durch einen Fremdleistungs-Ansatz zum
// Bieterpreis nach Nachlass ersetzt; ein fester EP (epManuell) entfällt.
// Lieferant: Preis aller Ansätze dieser Ressource wird auf den Bieterpreis gesetzt.
export function inKalkulationUebernehmen(v, knoten, ansaetze, { bieterId = v.vergeben_an, wahl = null } = {}) {
  const bieterVon = key => (v.bieter || []).find(b => b.id === (wahl?.[key] || bieterId));
  const paket = { aendern: [], ansaetze: { neu: [], aendern: [], loeschen: [] } };
  // Zielstand kann eine Kopie sein (neue IDs): dann über die OZ zuordnen
  const nachId = new Map(knoten.map(k => [k.id, k]));
  const nachOz = new Map(knoten.filter(k => k.typ === "position" && k.oz).map(k => [ozNorm(k.oz), k]));
  let anzahl = 0;
  for (const z of v.zeilen || []) {
    const b = bieterVon(z.key);
    if (!b || !hatPreis(b, z.key)) continue;
    const preis = Math.round(Number(b.preise[z.key]) * (1 - (Number(b.nachlass) || 0) / 100) * 10000) / 10000;
    if (v.art === "nu") {
      const k = nachId.get(z.knotenId) || (z.oz ? nachOz.get(ozNorm(z.oz)) : null);
      if (!k) continue;
      paket.ansaetze.loeschen.push(...ansaetze.filter(a => a.knoten_id === k.id).map(a => a.id));
      paket.ansaetze.neu.push({ id: neueId(), knoten_id: k.id, sort: 1024, kostenart: "fremd", ressource_id: null, bezeichnung: `NU ${b.name}`.trim(),
        einheit: k.einheit || "", menge_je_me: 1, faktor: 1, preis, formel: null, kommentar: `Vergabe ${v.titel || v.nummer}` });
      const extra = { ...(k.extra || {}), vergabe: { id: v.id, bieter: b.name, ep: preis } };
      delete extra.epManuell;
      paket.aendern.push({ id: k.id, felder: { extra } });
      anzahl++;
    } else {
      const treffer = ansaetze.filter(a => (z.ressourceId ? String(a.ressource_id) === String(z.ressourceId)
        : `t:${a.kostenart}:${String(a.bezeichnung).trim().toLowerCase()}:${a.einheit}` === z.key));
      for (const a of treffer) if (Math.abs((Number(a.preis) || 0) - preis) > 0.00005) paket.ansaetze.aendern.push({ id: a.id, felder: { preis, kommentar: `Lieferant ${b.name}` } });
      if (treffer.length) anzahl++;
    }
  }
  return { paket, anzahl };
}

// ── Export: Anfrage (X83), Auftrag (X86), Druck ───────────────────────────

// Teil-LV des Pakets: Positionen mit ihren Titeln, Preise aus dem Bieter (oder leer)
function paketKnoten(v, knoten, bieter = null) {
  const index = baumIndex(knoten);
  const behalten = new Set();
  for (const z of v.zeilen || []) {
    let k = index.nachId.get(z.knotenId);
    if (!k) continue;
    behalten.add(k.id);
    // Unterbeschreibungen der Position mitnehmen
    const geschwister = index.kinderVon(k.parent_id ?? null);
    for (let i = geschwister.indexOf(k) + 1; i < geschwister.length && geschwister[i].typ === "hinweis" && geschwister[i].extra?.unterbeschreibung; i++) behalten.add(geschwister[i].id);
    while (k.parent_id) { k = index.nachId.get(k.parent_id); if (!k) break; behalten.add(k.id); }
  }
  const nachKey = new Map((v.zeilen || []).map(z => [z.knotenId, z]));
  return knoten.filter(k => behalten.has(k.id)).map(k => {
    if (k.typ !== "position") return k;
    const z = nachKey.get(k.id);
    const ep = bieter && hatPreis(bieter, z.key) ? Number(bieter.preise[z.key]) : 0;
    return { ...k, menge: z.menge, ep, rabatt: bieter ? Number(bieter.nachlass) || 0 : 0 };
  });
}

export function anfrageGaeb(v, knoten, { projektTitel = "" } = {}) {
  if (v.art !== "nu") throw new Error("GAEB-Anfragen gibt es für NU-Pakete");
  return gaebX84Schreiben(knotenZuFlach(paketKnoten(v, knoten)), { projektTitel: [projektTitel, v.titel].filter(Boolean).join(" – "), phase: 83 });
}

export function auftragGaeb(v, knoten, { projektTitel = "" } = {}) {
  const b = (v.bieter || []).find(x => x.id === v.vergeben_an);
  if (!b) throw new Error("Noch nicht vergeben");
  return gaebX84Schreiben(knotenZuFlach(paketKnoten(v, knoten, b)), { projektTitel: [projektTitel, v.titel].filter(Boolean).join(" – "), phase: 86, bieter: { name: b.name } });
}

// Zeilen für anfrageText() aus lib/anfragen.js
export const anfrageZeilen = v => (v.zeilen || []).map(z => ({ oz: z.oz, text: z.kurztext, langtext: z.langtext, menge: z.menge, einheit: z.einheit }));

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eurD = x => (Number(x) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mng = x => (Number(x) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
const datumDe = s => (s ? new Date(String(s).length <= 10 ? `${s}T12:00:00` : s).toLocaleDateString("de-DE") : "");

export const STANDARD_BEDINGUNGEN = [
  "Grundlage sind die VOB/B und die VOB/C in der bei Vertragsschluss gültigen Fassung.",
  "Die Einheitspreise sind Festpreise bis zum Ende der Ausführung.",
  "Abgerechnet wird nach Aufmaß gemäß VOB/C; Aufmaße sind gemeinsam zu nehmen.",
  "Abschlagsrechnungen nach Leistungsstand, Zahlung innerhalb von 21 Tagen.",
  "Sicherheitseinbehalt 5 % der Schlussrechnungssumme für die Dauer der Gewährleistung, ablösbar durch Bürgschaft.",
  "Nachträge bedürfen vor Ausführung der schriftlichen Beauftragung.",
];

export const LIEFER_BEDINGUNGEN = [
  "Preise frei Baustelle, abgeladen, einschließlich Verpackung und Fracht.",
  "Liefertermine sind verbindlich und mit der Bauleitung 2 Werktage vorher abzustimmen.",
  "Mengen sind Schätzmengen; abgerechnet wird nach Lieferschein.",
  "Zahlung innerhalb von 30 Tagen nach Rechnungseingang.",
  "Es gelten unsere Einkaufsbedingungen; abweichende Bedingungen des Lieferanten gelten nur bei schriftlicher Bestätigung.",
];

export function auftragHtml(v, knoten, { projekt = {}, firma = {}, datum = new Date().toISOString().slice(0, 10) } = {}) {
  const b = (v.bieter || []).find(x => x.id === v.vergeben_an);
  if (!b) throw new Error("Noch nicht vergeben");
  const s = bieterSumme(v.zeilen, b);
  const nachId = new Map(knoten.map(k => [k.id, k]));
  const nu = v.art !== "lieferant";
  const art = nu ? "Nachunternehmerauftrag" : "Bestellung";
  const zeilen = v.zeilen.map((z, i) => {
    const k = nachId.get(z.knotenId) || {};
    const t = druckTexte({ kurztext: z.kurztext, langtext: k.langtext ?? z.langtext });
    const ep = hatPreis(b, z.key) ? Number(b.preise[z.key]) : null;
    const gp = ep == null || z.inSumme === false ? null : gpCent(z.menge, ep) / 100;
    return `<tr><td>${esc(z.oz || (nu ? "" : String(i + 1)))}</td><td>${t.kurz ? `<b>${esc(t.kurz)}</b>` : ""}${t.lang ? `<div class="lang">${esc(t.lang).replace(/\n/g, "<br>")}</div>` : ""}${z.inSumme === false ? `<div class="lang">Bedarfs-/Alternativposition, nicht in der Summe</div>` : ""}</td>`
      + `<td class="r">${mng(z.menge)} ${esc(z.einheit)}</td><td class="r">${ep == null ? "—" : eurD(ep)}</td><td class="r">${gp == null ? "" : eurD(gp)}</td></tr>`;
  }).join("");
  const bed = (v.auftrag?.bedingungen?.length ? v.auftrag.bedingungen : nu ? STANDARD_BEDINGUNGEN : LIEFER_BEDINGUNGEN).map(x => `<li>${esc(x)}</li>`).join("");
  const ort = [projekt.adresse, [projekt.plz, projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${art} ${esc(v.auftrag?.nummer || "")}</title><style>
body{font:10pt/1.4 system-ui,sans-serif;color:#1c1c1c;margin:18mm}h1{font-size:15pt;font-weight:600;margin:0 0 4mm}
table{width:100%;border-collapse:collapse;margin:4mm 0}td,th{padding:3px 4px;border-bottom:.5px solid #ccc;vertical-align:top;text-align:left}
th{font-weight:500;color:#555}.r{text-align:right;white-space:nowrap}.lang{color:#444;font-size:9pt;margin-top:2px}.kopf{display:flex;justify-content:space-between;gap:10mm}
.summe td{border:0}.summe .g td{font-weight:600;border-top:1px solid #333}ol{padding-left:5mm}.unterschrift{display:flex;gap:20mm;margin-top:18mm}.unterschrift div{flex:1;border-top:.5px solid #333;padding-top:2mm;color:#555}
</style></head><body>
<div class="kopf"><div><b>${esc(firma.name || "")}</b><br>${esc(firma.adresse || firma.strasse || "")}</div><div>${esc(b.name)}<br>${esc(b.email || "")}</div></div>
<h1 style="margin-top:10mm">${art} ${esc(v.auftrag?.nummer || "")}</h1>
<p>Bauvorhaben: <b>${esc(projekt.name || "")}</b>${ort ? `, ${esc(ort)}` : ""}<br>${nu ? "Leistung" : "Lieferung"}: ${esc(v.titel)}<br>Datum: ${datumDe(datum)}${b.eingang ? `<br>Ihr Angebot vom ${datumDe(b.eingang)}` : ""}</p>
<p>${nu ? "Wir beauftragen Sie auf Grundlage Ihres Angebots mit den folgenden Leistungen zu den genannten Einheitspreisen." : "Auf Grundlage Ihres Angebots bestellen wir:"}</p>
<table><thead><tr><th>${nu ? "OZ" : "Pos."}</th><th>${nu ? "Leistung" : "Artikel"}</th><th class="r">Menge</th><th class="r">EP €</th><th class="r">GP €</th></tr></thead><tbody>${zeilen}</tbody></table>
<table class="summe"><tr><td></td><td class="r">Summe netto</td><td class="r" style="width:30mm">${eurD(s.brutto)} €</td></tr>
${s.nachlass ? `<tr><td></td><td class="r">Nachlass ${mng(b.nachlass)} %</td><td class="r">−${eurD(s.nachlass)} €</td></tr>` : ""}
<tr class="g"><td></td><td class="r">${nu ? "Auftragssumme" : "Bestellwert"} netto</td><td class="r">${eurD(s.netto)} €</td></tr>
${b.skonto ? `<tr><td></td><td class="r">Skonto ${mng(b.skonto)} % bei Zahlung innerhalb der Skontofrist</td><td class="r"></td></tr>` : ""}</table>
${v.auftrag?.ausfuehrung ? `<p>Ausführung: ${esc(v.auftrag.ausfuehrung)}</p>` : ""}
<h2 style="font-size:11pt;font-weight:600">Vertragsbedingungen</h2><ol>${bed}</ol>
${b.vorbehalte?.length ? `<p>Ihre Vorbehalte aus dem Angebot (${esc(b.vorbehalte.join("; "))}) werden nur Vertragsbestandteil, soweit oben nicht abweichend geregelt.</p>` : ""}
<p>Bitte bestätigen Sie ${nu ? "den Auftrag" : "die Bestellung"} durch Rücksendung einer unterschriebenen Ausfertigung.</p>
<div class="unterschrift"><div>${nu ? "Auftraggeber" : "Besteller"}</div><div>${nu ? "Auftragnehmer" : "Lieferant"}</div></div>
</body></html>`;
}

// Preisspiegel als Druck (für die Akte)
export function preisspiegelHtml(v, { projekt = {} } = {}) {
  const ps = preisspiegel(v);
  const kopf = ps.bieter.map(b => `<th class="r">${esc(b.name)}</th>`).join("");
  const zeilen = ps.zeilen.map(z => `<tr><td>${esc(z.oz)}</td><td>${esc(z.kurztext)}</td><td class="r">${mng(z.menge)} ${esc(z.einheit)}</td><td class="r">${eurD(z.budgetEp)}</td>`
    + z.preise.map((p, i) => `<td class="r${i === z.minIndex ? " min" : ""}">${p == null ? "—" : eurD(p)}${z.ausreisser[i] ? " *" : ""}</td>`).join("") + "</tr>").join("");
  const fuss = (label, f) => `<tr class="s"><td></td><td>${label}</td><td></td><td class="r">${label === "Wertung" ? eurD(ps.budget) : ""}</td>${ps.bieter.map(f).join("")}</tr>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Preisspiegel ${esc(v.titel)}</title><style>
body{font:9pt/1.35 system-ui,sans-serif;margin:12mm}h1{font-size:13pt;font-weight:600}table{width:100%;border-collapse:collapse}
td,th{padding:2px 4px;border-bottom:.5px solid #ccc;text-align:left}th{font-weight:500}.r{text-align:right;white-space:nowrap}.min{font-weight:600}.s td{font-weight:500;border-top:.5px solid #333}
</style></head><body><h1>Preisspiegel ${esc(v.titel)}</h1><p>${esc(projekt.name || "")} · Stand ${datumDe(new Date().toISOString().slice(0, 10))} · * mehr als ${AUSREISSER * 100} % vom Median</p>
<table><thead><tr><th>OZ</th><th>Leistung</th><th class="r">Menge</th><th class="r">Budget EP</th>${kopf}</tr></thead><tbody>${zeilen}
${fuss("Summe netto", b => `<td class="r">${eurD(b.netto)}</td>`)}${fuss("Wertung", b => `<td class="r">${eurD(b.wertung)}</td>`)}${fuss("Rang", b => `<td class="r">${b.rang ?? "—"}</td>`)}
</tbody></table></body></html>`;
}
