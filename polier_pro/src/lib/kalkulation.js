// Zuschlagskalkulation pro Angebots-Position: Einzelkosten (Lohn + Material +
// Gerät + Fremdleistung, aus Kalkulations-Stammdaten × erfasster Menge) plus
// getrennte Zuschläge für Gemeinkosten/Wagnis/Gewinn. Die drei Zuschlagssätze
// werden additiv auf die Selbstkosten angewendet (Selbstkosten × (1 + Summe
// der Prozentsätze/100)) statt multiplikativ verkettet — das ist die in der
// deutschen Baukalkulation übliche Zuschlagskalkulation (alle Zuschläge
// beziehen sich auf dieselbe Bezugsgröße: die Selbstkosten).

export function leereKalkulation() {
  return {
    lohnposten: [], materialposten: [], geraetPosten: [],
    fremdleistung: 0,
    zuschlagGemeinkosten: 0, zuschlagWagnis: 0, zuschlagGewinn: 0,
  };
}

function postenSumme(posten, stammdaten) {
  return (posten || []).reduce((s, p) => {
    const stamm = stammdaten.find(x => x.id === p.stammId);
    return s + (stamm?.preis || 0) * (p.menge || 0);
  }, 0);
}

// Kosten je Kostenart, für die Soll-Ist-Übersicht (Teil 3) und die
// Kalkulations-UI (Teilsummen je Kategorie).
export function kalkulationAufschluesselung(kalk, stammdaten) {
  return {
    lohn:          postenSumme(kalk.lohnposten,     stammdaten),
    material:      postenSumme(kalk.materialposten, stammdaten),
    geraet:        postenSumme(kalk.geraetPosten,   stammdaten),
    fremdleistung: kalk.fremdleistung || 0,
  };
}

export function kalkulationEinzelkosten(kalk, stammdaten) {
  const a = kalkulationAufschluesselung(kalk, stammdaten);
  return a.lohn + a.material + a.geraet + a.fremdleistung;
}

export function kalkulationZuschlagProzent(kalk) {
  return (kalk.zuschlagGemeinkosten || 0) + (kalk.zuschlagWagnis || 0) + (kalk.zuschlagGewinn || 0);
}

// Gesamtkosten für die GESAMTE Position (nicht pro Einheit) — die erfassten
// Posten-Mengen sind die für die ganze Position benötigte Menge (z.B.
// "40 Stunden Facharbeiter"), nicht ein Wert pro Mengeneinheit der Position.
export function kalkulationGesamtkosten(kalk, stammdaten) {
  const einzel = kalkulationEinzelkosten(kalk, stammdaten);
  return einzel * (1 + kalkulationZuschlagProzent(kalk) / 100);
}

// EP (€ pro Mengeneinheit der Position) aus der Kalkulation ableiten.
export function kalkulationEp(kalk, stammdaten, menge) {
  if (!menge) return 0;
  return kalkulationGesamtkosten(kalk, stammdaten) / menge;
}
