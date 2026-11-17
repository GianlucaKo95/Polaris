// Kalkulations-Copilot (1.84): von der Anfrage zum kalkulierten LV in
// sichtbaren, änderbaren Schritten.
//
//   1 Eingabe      Text, Diktat, Fotos, Pläne
//   2 Verstehen    Bauteile, Annahmen, Rückfragen (beantwortbar)
//   3 Mengen       Aufmaßzeilen je Bauteil mit Rechenweg (lib/aufmass.js)
//   4 Positionen   LV-Positionen; die Menge kommt aus der Aufmaßsumme eines
//                  Bauteils × Faktor, bleibt also an das Aufmaß gebunden
//   5 Kalkulation  wie die KI-Vorkalkulation (lib/kiVorkalkulation.js)
//   6 Prüfung      Regeln des zweiten Kalkulators (lib/kalkulationsPruefung.js)
//   7 Übernehmen   Positionen samt Aufmaß und Annahmen ins Angebot
//
// Jeder KI-Schritt bekommt das bestätigte Ergebnis der Schritte davor als
// Text. Wird ein früherer Schritt geändert, gelten die späteren als veraltet
// und werden auf Wunsch neu erzeugt. Preise nennt die KI nie.

import { neueZeile, formelAuswerten, aufmassSumme, zahlDe } from "./aufmass.js";

export const SCHRITTE = [
  { key: "eingabe", label: "Eingabe" },
  { key: "verstehen", label: "Verstehen" },
  { key: "mengen", label: "Mengen" },
  { key: "positionen", label: "Positionen" },
  { key: "kalkulation", label: "Kalkulation" },
  { key: "pruefung", label: "Prüfung" },
];

const kurz = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const id = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function toolErgebnis(antwort, name) {
  return (antwort?.content || []).find(b => b.type === "tool_use" && b.name === name)?.input || null;
}

const GRUND = `Du bist erfahrener Kalkulator und Bauleiter in einem deutschen Bauunternehmen und arbeitest Schritt für Schritt mit einem Kollegen an einer Kalkulation. Er prüft jeden Schritt, bevor es weitergeht. Du nennst nie Preise. Deutsch, fachlich, knapp.`;

// ── Schritt 2: Verstehen ──
export const VERSTEHEN_WERKZEUG = {
  name: "verstaendnis_abgeben",
  description: "Gibt das Verständnis der Anfrage ab.",
  input_schema: {
    type: "object",
    properties: {
      zusammenfassung: { type: "string", description: "Was gebaut werden soll, 2–3 Sätze" },
      bauteile: {
        type: "array",
        description: "Bauteile bzw. Leistungsbereiche, für die Mengen ermittelt werden",
        items: { type: "object", properties: { bez: { type: "string" }, beschreibung: { type: "string", description: "Aufbau, Material, Besonderheiten" } }, required: ["bez"] },
      },
      annahmen: { type: "array", items: { type: "string" }, description: "Getroffene Annahmen, die im Angebot stehen sollten" },
      rueckfragen: {
        type: "array",
        items: { type: "object", properties: { frage: { type: "string" }, vorschlag: { type: "string", description: "Vorgeschlagene Antwort, falls der Kollege nichts weiß" } }, required: ["frage"] },
      },
    },
    required: ["zusammenfassung", "bauteile"],
  },
};

export function eingabeInhalt(eingabe, anhaenge = []) {
  return [
    ...anhaenge.flatMap(a => a.bloecke || (a.block ? [a.block] : [])),
    { type: "text", text: `Anfrage:\n${eingabe.text || "(nur Anhänge)"}${anhaenge.length ? `\n\nAnhänge: ${anhaenge.map(a => a.name).join(", ")}` : ""}` },
  ];
}

export async function verstehen({ eingabe, anhaenge, projekt, rufeKi }) {
  const system = `${GRUND}
Schritt 1 von 5: Verstehe die Anfrage. Gliedere sie in Bauteile bzw. Leistungsbereiche (z.B. "Bodenplatte", "Außenwände EG", "Dachabdichtung"), nenne deine Annahmen und stelle nur Rückfragen, deren Antwort die Kalkulation wirklich verändert (höchstens 6), jeweils mit einem vernünftigen Vorschlag.
Projekt: ${projekt?.name || "unbekannt"}${projekt?.ort ? `, ${projekt.ort}` : ""}. Rufe am Ende genau einmal ${VERSTEHEN_WERKZEUG.name} auf.`;
  const r = toolErgebnis(await rufeKi(system, [{ role: "user", content: eingabeInhalt(eingabe, anhaenge) }], [VERSTEHEN_WERKZEUG], { type: "tool", name: VERSTEHEN_WERKZEUG.name }), VERSTEHEN_WERKZEUG.name);
  if (!r) throw new Error("Die KI hat kein Verständnis geliefert");
  return {
    zusammenfassung: String(r.zusammenfassung || "").trim(),
    bauteile: (r.bauteile || []).filter(b => b?.bez).map(b => ({ id: id("b"), bez: String(b.bez).trim(), beschreibung: String(b.beschreibung || "").trim() })),
    annahmen: (r.annahmen || []).map(String).filter(Boolean),
    rueckfragen: (r.rueckfragen || []).filter(f => f?.frage).map(f => ({ id: id("f"), frage: String(f.frage).trim(), antwort: String(f.vorschlag || "").trim() })),
  };
}

export function verstaendnisText(v) {
  return `Zusammenfassung: ${v.zusammenfassung}
Bauteile:
${v.bauteile.map((b, i) => `B${i + 1} ${b.bez}${b.beschreibung ? `: ${b.beschreibung}` : ""}`).join("\n")}
${v.annahmen.length ? `Annahmen:\n${v.annahmen.map(a => `- ${a}`).join("\n")}` : ""}
${v.rueckfragen.length ? `Rückfragen und Antworten des Kollegen:\n${v.rueckfragen.map(f => `- ${f.frage} → ${f.antwort || "offen, deinen Vorschlag annehmen"}`).join("\n")}` : ""}`.trim();
}

// ── Schritt 3: Mengen ──
export const MENGEN_WERKZEUG = {
  name: "mengen_abgeben",
  description: "Gibt die Aufmaßzeilen je Bauteil ab.",
  input_schema: {
    type: "object",
    properties: {
      bauteile: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nr: { type: "integer", description: "B-Nummer des Bauteils" },
            zeilen: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  bez: { type: "string" }, formel: { type: "string", description: "Rechenweg, deutsche Dezimalzahlen, z.B. '12,40*2,75'" },
                  einheit: { type: "string", enum: ["m", "m²", "m³", "Stk", "t", "psch"] }, abzug: { type: "boolean" },
                  grundlage: { type: "string", description: "Woher das Maß stammt: Plan, Foto (geschätzt), Anfrage, Annahme" },
                  toleranz: { type: "number", description: "Nur bei geschätzten Maßen, z.B. 0.15" },
                },
                required: ["bez", "formel", "einheit"],
              },
            },
          },
          required: ["nr", "zeilen"],
        },
      },
      hinweise: { type: "array", items: { type: "string" } },
    },
    required: ["bauteile"],
  },
};

export async function mengenErmitteln({ eingabe, anhaenge, verstaendnis, rufeKi }) {
  const system = `${GRUND}
Schritt 2 von 5: Ermittle die Mengen je Bauteil als Aufmaßzeilen mit nachvollziehbarer Formel, wie auf einem Aufmaßblatt. Maße aus Plänen nur aus Bemaßung, Raumstempeln und Beschriftung lesen. Aus Fotos nur über erkennbare Bezugsmaße schätzen und eine toleranz angeben. Maße aus der Anfrage übernehmen. Öffnungen als eigene Zeilen mit abzug=true. Was fehlt, nicht erfinden, sondern unter hinweise nennen und, wo sinnvoll, mit einer klar als Annahme bezeichneten Zeile arbeiten.
Rufe am Ende genau einmal ${MENGEN_WERKZEUG.name} auf.`;
  const inhalt = [...eingabeInhalt(eingabe, anhaenge), { type: "text", text: `Bestätigter Stand:\n${verstaendnisText(verstaendnis)}` }];
  const r = toolErgebnis(await rufeKi(system, [{ role: "user", content: inhalt }], [MENGEN_WERKZEUG], { type: "tool", name: MENGEN_WERKZEUG.name }), MENGEN_WERKZEUG.name);
  if (!r) throw new Error("Die KI hat keine Mengen geliefert");
  const jeBauteil = {};
  for (const b of verstaendnis.bauteile) jeBauteil[b.id] = [];
  for (const eintrag of r.bauteile || []) {
    const b = verstaendnis.bauteile[Number(eintrag.nr) - 1];
    if (!b) continue;
    for (const z of eintrag.zeilen || []) {
      const menge = formelAuswerten(z.formel);
      if (menge == null) continue;
      const geschaetzt = Number(z.toleranz) > 0;
      jeBauteil[b.id].push(neueZeile({ bez: String(z.bez || "").trim(), formel: String(z.formel).trim(), menge, einheit: z.einheit || "m²",
        abzug: !!z.abzug, quelle: geschaetzt ? "foto" : "ki", grundlage: String(z.grundlage || "").trim(),
        ...(geschaetzt ? { toleranz: Math.min(0.5, Number(z.toleranz)) } : {}) }));
    }
  }
  return { jeBauteil, hinweise: (r.hinweise || []).map(String) };
}

export function bauteilSummen(bauteil, zeilen) {
  const einheiten = [...new Set((zeilen || []).map(z => z.einheit))];
  return einheiten.map(e => ({ einheit: e, ...aufmassSumme(zeilen, e) }));
}

export function mengenText(verstaendnis, mengen) {
  return verstaendnis.bauteile.map((b, i) => {
    const s = bauteilSummen(b, mengen.jeBauteil[b.id]);
    return `B${i + 1} ${b.bez}: ${s.length ? s.map(x => `${zahlDe(x.summe, 3)} ${x.einheit}`).join(", ") : "keine Mengen"}`;
  }).join("\n");
}

// ── Schritt 4: Positionen ──
export const POSITIONEN_WERKZEUG = {
  name: "positionen_abgeben",
  description: "Gibt die LV-Positionen ab.",
  input_schema: {
    type: "object",
    properties: {
      positionen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titel: { type: "string", description: "Titel/Abschnitt, z.B. 'Erdarbeiten'" },
            kurztext: { type: "string" }, langtext: { type: "string", description: "Leistungsbeschreibung wie im LV, präzise, ohne Preise" },
            einheit: { type: "string" },
            bauteil: { type: "integer", description: "B-Nummer, aus dessen Aufmaß die Menge kommt" },
            mengeEinheit: { type: "string", description: "Welche Aufmaßsumme des Bauteils: m, m², m³, Stk" },
            faktor: { type: "number", description: "Menge = Aufmaßsumme × faktor (meist 1)" },
            menge: { type: "number", description: "Nur wenn die Menge nicht aus einem Aufmaß kommt (z.B. 1 psch)" },
          },
          required: ["kurztext", "einheit"],
        },
      },
    },
    required: ["positionen"],
  },
};

export async function positionenBilden({ verstaendnis, mengen, rufeKi }) {
  const system = `${GRUND}
Schritt 3 von 5: Leite aus Bauteilen und Mengen die LV-Positionen ab, so wie ein erfahrener Kalkulator ein LV aufstellt: Teilleistungen sinnvoll trennen (z.B. Schalung, Bewehrung, Beton), übliche Nebenleistungen nicht als eigene Position, Besondere Leistungen schon. Baustelleneinrichtung als Pauschale, wenn passend.
Die Menge jeder Position kommt aus der Aufmaßsumme eines Bauteils (bauteil, mengeEinheit, faktor), z.B. Bewehrung in t = Betonvolumen m³ × 0,1. Nur wenn kein Aufmaß passt, menge direkt. Rufe am Ende genau einmal ${POSITIONEN_WERKZEUG.name} auf.`;
  const inhalt = `${verstaendnisText(verstaendnis)}\n\nMengen (Aufmaßsummen):\n${mengenText(verstaendnis, mengen)}`;
  const r = toolErgebnis(await rufeKi(system, [{ role: "user", content: inhalt }], [POSITIONEN_WERKZEUG], { type: "tool", name: POSITIONEN_WERKZEUG.name }), POSITIONEN_WERKZEUG.name);
  if (!r) throw new Error("Die KI hat keine Positionen geliefert");
  return (r.positionen || []).filter(p => p?.kurztext && p?.einheit).map(p => {
    const b = p.bauteil ? verstaendnis.bauteile[Number(p.bauteil) - 1] : null;
    return {
      id: id("p"), titel: String(p.titel || "").trim(), bez: String(p.kurztext).trim(), langtext: String(p.langtext || "").trim(), einheit: String(p.einheit).trim(),
      mengeAus: b ? { bauteilId: b.id, einheit: p.mengeEinheit || p.einheit, faktor: Number(p.faktor) > 0 ? Number(p.faktor) : 1 } : null,
      mengeDirekt: b ? null : (Number(p.menge) > 0 ? Number(p.menge) : 1),
    };
  });
}

// Menge einer Copilot-Position: aus der Aufmaßsumme oder direkt
export function positionMenge(p, mengen, grenze = 0) {
  if (!p.mengeAus) return p.mengeDirekt ?? 0;
  const s = aufmassSumme(mengen?.jeBauteil?.[p.mengeAus.bauteilId] || [], p.mengeAus.einheit, grenze);
  return Math.round(s.summe * p.mengeAus.faktor * 1000) / 1000;
}

export function mengenHerkunft(p, verstaendnis) {
  if (!p.mengeAus) return "direkt";
  const b = verstaendnis.bauteile.find(x => x.id === p.mengeAus.bauteilId);
  const f = p.mengeAus.faktor !== 1 ? ` × ${zahlDe(p.mengeAus.faktor, 4)}` : "";
  return `${b?.bez || "?"}, Summe ${p.mengeAus.einheit}${f}`;
}

// Copilot-Positionen → Angebotspositionen (vor der Kalkulation), Titel als Titelzeilen
export function alsAngebotspositionen(positionen, mengen, verstaendnis) {
  const out = [];
  let titel = null;
  for (const p of positionen) {
    if (p.titel && p.titel !== titel) { titel = p.titel; out.push({ id: id("t"), bez: `── ${p.titel} ──`, einheit: "", menge: 0, ep: 0 }); }
    const zeilen = p.mengeAus ? mengen.jeBauteil[p.mengeAus.bauteilId] || [] : null;
    out.push({ id: p.id, bez: p.bez, langtext: p.langtext, einheit: p.einheit, menge: positionMenge(p, mengen), ep: 0,
      ...(zeilen?.length ? { aufmass: { zeilen, abzugsregel: "alle", toleranz: aufmassSumme(zeilen, p.mengeAus.einheit).toleranz, faktor: p.mengeAus.faktor } } : {}),
      copilot: { mengenHerkunft: mengenHerkunft(p, verstaendnis) } });
  }
  return out;
}

export function annahmenListe(verstaendnis) {
  return [
    ...verstaendnis.annahmen,
    ...verstaendnis.rueckfragen.filter(f => f.antwort).map(f => `${kurz(f.frage, 120)} ${f.antwort}`),
  ];
}
