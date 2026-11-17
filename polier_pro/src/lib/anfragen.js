// NU- und Lieferanten-Anfragen (1.88).
//
// Die KI schnürt aus dem LV Leistungspakete, die man üblicherweise an
// Nachunternehmer vergibt (Gerüst, Abdichtung, Dach …), und aus dem
// Materialbedarf der Kalkulation Pakete für Lieferanten (Baustoffhandel,
// Betonwerk, Stahlhandel …). Der Anfragetext entsteht aus einer festen
// Vorlage, damit jede Anfrage dieselben Angaben enthält. NU-Pakete gehen
// zusätzlich als GAEB D83 raus; die Rückläufe (D84/X84 oder PDF) liest der
// NU-Preisspiegel.

import { istTitel } from "./lv.js";

const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const zahlDe = (n, st = 2) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
const datumDe = s => s ? new Date(`${s}T12:00:00`).toLocaleDateString("de-DE") : "";

export const PAKET_WERKZEUG = {
  name: "pakete_abgeben",
  description: "Gibt die Anfragepakete ab.",
  input_schema: {
    type: "object",
    properties: {
      pakete: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "z.B. 'Abdichtung', 'Gerüst', 'Transportbeton'" },
            art: { type: "string", enum: ["nu", "lieferant"] },
            positionen: { type: "array", items: { type: "integer" }, description: "nu: unsere Positionsnummern (#)" },
            bausteine: { type: "array", items: { type: "string" }, description: "lieferant: ids der Materialbausteine" },
            begruendung: { type: "string", description: "Warum dieses Paket, ein Satz" },
          },
          required: ["name", "art"],
        },
      },
    },
    required: ["pakete"],
  },
};

export function paketPrompt(gewerkeFirma = []) {
  return `Du bereitest für einen Bauunternehmer die Anfragen an Nachunternehmer und Lieferanten vor.
- NU-Pakete: Fasse LV-Positionen zu Leistungspaketen zusammen, die man üblicherweise geschlossen an einen Nachunternehmer vergibt. Leistungen, die der Betrieb selbst ausführt${gewerkeFirma.length ? ` (eigene Gewerke: ${gewerkeFirma.join(", ")})` : ""}, und Positionen, die schon als Fremdleistung kalkuliert sind, gehören hinein, wenn sie typisch vergeben werden.
- Lieferanten-Pakete: Fasse Materialbausteine so zusammen, wie man sie bei einem Lieferanten anfragt (Baustoffhandel, Betonwerk, Stahlhändler, Fachhandel).
- Jede Position und jeder Baustein höchstens in einem Paket. Lieber wenige, sinnvolle Pakete.
Rufe genau einmal ${PAKET_WERKZEUG.name} auf.`;
}

export function paketKontext(positionen, materialBedarf, kalkulationspreise) {
  let nr = 0;
  const posMap = new Map();
  const lv = (positionen || []).map(p => {
    if (istTitel(p)) return `— ${String(p.bez).replace(/─/g, "").trim()} —`;
    posMap.set(++nr, p);
    const nu = Number(p.kalk?.fremdleistung) > 0 ? " | als Fremdleistung kalkuliert" : "";
    return `#${nr}${p.oz ? ` | OZ ${p.oz}` : ""} | ${zahlDe(p.menge, 3)} ${p.einheit || ""} | ${kurz(p.bez, 120)}${nu}`;
  }).join("\n");
  const mat = (kalkulationspreise || []).filter(k => k.kategorie === "material" && (materialBedarf?.get(String(k.id)) || 0) > 0)
    .map(k => `${k.id} | ${kurz(k.bezeichnung, 80)} | Bedarf ${zahlDe(materialBedarf.get(String(k.id)), 2)} ${k.einheit}`).join("\n");
  return { text: `LV:\n${lv}\n\nMaterialbedarf (id | Baustein | Bedarf):\n${mat || "keiner"}`, posMap };
}

export function paketeAuswerten(input, posMap, kalkulationspreise, materialBedarf) {
  const vergeben = new Set(), vergebenB = new Set();
  const pakete = [];
  for (const p of input?.pakete || []) {
    if (!p?.name) continue;
    if (p.art === "nu") {
      const pos = (p.positionen || []).map(n => posMap.get(Number(n))).filter(x => x && !vergeben.has(x.id));
      pos.forEach(x => vergeben.add(x.id));
      if (pos.length) pakete.push({ id: `pk${pakete.length}`, name: String(p.name).trim(), art: "nu", positionIds: pos.map(x => x.id), begruendung: String(p.begruendung || "") });
    } else if (p.art === "lieferant") {
      const b = (p.bausteine || []).map(id => (kalkulationspreise || []).find(k => String(k.id) === String(id)))
        .filter(k => k && k.kategorie === "material" && (materialBedarf?.get(String(k.id)) || 0) > 0 && !vergebenB.has(String(k.id)));
      b.forEach(k => vergebenB.add(String(k.id)));
      if (b.length) pakete.push({ id: `pk${pakete.length}`, name: String(p.name).trim(), art: "lieferant", bausteinIds: b.map(k => k.id), begruendung: String(p.begruendung || "") });
    }
  }
  return pakete;
}

export async function paketeVorschlagen({ positionen, materialBedarf, kalkulationspreise, gewerkeFirma, rufeKi }) {
  const { text, posMap } = paketKontext(positionen, materialBedarf, kalkulationspreise);
  const antwort = await rufeKi(paketPrompt(gewerkeFirma), [{ role: "user", content: text }], [PAKET_WERKZEUG], { type: "tool", name: PAKET_WERKZEUG.name });
  const input = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === PAKET_WERKZEUG.name)?.input;
  if (!input) throw new Error("Die KI hat keine Pakete geliefert");
  return paketeAuswerten(input, posMap, kalkulationspreise, materialBedarf);
}

// Zeilen eines Pakets für Text und Export
export function paketZeilen(paket, positionen, kalkulationspreise, materialBedarf) {
  if (paket.art === "nu") {
    return (positionen || []).filter(p => paket.positionIds.includes(p.id))
      .map(p => ({ oz: p.oz || "", text: p.bez, langtext: p.langtext || "", menge: Number(p.menge) || 0, einheit: p.einheit || "" }));
  }
  return paket.bausteinIds.map(id => (kalkulationspreise || []).find(k => String(k.id) === String(id))).filter(Boolean)
    .map(k => ({ oz: "", text: k.bezeichnung, langtext: "", menge: Math.ceil((materialBedarf?.get(String(k.id)) || 0) * 100) / 100, einheit: k.einheit }));
}

export function anfrageText(paket, zeilen, { projekt, firma, absender, abgabe, ausfuehrung } = {}) {
  const nu = paket.art === "nu";
  const ort = [projekt?.adresse, [projekt?.plz, projekt?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const liste = zeilen.map(z => `- ${z.oz ? `${z.oz} ` : ""}${z.text}: ${zahlDe(z.menge, 3)} ${z.einheit}`).join("\n");
  const betreff = `Anfrage ${paket.name} – ${projekt?.name || "Bauvorhaben"}`;
  const text = `Sehr geehrte Damen und Herren,

für das Bauvorhaben ${projekt?.name || ""}${ort ? `, ${ort}` : ""} bitten wir um Ihr Angebot für ${nu ? "folgende Leistungen" : "folgendes Material"} (${paket.name}):

${liste}
${nu ? "\nDas Leistungsverzeichnis liegt als GAEB-Datei (D83) bei. Bitte bepreisen Sie es und senden es als GAEB D84/X84 oder PDF zurück.\n" : "\nBitte geben Sie Preise frei Baustelle an, mit Lieferbedingungen, Fracht- und Mindermengenzuschlägen.\n"}${ausfuehrung ? `\nGeplante Ausführung: ${ausfuehrung}` : ""}${abgabe ? `\nWir bitten um Ihr Angebot bis zum ${datumDe(abgabe)}.` : ""}
Bitte nennen Sie Vorbehalte und Bindefrist ausdrücklich.

Mit freundlichen Grüßen
${[absender, firma?.name].filter(Boolean).join("\n")}`;
  return { betreff, text };
}
