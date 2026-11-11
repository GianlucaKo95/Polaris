// Kalkulationsgrundlagen der Firma: Mittellohn und Gerätekosten. Beide
// erzeugen Kalkulationspreise (kalkulationspreise, Kategorie lohn bzw.
// geraet), die von Rezepturen und Positionskalkulationen genutzt werden —
// ändert sich der Tariflohn oder ein Gerätewert, ziehen alle Stamm-
// positionen automatisch nach.
//
// ── Mittellohn (Schema wie EFB 221, Abschnitt 1) ──────────────────────────
//   Lohngruppen (Anzahl × Stundenlohn) → Durchschnittslohn
//   + Zulagen je Stunde (Erschwernis, Vermögensbildung …)
//   = Mittellohn ML
//   + lohngebundene Kosten (Sozialkosten, % von ML)
//   + lohnbezogene Kosten (Lohnnebenkosten wie Auslöse, Fahrgeld, € je h)
//   = Kalkulationslohn KL — Grundlage der Lohnkosten in der Kalkulation.
//
// ── Gerätekosten (Schema der Baugeräteliste BGL) ──────────────────────────
//   Monatliche Vorhaltekosten = mittlerer Neuwert × (Abschreibung und
//   Verzinsung % + Reparatur %) je Monat; je Betriebsstunde geteilt durch
//   die Vorhaltestunden im Monat (BGL: 170 h), plus Betriebsstoffe
//   (Verbrauch × Preis) je Stunde. Die BGL-Werte selbst (Neuwert, %-Sätze)
//   trägt die Firma aus ihrer BGL-Ausgabe ein — die Liste ist lizenziert
//   und nicht Teil von Polaris.

export const LEERE_GRUNDLAGEN = {
  mittellohn: {
    lohngruppen: [],          // [{ bez, anzahl, stundenlohn }]
    zulagen: 0,               // € je h
    sozialkostenProzent: 0,   // % von ML
    lohnnebenkosten: 0,       // € je h
  },
  geraete: [],                // [{ id, bez, neuwert, avProzent, repProzent, stundenJeMonat, verbrauchJeH, betriebsstoffPreis }]
};

const r2 = n => Math.round(n * 100) / 100;

export function mittellohnBerechnen(ml) {
  const gruppen = (ml?.lohngruppen || []).filter(g => Number(g.anzahl) > 0);
  const koepfe = gruppen.reduce((s, g) => s + Number(g.anzahl), 0);
  const durchschnitt = koepfe ? gruppen.reduce((s, g) => s + Number(g.anzahl) * (Number(g.stundenlohn) || 0), 0) / koepfe : 0;
  const mittellohn = durchschnitt + (Number(ml?.zulagen) || 0);
  const sozialkosten = mittellohn * (Number(ml?.sozialkostenProzent) || 0) / 100;
  const kalkulationslohn = mittellohn + sozialkosten + (Number(ml?.lohnnebenkosten) || 0);
  return {
    koepfe, durchschnitt: r2(durchschnitt), mittellohn: r2(mittellohn),
    sozialkosten: r2(sozialkosten), lohnnebenkosten: r2(Number(ml?.lohnnebenkosten) || 0),
    kalkulationslohn: r2(kalkulationslohn),
  };
}

export function geraetekostenJeStunde(g) {
  const stunden = Number(g?.stundenJeMonat) || 170;
  const vorhaltung = (Number(g?.neuwert) || 0) * ((Number(g?.avProzent) || 0) + (Number(g?.repProzent) || 0)) / 100 / stunden;
  const betriebsstoff = (Number(g?.verbrauchJeH) || 0) * (Number(g?.betriebsstoffPreis) || 0);
  return { vorhaltung: r2(vorhaltung), betriebsstoff: r2(betriebsstoff), gesamt: r2(vorhaltung + betriebsstoff) };
}

// Synchronisiert die abgeleiteten Kalkulationspreise: ein Lohnpreis
// "Mittellohn (Kalkulationslohn)" und je Gerät ein Gerätepreis. Erkennbar
// an herkunft, damit manuell angelegte Preise unberührt bleiben und die
// IDs (auf die Rezepturen zeigen) stabil bleiben.
export function kalkulationspreiseAbleiten(kalkulationspreise, grundlagen) {
  const liste = [...(kalkulationspreise || [])];
  const ml = mittellohnBerechnen(grundlagen?.mittellohn);
  const mlIdx = liste.findIndex(k => k.herkunft?.typ === "mittellohn");
  if (ml.koepfe > 0) {
    const eintrag = { kategorie: "lohn", bezeichnung: "Mittellohn (Kalkulationslohn)", einheit: "h", preis: ml.kalkulationslohn, herkunft: { typ: "mittellohn" } };
    if (mlIdx >= 0) liste[mlIdx] = { ...liste[mlIdx], ...eintrag };
    else liste.push({ ...eintrag, id: Date.now() });
  }
  for (const g of grundlagen?.geraete || []) {
    if (!g?.bez) continue;
    const idx = liste.findIndex(k => k.herkunft?.typ === "geraet" && k.herkunft.id === g.id);
    const eintrag = { kategorie: "geraet", bezeichnung: g.bez, einheit: "h", preis: geraetekostenJeStunde(g).gesamt, herkunft: { typ: "geraet", id: g.id } };
    if (idx >= 0) liste[idx] = { ...liste[idx], ...eintrag };
    else liste.push({ ...eintrag, id: Date.now() + Math.floor(Math.random() * 1000) });
  }
  // Gelöschte Geräte: abgeleiteten Preis entfernen.
  const geraeteIds = new Set((grundlagen?.geraete || []).map(g => g.id));
  return liste.filter(k => k.herkunft?.typ !== "geraet" || geraeteIds.has(k.herkunft.id));
}
