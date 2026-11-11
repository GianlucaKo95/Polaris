// KI-Angebots-Agent: erstellt aus einer formlosen Anfrage ("Projektleiter
// Müller will die Kellerwände abdichten, ca. 40 m Außenwand …") ein
// Angebot aus dem Stammdatenverzeichnis der Firma.
//
// Grundsatz: Die KI rechnet nie frei. Sie darf Preise nur über das Werkzeug
// katalog_suchen holen (lib/katalog.js: Stammpositionen, Einheitspreise,
// Mutter-LVs) und wählt im Vorschlag nur Katalog-Referenzen aus. Den EP
// setzt danach dieser Code aus dem Katalog — eine Position ohne passende
// Referenz bleibt ohne Preis und wird im Editor rot markiert, statt dass die
// KI einen Preis erfindet.
//
// Ablauf (Tool-Use-Schleife, die Werkzeuge laufen hier im Browser):
//   1. KI sucht im Katalog (beliebig oft, max. MAX_RUNDEN Runden).
//   2. Fehlen preisrelevante Angaben, ruft sie rueckfragen_stellen auf —
//      die Schleife hält an, die UI zeigt die Fragen, die Antworten gehen
//      mit agentFortsetzen() als tool_result zurück.
//   3. Am Ende ruft sie angebot_vorschlagen auf → Status "fertig".
//
// Der Dialogverlauf (messages) liegt komplett beim Aufrufer, damit die UI
// zwischen Rückfrage und Antwort beliebig lange warten kann.

import { katalogSuchen, katalogEintrag, einheitNormalisieren } from "./katalog.js";
import { positionAusStammposition } from "./stammpositionen.js";

export const MAX_RUNDEN = 10;

export const WERKZEUGE = [
  {
    name: "katalog_suchen",
    description: "Durchsucht das Stammdatenverzeichnis der Firma (eigene Stammpositionen mit Rezeptur, Einheitspreis-Katalog, Positionen aus früheren Leistungsverzeichnissen) nach Leistungen. Liefert Referenzen mit Einheit und Einheitspreis. Für jede geplante Angebotsposition einzeln aufrufen, mit wenigen fachlichen Stichworten (z.B. 'Perimeterdämmung XPS', 'Baustelleneinrichtung', 'Bodenplatte C25/30').",
    input_schema: {
      type: "object",
      properties: {
        suchbegriff: { type: "string", description: "2–4 fachliche Stichworte der gesuchten Leistung" },
        einheit: { type: "string", description: "Erwartete Abrechnungseinheit, z.B. m², m³, m, Stk, t, Psch (optional)" },
      },
      required: ["suchbegriff"],
    },
  },
  {
    name: "rueckfragen_stellen",
    description: "Stellt dem Nutzer Rückfragen, wenn für Mengen oder Leistungsumfang preisrelevante Angaben fehlen. Höchstens 3 kurze, konkrete Fragen, nur einmal pro Angebot. Nicht nach Dingen fragen, die sich mit einer üblichen Annahme lösen lassen — dann die Annahme im Vorschlag nennen.",
    input_schema: {
      type: "object",
      properties: {
        fragen: { type: "array", items: { type: "string" }, maxItems: 3 },
      },
      required: ["fragen"],
    },
  },
  {
    name: "angebot_vorschlagen",
    description: "Gibt den fertigen Angebotsvorschlag zurück. Jede Position referenziert einen Treffer aus katalog_suchen (Feld ref) oder ref=null, wenn nichts Passendes gefunden wurde. Niemals Preise angeben.",
    input_schema: {
      type: "object",
      properties: {
        titel: { type: "string", description: "Kurzer Angebotstitel" },
        empfaenger: { type: "string", description: "Auftraggeber, falls genannt, sonst leer" },
        annahmen: { type: "array", items: { type: "string" }, description: "Getroffene Annahmen, z.B. 'Wandhöhe 2,50 m angenommen'" },
        positionen: {
          type: "array",
          items: {
            type: "object",
            properties: {
              bez: { type: "string", description: "Positionstext" },
              menge: { type: "number" },
              einheit: { type: "string" },
              ref: { type: ["string", "null"], description: "Referenz aus katalog_suchen, z.B. 'SP:12', oder null" },
              mengen_herleitung: { type: "string", description: "Wie die Menge zustande kommt, z.B. '40 m × 2,50 m = 100 m²'" },
            },
            required: ["bez", "menge", "einheit", "ref", "mengen_herleitung"],
          },
        },
      },
      required: ["titel", "positionen"],
    },
  },
];

export function systemPrompt({ projekt, gewerke } = {}) {
  return `Du bist erfahrener Baukalkulator in einem deutschen Bauunternehmen und erstellst Angebote für Poliere, die selbst keine Kalkulationserfahrung haben.

Regeln:
1. Zerlege die Anfrage in die Leistungen, die ein vollständiges Angebot braucht. Denke an übliche Nebenleistungen (Baustelleneinrichtung, Erdarbeiten, Entsorgung, Gerüst, Schutzmaßnahmen), wenn sie zur Leistung gehören.
2. Suche JEDE Leistung mit katalog_suchen, bevor du sie vorschlägst. Probiere bei keinem Treffer 1–2 andere Stichworte.
3. Du nennst NIEMALS selbst einen Preis. Preise kommen ausschließlich aus dem Katalog über die Referenz (ref). Findest du nichts Passendes, setze ref=null — die Position wird dann ohne Preis zur manuellen Kalkulation markiert.
4. Wähle die Referenz, deren Leistung und Einheit wirklich passt. Bevorzuge Stammpositionen (SP:…) vor Einheitspreisen (EP:…) vor früheren LV-Positionen (LV:…), wenn sie gleich gut passen.
5. Leite Mengen aus den Angaben nachvollziehbar her und schreibe die Rechnung in mengen_herleitung. Rechne Einheiten sauber um (z.B. Wandlänge × Höhe = m²).
6. Fehlen preisrelevante Angaben, die du nicht sinnvoll annehmen kannst, stelle EINMAL mit rueckfragen_stellen bis zu 3 kurze Fragen. Sonst triff übliche Annahmen und liste sie unter annahmen.
7. Schließe immer mit angebot_vorschlagen ab. Antworte auf Deutsch.

Projekt: ${projekt?.name || "unbekannt"}${projekt?.ort ? `, ${projekt.ort}` : ""}${projekt?.typ ? ` (Bauart: ${projekt.typ})` : ""}
${gewerke?.length ? `Gewerke der Firma: ${gewerke.join(", ")}` : ""}`.trim();
}

// Führt ein Werkzeug aus. Nur katalog_suchen liefert ein echtes Ergebnis —
// die beiden anderen beenden die Schleife und werden vom Aufrufer behandelt.
export function werkzeugAusfuehren(name, input, katalog) {
  if (name === "katalog_suchen") {
    const treffer = katalogSuchen(katalog, input?.suchbegriff || "", { einheit: input?.einheit || null, max: 6 });
    if (treffer.length === 0) return { treffer: [], hinweis: "Keine passenden Einträge. Andere Stichworte versuchen oder ref=null verwenden." };
    return {
      treffer: treffer.map(t => ({ ref: t.ref, quelle: t.quelle, bez: t.bez, einheit: t.einheit, ep: t.ep, passung: t.score })),
    };
  }
  return { fehler: `Unbekanntes Werkzeug: ${name}` };
}

function toolUses(antwort) {
  return (antwort?.content || []).filter(b => b.type === "tool_use");
}

// Kernschleife. rufeKi(system, messages, tools) → Anthropic-Antwort. Gibt
// immer den aktualisierten Verlauf zurück, damit der Aufrufer fortsetzen kann.
export async function agentAusfuehren({ messages, katalog, kontext, rufeKi, maxRunden = MAX_RUNDEN }) {
  const verlauf = [...messages];
  const system = systemPrompt(kontext);
  let ohneWerkzeug = 0;
  for (let runde = 0; runde < maxRunden; runde++) {
    const antwort = await rufeKi(system, verlauf, WERKZEUGE);
    verlauf.push({ role: "assistant", content: antwort.content || [] });
    const aufrufe = toolUses(antwort);

    if (aufrufe.length === 0) {
      // KI hat ohne Werkzeug geantwortet — einmal deutlich auffordern,
      // den Vorschlag über das Werkzeug zu liefern, statt Text zu parsen.
      // Zweimal hintereinander ohne Werkzeug heißt fast immer, dass der
      // ki-proxy die Werkzeuge nicht durchreicht (alte Version deployed) —
      // dann sofort abbrechen statt weitere kostenpflichtige Runden zu drehen.
      if (++ohneWerkzeug >= 2) {
        return { status: "fehler", messages: verlauf,
          fehler: "Die KI hat keine Werkzeuge verwendet. Ist die Edge Function ki-proxy in der aktuellen Version deployed (supabase functions deploy ki-proxy)?" };
      }
      verlauf.push({ role: "user", content: "Bitte schließe jetzt mit dem Werkzeug angebot_vorschlagen ab." });
      continue;
    }
    ohneWerkzeug = 0;

    const vorschlag = aufrufe.find(a => a.name === "angebot_vorschlagen");
    if (vorschlag) return { status: "fertig", vorschlag: vorschlag.input || {}, messages: verlauf };

    const rueckfrage = aufrufe.find(a => a.name === "rueckfragen_stellen");
    if (rueckfrage) {
      // Andere, im selben Zug angefragte Suchen sofort beantworten, damit
      // der Verlauf gültig bleibt (jeder tool_use braucht ein tool_result).
      const sofort = aufrufe.filter(a => a.id !== rueckfrage.id).map(a => ({
        type: "tool_result", tool_use_id: a.id, content: JSON.stringify(werkzeugAusfuehren(a.name, a.input, katalog)),
      }));
      return {
        status: "rueckfrage",
        fragen: (rueckfrage.input?.fragen || []).slice(0, 3),
        offen: { toolUseId: rueckfrage.id, sofort },
        messages: verlauf,
      };
    }

    verlauf.push({
      role: "user",
      content: aufrufe.map(a => ({
        type: "tool_result", tool_use_id: a.id, content: JSON.stringify(werkzeugAusfuehren(a.name, a.input, katalog)),
      })),
    });
  }
  return { status: "fehler", fehler: "Die KI ist nach zu vielen Schritten zu keinem Ergebnis gekommen. Bitte die Anfrage genauer beschreiben.", messages: verlauf };
}

export function agentStarten({ anfrage, katalog, kontext, rufeKi }) {
  return agentAusfuehren({ messages: [{ role: "user", content: `Anfrage:\n${anfrage}` }], katalog, kontext, rufeKi });
}

// Setzt nach einer Rückfrage fort: die Antworten des Nutzers gehen als
// tool_result des rueckfragen_stellen-Aufrufs zurück.
export function agentFortsetzen({ messages, offen, fragen, antworten, katalog, kontext, rufeKi }) {
  const text = fragen.map((f, i) => `${f}\n→ ${antworten[i]?.trim() || "keine Angabe, bitte übliche Annahme treffen"}`).join("\n\n");
  const verlauf = [...messages, {
    role: "user",
    content: [...(offen?.sofort || []), { type: "tool_result", tool_use_id: offen.toolUseId, content: text }],
  }];
  return agentAusfuehren({ messages: verlauf, katalog, kontext, rufeKi });
}

// Wandelt den Vorschlag in Angebotspositionen um. Hier — nicht in der KI —
// entsteht der Preis: aus der Referenz im Katalog. Jede Position trägt ihre
// Preisquelle und die Mengenherleitung, damit der Nutzer im Editor sieht,
// woher jede Zahl kommt.
export function vorschlagZuPositionen(vorschlag, { katalog, stammpositionen = [], kalkulationspreise = [], standardZuschlaege = null }) {
  const warnungen = [];
  const positionen = (vorschlag?.positionen || []).filter(p => p?.bez).map(p => {
    const menge = Math.max(0, Number(p.menge) || 0);
    const ki = { herleitung: p.mengen_herleitung || "" };
    const eintrag = p.ref ? katalogEintrag(katalog, p.ref) : null;

    if (p.ref && !eintrag) warnungen.push(`„${p.bez}“: unbekannte Referenz ${p.ref} verworfen.`);
    if (!eintrag) {
      return { bez: p.bez, einheit: p.einheit || "Stk", menge, ep: 0, rabatt: 0,
        preisquelle: { art: "ki_ohne_preis" }, ki };
    }

    if (einheitNormalisieren(eintrag.einheit) !== einheitNormalisieren(p.einheit)) {
      ki.hinweis = `Einheit der KI (${p.einheit}) an Katalog angepasst (${eintrag.einheit}) — Menge prüfen.`;
      warnungen.push(`„${p.bez}“: ${ki.hinweis}`);
    }
    const preisquelle = { art: eintrag.quelle, ref: eintrag.ref, bez: eintrag.bez };

    if (eintrag.quelle === "stammposition") {
      const sp = stammpositionen.find(s => `SP:${s.id}` === eintrag.ref);
      if (sp) {
        return { ...positionAusStammposition(sp, menge, kalkulationspreise, standardZuschlaege),
          bez: p.bez || sp.bez, preisquelle, ki };
      }
    }
    return { bez: p.bez, einheit: eintrag.einheit || p.einheit, menge, ep: eintrag.ep, rabatt: 0,
      ...(eintrag.stlk ? { stlk: eintrag.stlk } : {}), preisquelle, ki };
  });
  return {
    titel: vorschlag?.titel || "",
    empfaenger: vorschlag?.empfaenger || "",
    annahmen: Array.isArray(vorschlag?.annahmen) ? vorschlag.annahmen.filter(Boolean) : [],
    positionen,
    warnungen,
  };
}
