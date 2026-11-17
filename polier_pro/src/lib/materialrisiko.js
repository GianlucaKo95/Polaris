// Materialpreisrisiko (1.91).
//
// Stoffe wie Betonstahl, Bitumen, Kupfer oder Holz schwanken stark im Preis.
// Liegt zwischen Angebot und Einkauf viel Zeit, steckt in einem Festpreis ein
// Risiko. Hier wird je Stoffgruppe ermittelt, wie viel Materialkosten im
// Angebot stecken und welche Preisbewegung bis zum Einkauf denkbar ist.
// Empfohlen wird dann eine Stoffpreisgleitklausel (bei öffentlichen Aufträgen
// nach VHB, Formblatt 225; privat frei vereinbar) oder ein Risikoaufschlag.
//
// Die Schwankungswerte sind Annahmen je Jahr und in der Oberfläche
// änderbar; sie sind keine Prognose.

import { istTitel, inSumme } from "./lv.js";

export const STOFFGRUPPEN = {
  stahl:     { label: "Stahl, Betonstahl", schwankung: 0.20, muster: /stahl|bewehr|b500|baustahl|matte|profil|träger/i },
  bitumen:   { label: "Bitumen, Asphalt", schwankung: 0.20, muster: /bitumen|asphalt|pmbc|kmb|schweißbahn|dachbahn/i },
  kupfer:    { label: "Kupfer, Kabel", schwankung: 0.25, muster: /kupfer|kabel|nym|leitung/i },
  holz:      { label: "Holz", schwankung: 0.20, muster: /holz|kvh|bsh|osb|schalbrett|lattung|sparren/i },
  kunststoff:{ label: "Dämmstoffe, Kunststoffe", schwankung: 0.15, muster: /xps|eps|pur|pir|pvc|pe-|noppenbahn|folie|dämm/i },
  beton:     { label: "Beton, Zement", schwankung: 0.10, muster: /beton|zement|mörtel|estrich|c\d\d\/\d\d/i },
  energie:   { label: "Kraftstoff, Energie", schwankung: 0.20, muster: /diesel|kraftstoff|heizöl|strom|energie/i },
};
export const SONSTIGE = { label: "Sonstige Stoffe", schwankung: 0.05 };

const r2 = n => Math.round(n * 100) / 100;
const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export function stoffgruppeVon(baustein, zuordnung = {}) {
  if (zuordnung[String(baustein.id)]) return zuordnung[String(baustein.id)];
  // Reihenfolge zählt: "Betonstahl" ist Stahl, nicht Beton
  for (const [k, g] of Object.entries(STOFFGRUPPEN)) if (g.muster.test(baustein.bezeichnung || "")) return k;
  return "sonstige";
}

// Materialkosten (ohne Zuschlag) je Stoffgruppe über alle Positionen in der Summe
export function materialJeGruppe(positionen, kalkulationspreise, zuordnung = {}) {
  const preis = new Map((kalkulationspreise || []).map(k => [String(k.id), k]));
  const gruppen = {};
  let netto = 0;
  for (const p of positionen || []) {
    if (istTitel(p) || !inSumme(p)) continue;
    netto += (Number(p.menge) || 0) * (Number(p.ep) || 0);
    for (const m of p.kalk?.materialposten || []) {
      const k = preis.get(String(m.stammId));
      if (!k || k.kategorie !== "material") continue;
      const kosten = (Number(m.menge) || 0) * (Number(k.preis) || 0);
      if (!(kosten > 0)) continue;
      const g = stoffgruppeVon(k, zuordnung);
      gruppen[g] ??= { gruppe: g, kosten: 0, bausteine: new Map(), positionen: new Set() };
      gruppen[g].kosten += kosten;
      gruppen[g].bausteine.set(String(k.id), (gruppen[g].bausteine.get(String(k.id)) || 0) + kosten);
      gruppen[g].positionen.add(p.id);
    }
  }
  return { netto, gruppen: Object.values(gruppen) };
}

// Risiko je Gruppe für einen Zeitraum bis zum Einkauf (Monate) und
// Ausführungsdauer (Einkauf verteilt sich: im Mittel halbe Dauer)
export function risikoBewerten({ netto, gruppen }, { monateBisBeginn = 3, dauerMonate = 3, schwankung = {} } = {}) {
  const monate = Math.max(0, Number(monateBisBeginn) || 0) + Math.max(0, Number(dauerMonate) || 0) / 2;
  return gruppen.map(g => {
    const s = schwankung[g.gruppe] ?? (STOFFGRUPPEN[g.gruppe] || SONSTIGE).schwankung;
    const bewegung = s * Math.sqrt(monate / 12);   // Schwankung wächst etwa mit der Wurzel der Zeit
    const risiko = g.kosten * bewegung;
    const anteil = netto > 0 ? g.kosten / netto : 0;
    const empfehlung = g.gruppe === "sonstige" || risiko < 250 ? "keine"
      : anteil >= 0.05 && bewegung >= 0.08 ? "gleitklausel"
      : "aufschlag";
    return { ...g, label: (STOFFGRUPPEN[g.gruppe] || SONSTIGE).label, schwankung: s, bewegung, risiko: r2(risiko), anteil, empfehlung,
      aufschlagProzent: Math.round(bewegung * 500) / 10 };   // halbe denkbare Bewegung in %, eine Nachkommastelle
  }).sort((a, b) => b.risiko - a.risiko);
}

// Risikoaufschlag als Projektpreis im Preisstand (Hälfte der denkbaren Bewegung)
export function aufschlagAnwenden(ps, bewertung, preisSetzen) {
  let neu = ps;
  for (const id of bewertung.bausteine.keys()) {
    const k = neu.kalkulationspreise.find(x => String(x.id) === id);
    if (!k) continue;
    const basis = Number(k.quelle?.basis ?? k.preis) || 0;
    neu = preisSetzen(neu, k.id, basis * (1 + bewertung.aufschlagProzent / 100), { art: "risiko", basis, prozent: bewertung.aufschlagProzent });
  }
  return neu;
}

export function vorbehaltText(b, stand) {
  const datum = stand || new Date().toLocaleDateString("de-DE");
  return b.empfehlung === "gleitklausel"
    ? `Die Preise für ${b.label} beruhen auf dem Preisstand vom ${datum}. Für diese Stoffe gilt eine Stoffpreisgleitklausel: Änderungen der Einkaufspreise bis zur Ausführung werden nachgewiesen und verrechnet.`
    : `Die Preise für ${b.label} beruhen auf dem Preisstand vom ${datum}.`;
}

// ── KI: unbekannte Bausteine zuordnen ──
export const STOFF_WERKZEUG = {
  name: "stoffe_zuordnen",
  description: "Ordnet Materialbausteine Stoffgruppen zu.",
  input_schema: { type: "object", properties: { zuordnung: { type: "array", items: { type: "object", properties: {
    id: { type: "string" }, gruppe: { type: "string", enum: [...Object.keys(STOFFGRUPPEN), "sonstige"] } }, required: ["id", "gruppe"] } } }, required: ["zuordnung"] },
};

export async function bausteineZuordnen(bausteine, rufeKi) {
  if (!bausteine.length) return {};
  const antwort = await rufeKi(
    `Ordne Baustoffe der Stoffgruppe zu, deren Marktpreis ihren Preis am stärksten treibt: ${Object.entries(STOFFGRUPPEN).map(([k, g]) => `${k} (${g.label})`).join(", ")}, sonst sonstige. Rufe genau einmal ${STOFF_WERKZEUG.name} auf.`,
    [{ role: "user", content: bausteine.map(k => `${k.id} | ${kurz(k.bezeichnung, 80)} | ${k.einheit}`).join("\n") }],
    [STOFF_WERKZEUG], { type: "tool", name: STOFF_WERKZEUG.name });
  const input = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === STOFF_WERKZEUG.name)?.input;
  const gueltig = new Set([...Object.keys(STOFFGRUPPEN), "sonstige"]);
  return Object.fromEntries((input?.zuordnung || []).filter(z => gueltig.has(z.gruppe) && bausteine.some(k => String(k.id) === String(z.id))).map(z => [String(z.id), z.gruppe]));
}
