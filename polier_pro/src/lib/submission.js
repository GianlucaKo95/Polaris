// Aus Submissionsergebnissen lernen (1.92).
//
// Je Angebot wird festgehalten, wie die Submission ausging: eigener Rang,
// Summen der Mitbieter und, wenn der Auftraggeber einen Preisspiegel
// herausgibt, die Einheitspreise des Bestbieters je Position (eingelesen
// wie ein NU-Angebot, lib/angebotEinlesen.js). Firmenweit zeigt das, in
// welchen Gewerken man regelmäßig zu teuer oder zu billig liegt; die KI
// erklärt die Muster.
//
// angebot.submission = { datum, rang, bieter: [{ name, summe }], bestbieterEp: { [posId]: ep }, notiz }

import { istTitel, inSumme, nettoSumme } from "./lv.js";

const r4 = n => Math.round(n * 10000) / 10000;
const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pz = n => `${n > 0 ? "+" : ""}${Math.round(n * 1000) / 10} %`.replace(".", ",");

export function eigeneSumme(angebot) {
  return Math.round(nettoSumme(angebot.positionen || []) * 100) / 100;
}

export function submissionAuswerten(angebot) {
  const s = angebot.submission;
  if (!s) return null;
  const eigen = eigeneSumme(angebot);
  const andere = (s.bieter || []).map(b => Number(b.summe)).filter(x => x > 0);
  const best = andere.length ? Math.min(...andere) : null;
  const alle = [...andere, eigen].sort((a, b) => a - b);
  const rang = Number(s.rang) > 0 ? Number(s.rang) : (andere.length ? alle.indexOf(eigen) + 1 : null);
  const bester = rang === 1;
  // Abstand zum Besten der ANDEREN: bei Rang 1 negativ = Vorsprung
  return { eigen, best, rang, bieter: andere.length + 1, abstand: best ? r4(eigen / best - 1) : null, bester,
    zweiter: bester && andere.length ? Math.min(...andere) : null };
}

// Gewerk einer Position: Gewerk der Stammposition, sonst der LV-Abschnitt
export function gewerkVon(pos, abschnitt, stammpositionen = []) {
  const sp = pos.stammpositionId != null ? stammpositionen.find(s => String(s.id) === String(pos.stammpositionId)) : null;
  return (sp?.gewerk || abschnitt || "Ohne Abschnitt").trim();
}

export function positionsVergleich(angebot, stammpositionen = []) {
  const best = angebot.submission?.bestbieterEp || {};
  const zeilen = [];
  let abschnitt = null;
  for (const p of angebot.positionen || []) {
    if (istTitel(p)) { abschnitt = String(p.bez).replace(/─/g, "").trim(); continue; }
    if (!inSumme(p)) continue;
    const b = Number(best[p.id]);
    if (!(b > 0) || !(Number(p.ep) > 0)) continue;
    zeilen.push({ pos: p, gewerk: gewerkVon(p, abschnitt, stammpositionen), ep: Number(p.ep), best: b, menge: Number(p.menge) || 0,
      abweichung: r4(Number(p.ep) / b - 1), gpDiff: (Number(p.ep) - b) * (Number(p.menge) || 0) });
  }
  return zeilen;
}

export function firmenAuswertung(angebote, stammpositionen = []) {
  const mit = (angebote || []).filter(a => a.submission);
  const entschieden = (angebote || []).filter(a => a.status === "angenommen" || a.status === "abgelehnt");
  const gewonnen = entschieden.filter(a => a.status === "angenommen").length;
  const abstaende = mit.map(submissionAuswerten).filter(x => x?.abstand != null);
  const gewerke = new Map();
  for (const a of mit) {
    for (const z of positionsVergleich(a, stammpositionen)) {
      const g = gewerke.get(z.gewerk) || { gewerk: z.gewerk, eigen: 0, best: 0, positionen: 0, angebote: new Set(), beispiele: [] };
      g.eigen += z.ep * z.menge; g.best += z.best * z.menge; g.positionen++; g.angebote.add(a.id);
      g.beispiele.push({ bez: z.pos.bez, einheit: z.pos.einheit, ep: z.ep, best: z.best, abweichung: z.abweichung, angebot: a.titel });
      gewerke.set(z.gewerk, g);
    }
  }
  const jeGewerk = [...gewerke.values()].map(g => ({ ...g, angebote: g.angebote.size, abweichung: g.best > 0 ? r4(g.eigen / g.best - 1) : 0,
    beispiele: g.beispiele.sort((x, y) => Math.abs(y.abweichung) - Math.abs(x.abweichung)).slice(0, 5) }))
    .sort((x, y) => Math.abs(y.abweichung) - Math.abs(x.abweichung));
  return {
    angebote: mit.length, entschieden: entschieden.length, gewonnen, quote: entschieden.length ? gewonnen / entschieden.length : null,
    abstandMittel: abstaende.length ? r4(abstaende.reduce((s, x) => s + x.abstand, 0) / abstaende.length) : null,
    knappVerloren: abstaende.filter(x => !x.bester && x.abstand <= 0.03).length,
    jeGewerk,
  };
}

// ── KI: Muster erklären ──
export const MUSTER_WERKZEUG = {
  name: "muster_abgeben",
  description: "Gibt die erkannten Muster und Empfehlungen ab.",
  input_schema: { type: "object", properties: {
    zusammenfassung: { type: "string", description: "2–3 Sätze zur Wettbewerbslage" },
    muster: { type: "array", items: { type: "object", properties: {
      gewerk: { type: "string" }, befund: { type: "string" }, ursache: { type: "string", description: "Wahrscheinliche Ursache in der Kalkulation" },
      empfehlung: { type: "string", description: "Konkreter Ansatzpunkt, z.B. Zeitansatz, Material, Zuschlag, Geräteeinsatz" } }, required: ["gewerk", "befund", "empfehlung"] } },
  }, required: ["zusammenfassung", "muster"] },
};

export function musterText(a) {
  return [
    `Submissionen: ${a.angebote}, entschieden ${a.entschieden}, gewonnen ${a.gewonnen}${a.quote != null ? ` (Quote ${Math.round(a.quote * 100)} %)` : ""}`,
    a.abstandMittel != null ? `Mittlerer Abstand zum besten Mitbieter: ${pz(a.abstandMittel)}, knapp verloren (≤ 3 %): ${a.knappVerloren}` : "",
    "Je Gewerk (eigene EP gegen Bestbieter, mengengewichtet):",
    ...a.jeGewerk.map(g => `- ${g.gewerk}: ${pz(g.abweichung)} aus ${g.positionen} Positionen in ${g.angebote} Angeboten; Beispiele: ${g.beispiele.map(b => `${b.bez} ${eur(b.ep)} vs. ${eur(b.best)}/${b.einheit} (${pz(b.abweichung)})`).join("; ")}`),
  ].filter(Boolean).join("\n");
}

export async function musterErklaeren(auswertung, rufeKi) {
  const antwort = await rufeKi(
    `Du bist erfahrener Kalkulator und wertest die Submissionsergebnisse eines Bauunternehmens aus. Erkläre, in welchen Gewerken die Firma systematisch zu teuer oder auffällig billig ist, mit der wahrscheinlichsten Ursache in der Kalkulation und einem konkreten Ansatzpunkt. Zu billig ist auch ein Risiko (Verlust, Fehler im Ansatz). Wenige Daten ehrlich als vorläufig bezeichnen. Keine Empfehlung, Preise unter Kosten anzubieten. Rufe genau einmal ${MUSTER_WERKZEUG.name} auf. Deutsch.`,
    [{ role: "user", content: musterText(auswertung) }], [MUSTER_WERKZEUG], { type: "tool", name: MUSTER_WERKZEUG.name });
  const input = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === MUSTER_WERKZEUG.name)?.input;
  if (!input) throw new Error("Die KI hat keine Auswertung geliefert");
  return { zusammenfassung: String(input.zusammenfassung || ""), muster: (input.muster || []).filter(m => m?.gewerk && m?.befund) };
}

// Preisspiegel des Auftraggebers (eingelesen wie ein NU-Angebot) → Bestbieter-EP je Position
export function bestbieterAusEinlesung(nuErgebnis) {
  return Object.fromEntries((nuErgebnis?.positionen || []).filter(p => p.quellPosId != null && p.ep > 0).map(p => [p.quellPosId, p.ep]));
}
