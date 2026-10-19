// Mutter-LV-Preisabgleich: ordnet die Positionen einer neu hochgeladenen,
// unbepreisten Ausschreibung/Anfrage (GAEB90 D81/D83 oder GAEB-DA-XML X83,
// siehe gaeb90.js/gaebXml.js) Preisen aus zuvor gespeicherten LV-Vorlagen
// ("Mutter-LV", lvVorlagen) zu — Grundlage, um aus einer Ausschreibung
// automatisch ein bepreistes Angebot vorzuschlagen (AngebotView.jsx).
//
// Zwei Abgleichswege, in Prioritätsreihenfolge:
// 1. StLK-Katalognummer (Standardleistungsbuch, aus GAEB-DA-XML
//    CtlgAssign/CtlgCode — siehe stlkAus() in gaebXml.js) — exakt und über
//    verschiedene Ausschreibungen hinweg stabil, da Katalognummern (anders
//    als Ordnungszahlen) nicht pro LV neu vergeben werden.
// 2. Normalisierter Bezeichnungstext (Kleinschreibung, Whitespace
//    vereinheitlicht, Positionsart-/Unterpositions-Präfix entfernt) —
//    einziger Weg für GAEB90 D81/D83, das keine Katalognummer mitführt, und
//    Fallback, wenn eine X83-Position keine StLK-Nummer trägt.
//
// Keine Position wird geraten: ohne Treffer bleibt der EP 0, sichtbar als
// "unbepreist" in der Übersicht — dieselbe tolerante Philosophie wie die
// übrigen GAEB-Parser in gaeb90.js/gaebXml.js.
//
// Zuschläge: ein GAEB-Preis aus der Mutter-LV ist i.d.R. bereits ein
// fertiger Verkaufspreis der Vorausschreibung (inkl. damaliger Zuschläge),
// keine reine Kostenbasis — ihn beim Generieren automatisch nochmal mit
// einem Zuschlag zu belegen würde ihn stillschweigend verteuern. Statt
// also selbst einen Zuschlagssatz zu raten, bereitet
// positionenMitKalkulationVorbereiten() jede gematchte Position nur für die
// bestehende Kalkulations-UI vor (siehe kalkulation.js/
// PositionKalkulation.jsx): der Mutter-LV-Preis wird als Fremdleistungs-
// Kostenbasis in eine Kalkulation mit 0% Zuschlag gelegt (der EP bleibt
// dadurch unverändert), der Nutzer trägt im Angebot nur noch die für
// DIESES Projekt passenden Zuschlagssätze ein, statt die Kalkulation von
// Grund auf selbst anzulegen.

import { leereKalkulation, kalkulationEp } from "./kalkulation.js";

function normalisierterText(bez) {
  return (bez || "")
    .replace(/^\[[^\]]+\]\s*/, "") // "[Bedarfsposition] " / "[Alternativposition] " etc.
    .replace(/^↳\s*/, "")           // Unterpositions-Präfix (siehe gaeb90ZuPositionen)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Baut aus allen gespeicherten LV-Vorlagen einen Preis-Index: je Schlüssel
// (StLK bzw. normalisierter Text) die Position mit diesem Schlüssel. Bei
// widersprüchlichen Preisen zwischen mehreren Vorlagen gewinnt bewusst die
// zuletzt in lvVorlagen stehende (neuere) — ältere Mutter-LVs werden in der
// Praxis durch neuere ersetzt, nicht ergänzt.
export function mutterLvIndexBauen(lvVorlagen) {
  const nachStlk = new Map();
  const nachText = new Map();
  for (const vorlage of lvVorlagen || []) {
    for (const p of vorlage.positionen || []) {
      if (!p.ep) continue; // unbepreiste Positionen taugen nicht als Preisquelle
      if (p.stlk) nachStlk.set(p.stlk, p);
      const text = normalisierterText(p.bez);
      if (text) nachText.set(text, p);
    }
  }
  return { nachStlk, nachText };
}

// Gleicht die Positionen einer Ausschreibung (Format wie gaeb90ZuPositionen()
// liefert: {id,bez,einheit,menge,ep,rabatt,oz?,stlk?}) gegen den Mutter-LV-
// Index ab und liefert dieselbe Liste mit ep befüllt, wo ein Treffer
// gefunden wurde, plus Trefferstatistik für die Erfolgsmeldung im UI.
export function angebotAusAusschreibungAbgleichen(positionen, mutterLvIndex) {
  let treffer = 0;
  let gesamt = 0;
  const abgeglichen = (positionen || []).map(p => {
    if (!p.bez || p.bez.startsWith("──")) return p; // Gruppenkopfzeile, kein Preisziel
    gesamt++;
    const fundStlk = p.stlk ? mutterLvIndex.nachStlk.get(p.stlk) : null;
    const fund = fundStlk || mutterLvIndex.nachText.get(normalisierterText(p.bez));
    if (!fund) return p;
    treffer++;
    return { ...p, ep: fund.ep };
  });
  return { positionen: abgeglichen, treffer, gesamt, fehlend: gesamt - treffer };
}

// Bereitet gematchte Positionen für die Kalkulations-UI vor (siehe
// Datei-Kommentar oben) — der Mutter-LV-Preis wird als Fremdleistungs-
// Kostenbasis in eine Kalkulation mit 0% Zuschlag gelegt, der EP bleibt
// dadurch unverändert. Nur für tatsächlich gematchte Positionen (ep>0 und
// menge>0) — eine unbepreiste oder mengenlose Position braucht keine leere
// Kalkulation aufgedrängt zu bekommen.
export function positionenMitKalkulationVorbereiten(positionen) {
  return (positionen || []).map(p => {
    if (!p.ep || !p.menge) return p;
    const kalk = { ...leereKalkulation(), fremdleistung: p.ep * p.menge };
    return { ...p, kalk, ep: kalkulationEp(kalk, [], p.menge) };
  });
}
