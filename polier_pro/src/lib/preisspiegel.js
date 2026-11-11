// Nachunternehmer-Preisspiegel: legt mehrere bepreiste NU-Angebote (GAEB
// X84/D84, eingelesen mit gaebXml.js bzw. gaeb90.js) neben die Positionen
// des eigenen Angebots und zeigt je Position den günstigsten Preis.
//
// Zuordnung je Position, in dieser Reihenfolge:
//   1. gleiche Ordnungszahl (der Normalfall: alle Bieter haben dasselbe LV
//      bepreist, das wir weitergegeben haben)
//   2. gleiche StLK-Katalognummer
//   3. ähnlicher Text und gleiche Einheit (aehnlichkeit() ≥ 0,6) — für NU-
//      Angebote auf eigenen Formularen ohne OZ
//
// Übernahme: Der NU-Preis wird als Fremdleistung in die Positions-
// kalkulation gelegt und mit dem Fremdleistungs-Zuschlag der Firma
// beaufschlagt — derselbe Weg wie beim Mutter-LV-Abgleich (mutterlv.js).

import { aehnlichkeit, einheitNormalisieren } from "./katalog.js";
import { leereKalkulation, kalkulationEp } from "./kalkulation.js";

function istPreisposition(p) { return p?.bez && !p.bez.startsWith("──"); }

function zuordnen(position, nuPositionen) {
  if (position.oz) {
    const f = nuPositionen.find(n => n.oz === position.oz);
    if (f) return f;
  }
  if (position.stlk) {
    const f = nuPositionen.find(n => n.stlk === position.stlk);
    if (f) return f;
  }
  let best = null, bestScore = 0.6;
  for (const n of nuPositionen) {
    if (einheitNormalisieren(n.einheit) !== einheitNormalisieren(position.einheit)) continue;
    const s = aehnlichkeit(position.bez, n.bez);
    if (s >= bestScore) { best = n; bestScore = s; }
  }
  return best;
}

// nuAngebote: [{ name, positionen }] — positionen im Format von
// gaeb90ZuPositionen() mit ep aus dem NU-Angebot.
export function preisspiegelBauen(positionen, nuAngebote) {
  const bieter = (nuAngebote || []).map(a => ({ name: a.name, positionen: (a.positionen || []).filter(n => istPreisposition(n) && Number(n.ep) > 0) }));
  const zeilen = (positionen || []).filter(istPreisposition).map(p => {
    const preise = bieter.map(b => {
      const f = zuordnen(p, b.positionen);
      return f ? Number(f.ep) : null;
    });
    const gueltig = preise.filter(x => x != null);
    const min = gueltig.length ? Math.min(...gueltig) : null;
    return { id: p.id, oz: p.oz || "", bez: p.bez, menge: Number(p.menge) || 0, einheit: p.einheit, preise,
      minIndex: min == null ? -1 : preise.indexOf(min), min };
  });
  const summen = bieter.map((_, i) => zeilen.reduce((s, z) => s + (z.preise[i] ?? 0) * z.menge, 0));
  const fehlend = bieter.map((_, i) => zeilen.filter(z => z.preise[i] == null).length);
  return { bieter: bieter.map(b => b.name), zeilen, summen, fehlend };
}

// Übernimmt je Position den gewählten NU-Preis (wahl: { [positionId]: bieterIndex })
// als Fremdleistung mit Zuschlag in die Kalkulation.
export function nuPreiseUebernehmen(positionen, spiegel, wahl, zuschlagFremdleistung = 0) {
  const nachId = new Map(spiegel.zeilen.map(z => [z.id, z]));
  return (positionen || []).map(p => {
    const z = nachId.get(p.id);
    const idx = wahl?.[p.id];
    if (!z || idx == null || idx < 0 || z.preise[idx] == null || !z.menge) return p;
    const kalk = { ...leereKalkulation(), fremdleistung: z.preise[idx] * z.menge, zuschlagFremdleistung: Number(zuschlagFremdleistung) || 0 };
    return { ...p, kalk, ep: kalkulationEp(kalk, [], z.menge),
      preisquelle: { art: "nachunternehmer", bez: spiegel.bieter[idx] } };
  });
}
