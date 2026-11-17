// Angebotsschreiben mit Annahmen und Vorbehalten (1.89).
//
// Ein gutes Angebot sagt nicht nur, was es kostet, sondern auch, was es
// voraussetzt und was nicht enthalten ist. Die KI entwirft Einleitung,
// Annahmen, Ausschlüsse, Zahlungsbedingungen und Schluss aus dem, was die
// Kalkulation schon weiß: Annahmen aus Copilot und KI-Vorkalkulation,
// Risiken aus der LV-Prüfung, Vorbehalte der NU-Angebote. Gespeichert in
// angebot.anschreiben, gedruckt im Angebots-PDF.

import { istTitel, inSumme } from "./lv.js";

const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export const LEER = { einleitung: "", annahmen: [], ausschluesse: [], zahlung: "", schluss: "" };

export const ANSCHREIBEN_WERKZEUG = {
  name: "anschreiben_abgeben",
  description: "Gibt den Entwurf des Angebotsschreibens ab.",
  input_schema: {
    type: "object",
    properties: {
      einleitung: { type: "string", description: "2–4 Sätze vor dem LV, sachlich, ohne Floskelketten" },
      annahmen: { type: "array", items: { type: "string" }, description: "Grundlagen und Annahmen, auf denen die Preise beruhen" },
      ausschluesse: { type: "array", items: { type: "string" }, description: "Leistungen, die ausdrücklich nicht enthalten sind" },
      zahlung: { type: "string", description: "Zahlungsbedingungen, z.B. Abschläge nach Leistungsstand" },
      schluss: { type: "string", description: "1–2 Sätze Schluss" },
    },
    required: ["einleitung", "annahmen", "ausschluesse", "zahlung", "schluss"],
  },
};

export function anschreibenPrompt({ vob = true } = {}) {
  return `Du schreibst für ein deutsches Bauunternehmen das Anschreiben zu einem Angebot.
- Sachlich, knapp, kundenfreundlich. Keine Werbesprache, keine Ausrufezeichen.
- Annahmen: nur, was die Preise wirklich beeinflusst (Baugrund, Zugänglichkeit, Bauzeit, Vorleistungen anderer, Mengen nach Aufmaß). Aus den gelieferten Annahmen, Risiken und Vorbehalten ableiten, nichts erfinden.
- Ausschlüsse: Leistungen, die man erwarten könnte, die aber nicht im Angebot sind (z.B. Gerüst, Entsorgung belasteter Böden, Baustrom). Nur, was nach Inhalt des Angebots naheliegt.
- Zahlung: ${vob ? "Abschlagszahlungen nach Leistungsstand gemäß § 16 VOB/B, Schlusszahlung nach Abnahme und Schlussrechnung" : "Abschläge nach Baufortschritt (§ 632a BGB), Schlussrechnung nach Abnahme"}; Fristen nur, wenn vorgegeben, sonst die üblichen.
- Keine Preise wiederholen außer der Angebotssumme, keine Rechtsberatung.
Rufe genau einmal ${ANSCHREIBEN_WERKZEUG.name} auf. Deutsch.`;
}

export function anschreibenKontext({ angebot, projekt, firma, annahmen = [], risiken = [], vorbehalte = [], netto = 0 }) {
  const titel = (angebot.positionen || []).filter(istTitel).map(p => String(p.bez).replace(/─/g, "").trim());
  const pos = (angebot.positionen || []).filter(p => !istTitel(p));
  const alternativ = pos.filter(p => !inSumme(p)).length;
  const ki = pos.flatMap(p => p.kiKalkulation?.fehlt || []);
  return [
    `Firma: ${firma?.name || ""}`,
    `Bauvorhaben: ${projekt?.name || ""}${projekt?.ort ? `, ${projekt.ort}` : ""}`,
    `Empfänger: ${angebot.empfaenger || "unbekannt"}`,
    `Angebot: ${angebot.titel || ""}, ${pos.length} Positionen${alternativ ? ` (davon ${alternativ} Bedarfs-/Alternativpositionen)` : ""}, netto ${eur(netto)}`,
    titel.length ? `Abschnitte: ${titel.join(", ")}` : "",
    `Positionen (Auszug): ${pos.slice(0, 40).map(p => kurz(p.bez, 60)).join("; ")}`,
    annahmen.length ? `Annahmen aus der Kalkulation:\n${annahmen.map(a => `- ${a}`).join("\n")}` : "",
    ki.length ? `In der Kalkulation noch offene Bausteine: ${[...new Set(ki)].join(", ")}` : "",
    risiken.length ? `Risiken aus der LV-Prüfung:\n${risiken.slice(0, 15).map(r => `- ${r.text}`).join("\n")}` : "",
    vorbehalte.length ? `Vorbehalte von Nachunternehmern/Lieferanten:\n${vorbehalte.map(v => `- ${v}`).join("\n")}` : "",
    angebot.gueltig_bis ? `Bindefrist bis ${new Date(angebot.gueltig_bis).toLocaleDateString("de-DE")}` : "",
  ].filter(Boolean).join("\n");
}

export function entwurfAuswerten(input) {
  const liste = x => (Array.isArray(x) ? x : []).map(s => String(s).trim()).filter(Boolean);
  return { einleitung: String(input?.einleitung || "").trim(), annahmen: liste(input?.annahmen), ausschluesse: liste(input?.ausschluesse),
    zahlung: String(input?.zahlung || "").trim(), schluss: String(input?.schluss || "").trim() };
}

export async function anschreibenEntwerfen({ kontext, vob, rufeKi }) {
  const antwort = await rufeKi(anschreibenPrompt({ vob }), [{ role: "user", content: kontext }], [ANSCHREIBEN_WERKZEUG], { type: "tool", name: ANSCHREIBEN_WERKZEUG.name });
  const input = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === ANSCHREIBEN_WERKZEUG.name)?.input;
  if (!input) throw new Error("Die KI hat keinen Entwurf geliefert");
  return entwurfAuswerten(input);
}

// HTML-Bausteine fürs Angebots-PDF (escape kommt vom Aufrufer)
export function anschreibenHtml(an, escape) {
  if (!an) return { vorTabelle: "", nachSummen: "" };
  const absatz = t => escape(t).replace(/\n/g, "<br>");
  const liste = (titel, l) => l?.length ? `<div class="an-block"><div class="an-titel">${titel}</div><ul>${l.map(x => `<li>${escape(x)}</li>`).join("")}</ul></div>` : "";
  return {
    vorTabelle: an.einleitung ? `<div class="an-einleitung">${absatz(an.einleitung)}</div>` : "",
    nachSummen: [
      liste("Grundlagen und Annahmen", an.annahmen),
      liste("Nicht im Angebot enthalten", an.ausschluesse),
      an.zahlung ? `<div class="an-block"><div class="an-titel">Zahlungsbedingungen</div><div>${absatz(an.zahlung)}</div></div>` : "",
      an.schluss ? `<div class="an-block">${absatz(an.schluss)}</div>` : "",
    ].join(""),
  };
}

export const ANSCHREIBEN_CSS = `.an-einleitung{margin:14px 0 10px;line-height:1.5}.an-block{margin-top:12px;line-height:1.5;font-size:9.5pt}.an-titel{font-weight:bold;margin-bottom:3px}.an-block ul{margin:0;padding-left:16px}`;
