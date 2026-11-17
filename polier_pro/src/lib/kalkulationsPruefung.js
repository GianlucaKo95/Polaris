// Zweiter Kalkulator (1.80): prüft eine fertige Kalkulation vor der Abgabe.
//
// Zwei Stufen:
//   Regeln  sofort und ohne KI: fehlende Preise, Preisampel gegen eigene
//           frühere Angebote, Material ohne Lohn, gleiche Leistung mit
//           unterschiedlichem Preis, große Pauschalen, abweichende Zuschläge,
//           unsichere KI-Vorkalkulation.
//   KI      liest Text und Aufbau jeder Position wie ein Kollege: vergessene
//           Nebenleistungen, unplausible Zeitansätze und Materialmengen,
//           fehlendes Gerät, Widersprüche, und Leistungen, die im ganzen LV
//           fehlen. Die KI nennt keine Preise, sie zeigt auf Stellen.
//
// Befund: { id, posId|null, quelle: "regel"|"ki", art, schwere: "hoch"|"mittel"|"hinweis", text, vorschlag? }

import { istTitel } from "./lv.js";
import { kalkulationAufschluesselung, ZUSCHLAG_FELD } from "./kalkulation.js";

export const SCHWERE_REIHENFOLGE = { hoch: 0, mittel: 1, hinweis: 2 };
const ARBEIT = /(herstell|einbau|einbring|verleg|montag|montier|liefern und|setzen|mauer|betonier|verfüll|abbruch|abbrech|schal|bewehr|verputz|streich|beschicht|dämm|abdicht|pflaster|aushub|ausheb)/i;
const PAUSCHAL = /^(psch|pauschal|pau)$/i;

const zahlDe = (n, st = 2) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();

export function posLabel(pos, positionen) {
  if (pos?.oz) return pos.oz;
  const nr = (positionen || []).filter(p => !istTitel(p)).indexOf(pos) + 1;
  return nr > 0 ? String(nr) : "–";
}

// Aufbau je Einheit aus der Kalkulation: Lohnstunden, Material, Gerät, NU-Anteil
export function positionAufbau(pos, kalkulationspreise) {
  const menge = Number(pos?.menge) || 0;
  if (!pos?.kalk || !menge) return null;
  const finde = id => (kalkulationspreise || []).find(k => k.id === id);
  const zeilen = (posten, art) => (posten || []).map(p => {
    const k = finde(p.stammId);
    return { art, bez: k?.bezeichnung || "?", einheit: k?.einheit || "", jeEinheit: (Number(p.menge) || 0) / menge };
  }).filter(z => z.jeEinheit > 0);
  const lohn = zeilen(pos.kalk.lohnposten, "lohn");
  return {
    stunden: lohn.filter(z => z.einheit === "h").reduce((s, z) => s + z.jeEinheit, 0),
    lohn, material: zeilen(pos.kalk.materialposten, "material"), geraet: zeilen(pos.kalk.geraetPosten, "geraet"),
    fremdleistungJeEinheit: (Number(pos.kalk.fremdleistung) || 0) / menge,
  };
}

export function aufbauText(a) {
  if (!a) return "kein Aufbau (EP direkt)";
  const t = [...a.lohn, ...a.material, ...a.geraet].map(z => `${zahlDe(z.jeEinheit, 3)} ${z.einheit} ${z.bez}`);
  if (a.fremdleistungJeEinheit > 0) t.push(`Fremdleistung ${eur(a.fremdleistungJeEinheit)}`);
  return t.length ? t.join(" + ") : "leer";
}

export function regelPruefung(positionen, { kalkulationspreise = [], standardZuschlaege = null, preispruefung = null } = {}) {
  const befunde = [];
  const liste = (positionen || []).filter(p => p && !istTitel(p));
  const neu = (pos, art, schwere, text, vorschlag) =>
    befunde.push({ id: `regel:${art}:${pos?.id ?? "lv"}`, posId: pos?.id ?? null, quelle: "regel", art, schwere, text, ...(vorschlag ? { vorschlag } : {}) });
  const netto = liste.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.ep) || 0), 0);
  const gleiche = new Map();

  for (const p of liste) {
    const menge = Number(p.menge) || 0, ep = Number(p.ep) || 0;
    if (ep <= 0 && menge > 0) neu(p, "ohne_preis", "hoch", "Ohne Preis — geht mit 0 € ins Angebot");
    if (ep > 0 && menge <= 0 && !p.bedarf && !p.alternativ) neu(p, "ohne_menge", "hinweis", "Preis ohne Menge — zählt nicht zur Summe", "Menge prüfen oder als Bedarfsposition kennzeichnen");
    const ampel = preispruefung?.jePosition?.[p.id];
    if (ep > 0 && (ampel?.ampel === "rot" || ampel?.ampel === "gelb")) {
      neu(p, "preisvergleich", ampel.ampel === "rot" ? "hoch" : "mittel", `Preis ${String(ampel.text).replace(/\.$/, "")}`);
    }
    if (p.kalk && menge > 0) {
      const k = kalkulationAufschluesselung(p.kalk, kalkulationspreise);
      if (k.material > 0 && k.lohn === 0 && k.fremdleistung === 0 && ARBEIT.test(`${p.bez} ${p.langtext || ""}`)) {
        neu(p, "ohne_lohn", "mittel", "Nur Material kalkuliert, aber der Text beschreibt Arbeit", "Lohnstunden ergänzen oder Fremdleistung ansetzen");
      }
      if (standardZuschlaege) {
        const abw = Object.entries(ZUSCHLAG_FELD)
          .filter(([kostenart, feld]) => k[kostenart] > 0 && p.kalk[feld] != null && standardZuschlaege[feld] != null && Math.abs(p.kalk[feld] - standardZuschlaege[feld]) >= 0.5)
          .map(([kostenart, feld]) => `${{ lohn: "Lohn", material: "Material", geraet: "Gerät", fremdleistung: "NU" }[kostenart]} ${zahlDe(p.kalk[feld], 1)} % statt ${zahlDe(standardZuschlaege[feld], 1)} %`);
        if (abw.length) neu(p, "zuschlag", "hinweis", `Zuschläge weichen vom Angebot ab: ${abw.join(", ")}`, "Gewollt? Sonst Zuschläge des Angebots anwenden");
      }
    }
    if (PAUSCHAL.test(String(p.einheit || "").trim()) && netto > 0 && menge * ep > netto * 0.1) {
      neu(p, "pauschal", "mittel", `Pauschale mit ${zahlDe(menge * ep / netto * 100, 0)} % der Angebotssumme`, "Umfang und Risiko der Pauschale prüfen");
    }
    if (p.kiKalkulation && p.preisquelle?.art !== "manuell") {
      if (p.kiKalkulation.sicherheit === "niedrig") neu(p, "ki_unsicher", "mittel", "KI-Vorkalkulation mit niedriger Sicherheit", p.kiKalkulation.begruendung);
      else if (p.kiKalkulation.fehlt?.length) neu(p, "ki_fehlt", "mittel", `KI-Vorkalkulation unvollständig: ${p.kiKalkulation.fehlt.join(", ")}`);
    }
    const schluessel = `${norm(p.bez)}|${norm(p.einheit)}`;
    if (ep > 0 && norm(p.bez).length > 8) {
      const vorher = gleiche.get(schluessel);
      if (vorher && Math.abs(vorher.ep - ep) / Math.max(vorher.ep, ep) > 0.1) {
        neu(p, "widerspruch", "mittel", `Gleiche Leistung wie Pos. ${posLabel(vorher, positionen)}, aber ${eur(ep)} statt ${eur(vorher.ep)}`);
      } else if (!vorher) gleiche.set(schluessel, p);
    }
  }
  return sortieren(befunde);
}

export function sortieren(befunde) {
  return [...befunde].sort((a, b) => (SCHWERE_REIHENFOLGE[a.schwere] ?? 9) - (SCHWERE_REIHENFOLGE[b.schwere] ?? 9));
}

export function zaehlen(befunde) {
  const z = { hoch: 0, mittel: 0, hinweis: 0 };
  for (const b of befunde) z[b.schwere] = (z[b.schwere] || 0) + 1;
  return z;
}

// ── KI-Prüfung ──
export const PRUEF_BLOCK = 40;

export const PRUEF_WERKZEUG = {
  name: "pruefung_abgeben",
  description: "Gibt das Ergebnis der Prüfung ab. Nur echte Auffälligkeiten.",
  input_schema: {
    type: "object",
    properties: {
      befunde: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nr: { type: "integer", description: "Nummer der Position (#)" },
            art: { type: "string", enum: ["nebenleistung", "zeitansatz", "material", "geraet", "widerspruch", "text", "sonstiges"] },
            schwere: { type: "string", enum: ["hoch", "mittel", "hinweis"] },
            text: { type: "string", description: "Was auffällt, ein Satz" },
            vorschlag: { type: "string", description: "Was der Kalkulator prüfen oder ändern sollte, ein Satz" },
          },
          required: ["nr", "art", "schwere", "text"],
        },
      },
      fehlende_leistungen: {
        type: "array",
        description: "Leistungen, die für dieses Vorhaben üblicherweise nötig sind, aber in keiner Position vorkommen",
        items: { type: "object", properties: { text: { type: "string" }, begruendung: { type: "string" } }, required: ["text"] },
      },
    },
    required: ["befunde"],
  },
};

export function pruefSystemPrompt({ projekt, angebotTitel } = {}) {
  return `Du bist ein zweiter, erfahrener Kalkulator in einem deutschen Bauunternehmen und prüfst die Kalkulation eines Kollegen, bevor das Angebot rausgeht.

Prüfe jede Position anhand von Kurztext, Langtext, Einheit und Aufbau je Einheit:
- vergessene Nebenleistungen, die laut Text geschuldet sind, im Aufbau aber fehlen (z.B. Schalung bei Ortbeton, Entsorgung, Hohlkehle, Anschlüsse, Verschnitt)
- Zeitansätze, die deutlich von üblichen Aufwandswerten abweichen (zu niedrig ist teurer als zu hoch)
- Materialmengen in falscher Größenordnung oder ohne Verschnitt
- fehlendes Gerät, wo es üblicherweise nötig ist
- Widersprüche zwischen Positionen und unklare Texte, die ein Kalkulationsrisiko sind

Regeln:
1. Nur echte, belastbare Auffälligkeiten. Keine Selbstverständlichkeiten, keine Stilfragen. Lieber fünf gute Befunde als zwanzig schwache. Unauffällige Positionen lässt du weg.
2. Schwere: hoch = kostet sicher Geld oder ist falsch; mittel = wahrscheinlich zu knapp, prüfen; hinweis = Annahme dokumentieren.
3. Nenne keine Preise. Zeitansätze und Mengen darfst du nennen ("üblich sind eher 0,4–0,5 h/m²").
4. fehlende_leistungen nur, wenn sie für dieses Vorhaben naheliegen und in keiner Position stecken.
5. Rufe am Ende genau einmal pruefung_abgeben auf. Deutsch, knapp.

Projekt: ${projekt?.name || "unbekannt"}${projekt?.ort ? `, ${projekt.ort}` : ""}${angebotTitel ? `\nAngebot: ${angebotTitel}` : ""}`;
}

export function pruefBlockText(eintraege, kalkulationspreise) {
  return eintraege.map(({ nr, pos }) => {
    if (istTitel(pos)) return `— ${String(pos.bez).replace(/─/g, "").trim()} —`;
    const a = positionAufbau(pos, kalkulationspreise);
    return `#${nr}${pos.oz ? ` | OZ ${pos.oz}` : ""} | ${zahlDe(pos.menge, 3)} ${pos.einheit || ""} | EP ${eur(pos.ep)} | ${kurz(pos.bez, 140)}`
      + (pos.langtext ? `\n   Langtext: ${kurz(pos.langtext, 450)}` : "")
      + `\n   Aufbau je ${pos.einheit || "Einheit"}: ${aufbauText(a)}`;
  }).join("\n");
}

export async function kiPruefen({ positionen, kalkulationspreise, kontext, rufeKi, onFortschritt }) {
  // Titel bleiben als Gliederung im Text, nummeriert werden nur Positionen
  let nr = 0;
  const eintraege = (positionen || []).map(pos => ({ nr: istTitel(pos) ? null : ++nr, pos }));
  const teile = [];
  let aktuell = [];
  for (const e of eintraege) {
    aktuell.push(e);
    if (aktuell.filter(x => x.nr).length >= PRUEF_BLOCK) { teile.push(aktuell); aktuell = []; }
  }
  if (aktuell.some(x => x.nr)) teile.push(aktuell);

  const befunde = [], fehlend = [];
  for (let i = 0; i < teile.length; i++) {
    onFortschritt?.(i + 1, teile.length);
    const antwort = await rufeKi(pruefSystemPrompt(kontext),
      [{ role: "user", content: `Positionen${teile.length > 1 ? ` (Teil ${i + 1} von ${teile.length})` : ""}:\n${pruefBlockText(teile[i], kalkulationspreise)}` }],
      [PRUEF_WERKZEUG], { type: "tool", name: PRUEF_WERKZEUG.name });
    const aufruf = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === PRUEF_WERKZEUG.name);
    for (const b of aufruf?.input?.befunde || []) {
      const e = teile[i].find(x => x.nr === Number(b.nr));
      if (!e || !String(b.text || "").trim()) continue;
      befunde.push({ id: `ki:${e.pos.id}:${befunde.length}`, posId: e.pos.id, quelle: "ki", art: b.art || "sonstiges",
        schwere: SCHWERE_REIHENFOLGE[b.schwere] != null ? b.schwere : "hinweis", text: String(b.text).trim(),
        ...(b.vorschlag ? { vorschlag: String(b.vorschlag).trim() } : {}) });
    }
    for (const f of aufruf?.input?.fehlende_leistungen || []) {
      if (f?.text && !fehlend.some(x => norm(x.text) === norm(f.text))) fehlend.push({ text: String(f.text).trim(), begruendung: String(f.begruendung || "").trim() });
    }
  }
  return { befunde: sortieren(befunde), fehlend };
}
