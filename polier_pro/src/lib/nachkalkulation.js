// Nachkalkulation: Rückfluss der tatsächlich gebrauchten Stunden in die
// Stammdaten — damit wird jede abgeschlossene Baustelle zur Kalkulations-
// grundlage für das nächste Angebot.
//
// Leistungsfaktor = Ist-Lohnstunden (abgeschlossene Zeitbuchungen der
// Baustelle) / Soll-Lohnstunden der bisher erbrachten Leistung (Lohn-
// stunden der Kalkulation je Position × Leistungsstand aus dem
// Baufortschritt). Faktor 1,15 heißt: 15 % mehr Stunden gebraucht als
// kalkuliert.
//
// Grenze dieser Methode: Zeitbuchungen hängen an der Baustelle, nicht an
// der Position — der Faktor gilt deshalb für alle Positionen der Baustelle
// gleich. Für eine Aussage braucht es eine Mindestmenge an Daten
// (MIN_SOLL_STUNDEN); vorher wird kein Faktor vorgeschlagen.

export const MIN_SOLL_STUNDEN = 40;

function lohnstunden(kalk, kalkulationspreise) {
  return (kalk?.lohnposten || []).reduce((s, p) => {
    const stamm = (kalkulationspreise || []).find(k => k.id === p.stammId);
    return stamm?.einheit === "h" ? s + (Number(p.menge) || 0) : s;
  }, 0);
}

// angebote: angenommene Angebote; fortschritt: { [angebotId]: [{position_id, prozent}] }
export function leistungsfaktor({ angebote, fortschritt, zeitbuchungen, kalkulationspreise }) {
  let soll = 0;
  const stammIds = new Set();
  for (const a of angebote || []) {
    const bf = new Map((fortschritt?.[a.id] || []).map(e => [e.position_id, Number(e.prozent) || 0]));
    for (const p of a.positionen || []) {
      if (!p.kalk) continue;
      const prozent = bf.get(p.id) || 0;
      const std = lohnstunden(p.kalk, kalkulationspreise);
      soll += std * prozent / 100;
      if (p.stammpositionId && std > 0 && prozent > 0) stammIds.add(p.stammpositionId);
    }
  }
  const ist = (zeitbuchungen || [])
    .filter(z => z.status === "abgeschlossen")
    .reduce((s, z) => s + (Number(z.netto_minuten) || 0) / 60, 0);
  const aussagekraeftig = soll >= MIN_SOLL_STUNDEN && ist > 0;
  return {
    sollStunden: soll, istStunden: ist,
    faktor: aussagekraeftig ? ist / soll : null,
    stammpositionIds: [...stammIds],
    hinweis: aussagekraeftig ? null : `Erst ab ${MIN_SOLL_STUNDEN} Soll-Stunden erbrachter Leistung aussagekräftig.`,
  };
}

// Skaliert die Lohnzeilen (Einheit h) der genannten Stammpositionen mit dem
// Faktor und hält die Anpassung in einer Historie fest, damit sie
// nachvollziehbar und rückgängig zu machen bleibt.
export function zeitansaetzeAnpassen(stammpositionen, ids, faktor, kalkulationspreise, { projekt = "", datum = new Date().toISOString().slice(0, 10) } = {}) {
  if (!faktor || !Number.isFinite(faktor)) return stammpositionen;
  const ziel = new Set(ids);
  return (stammpositionen || []).map(sp => {
    if (!ziel.has(sp.id)) return sp;
    const rezeptur = (sp.rezeptur || []).map(z => {
      const stamm = (kalkulationspreise || []).find(k => k.id === z.stammId);
      if (z.unterpositionId != null || stamm?.kategorie !== "lohn" || stamm.einheit !== "h") return z;
      const f = Math.round(faktor * 1000) / 1000;
      if (z.formel && String(z.formel).trim()) return { ...z, formel: `(${z.formel})*${String(f).replace(".", ",")}` };
      return { ...z, mengeJeEinheit: Math.round((z.mengeJeEinheit || 0) * faktor * 10000) / 10000 };
    });
    const historie = [...(sp.nachkalkulation || []), { datum, projekt, faktor: Math.round(faktor * 1000) / 1000 }];
    return { ...sp, rezeptur, nachkalkulation: historie };
  });
}
