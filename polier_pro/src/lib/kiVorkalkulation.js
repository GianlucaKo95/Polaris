// KI-Vorkalkulation eines Leistungsverzeichnisses (1.79).
//
// Ein importiertes LV hat Positionen mit Text, Einheit und Menge, aber ohne
// Preis. Die KI schlägt je Position vor, wie sie kalkuliert wird:
//   katalog   eine passende Referenz aus dem Stammdatenverzeichnis
//             (Stammposition, Einheitspreis, frühere LV-Position)
//   rezeptur  ein Aufbau je Mengeneinheit aus den Kostenbausteinen der Firma
//             (Lohnstunden = Zeitansatz, Material inkl. Verschnitt, Gerät)
//   offen     nicht sinnvoll vorzukalkulieren (unklarer Text,
//             Nachunternehmerleistung ohne Baustein …)
//
// Grundsatz wie beim Angebots-Agenten: Die KI nennt nie einen Preis. Sie
// wählt Referenzen und Mengen je Einheit; Preise kommen aus den Stammdaten
// der Firma (bzw. dem Preisstand des Angebots). Jeder Vorschlag trägt eine
// Sicherheit und eine Begründung und wird erst nach Bestätigung übernommen.

import { katalogSuchen, katalogEintrag, einheitNormalisieren } from "./katalog.js";
import { positionAusStammposition, stammpositionKalk, stammpositionZeitansatz } from "./stammpositionen.js";
import { kalkulationEp } from "./kalkulation.js";
import { istTitel } from "./lv.js";

export const BLOCKGROESSE = 12;
export const SICHERHEIT = { hoch: "hoch", mittel: "mittel", niedrig: "niedrig" };
const MAX_STUNDEN_JE_EINHEIT = 200;
const PAUSCHAL = new Set(["psch", "pauschal", "pau"]);

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const zahlDe = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const gleicheId = (a, b) => String(a) === String(b);

// Positionen, die eine Vorkalkulation brauchen: keine Titel, mit Text, ohne
// Preis (oder alle, wenn neu kalkuliert werden soll).
export function zuKalkulieren(positionen, { alle = false } = {}) {
  return (positionen || []).filter(p => p && !istTitel(p) && String(p.bez || "").trim()
    && (alle || !(Number(p.ep) > 0)));
}

export function kandidatenFuer(pos, katalog, max = 5) {
  const text = [pos.bez, kurz(pos.langtext, 160)].filter(Boolean).join(" ");
  return katalogSuchen(katalog, text, { einheit: pos.einheit || null, max });
}

export const WERKZEUG = {
  name: "vorkalkulation_abgeben",
  description: "Gibt die Vorkalkulation für alle Positionen dieses Blocks ab. Für JEDE Position genau einen Eintrag.",
  input_schema: {
    type: "object",
    properties: {
      positionen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nr: { type: "integer", description: "Nummer der Position aus der Liste (#)" },
            art: { type: "string", enum: ["katalog", "rezeptur", "offen"] },
            ref: { type: "string", description: "Nur bei art=katalog: Referenz eines Kandidaten, z.B. SP:12" },
            variablen: { type: "object", description: "Nur bei Stammpositionen mit Variablen: abweichende Werte, z.B. { \"d\": 0.3 }" },
            rezeptur: {
              type: "array",
              description: "Nur bei art=rezeptur: Bausteine je EINE Mengeneinheit der Position",
              items: {
                type: "object",
                properties: {
                  baustein: { type: "string", description: "id des Kostenbausteins aus der Liste" },
                  mengeJeEinheit: { type: "number", description: "Menge des Bausteins je Einheit der Position, z.B. 0.35 (h je m²)" },
                },
                required: ["baustein", "mengeJeEinheit"],
              },
            },
            fehlt: { type: "array", items: { type: "string" }, description: "Bausteine, die für eine vollständige Kalkulation fehlen, z.B. 'Material: Dichtschlämme'" },
            sicherheit: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
            begruendung: { type: "string", description: "1–2 Sätze: warum diese Referenz bzw. woher der Zeitansatz" },
          },
          required: ["nr", "art", "sicherheit", "begruendung"],
        },
      },
    },
    required: ["positionen"],
  },
};

export function systemPrompt({ projekt, gewerke } = {}) {
  return `Du bist erfahrener Baukalkulator in einem deutschen Bauunternehmen und kalkulierst die Positionen eines Leistungsverzeichnisses vor. Ein Kalkulator prüft jeden Vorschlag, bevor er übernommen wird.

Regeln:
1. Du nennst NIEMALS einen Preis. Preise kommen ausschließlich aus den Stammdaten der Firma.
2. Passt ein Kandidat aus dem Katalog nach Leistung UND Einheit, nimm ihn (art=katalog). Stammpositionen (SP:) vor Einheitspreisen (EP:) vor früheren LV-Positionen (LV:). Ein Kandidat, der nur ähnlich klingt, ist kein Treffer.
3. Sonst baue eine Rezeptur je EINE Mengeneinheit der Position aus den Kostenbausteinen (art=rezeptur): Lohnstunden mit realistischem Zeitansatz nach üblichen Aufwandswerten, Material inkl. üblichem Verschnitt, Gerätestunden. Nur ids aus der Bausteinliste verwenden. Achte auf die Einheit des Bausteins (h, m², m³, t, Stk …).
4. Fehlt ein nötiger Baustein, nimm die vorhandenen und nenne den Rest unter fehlt. Sicherheit dann höchstens mittel.
5. Nachunternehmerleistungen ohne passenden Fremdleistungs-Baustein, Stundenlohn- und Bedarfspositionen mit unklarem Umfang oder unverständliche Texte: art=offen mit kurzer Begründung.
6. Sicherheit: hoch = Standardleistung, Text eindeutig, Katalogtreffer oder gängiger Aufwandswert; mittel = Annahmen nötig; niedrig = grobe Schätzung.
7. Begründung konkret und kurz, z.B. „0,35 h/m² Facharbeiter: Aufwandswert Perimeterdämmung geklebt, 5 % Verschnitt“.
8. Rufe am Ende genau einmal vorkalkulation_abgeben auf, mit einem Eintrag für JEDE Position. Antworte auf Deutsch.

Projekt: ${projekt?.name || "unbekannt"}${projekt?.ort ? `, ${projekt.ort}` : ""}${projekt?.typ ? ` (Bauart: ${projekt.typ})` : ""}${gewerke?.length ? `\nGewerke der Firma: ${gewerke.join(", ")}` : ""}`;
}

export function bausteineText(kalkulationspreise) {
  const zeilen = (kalkulationspreise || []).filter(k => k?.bezeichnung)
    .map(k => `${k.id} | ${k.kategorie} | ${kurz(k.bezeichnung, 70)} | ${k.einheit || ""}`);
  return zeilen.length ? `Kostenbausteine der Firma (id | Kategorie | Bezeichnung | Einheit):\n${zeilen.join("\n")}` : "Die Firma hat noch keine Kostenbausteine hinterlegt — nur Katalogtreffer oder offen möglich.";
}

export function blockText(block) {
  return block.map(({ nr, pos, kandidaten }) => {
    const kopf = `#${nr}${pos.oz ? ` | OZ ${pos.oz}` : ""} | ${zahlDe(pos.menge)} ${pos.einheit || ""} | ${kurz(pos.bez, 140)}`;
    const lang = pos.langtext ? `\n   Langtext: ${kurz(pos.langtext, 500)}` : "";
    const kand = kandidaten.length
      ? `\n   Kandidaten: ${kandidaten.map(k => `${k.ref} „${kurz(k.bez, 70)}“ [${k.einheit}]${k.variablen ? ` Variablen: ${k.variablen.map(v => `${v.name}=${v.standard} (${v.bez})`).join(", ")}` : ""}`).join("; ")}`
      : "\n   Kandidaten: keine";
    return kopf + lang + kand;
  }).join("\n\n");
}

// Prüft einen Vorschlag gegen Katalog und Bausteine. Ungültiges wird nicht
// still repariert, sondern als offen mit Grund zurückgegeben.
export function vorschlagPruefen(e, pos, { katalog, kalkulationspreise }) {
  const basis = { art: e?.art, sicherheit: SICHERHEIT[e?.sicherheit] || "niedrig", begruendung: String(e?.begruendung || "").trim(),
    fehlt: (e?.fehlt || []).filter(Boolean).map(String) };
  const offen = grund => ({ ...basis, art: "offen", begruendung: grund, sicherheit: "niedrig" });
  if (e?.art === "offen") return { ...basis, art: "offen" };
  if (e?.art === "katalog") {
    const eintrag = e.ref ? katalogEintrag(katalog, e.ref) : null;
    if (!eintrag) return offen(`Vorgeschlagene Referenz ${e.ref || "–"} gibt es nicht`);
    const pauschal = PAUSCHAL.has(einheitNormalisieren(pos.einheit));
    if (!pauschal && einheitNormalisieren(eintrag.einheit) !== einheitNormalisieren(pos.einheit)) {
      return offen(`${eintrag.ref} ist in ${eintrag.einheit}, die Position in ${pos.einheit}`);
    }
    return { ...basis, ref: eintrag.ref, eintrag, ...(e.variablen && Object.keys(e.variablen).length ? { variablen: e.variablen } : {}) };
  }
  if (e?.art === "rezeptur") {
    const zeilen = [];
    for (const z of e.rezeptur || []) {
      const stamm = (kalkulationspreise || []).find(k => gleicheId(k.id, z.baustein));
      if (!stamm) return offen(`Baustein ${z.baustein} gibt es nicht`);
      const m = Number(z.mengeJeEinheit);
      if (!Number.isFinite(m) || m <= 0) return offen(`Menge für „${stamm.bezeichnung}“ fehlt`);
      if (stamm.kategorie === "lohn" && stamm.einheit === "h" && m > MAX_STUNDEN_JE_EINHEIT && !PAUSCHAL.has(einheitNormalisieren(pos.einheit))) {
        return offen(`${zahlDe(m)} h je ${pos.einheit} ist unplausibel`);
      }
      zeilen.push({ stammId: stamm.id, mengeJeEinheit: Math.round(m * 10000) / 10000 });
    }
    if (!zeilen.length) return offen("Rezeptur ohne Bausteine");
    return { ...basis, rezeptur: zeilen, ...(basis.fehlt.length && basis.sicherheit === "hoch" ? { sicherheit: "mittel" } : {}) };
  }
  return offen("Kein verwertbarer Vorschlag");
}

// Stammposition auf Zeit, aus der Rezeptur eines Vorschlags
function rezepturSp(pos, rezeptur) {
  return { id: "__ki", bez: pos.bez, einheit: pos.einheit, rezeptur, fremdleistungJeEinheit: 0 };
}

// Vorschau für die Prüfliste: EP und Zeitansatz, wie sie übernommen würden.
export function vorschlagVorschau(v, pos, { stammpositionen = [], kalkulationspreise = [], standardZuschlaege = null }) {
  if (v.art === "katalog") {
    const e = v.eintrag;
    if (e.quelle === "stammposition") {
      const sp = stammpositionen.find(s => `SP:${s.id}` === e.ref);
      if (sp) {
        const p = positionAusStammposition(sp, Number(pos.menge) || 1, kalkulationspreise, standardZuschlaege, { stammpositionen, variablen: v.variablen });
        return { ep: r2(p.ep), stunden: stammpositionZeitansatz(sp, kalkulationspreise, { stammpositionen, variablen: p.variablen }), quelle: e.bez };
      }
    }
    return { ep: r2(e.ep), stunden: null, quelle: e.bez };
  }
  if (v.art === "rezeptur") {
    const sp = rezepturSp(pos, v.rezeptur);
    const menge = Number(pos.menge) || 1;
    const kalk = stammpositionKalk(sp, menge, kalkulationspreise, standardZuschlaege);
    return { ep: r2(kalkulationEp(kalk, kalkulationspreise, menge)), stunden: stammpositionZeitansatz(sp, kalkulationspreise), quelle: null };
  }
  return { ep: null, stunden: null, quelle: null };
}

export function rezepturText(rezeptur, kalkulationspreise) {
  return (rezeptur || []).map(z => {
    const k = (kalkulationspreise || []).find(x => gleicheId(x.id, z.stammId));
    return `${zahlDe(z.mengeJeEinheit)} ${k?.einheit || ""} ${k?.bezeichnung || "?"}`.replace(/\s+/g, " ");
  }).join(" + ");
}

// Übernimmt einen geprüften Vorschlag in die Position. Text, OZ, Einheit und
// Menge des LV bleiben unverändert — der Auftraggeber hat sie vorgegeben.
export function vorschlagAnwenden(pos, v, { stammpositionen = [], kalkulationspreise = [], standardZuschlaege = null, jetzt = new Date() }) {
  if (!v || v.art === "offen") return pos;
  const menge = Number(pos.menge) || 0;
  const ki = { art: v.art, sicherheit: v.sicherheit, begruendung: v.begruendung, am: jetzt.toISOString(),
    ...(v.fehlt?.length ? { fehlt: v.fehlt } : {}) };
  if (v.art === "katalog") {
    const e = v.eintrag;
    const preisquelle = { art: e.quelle, ref: e.ref, bez: e.bez };
    if (e.quelle === "stammposition") {
      const sp = stammpositionen.find(s => `SP:${s.id}` === e.ref);
      if (sp) {
        const p = positionAusStammposition(sp, menge, kalkulationspreise, standardZuschlaege, { stammpositionen, variablen: v.variablen });
        return { ...pos, kalk: p.kalk, ep: p.ep, stammpositionId: sp.id, ...(p.variablen ? { variablen: p.variablen } : {}),
          preisquelle, kiKalkulation: { ...ki, ref: e.ref } };
      }
    }
    const { kalk, stammpositionId, variablen, ...rest } = pos;
    return { ...rest, ep: r2(e.ep), preisquelle, kiKalkulation: { ...ki, ref: e.ref } };
  }
  const sp = rezepturSp(pos, v.rezeptur);
  const kalk = stammpositionKalk(sp, menge, kalkulationspreise, standardZuschlaege);
  const { stammpositionId, variablen, ...rest } = pos;
  return { ...rest, kalk, ep: menge ? kalkulationEp(kalk, kalkulationspreise, menge) : vorschlagVorschau(v, pos, { kalkulationspreise, standardZuschlaege }).ep,
    preisquelle: { art: "ki_rezeptur" }, kiKalkulation: { ...ki, rezeptur: v.rezeptur } };
}

// Mengenänderung an einer KI-Rezeptur-Position: Rezeptur neu hochrechnen,
// Zuschläge der Position behalten. null, wenn die Position keine hat.
export function rezepturMengeAendern(pos, neueMenge, kalkulationspreise) {
  if (pos?.stammpositionId || !pos?.kiKalkulation?.rezeptur || !pos.kalk) return null;
  const zuschlaege = { zuschlagLohn: pos.kalk.zuschlagLohn, zuschlagMaterial: pos.kalk.zuschlagMaterial,
    zuschlagGeraet: pos.kalk.zuschlagGeraet, zuschlagFremdleistung: pos.kalk.zuschlagFremdleistung };
  const kalk = stammpositionKalk(rezepturSp(pos, pos.kiKalkulation.rezeptur), neueMenge, kalkulationspreise, zuschlaege);
  return { ...pos, menge: neueMenge, kalk, ep: neueMenge ? kalkulationEp(kalk, kalkulationspreise, neueMenge) : pos.ep };
}

// Rezeptur-Vorschlag als neue Stammposition der Firma merken
export function alsStammposition(pos, v, gewerk = "") {
  return { id: Date.now() + Math.floor(Math.random() * 1000), bez: pos.bez, langtext: pos.langtext || "", gewerk, einheit: pos.einheit,
    variablen: [], rezeptur: v.rezeptur.map(z => ({ stammId: z.stammId, mengeJeEinheit: z.mengeJeEinheit })), fremdleistungJeEinheit: 0,
    herkunft: { art: "ki_vorkalkulation", am: new Date().toISOString().slice(0, 10), begruendung: v.begruendung } };
}

// Ein Block Positionen an die KI. rufeKi(system, messages, tools, toolChoice)
// liefert die rohe Antwort. Ergebnis: Map pos.id → geprüfter Vorschlag.
export async function blockVorkalkulieren({ block, katalog, kalkulationspreise, kontext, rufeKi }) {
  const nummeriert = block.map((pos, i) => ({ nr: i + 1, pos, kandidaten: kandidatenFuer(pos, katalog) }));
  const inhalt = `${bausteineText(kalkulationspreise)}\n\nPositionen:\n${blockText(nummeriert)}`;
  const antwort = await rufeKi(systemPrompt(kontext), [{ role: "user", content: inhalt }], [WERKZEUG], { type: "tool", name: WERKZEUG.name });
  const aufruf = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === WERKZEUG.name);
  const liste = Array.isArray(aufruf?.input?.positionen) ? aufruf.input.positionen : [];
  const ergebnis = new Map();
  for (const { nr, pos } of nummeriert) {
    const e = liste.find(x => Number(x?.nr) === nr);
    ergebnis.set(pos.id, e ? vorschlagPruefen(e, pos, { katalog, kalkulationspreise })
      : { art: "offen", sicherheit: "niedrig", begruendung: "Die KI hat zu dieser Position nichts geliefert", fehlt: [] });
  }
  return ergebnis;
}

export function bloecke(positionen, groesse = BLOCKGROESSE) {
  const b = [];
  for (let i = 0; i < positionen.length; i += groesse) b.push(positionen.slice(i, i + groesse));
  return b;
}

export function zusammenfassung(vorschlaege) {
  const s = { gesamt: 0, katalog: 0, rezeptur: 0, offen: 0, hoch: 0, mittel: 0, niedrig: 0 };
  for (const v of vorschlaege.values()) {
    s.gesamt++; s[v.art]++;
    if (v.art !== "offen") s[v.sicherheit]++;
  }
  return s;
}
