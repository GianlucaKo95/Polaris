// Sprach- und Textbefehle in der Kalkulation (1.85).
//
// „Pos. 3 Zeitansatz auf 0,4, Material plus 5 % Verschnitt, Gerät raus“:
// Die KI übersetzt den Satz in einzelne, geprüfte Änderungen. Angewendet
// wird erst nach der Vorschau. Preise setzt die KI nur, wenn der Nutzer sie
// selbst nennt.

import { istTitel } from "./lv.js";
import { kalkulationEp, ZUSCHLAG_FELD } from "./kalkulation.js";
import { positionAufbau, aufbauText } from "./kalkulationsPruefung.js";

const r4 = n => Math.round(n * 10000) / 10000;
const zahlDe = (n, st = 2) => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: st });
const eur = n => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const KOSTENART_POSTEN = { lohn: "lohnposten", material: "materialposten", geraet: "geraetPosten" };
const KOSTENART_TEXT = { lohn: "Lohn", material: "Material", geraet: "Gerät", fremdleistung: "Fremdleistung" };

export const BEFEHL_WERKZEUG = {
  name: "aenderungen_abgeben",
  description: "Gibt die Änderungen ab, die der Befehl verlangt.",
  input_schema: {
    type: "object",
    properties: {
      aenderungen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["menge_setzen", "ep_setzen", "zeitansatz_setzen", "lohn_skalieren", "material_aufschlag", "kostenart_entfernen", "zuschlag_setzen", "text_setzen", "position_loeschen", "position_hinzufuegen"] },
            positionen: { type: "array", items: { type: "integer" }, description: "Nummern (#) der betroffenen Positionen; leer = alle (nur bei zuschlag_setzen)" },
            wert: { type: "number", description: "menge_setzen: neue Menge; ep_setzen: EP in € (nur wenn der Nutzer ihn nennt); zeitansatz_setzen: h je Einheit; lohn_skalieren: Faktor (1.1 = +10 %); material_aufschlag und zuschlag_setzen: Prozent" },
            kostenart: { type: "string", enum: ["lohn", "material", "geraet", "fremdleistung"] },
            kurztext: { type: "string" }, langtext: { type: "string" }, einheit: { type: "string" },
            nach: { type: "integer", description: "position_hinzufuegen: nach welcher Position (#)" },
          },
          required: ["op"],
        },
      },
      rueckfrage: { type: "string", description: "Nur wenn der Befehl wirklich mehrdeutig ist" },
    },
    required: ["aenderungen"],
  },
};

export function nummerierung(positionen) {
  const nr = new Map(); let i = 0;
  for (const p of positionen || []) if (!istTitel(p)) nr.set(++i, p.id);
  return nr;
}

export function befehlKontext(positionen, kalkulationspreise) {
  let i = 0;
  return (positionen || []).map(p => {
    if (istTitel(p)) return `— ${String(p.bez).replace(/─/g, "").trim()} —`;
    const a = positionAufbau(p, kalkulationspreise);
    return `#${++i}${p.oz ? ` OZ ${p.oz}` : ""} | ${p.bez} | ${zahlDe(p.menge, 3)} ${p.einheit || ""} | EP ${eur(p.ep)}${a ? ` | Aufbau je Einheit: ${aufbauText(a)}` : " | ohne Kalkulation"}`;
  }).join("\n");
}

export function befehlPrompt() {
  return `Du übersetzt Befehle eines erfahrenen Kalkulators in Änderungen an seinem LV. Der Befehl ist oft diktiert und knapp („drei Komma vier“, „Pos fünf“, „bei allen Dämmpositionen“).
- Positionen über ihre Nummer (#), OZ oder Text zuordnen. Bei "alle …" alle passenden Positionen.
- ep_setzen nur, wenn der Nutzer einen Preis nennt. Sonst nie Preise.
- Verschnitt/Aufschlag auf Material = material_aufschlag in Prozent. Zeitansatz = Lohnstunden je Einheit.
- Ist der Befehl mehrdeutig, keine Änderung raten, sondern rueckfrage stellen.
Rufe genau einmal ${BEFEHL_WERKZEUG.name} auf.`;
}

function kalkSkalieren(kalk, postenFeld, faktor) {
  return { ...kalk, [postenFeld]: (kalk[postenFeld] || []).map(x => ({ ...x, menge: r4((Number(x.menge) || 0) * faktor) })) };
}

function lohnStunden(kalk, kp) {
  return (kalk?.lohnposten || []).reduce((s, x) => {
    const k = (kp || []).find(y => y.id === x.stammId);
    return k?.einheit === "h" ? s + (Number(x.menge) || 0) : s;
  }, 0);
}

// Wendet geprüfte Änderungen an. mengeSetzen kommt vom Editor, damit Mengen
// genau so neu gerechnet werden wie bei einer Eingabe von Hand.
export function befehleAnwenden(positionen, aenderungen, { kalkulationspreise = [], mengeSetzen, neueId = () => Date.now() + Math.random() } = {}) {
  const nr = nummerierung(positionen);
  let liste = [...positionen];
  const protokoll = [], fehler = [];
  const finde = n => nr.get(Number(n));
  const label = p => `${p.oz ? `Pos. ${p.oz}` : p.bez.slice(0, 40)}`;
  // Geänderte Kalkulation: EP neu, Preisquelle ehrlich auf "manuell"
  const neuEp = p => p.kalk && Number(p.menge) > 0
    ? { ...p, ep: kalkulationEp(p.kalk, kalkulationspreise, p.menge), ...(p.preisquelle ? { preisquelle: { art: "manuell" } } : {}) } : p;
  const aendere = (id, fn, text) => {
    liste = liste.map(p => {
      if (p.id !== id) return p;
      const r = fn(p);
      if (typeof r === "string") { fehler.push(`${label(p)}: ${r}`); return p; }
      protokoll.push({ posId: id, text: `${label(p)}: ${text(p, r)}` });
      return r;
    });
  };

  for (const a of aenderungen || []) {
    const ziele = (a.positionen || []).map(finde).filter(x => x != null);
    if (a.op !== "position_hinzufuegen" && a.op !== "zuschlag_setzen" && !ziele.length) { fehler.push(`Keine Position gefunden für „${a.op}“`); continue; }
    const w = Number(a.wert);
    switch (a.op) {
      case "menge_setzen":
        for (const id of ziele) aendere(id, p => !(w >= 0) ? "Menge fehlt" : mengeSetzen ? mengeSetzen(p, w) : neuEp({ ...p, menge: w }),
          (p, r) => `Menge ${zahlDe(p.menge, 3)} → ${zahlDe(r.menge, 3)} ${p.einheit || ""}`);
        break;
      case "ep_setzen":
        for (const id of ziele) aendere(id, p => !(w > 0) ? "Preis fehlt" : { ...p, ep: w, preisquelle: { art: "manuell" } }, (p, r) => `EP ${eur(p.ep)} → ${eur(r.ep)}`);
        break;
      case "zeitansatz_setzen":
        for (const id of ziele) aendere(id, p => {
          const ist = lohnStunden(p.kalk, kalkulationspreise);
          if (!p.kalk || !(ist > 0) || !(Number(p.menge) > 0)) return "keine Lohnstunden in der Kalkulation";
          if (!(w > 0)) return "Zeitansatz fehlt";
          return neuEp({ ...p, kalk: kalkSkalieren(p.kalk, "lohnposten", (w * p.menge) / ist) });
        }, (p, r) => `Zeitansatz ${zahlDe(lohnStunden(p.kalk, kalkulationspreise) / p.menge, 3)} → ${zahlDe(w, 3)} h/${p.einheit}, EP ${eur(p.ep)} → ${eur(r.ep)}`);
        break;
      case "lohn_skalieren":
        for (const id of ziele) aendere(id, p => !p.kalk ? "ohne Kalkulation" : !(w > 0) ? "Faktor fehlt" : neuEp({ ...p, kalk: kalkSkalieren(p.kalk, "lohnposten", w) }),
          (p, r) => `Lohn ${w > 1 ? "+" : ""}${zahlDe((w - 1) * 100, 1)} %, EP ${eur(p.ep)} → ${eur(r.ep)}`);
        break;
      case "material_aufschlag":
        for (const id of ziele) aendere(id, p => !p.kalk?.materialposten?.length ? "kein Material in der Kalkulation" : !Number.isFinite(w) ? "Prozent fehlt" : neuEp({ ...p, kalk: kalkSkalieren(p.kalk, "materialposten", 1 + w / 100) }),
          (p, r) => `Material ${w >= 0 ? "+" : ""}${zahlDe(w, 1)} %, EP ${eur(p.ep)} → ${eur(r.ep)}`);
        break;
      case "kostenart_entfernen":
        for (const id of ziele) aendere(id, p => {
          if (!p.kalk || !KOSTENART_TEXT[a.kostenart]) return "ohne Kalkulation";
          const kalk = a.kostenart === "fremdleistung" ? { ...p.kalk, fremdleistung: 0 } : { ...p.kalk, [KOSTENART_POSTEN[a.kostenart]]: [] };
          return neuEp({ ...p, kalk });
        }, (p, r) => `${KOSTENART_TEXT[a.kostenart]} entfernt, EP ${eur(p.ep)} → ${eur(r.ep)}`);
        break;
      case "zuschlag_setzen": {
        const feld = ZUSCHLAG_FELD[a.kostenart];
        if (!feld || !Number.isFinite(w)) { fehler.push("Zuschlag: Kostenart oder Prozent fehlt"); break; }
        const ids = ziele.length ? ziele : liste.filter(p => p.kalk && !istTitel(p)).map(p => p.id);
        for (const id of ids) aendere(id, p => !p.kalk ? "ohne Kalkulation" : neuEp({ ...p, kalk: { ...p.kalk, [feld]: w } }),
          (p, r) => `Zuschlag ${KOSTENART_TEXT[a.kostenart]} → ${zahlDe(w, 1)} %, EP ${eur(p.ep)} → ${eur(r.ep)}`);
        break;
      }
      case "text_setzen":
        for (const id of ziele) aendere(id, p => !a.kurztext && !a.langtext ? "kein Text" : { ...p, ...(a.kurztext ? { bez: a.kurztext } : {}), ...(a.langtext ? { langtext: a.langtext } : {}) },
          () => `Text geändert`);
        break;
      case "position_loeschen":
        for (const id of ziele) {
          const p = liste.find(x => x.id === id);
          liste = liste.filter(x => x.id !== id);
          protokoll.push({ posId: null, text: `${label(p)}: gelöscht` });
        }
        break;
      case "position_hinzufuegen": {
        if (!a.kurztext || !a.einheit) { fehler.push("Neue Position: Text oder Einheit fehlt"); break; }
        const neu = { id: neueId(), bez: a.kurztext, langtext: a.langtext || "", einheit: a.einheit, menge: Number(a.wert) || 0, ep: 0, rabatt: 0 };
        const nachId = a.nach ? finde(a.nach) : null;
        const i = nachId != null ? liste.findIndex(x => x.id === nachId) : -1;
        liste = i >= 0 ? [...liste.slice(0, i + 1), neu, ...liste.slice(i + 1)] : [...liste, neu];
        protokoll.push({ posId: neu.id, text: `Neue Position „${a.kurztext}“, ${zahlDe(neu.menge, 3)} ${a.einheit}, noch ohne Preis` });
        break;
      }
      default: fehler.push(`Unbekannte Änderung „${a.op}“`);
    }
  }
  return { positionen: liste, protokoll, fehler };
}

export function netto(positionen) {
  return (positionen || []).reduce((s, p) => s + (istTitel(p) ? 0 : (Number(p.menge) || 0) * (Number(p.ep) || 0) * (1 - (Number(p.rabatt) || 0) / 100)), 0);
}

export async function befehlAuswerten({ text, positionen, kalkulationspreise, rufeKi }) {
  const antwort = await rufeKi(befehlPrompt(), [{ role: "user", content: `LV:\n${befehlKontext(positionen, kalkulationspreise)}\n\nBefehl: ${text}` }],
    [BEFEHL_WERKZEUG], { type: "tool", name: BEFEHL_WERKZEUG.name });
  const r = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === BEFEHL_WERKZEUG.name)?.input;
  if (!r) throw new Error("Die KI hat den Befehl nicht verstanden");
  return { aenderungen: r.aenderungen || [], rueckfrage: r.rueckfrage ? String(r.rueckfrage) : null };
}
