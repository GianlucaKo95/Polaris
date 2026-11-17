// Eine Baustelle aus der Datenbank in den App-Zustand übernehmen. Laden und
// Speichern nutzen dieselbe Umwandlung, damit keine Spalte unterwegs verloren geht.
export function projektAusDb(p) {
  return {
    id: p.id, name: p.name, adresse: p.adresse, plz: p.plz, ort: p.ort,
    projektnummer: p.projektnummer, bauleiter: p.bauleiter,
    auftraggeber: p.auftraggeber, typ: p.typ, farbe: p.farbe, sub_ids: p.sub_ids || [],
    firma_id: p.firma_id, budget_positionen: p.budget_positionen, stundensatz: p.stundensatz,
    abnahme_datum: p.abnahme_datum || null, abnahme_art: p.abnahme_art || null, abnahme_vorbehalte: p.abnahme_vorbehalte || "",
    abschluss_datum: p.abschluss_datum || null,
    regie_saetze: p.regie_saetze || null,
  };
}
