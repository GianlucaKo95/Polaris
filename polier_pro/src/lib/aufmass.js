// Aufmaß aus Plänen und Fotos (1.83).
//
// Ein Aufmaß besteht aus Zeilen wie auf dem Aufmaßblatt: Bezeichnung, Formel
// (z.B. "12,40*2,75"), Ergebnis, Einheit, Abzug ja/nein. Zeilen entstehen
//   - durch Messen im Plan oder Foto (Strecke, Linienzug, Fläche, Stück),
//   - aus dem Plantext (Raumstempel mit m²),
//   - aus der KI, die Maßketten und Beschriftungen liest oder im Foto
//     anhand eines Bezugsmaßes schätzt,
//   - von Hand.
// Jede Zeile behält ihre Quelle und ggf. eine Toleranz, damit erkennbar
// bleibt, was gemessen, gelesen oder geschätzt ist.

export const PT_IN_M = 25.4 / 72 / 1000;   // ein PDF-Punkt auf dem Papier in Meter

export const QUELLE = { messung: "Gemessen", plantext: "Aus dem Plan", ki: "KI", hand: "Von Hand", foto: "Foto, geschätzt" };

// Übermessungsregeln: Öffnungen bis zur Grenze werden nicht abgezogen.
// Werte nach VOB/C, im Einzelfall gilt der Vertrag.
export const ABZUGSREGELN = [
  { key: "alle", label: "Alle Öffnungen abziehen", grenze: 0 },
  { key: "putz", label: "Putz, Maler: bis 2,5 m² übermessen (DIN 18350, 18363)", grenze: 2.5 },
  { key: "fliesen", label: "Fliesen: bis 0,1 m² übermessen (DIN 18352)", grenze: 0.1 },
];

const r3 = n => Math.round(n * 1000) / 1000;
export const zahlDe = (n, st = 2) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });

// ── Geometrie (Bildpunkte) ──
export function abstand(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
export function linienzugLaenge(punkte) {
  let s = 0;
  for (let i = 1; i < (punkte || []).length; i++) s += abstand(punkte[i - 1], punkte[i]);
  return s;
}
export function polygonFlaeche(punkte) {
  const p = punkte || [];
  if (p.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}
export function polygonUmfang(punkte) {
  return (punkte || []).length < 2 ? 0 : linienzugLaenge([...punkte, punkte[0]]);
}

// Meter je Bildpunkt
export function massstabAusKalibrierung(a, b, laengeM) {
  const px = abstand(a, b);
  return px > 0 && laengeM > 0 ? laengeM / px : null;
}
export function massstabAusPdf(planMassstab, renderFaktor) {
  return planMassstab > 0 && renderFaktor > 0 ? PT_IN_M * planMassstab / renderFaktor : null;
}

// ── Formeln: Zahlen (Komma oder Punkt), + − * / ( ), sonst nichts ──
export function formelAuswerten(text) {
  const s = String(text ?? "").replace(/\s+/g, "").replace(/×|x(?=[\d(])/gi, "*").replace(/:/g, "/").replace(/−/g, "-");
  if (!s) return null;
  let i = 0;
  const zahl = () => {
    const m = s.slice(i).match(/^\d+(?:[.,]\d+)?/);
    if (!m) throw new Error("Zahl erwartet");
    i += m[0].length;
    return Number(m[0].replace(",", "."));
  };
  const faktor = () => {
    if (s[i] === "-") { i++; return -faktor(); }
    if (s[i] === "+") { i++; return faktor(); }
    if (s[i] === "(") { i++; const v = summe(); if (s[i] !== ")") throw new Error(") fehlt"); i++; return v; }
    return zahl();
  };
  const produkt = () => {
    let v = faktor();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++]; const w = faktor();
      v = op === "*" ? v * w : v / w;
    }
    return v;
  };
  const summe = () => {
    let v = produkt();
    while (s[i] === "+" || s[i] === "-") { const op = s[i++]; const w = produkt(); v = op === "+" ? v + w : v - w; }
    return v;
  };
  try {
    const v = summe();
    return i === s.length && Number.isFinite(v) ? r3(v) : null;
  } catch { return null; }
}

// ── Zeilen ──
let zaehler = 0;
export function neueZeile(teil = {}) {
  const formel = teil.formel ?? (teil.menge != null ? zahlDe(teil.menge, 3) : "");
  return { id: `z${Date.now().toString(36)}${(zaehler++).toString(36)}`, bez: "", einheit: "m²", abzug: false, quelle: "hand", ...teil,
    formel, menge: teil.menge ?? formelAuswerten(formel) ?? 0 };
}

export function zeileAendern(z, teil) {
  const n = { ...z, ...teil };
  if ("formel" in teil) n.menge = formelAuswerten(teil.formel) ?? 0;
  return n;
}

// Messung (Bildpunkte + m/px) → Zeile
export function zeileAusMessung(messung, mProPx, { foto = false, referenzPx = null } = {}) {
  const { art, punkte } = messung;
  let menge, einheit;
  if (art === "flaeche") { menge = polygonFlaeche(punkte) * mProPx * mProPx; einheit = "m²"; }
  else if (art === "zaehlen") { menge = punkte.length; einheit = "Stk"; }
  else { menge = linienzugLaenge(punkte) * mProPx; einheit = "m"; }
  const t = foto && art !== "zaehlen" ? fotoToleranz(messung, referenzPx) : null;
  return neueZeile({ bez: messung.bez || { flaeche: "Fläche", strecke: "Länge", zaehlen: "Anzahl" }[art] || "Messung", menge: r3(menge),
    formel: zahlDe(menge, 3), einheit, quelle: foto ? "foto" : "messung", messungId: messung.id, ...(t ? { toleranz: t } : {}) });
}

// Fotos sind perspektivisch verzerrt: je weiter das Maß vom Bezugsmaß weg
// liegt (Größe, Lage), desto unsicherer. Grobe, ehrliche Spanne statt
// Scheingenauigkeit. Flächen verdoppeln den Längenfehler etwa.
export function fotoToleranz(messung, referenzPx) {
  const groesse = messung.art === "flaeche" ? Math.sqrt(polygonFlaeche(messung.punkte)) : linienzugLaenge(messung.punkte);
  const verhaeltnis = referenzPx > 0 && groesse > 0 ? Math.abs(Math.log2(groesse / referenzPx)) : 2;
  const linear = Math.min(0.25, 0.06 + 0.03 * verhaeltnis);
  return Math.round((messung.art === "flaeche" ? Math.min(0.4, linear * 2) : linear) * 100) / 100;
}

// Summe in einer Einheit, mit Übermessungsregel für Abzüge
export function aufmassSumme(zeilen, einheit, grenze = 0) {
  const norm = e => String(e || "").toLowerCase().replace("²", "2").replace("³", "3").replace(/^qm$/, "m2").replace(/^(st|stück|stck)$/, "stk");
  let summe = 0, uebermessen = 0, toleranz = 0;
  for (const z of zeilen || []) {
    if (norm(z.einheit) !== norm(einheit)) continue;
    const m = Number(z.menge) || 0;
    if (z.abzug) {
      if (grenze > 0 && m <= grenze) { uebermessen++; continue; }
      summe -= m;
    } else {
      summe += m;
      toleranz += m * (z.toleranz || 0);
    }
  }
  return { summe: r3(summe), uebermessen, toleranz: summe > 0 ? Math.round(toleranz / summe * 100) / 100 : 0 };
}

export function einheitenIn(zeilen) {
  return [...new Set((zeilen || []).map(z => z.einheit).filter(Boolean))];
}

// Raumstempel aus dem Plantext (lib/pdfPlan.js) → Zeilen
export function zeilenAusRaumstempeln(raeume) {
  return (raeume || []).flatMap(r => [
    neueZeile({ bez: `${r.raum}${r.art ? ` (${r.art})` : ""}`, menge: r.flaeche, einheit: "m²", quelle: "plantext" }),
    ...(r.umfang ? [neueZeile({ bez: `${r.raum}, Umfang`, menge: r.umfang, einheit: "m", quelle: "plantext" })] : []),
  ]);
}

// ── KI: Maße lesen (Plan) bzw. schätzen (Foto) ──
export const MASS_WERKZEUG = {
  name: "aufmass_abgeben",
  description: "Gibt die abgelesenen oder geschätzten Aufmaßzeilen ab.",
  input_schema: {
    type: "object",
    properties: {
      zeilen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            bez: { type: "string", description: "Was gemessen wird, z.B. 'Wand Achse A–C, EG'" },
            formel: { type: "string", description: "Rechenweg mit deutschen Dezimalzahlen, z.B. '12,40*2,75'" },
            einheit: { type: "string", enum: ["m", "m²", "m³", "Stk"] },
            abzug: { type: "boolean", description: "true für Öffnungen/Abzüge" },
            grundlage: { type: "string", description: "Woher die Maße stammen, z.B. 'Maßkette Achse A–C' oder 'geschätzt über Tür 2,01 m'" },
            toleranz: { type: "number", description: "Nur bei Schätzungen: relative Unsicherheit, z.B. 0.1 für ±10 %" },
          },
          required: ["bez", "formel", "einheit"],
        },
      },
      hinweise: { type: "array", items: { type: "string" }, description: "Was nicht lesbar war oder angenommen wurde" },
    },
    required: ["zeilen"],
  },
};

export function massPrompt({ art, ziel, referenz }) {
  const gemeinsam = `Du bist erfahrener Bauleiter und erstellst ein Aufmaß${ziel ? ` für: ${ziel}` : ""}. Ergebnis als Aufmaßzeilen mit nachvollziehbarer Formel (deutsche Dezimalzahlen, * für mal). Öffnungen als eigene Zeilen mit abzug=true. Rufe am Ende genau einmal aufmass_abgeben auf. Deutsch.`;
  if (art === "foto") {
    return `${gemeinsam}
Das ist ein FOTO, kein Plan. Schätze Maße nur über das Bezugsmaß${referenz ? `: ${referenz}` : " (sichtbare Normmaße wie Türen 2,01 m, Mauersteine, Fliesen)"}.
Gib bei jeder Zeile die Grundlage und eine ehrliche toleranz an (selten unter 0.1). Perspektive beachten: Flächen schräg zur Kamera sind verkürzt. Was nicht sichtbar ist, nicht erfinden, sondern unter hinweise nennen.`;
  }
  return `${gemeinsam}
Das ist ein PLAN. Lies Maße ausschließlich aus Bemaßungen, Maßketten, Raumstempeln und Beschriftungen (Höhen aus Schnitten, z.B. LH, RH). Nicht aus der Zeichnung abmessen. Gib die Grundlage je Zeile an. Fehlt ein Maß, keine Zeile erfinden, sondern unter hinweise nennen.`;
}

export async function kiAufmass({ bildBlock, art, ziel, referenz, rufeKi }) {
  const antwort = await rufeKi(massPrompt({ art, ziel, referenz }),
    [{ role: "user", content: [bildBlock, { type: "text", text: ziel ? `Aufmaß für: ${ziel}` : "Erstelle das Aufmaß der erkennbaren Bauteile." }] }],
    [MASS_WERKZEUG], { type: "tool", name: MASS_WERKZEUG.name });
  const aufruf = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === MASS_WERKZEUG.name);
  const zeilen = [];
  for (const z of aufruf?.input?.zeilen || []) {
    const menge = formelAuswerten(z.formel);
    if (menge == null || !String(z.bez || "").trim()) continue;
    const toleranz = art === "foto" ? Math.max(0.1, Math.min(0.5, Number(z.toleranz) || 0.15)) : null;
    zeilen.push(neueZeile({ bez: String(z.bez).trim(), formel: String(z.formel).trim(), menge, einheit: z.einheit || "m²", abzug: !!z.abzug,
      quelle: art === "foto" ? "foto" : "ki", grundlage: String(z.grundlage || "").trim(), ...(toleranz ? { toleranz } : {}) }));
  }
  return { zeilen, hinweise: (aufruf?.input?.hinweise || []).map(String) };
}
