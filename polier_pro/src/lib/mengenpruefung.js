// Mengenprüfung des Auftraggeber-LV (1.86).
//
// Beim Einheitspreisvertrag werden die LV-Mengen des Auftraggebers bepreist,
// abgerechnet wird aber nach Aufmaß. Wer vorher selbst nachmisst, sieht
// Mehrmengen (Mehrerlös, ggf. neuer Preis nach § 2 Abs. 3 VOB/B) und
// Mindermengen (Deckungslücke bei Gemeinkosten). Die eigene Menge liegt
// deshalb in pos.eigeneMenge und überschreibt die LV-Menge nie.
//
// Die KI ermittelt eigene Mengen aus Plänen, OHNE die LV-Mengen zu sehen,
// damit sie nicht zum vorgegebenen Wert hin rechnet.

import { istTitel } from "./lv.js";
import { formelAuswerten, aufmassSumme } from "./aufmass.js";

export const SCHWELLE = 0.1;   // § 2 Abs. 3 VOB/B: ±10 %
const r3 = n => Math.round(n * 1000) / 1000;
const zahlDe = (n, st = 3) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export function eigeneMengeAusAufmass({ zeilen, abzugsregelGrenze = 0, einheit }) {
  const s = aufmassSumme(zeilen, einheit, abzugsregelGrenze);
  return { menge: s.summe, quelle: "aufmass", zeilen, toleranz: s.toleranz };
}

export function vergleich(positionen, { schwelle = SCHWELLE } = {}) {
  const zeilen = [];
  for (const p of positionen || []) {
    if (istTitel(p) || p.typ === "hinweis") continue;
    const lv = Number(p.menge) || 0;
    const e = p.eigeneMenge?.menge;
    const ep = Number(p.ep) || 0;
    if (e == null) { zeilen.push({ pos: p, lv, eigen: null, abw: null, bewertung: "offen", wirkung: 0 }); continue; }
    const abw = lv > 0 ? (e - lv) / lv : (e > 0 ? Infinity : 0);
    const tol = p.eigeneMenge.toleranz || 0;
    // Schätzungen mit großer Toleranz zählen erst, wenn die Abweichung sie übersteigt
    const grenze = Math.max(schwelle, tol);
    const bewertung = Math.abs(abw) <= grenze ? "passt" : abw > 0 ? "mehrmenge" : "mindermenge";
    zeilen.push({ pos: p, lv, eigen: e, abw, bewertung, wirkung: (e - lv) * ep, unsicher: tol > schwelle });
  }
  return zeilen;
}

export function summen(zeilen) {
  const s = { mehrmenge: 0, mindermenge: 0, passt: 0, offen: 0, mehrerloes: 0, deckungsluecke: 0 };
  for (const z of zeilen) {
    s[z.bewertung]++;
    if (z.bewertung === "mehrmenge") s.mehrerloes += z.wirkung;
    if (z.bewertung === "mindermenge") s.deckungsluecke += z.wirkung;
  }
  return s;
}

export function bewertungText(z) {
  if (z.bewertung === "mehrmenge") return `Mehrmenge ${z.abw === Infinity ? "" : `+${Math.round(z.abw * 100)} % `}: wird nach Aufmaß abgerechnet; über 10 % kann ein neuer Preis verlangt werden (§ 2 Abs. 3 VOB/B)`;
  if (z.bewertung === "mindermenge") return `Mindermenge ${Math.round(z.abw * 100)} %: Gemeinkostenanteil im EP wird nicht voll gedeckt; über 10 % kann eine Preiserhöhung verlangt werden (§ 2 Abs. 3 VOB/B)`;
  if (z.bewertung === "passt") return "Im Rahmen";
  return "Noch keine eigene Menge";
}

// Deutliche Abweichungen als Bieterfragen (lib/lvRisiken.js-Format)
export function bieterfragenAusAbweichungen(zeilen) {
  return zeilen.filter(z => z.bewertung === "mehrmenge" || z.bewertung === "mindermenge").map((z, i) => ({
    id: `menge:${z.pos.id}:${i}`, posId: z.pos.id, oz: z.pos.oz || "", bez: z.pos.bez,
    frage: `Nach unserer Mengenermittlung ergeben sich für diese Position ca. ${zahlDe(z.eigen)} ${z.pos.einheit} statt ${zahlDe(z.lv)} ${z.pos.einheit}. Können Sie die ausgeschriebene Menge bitte prüfen?`,
    grund: "Mengenprüfung",
  }));
}

// ── KI: eigene Mengen je LV-Position aus Plänen ──
export const MENGEN_JE_POS_WERKZEUG = {
  name: "mengen_je_position",
  description: "Gibt die ermittelte Menge je LV-Position ab.",
  input_schema: {
    type: "object",
    properties: {
      positionen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nr: { type: "integer" },
            formel: { type: "string", description: "Rechenweg, deutsche Dezimalzahlen, z.B. '2*(12,40+8,00)*2,75-4*1,01*2,01'" },
            grundlage: { type: "string", description: "Woher die Maße stammen (Plan, Maßkette, Raumstempel, Schnitt)" },
            sicherheit: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
          },
          required: ["nr", "formel", "grundlage", "sicherheit"],
        },
      },
      hinweise: { type: "array", items: { type: "string" } },
    },
    required: ["positionen"],
  },
};

export function mengenPrompt() {
  return `Du bist erfahrener Kalkulator und prüfst die Mengen eines Leistungsverzeichnisses, indem du sie selbst aus den Plänen ermittelst.
- Ermittle für jede Position die Menge in ihrer Einheit, mit Rechenweg wie auf einem Aufmaßblatt. Abrechnungsregeln der VOB/C (z.B. Übermessen kleiner Öffnungen) beachten und in der Grundlage nennen.
- Maße nur aus Bemaßung, Maßketten, Raumstempeln, Schnitten und Beschriftungen. Nicht aus der Zeichnung abmessen, nichts erfinden.
- Positionen, die sich aus den Plänen nicht ermitteln lassen (Pauschalen, Stundenlohn, fehlende Pläne), lässt du weg.
- sicherheit: hoch = direkt aus Bemaßung; mittel = Annahmen nötig; niedrig = grob.
Rufe am Ende genau einmal ${MENGEN_JE_POS_WERKZEUG.name} auf. Deutsch.`;
}

// Positionen OHNE LV-Menge an die KI
export function positionenText(eintraege) {
  return eintraege.map(({ nr, pos }) => `#${nr}${pos.oz ? ` | OZ ${pos.oz}` : ""} | Einheit ${pos.einheit || "?"} | ${kurz(pos.bez, 140)}${pos.langtext ? `\n   ${kurz(pos.langtext, 500)}` : ""}`).join("\n");
}

const TOLERANZ = { hoch: 0.03, mittel: 0.1, niedrig: 0.25 };

export async function kiMengenErmitteln({ positionen, anhangBloecke, rufeKi, blockGroesse = 40, onFortschritt }) {
  const liste = (positionen || []).filter(p => !istTitel(p) && p.typ !== "hinweis" && p.einheit && !/^(psch|pauschal|h|std)$/i.test(String(p.einheit).trim()));
  const ergebnis = new Map(); const hinweise = [];
  for (let i = 0; i < liste.length; i += blockGroesse) {
    onFortschritt?.(i / blockGroesse + 1, Math.ceil(liste.length / blockGroesse));
    const block = liste.slice(i, i + blockGroesse).map((pos, j) => ({ nr: j + 1, pos }));
    const antwort = await rufeKi(mengenPrompt(), [{ role: "user", content: [...anhangBloecke, { type: "text", text: `Positionen:\n${positionenText(block)}` }] }],
      [MENGEN_JE_POS_WERKZEUG], { type: "tool", name: MENGEN_JE_POS_WERKZEUG.name });
    const r = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === MENGEN_JE_POS_WERKZEUG.name)?.input;
    for (const e of r?.positionen || []) {
      const b = block.find(x => x.nr === Number(e.nr));
      const menge = formelAuswerten(e.formel);
      if (!b || menge == null || menge < 0) continue;
      ergebnis.set(b.pos.id, { menge: r3(menge), quelle: "ki", formel: String(e.formel), grundlage: String(e.grundlage || ""),
        sicherheit: e.sicherheit, toleranz: TOLERANZ[e.sicherheit] ?? 0.25 });
    }
    hinweise.push(...(r?.hinweise || []).map(String));
  }
  return { ergebnis, hinweise };
}
