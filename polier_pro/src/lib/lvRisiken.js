// LV-Risiken und Bieterfragen (1.82).
//
// Die KI liest das Leistungsverzeichnis in der Angebotsphase wie ein
// erfahrener Kalkulator: unklare oder widersprüchliche Texte, fehlende
// Angaben, auffällige Mengen, Vertragsrisiken in den Vorbemerkungen und
// Leistungen, deren Abgrenzung (Nebenleistung oder Besondere Leistung nach
// VOB/C) strittig werden kann. Daraus entstehen Bieterfragen, die vor der
// Abgabe an den Auftraggeber gehen. Nachtragspotenzial wird sachlich
// benannt; Empfehlungen zur Preisspekulation gibt es bewusst nicht.

import { istTitel } from "./lv.js";

export const RISIKO_BLOCK = 60;
export const MAX_VORBEMERKUNGEN = 12000;
export const RISIKO_ART = {
  unklar: "Unklarer Text", fehlende_angabe: "Fehlende Angabe", mengenrisiko: "Mengenrisiko",
  vertragsrisiko: "Vertragsrisiko", abgrenzung: "Abgrenzung VOB/C", nachtragspotenzial: "Nachtragspotenzial", technisch: "Technisch",
};

const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const zahlDe = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

export const RISIKO_WERKZEUG = {
  name: "lv_pruefung_abgeben",
  description: "Gibt Risiken und Bieterfragen zum LV ab.",
  input_schema: {
    type: "object",
    properties: {
      risiken: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nr: { type: "integer", description: "Nummer der Position (#), weglassen bei Vorbemerkungen oder dem LV als Ganzem" },
            art: { type: "string", enum: Object.keys(RISIKO_ART) },
            schwere: { type: "string", enum: ["hoch", "mittel", "hinweis"] },
            text: { type: "string", description: "Was das Risiko ist, ein bis zwei Sätze" },
            empfehlung: { type: "string", description: "Wie man in der Kalkulation oder im Angebot damit umgeht" },
          },
          required: ["art", "schwere", "text"],
        },
      },
      bieterfragen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nr: { type: "integer", description: "Nummer der Position (#), weglassen bei allgemeinen Fragen" },
            frage: { type: "string", description: "Die Frage an den Auftraggeber, sachlich und präzise, als ganzer Satz" },
            grund: { type: "string", description: "Wofür die Antwort gebraucht wird (intern)" },
          },
          required: ["frage"],
        },
      },
    },
    required: ["risiken", "bieterfragen"],
  },
};

export function risikoPrompt({ projekt, angebotTitel } = {}) {
  return `Du bist erfahrener Kalkulator und Bauleiter in einem deutschen Bauunternehmen und liest ein Leistungsverzeichnis in der Angebotsphase.

Suche nach:
- unklaren oder widersprüchlichen Positionstexten
- fehlenden Angaben, die man zum Kalkulieren braucht (z.B. Homogenbereiche, Betonfestigkeits- und Expositionsklasse, Dicken, Fabrikat, Transportwege, Entsorgungsklasse)
- Mengenrisiken: Pauschalen mit unklarem Umfang, Bedarfs- und Eventualpositionen, Mengen, die zueinander nicht passen
- Vertragsrisiken in den Vorbemerkungen: Vertragsstrafen, verlängerte Gewährleistung, hohe Sicherheiten, Abweichungen von der VOB/B, Bauzeit, Risiken, die auf den Auftragnehmer verlagert werden
- Abgrenzung nach VOB/C: Leistungen, die als Nebenleistung erwartet werden, aber Besondere Leistungen sein können
- Nachtragspotenzial: Leistungen, die wahrscheinlich fehlen oder deren Menge voraussichtlich steigt

Regeln:
1. Nur echte, belastbare Punkte, keine Selbstverständlichkeiten. Lieber zehn gute als dreißig schwache.
2. Nachtragspotenzial sachlich benennen. Keine Empfehlungen, Preise spekulativ zu verteilen.
3. Bieterfragen formulierst du so, dass man sie unverändert an den Auftraggeber schicken kann: höflich, präzise, mit Bezug auf die Position. Eine Frage je Punkt.
4. Keine Preise. Deutsch, knapp. Rufe am Ende genau einmal lv_pruefung_abgeben auf.

Projekt: ${projekt?.name || "unbekannt"}${projekt?.ort ? `, ${projekt.ort}` : ""}${angebotTitel ? `\nLV/Angebot: ${angebotTitel}` : ""}`;
}

export function lvText(eintraege) {
  return eintraege.map(({ nr, pos }) => {
    if (istTitel(pos)) return `— ${String(pos.bez).replace(/─/g, "").trim()} —`;
    if (pos.typ === "hinweis" || (!Number(pos.menge) && !pos.einheit)) return `   Hinweis: ${kurz(pos.bez || pos.langtext, 600)}`;
    return `#${nr}${pos.oz ? ` | OZ ${pos.oz}` : ""} | ${zahlDe(pos.menge)} ${pos.einheit || ""}${pos.bedarf ? " | Bedarfsposition" : ""}${pos.alternativ ? " | Alternativposition" : ""} | ${kurz(pos.bez, 160)}`
      + (pos.langtext ? `\n   ${kurz(pos.langtext, 900)}` : "");
  }).join("\n");
}

function nummerieren(positionen) {
  let nr = 0;
  return (positionen || []).map(pos => {
    const istPos = !istTitel(pos) && pos.typ !== "hinweis" && (Number(pos.menge) || pos.einheit);
    return { nr: istPos ? ++nr : null, pos };
  });
}

export async function lvPruefen({ positionen, vorbemerkungen = "", kontext, rufeKi, onFortschritt }) {
  const eintraege = nummerieren(positionen);
  const teile = [];
  let aktuell = [];
  for (const e of eintraege) {
    aktuell.push(e);
    if (aktuell.filter(x => x.nr).length >= RISIKO_BLOCK) { teile.push(aktuell); aktuell = []; }
  }
  if (aktuell.length) teile.push(aktuell);
  const vb = String(vorbemerkungen || "").trim().slice(0, MAX_VORBEMERKUNGEN);
  if (!teile.length && vb) teile.push([]);

  const risiken = [], fragen = [];
  for (let i = 0; i < teile.length; i++) {
    onFortschritt?.(i + 1, teile.length);
    const inhalt = [
      i === 0 && vb ? `Vorbemerkungen / Vertragsbedingungen:\n${vb}` : null,
      teile[i].length ? `Leistungsverzeichnis${teile.length > 1 ? ` (Teil ${i + 1} von ${teile.length})` : ""}:\n${lvText(teile[i])}` : null,
    ].filter(Boolean).join("\n\n");
    const antwort = await rufeKi(risikoPrompt(kontext), [{ role: "user", content: inhalt }], [RISIKO_WERKZEUG], { type: "tool", name: RISIKO_WERKZEUG.name });
    const aufruf = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === RISIKO_WERKZEUG.name);
    const posZu = nr => nr == null ? null : teile[i].find(x => x.nr === Number(nr))?.pos || null;
    for (const r of aufruf?.input?.risiken || []) {
      if (!String(r.text || "").trim()) continue;
      const pos = posZu(r.nr);
      risiken.push({ id: `risiko:${risiken.length}`, posId: pos?.id ?? null, oz: pos?.oz || "", art: RISIKO_ART[r.art] ? r.art : "unklar",
        schwere: ["hoch", "mittel", "hinweis"].includes(r.schwere) ? r.schwere : "hinweis",
        text: String(r.text).trim(), ...(r.empfehlung ? { empfehlung: String(r.empfehlung).trim() } : {}) });
    }
    for (const f of aufruf?.input?.bieterfragen || []) {
      const frage = String(f.frage || "").trim();
      if (!frage || fragen.some(x => norm(x.frage) === norm(frage))) continue;
      const pos = posZu(f.nr);
      fragen.push({ id: `frage:${fragen.length}`, posId: pos?.id ?? null, oz: pos?.oz || "", bez: pos?.bez || "", frage, grund: String(f.grund || "").trim() });
    }
  }
  const rang = { hoch: 0, mittel: 1, hinweis: 2 };
  return { risiken: risiken.sort((a, b) => rang[a.schwere] - rang[b.schwere]), fragen };
}

// Bieterfragen als Text zum Kopieren oder Versenden
export function bieterfragenText(fragen, { projekt, angebotTitel, firma } = {}) {
  const kopf = `Bieterfragen${angebotTitel ? ` zu „${angebotTitel}“` : ""}${projekt?.name ? `, ${projekt.name}` : ""}`;
  const liste = fragen.map((f, i) => `${i + 1}. ${f.oz ? `Pos. ${f.oz}: ` : ""}${f.frage}`).join("\n\n");
  return `${kopf}\n\nSehr geehrte Damen und Herren,\n\nzur Erstellung unseres Angebots bitten wir um Klärung folgender Punkte:\n\n${liste}\n\nVielen Dank im Voraus.\n\nMit freundlichen Grüßen\n${firma?.name || ""}`.trim();
}
