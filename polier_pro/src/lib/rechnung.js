// Rechnungsstellung nach Baufortschritt: Abschlags- und Schlussrechnungen
// auf Basis des Leistungsstands (% Fertigstellung) je Position eines
// angenommenen Angebots (= Auftrag, angebot.status === "angenommen").
//
// Der Leistungsstand liegt NICHT in angebot.positionen, sondern in einer
// eigenen Tabelle (baufortschritt, siehe lib/supabase.js) — ein angenommenes
// Angebot wird bei Annahme gesperrt (angebote.gesperrt), damit der
// vereinbarte Vertragsinhalt (Texte/Preise) nicht nachträglich verändert
// werden kann, der Leistungsstand muss aber während der gesamten Bauzeit
// weiter aktualisierbar bleiben.
//
// Jede Rechnung ist ein SNAPSHOT: bei Erstellung wird der dann aktuelle
// Leistungsstand jeder Position eingefroren (positionen_snapshot in der
// rechnungen-Tabelle), damit spätere Baufortschritt- oder Angebotsänderungen
// bereits gestellte Rechnungen nicht rückwirkend verändern.
//
// Rechnungsbetrag (netto) = Summe über alle Positionen von:
//   (aktueller kumulierter Wert der Position) − (kumulierter Wert derselben
//   Position aus der UNMITTELBAR VORHERIGEN Rechnung für denselben Auftrag,
//   0 wenn keine) — klassische Abschlagsrechnung nach Bautenstand: jede
//   Rechnung bezahlt nur den Fortschritt SEIT der letzten Rechnung, nicht
//   die gesamte bisherige Leistung erneut.

// Gruppenkopfzeilen ("── Titel ──", siehe gaeb90ZuPositionen()) tragen
// keinen eigenen Leistungsstand/Preis und werden daher überall ausgefiltert.
function istPosition(p) {
  return !(p.bez || "").startsWith("──");
}

export function kumulierterWert(position, prozent) {
  return (position.menge || 0) * (position.ep || 0) * ((prozent || 0) / 100);
}

// Angebotspositionen angereichert um den aktuellen Prozentsatz je Position
// (aus der baufortschritt-Tabelle) — Grundlage für die Erfassungs-UI und für
// einen neuen Rechnungs-Snapshot.
export function positionenMitLeistungsstand(positionen, baufortschrittEintraege) {
  const prozentNachId = new Map((baufortschrittEintraege || []).map(b => [b.position_id, b.prozent]));
  return (positionen || [])
    .filter(istPosition)
    .map(p => ({ ...p, prozent: prozentNachId.get(p.id) ?? 0 }));
}

// Gesamtfortschritt des Auftrags in % (wertgewichtet über alle Positionen —
// eine kleine, fast fertige Position zählt weniger als eine große).
export function gesamtFortschritt(positionenMitProzent) {
  const gesamtwert = positionenMitProzent.reduce((s, p) => s + (p.menge || 0) * (p.ep || 0), 0);
  if (!gesamtwert) return 0;
  const erbracht = positionenMitProzent.reduce((s, p) => s + kumulierterWert(p, p.prozent), 0);
  return (erbracht / gesamtwert) * 100;
}

// Snapshot für eine neue Rechnung: pro Position Menge/EP/Prozentsatz UND der
// daraus kumulierte Wert zum jetzigen Zeitpunkt — wird 1:1 so gespeichert
// (rechnungen.positionen_snapshot) und später nie neu berechnet, damit eine
// einmal gestellte Rechnung unveränderlich bleibt. Eine Schlussrechnung
// erzwingt 100% auf allen Positionen, unabhängig vom erfassten Baufortschritt.
export function snapshotErstellen(positionenMitProzent, { schluss = false } = {}) {
  return positionenMitProzent.map(p => {
    const prozent = schluss ? 100 : (p.prozent || 0);
    return {
      id: p.id, bez: p.bez, einheit: p.einheit, menge: p.menge, ep: p.ep,
      prozent, kumuliert: kumulierterWert(p, prozent),
    };
  });
}

// Rechnungsbetrag netto (vor Sicherheitseinbehalt/MwSt): Differenz zum
// kumulierten Wert derselben Position aus der unmittelbar vorherigen
// Rechnung für denselben Auftrag (0 wenn diese Position dort noch nicht
// vorkam, z.B. weil sie erst nachträglich zum Angebot hinzugefügt wurde).
export function rechnungsbetragNetto(snapshot, vorherigeRechnung) {
  const vorherNachId = new Map((vorherigeRechnung?.positionen_snapshot || []).map(p => [p.id, p.kumuliert]));
  return snapshot.reduce((s, p) => s + (p.kumuliert - (vorherNachId.get(p.id) || 0)), 0);
}

// MwSt auf den vollen Netto-Rechnungsbetrag (die erbrachte Leistung), danach
// erst der Sicherheitseinbehalt auf den Brutto-Rechnungsbetrag (übliche
// Reihenfolge einer deutschen Abschlagsrechnung) — der Einbehalt mindert nur
// den sofort auszuzahlenden Betrag, nicht die Steuerbemessungsgrundlage.
export function rechnungGesamt(nettoBetrag, { sicherheitseinbehaltProzent = 0, mwstProzent = 19 } = {}) {
  const mwstBetrag = nettoBetrag * (mwstProzent / 100);
  const bruttoBetrag = nettoBetrag + mwstBetrag;
  const einbehalt = bruttoBetrag * ((sicherheitseinbehaltProzent || 0) / 100);
  const zahlbetrag = bruttoBetrag - einbehalt;
  return { nettoBetrag, mwstBetrag, bruttoBetrag, einbehalt, zahlbetrag };
}

// Vorschlag für die nächste Rechnungsnummer (frei editierbar, wie der Titel
// bei Angeboten) — Jahr + laufende Nummer unter den bisherigen Rechnungen
// desselben Auftrags.
export function naechsteRechnungsnummer(bisherigeRechnungen, datum) {
  const jahr = (datum || new Date().toISOString().slice(0,10)).slice(0, 4);
  const n = (bisherigeRechnungen || []).length + 1;
  return `${jahr}-${String(n).padStart(3, "0")}`;
}
