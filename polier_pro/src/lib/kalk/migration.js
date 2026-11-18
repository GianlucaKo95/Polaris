// Migration der bisherigen Angebote (Tabelle angebote, positionen als JSON)
// in den Kalkulationsbereich.
//
// Je Polaris-Baustelle entsteht ein Kalkulationsprojekt; jedes Angebot wird
// ein Stand darin (Nachträge als Stand der Art "nachtrag"). Abgegebene,
// beauftragte und abgelehnte Angebote werden als gesperrter Stand
// übernommen, Entwürfe bleiben bearbeitbar. Die alte Tabelle bleibt
// unverändert stehen.
//
// Je Stand wird die Summe alt gegen neu verglichen. Neu wird je Position auf
// Cent gerundet (wie in GAEB und Rechnung); die alte Ansicht addierte
// ungerundete Zeilen. Kleine Abweichungen daraus werden ausgewiesen, nicht
// versteckt.

import { nettoSumme, gp as altGp, inSumme as altInSumme, istTitel } from "../lv.js";
import { altePositionenZuKnoten } from "./lvFlach.js";
import { summen, rundeCent } from "./lvBaum.js";

const GESPERRT_BEI = new Set(["versendet", "angenommen", "abgelehnt"]);

export function standStatusAusAngebot(a) {
  return GESPERRT_BEI.has(a?.status);
}

export function projektStatusAusAngeboten(angebote) {
  const st = (angebote || []).filter(a => !a.nachtrag_zu).map(a => a.status);
  if (st.includes("angenommen")) return "auftrag";
  if (st.includes("versendet")) return "abgegeben";
  if (st.length && st.every(s => s === "abgelehnt")) return "verloren";
  return "in_bearbeitung";
}

const de = (x, stellen) => Number(x).toLocaleString("de-DE", { maximumFractionDigits: stellen });
const nachkommastellen = x => {
  const s = String(x ?? "");
  const m = s.match(/\.(\d+)$/);
  return m ? m[1].replace(/0+$/, "").length : 0;
};

// Prüfung eines Stands: Summe alt (Cent) gegen neu (Cent) und Hinweise
export function standPruefen(altePositionen, knoten) {
  const altCent = Math.round(rundeCent(nettoSumme(altePositionen)) * 100);
  const neuCent = summen(knoten).gesamtCent;
  const hinweise = [];
  for (const p of altePositionen || []) {
    if (istTitel(p)) continue;
    const bez = String(p.bez || "").slice(0, 40);
    if (nachkommastellen(p.ep) > 2) hinweise.push(`EP ${de(p.ep, 6)} bei „${bez}“ auf ${de(rundeCent(p.ep), 2)} gerundet`);
    if (Number(p.rabatt) && nachkommastellen(Number((Number(p.ep) * (1 - Number(p.rabatt) / 100)).toFixed(6))) > 2) {
      hinweise.push(`Rabatt ${de(p.rabatt, 3)} % bei „${bez}“: Einheitspreis nach Rabatt auf Cent gerundet`);
    }
    if (nachkommastellen(p.menge) > 3) hinweise.push(`Menge ${de(p.menge, 6)} bei „${bez}“ auf 3 Nachkommastellen gerundet`);
  }
  const altePos = (altePositionen || []).filter(p => !istTitel(p) && altInSumme(p) && altGp(p) !== 0).length;
  const neuePos = knoten.filter(k => k.typ === "position" && k.art !== "bedarf" && k.art !== "alternativ" && Number(k.menge) * Number(k.ep) !== 0).length;
  if (altePos !== neuePos) hinweise.push(`${altePos} bepreiste Positionen alt, ${neuePos} neu`);
  return { altCent, neuCent, abweichungCent: neuCent - altCent, hinweise };
}

// Plan für alle Angebote einer Firma. bereitsMigriert: Set alter Angebots-IDs (als Text).
export function migrationsPlan(angebote, projekte, { bereitsMigriert = new Set() } = {}) {
  const projektNachId = new Map((projekte || []).map(p => [String(p.id), p]));
  const gruppen = new Map();
  for (const a of angebote || []) {
    if (bereitsMigriert.has(String(a.id))) continue;
    const schluessel = a.projekt_id != null ? String(a.projekt_id) : `ohne-${a.id}`;
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
    gruppen.get(schluessel).push(a);
  }

  const plan = [];
  for (const [schluessel, liste] of gruppen) {
    liste.sort((x, y) => String(x.datum || "").localeCompare(String(y.datum || "")) || String(x.id).localeCompare(String(y.id), undefined, { numeric: true }));
    const pr = projektNachId.get(schluessel);
    const erstes = liste.find(a => !a.nachtrag_zu) || liste[0];
    const staende = liste.map((a, i) => {
      const knoten = altePositionenZuKnoten(a.positionen || []);
      return {
        altes_angebot_id: String(a.id),
        art: a.nachtrag_zu ? "nachtrag" : "angebot",
        nummer: i + 1,
        bezeichnung: a.titel || (a.nachtrag_zu ? "Nachtrag" : "Angebot"),
        nachlass: Number(a.rabatt) || 0,
        mwst: a.mwst ?? 19,
        gesperrt: standStatusAusAngebot(a),
        datum: a.datum || null,
        knoten,
        pruefung: standPruefen(a.positionen || [], knoten),
      };
    });
    const hauptstaende = staende.filter(s => s.art !== "nachtrag");
    plan.push({
      projekt: {
        projekt_id: pr ? pr.id : (liste[0].projekt_id ?? null),
        name: pr?.name || erstes.titel || "Übernommenes Angebot",
        nummer: pr?.projektnummer || "",
        auftraggeber: pr?.auftraggeber || erstes.empfaenger || "",
        ort: pr?.ort || "",
        status: projektStatusAusAngeboten(liste),
      },
      aktuellerStandIndex: staende.indexOf((hauptstaende.length ? hauptstaende : staende).at(-1)),
      staende,
    });
  }
  return plan;
}

export function planZusammenfassung(plan) {
  let staende = 0, positionen = 0, mitAbweichung = 0, maxAbweichungCent = 0;
  for (const p of plan) for (const s of p.staende) {
    staende++;
    positionen += s.knoten.filter(k => k.typ === "position").length;
    const ab = Math.abs(s.pruefung.abweichungCent);
    if (ab > 0) mitAbweichung++;
    maxAbweichungCent = Math.max(maxAbweichungCent, ab);
  }
  return { projekte: plan.length, staende, positionen, mitAbweichung, maxAbweichungCent };
}
