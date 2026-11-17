// Erfahrungswerte (1.81): aus der Nachkalkulation aller Baustellen lernen.
//
// Die Leistungserfassung verteilt die Stunden eines Tages auf LV-Positionen
// (stunden_positionen), der Baufortschritt hält den Leistungsstand je
// Position. Hier werden beide über ALLE Baustellen je Stammposition
// zusammengeführt: Wie viele Stunden je Einheit hat die Leistung wirklich
// gebraucht, gegenüber dem Zeitansatz der Kalkulation?
//
// Vorsicht gegen Zufall: Der Vorschlag rückt den Zeitansatz nur so weit an
// den Ist-Wert, wie die Datenbasis trägt (Gewicht = Soll / (Soll + K)). Mit
// 10 Soll-Stunden aus einer Baustelle bewegt sich wenig, mit 200 Stunden aus
// fünf Baustellen fast der volle Ist-Wert. Was einmal eingeflossen ist, wird
// in der Historie der Stammposition vermerkt und nicht doppelt gezählt.

import { preiseFuer } from "./preisstand.js";
import { istTitel } from "./lv.js";
import { stammpositionZeitansatz } from "./stammpositionen.js";
import { zeitansaetzeAnpassen } from "./nachkalkulation.js";

export const K_STUNDEN = 40;          // Glättung: ab hier zählt der Ist-Wert zur Hälfte
export const MIN_SOLL = 8;            // darunter keine Aussage
export const TOLERANZ = 0.05;         // ±5 % gilt als bestätigt

function lohnstunden(kalk, kalkulationspreise) {
  return (kalk?.lohnposten || []).reduce((s, p) => {
    const k = (kalkulationspreise || []).find(x => x.id === p.stammId);
    return k?.kategorie === "lohn" && k.einheit === "h" ? s + (Number(p.menge) || 0) : s;
  }, 0);
}

const schluessel = (angebotId, positionId) => `${angebotId}:${positionId}`;

// Eine Beobachtung je Angebotsposition mit Stammposition, erbrachter Leistung und Ist-Stunden
export function beobachtungen({ angebote, fortschritt, verteilung, kalkulationspreise, projekte = [] }) {
  const prozent = new Map((fortschritt || []).map(e => [schluessel(e.angebot_id, e.position_id), Number(e.prozent) || 0]));
  const ist = new Map();
  for (const v of verteilung || []) {
    const k = schluessel(v.angebot_id, v.position_id);
    ist.set(k, (ist.get(k) || 0) + (Number(v.stunden) || 0));
  }
  const name = id => projekte.find(p => String(p.id) === String(id))?.name || "Baustelle";
  const liste = [];
  for (const a of angebote || []) {
    if (a.status !== "angenommen") continue;
    const preise = preiseFuer(a, kalkulationspreise);
    for (const p of a.positionen || []) {
      if (istTitel(p) || !p.stammpositionId || !p.kalk) continue;
      const k = schluessel(a.id, p.id);
      const pz = prozent.get(k) || 0, h = ist.get(k) || 0, menge = Number(p.menge) || 0;
      const soll = lohnstunden(p.kalk, preise);
      if (!(pz > 0) || !(h > 0) || !(soll > 0) || !(menge > 0)) continue;
      const mengeErbracht = menge * pz / 100;
      liste.push({
        key: k, stammpositionId: p.stammpositionId, projektId: a.projekt_id, projekt: name(a.projekt_id),
        oz: p.oz || "", bez: p.bez, einheit: p.einheit, mengeErbracht, prozent: pz,
        sollErbracht: soll * pz / 100, ist: h, sollJeE: soll / menge, istJeE: h / mengeErbracht,
      });
    }
  }
  return liste;
}

// Bereits in die Stammposition eingeflossene Beobachtungen
function eingeflossen(sp) {
  return new Set((sp.nachkalkulation || []).flatMap(h => h.positionen || []));
}

export function erfahrungJeStammposition(beob, stammpositionen, kalkulationspreise, { k = K_STUNDEN, minSoll = MIN_SOLL } = {}) {
  const ergebnis = [];
  for (const sp of stammpositionen || []) {
    const schon = eingeflossen(sp);
    const alle = (beob || []).filter(b => String(b.stammpositionId) === String(sp.id));
    const neu = alle.filter(b => !schon.has(b.key));
    if (!alle.length) continue;
    const aktuell = stammpositionZeitansatz(sp, kalkulationspreise, { stammpositionen });
    const soll = neu.reduce((s, b) => s + b.sollErbracht, 0);
    const ist = neu.reduce((s, b) => s + b.ist, 0);
    const menge = neu.reduce((s, b) => s + b.mengeErbracht, 0);
    const faktor = soll > 0 ? ist / soll : null;
    const gewicht = soll / (soll + k);
    const vorschlagFaktor = faktor ? 1 + (faktor - 1) * gewicht : 1;
    const jeBaustelle = new Map();
    for (const b of neu) {
      const x = jeBaustelle.get(b.projektId) || { projekt: b.projekt, ist: 0, menge: 0, soll: 0 };
      x.ist += b.ist; x.menge += b.mengeErbracht; x.soll += b.sollErbracht;
      jeBaustelle.set(b.projektId, x);
    }
    const werte = [...jeBaustelle.values()].map(x => x.ist / x.menge);
    const status = !neu.length ? "eingeflossen"
      : soll < minSoll ? "zu_wenig"
      : Math.abs(faktor - 1) <= TOLERANZ ? "bestaetigt" : "anpassen";
    ergebnis.push({
      sp, aktuell, beobachtungen: neu, eingeflosseneAnzahl: alle.length - neu.length,
      baustellen: jeBaustelle.size, sollErbracht: soll, ist, mengeErbracht: menge,
      istJeE: menge > 0 ? ist / menge : null, faktor, gewicht, status,
      vorschlag: aktuell > 0 ? Math.round(aktuell * vorschlagFaktor * 1000) / 1000 : null,
      spanne: werte.length ? { min: Math.min(...werte), max: Math.max(...werte) } : null,
    });
  }
  const rang = { anpassen: 0, bestaetigt: 1, zu_wenig: 2, eingeflossen: 3 };
  return ergebnis.sort((a, b) => rang[a.status] - rang[b.status] || Math.abs((b.faktor || 1) - 1) - Math.abs((a.faktor || 1) - 1));
}

// Neuen Zeitansatz übernehmen: Lohnzeilen skalieren, Historie mit den
// verwendeten Beobachtungen, damit sie nicht noch einmal zählen.
export function zeitansatzUebernehmen(stammpositionen, eintrag, neuerZeitansatz, kalkulationspreise, datum = new Date().toISOString().slice(0, 10)) {
  if (!(eintrag.aktuell > 0) || !(neuerZeitansatz > 0)) return stammpositionen;
  const faktor = neuerZeitansatz / eintrag.aktuell;
  const quelle = `Erfahrungswerte aus ${eintrag.baustellen} Baustelle${eintrag.baustellen === 1 ? "" : "n"}`;
  return zeitansaetzeAnpassen(stammpositionen, [eintrag.sp.id], faktor, kalkulationspreise, { projekt: quelle, datum })
    .map(sp => {
      if (sp.id !== eintrag.sp.id) return sp;
      const historie = [...(sp.nachkalkulation || [])];
      historie[historie.length - 1] = { ...historie[historie.length - 1], positionen: eintrag.beobachtungen.map(b => b.key),
        von: Math.round(eintrag.aktuell * 1000) / 1000, auf: Math.round(neuerZeitansatz * 1000) / 1000 };
      return { ...sp, nachkalkulation: historie };
    });
}

// ── KI: Abweichungen erklären ──
export const ERKLAER_WERKZEUG = {
  name: "erfahrung_bewerten",
  description: "Bewertet die Abweichungen je Stammposition.",
  input_schema: {
    type: "object",
    properties: {
      bewertungen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nr: { type: "integer" },
            empfehlung: { type: "string", enum: ["uebernehmen", "teilweise", "beibehalten"] },
            zeitansatz: { type: "number", description: "Empfohlener Zeitansatz in h je Einheit" },
            erklaerung: { type: "string", description: "Wahrscheinliche Ursache der Abweichung, 1–2 Sätze" },
            ausreisser: { type: "array", items: { type: "string" }, description: "Baustellen, die wie Sonderfälle wirken" },
          },
          required: ["nr", "empfehlung", "erklaerung"],
        },
      },
    },
    required: ["bewertungen"],
  },
};

export function erklaerPrompt() {
  return `Du bist erfahrener Kalkulator und Bauleiter in einem deutschen Bauunternehmen. Du bewertest, ob die Zeitansätze von Stammpositionen nach den Ist-Stunden abgeschlossener oder laufender Baustellen angepasst werden sollen.

Für jede Stammposition bekommst du den aktuellen Zeitansatz und die Ist-Werte je Baustelle (h je Einheit, erbrachte Menge).
- Erkläre die wahrscheinliche Ursache der Abweichung (z.B. kleine Mengen mit hohem Rüstanteil, Bestand/Sanierung, Witterung, Einarbeitung, Kalkulation schlicht zu knapp).
- Empfiehl: uebernehmen (der Ist-Wert ist der neue Normalfall), teilweise (Richtung stimmt, aber Sonderfälle dämpfen) oder beibehalten (Abweichung durch Sonderfälle erklärt).
- zeitansatz: dein empfohlener Wert in h je Einheit, nur bei uebernehmen oder teilweise.
- Nenne Baustellen, die wie Ausreißer wirken.
Knapp, Deutsch, keine Preise. Rufe am Ende genau einmal erfahrung_bewerten auf.`;
}

export function erklaerText(eintraege) {
  const z = n => (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
  return eintraege.map((e, i) => `#${i + 1} ${e.sp.bez} [${e.sp.einheit}] — Zeitansatz jetzt ${z(e.aktuell)} h/${e.sp.einheit}, Ist gesamt ${z(e.istJeE)} h/${e.sp.einheit}\n`
    + e.beobachtungen.map(b => `   ${b.projekt}: ${z(b.mengeErbracht)} ${b.einheit} erbracht (${Math.round(b.prozent)} %), Ist ${z(b.istJeE)} h/E, kalkuliert ${z(b.sollJeE)} h/E`).join("\n")).join("\n\n");
}

export async function abweichungenErklaeren(eintraege, rufeKi) {
  const antwort = await rufeKi(erklaerPrompt(), [{ role: "user", content: erklaerText(eintraege) }], [ERKLAER_WERKZEUG], { type: "tool", name: ERKLAER_WERKZEUG.name });
  const aufruf = (antwort?.content || []).find(b => b.type === "tool_use" && b.name === ERKLAER_WERKZEUG.name);
  const out = new Map();
  for (const b of aufruf?.input?.bewertungen || []) {
    const e = eintraege[Number(b.nr) - 1];
    if (!e) continue;
    const za = Number(b.zeitansatz);
    out.set(e.sp.id, { empfehlung: b.empfehlung, erklaerung: String(b.erklaerung || ""), ausreisser: b.ausreisser || [],
      zeitansatz: b.empfehlung !== "beibehalten" && za > 0 && za < 1000 ? Math.round(za * 1000) / 1000 : null });
  }
  return out;
}
