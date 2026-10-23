// Zuschlagskalkulation pro Angebots-Position: Einzelkosten (Lohn + Material +
// Gerät + Fremdleistung, aus Kalkulations-Stammdaten × erfasster Menge) je
// Kostenart mit einem EIGENEN Zuschlagssatz verrechnet (Gesamtkosten der
// Kostenart = Einzelkosten der Kostenart × (1 + eigener Satz/100), dann über
// alle Kostenarten summiert) — das entspricht der in der deutschen
// Baukalkulation üblichen kostenartenspezifischen Zuschlagskalkulation.
//
// Gegen eine echte Kalkulation desselben Referenzprojekts (Kaufland Freiberg
// Bebelplatz 2, siehe gaeb90.test.mjs/gaebXml.test.mjs) abgeglichen: dort
// bekommt Lohn durch die Mittellohnkalkulation effektiv 35 % Zuschlag,
// Material/Gerät/Sonstiges 25 %, Fremdleistung/Sub 15 % — ein einziger
// Satz für die ganze Position (wie vor dieser Änderung) wäre hier spürbar
// ungenau, da Fremdleistung real mit weniger als halb so hohem Zuschlag wie
// Lohn kalkuliert wird.
//
// Der Zuschlagssatz je Kostenart gliedert sich wiederum in die drei in der
// VOB-Baukalkulation üblichen Komponenten (siehe ZUSCHLAG_KOMPONENTEN unten):
// Baustellengemeinkosten (BGK), Allgemeine Geschäftskosten (AGK) und Wagnis &
// Gewinn (WuG) — bewusst additiv statt über die klassische HK-/SK-Stufenkette
// verkettet gerechnet (Summe der drei Prozentsätze, einmal auf die
// Einzelkosten der Kostenart angewendet): für die Zielgruppe (kleinere
// Betriebe ohne eigene Kalkulationsabteilung) nachvollziehbarer als die
// mehrstufige Verkettung größerer AVA-Systeme, bei im Alltag meist ohnehin
// kleinen Einzelsätzen rechnerisch kaum unterschiedlich.
//
// Rückwärtskompatibel zu vor dieser Änderung gespeicherten Angeboten, in
// zwei Stufen: (1) kennt eine Position noch keine granularen BGK/AGK/WuG-
// Felder einer Kostenart, aber einen eigenen (damals einzigen) Satz je
// Kostenart (zuschlagLohn/zuschlagMaterial/zuschlagGeraet/
// zuschlagFremdleistung), wird dieser unverändert als deren Satz übernommen.
// (2) kennt sie auch das nicht, sondern nur die noch ältere, für die GESAMTE
// Position geltenden Felder zuschlagGemeinkosten/zuschlagWagnis/
// zuschlagGewinn, wird deren Summe als gemeinsamer Satz für jede Kostenart
// verwendet. Beides reproduziert exakt das jeweils alte Rechenergebnis
// (siehe kalkulation.test.mjs).

export const KOSTENARTEN = ["lohn", "material", "geraet", "fremdleistung"];

export const ZUSCHLAG_KOMPONENTEN = ["bgk", "agk", "wg"];
export const ZUSCHLAG_KOMPONENTEN_LABEL = { bgk: "BGK", agk: "AGK", wg: "WuG" };
export const ZUSCHLAG_KOMPONENTEN_BESCHREIBUNG = {
  bgk: "Baustellengemeinkosten", agk: "Allgemeine Geschäftskosten", wg: "Wagnis & Gewinn",
};

// z.B. zuschlagFeldName("fremdleistung","bgk") -> "zuschlagFremdleistungBgk".
export function zuschlagFeldName(kostenart, komponente) {
  const k = kostenart.charAt(0).toUpperCase() + kostenart.slice(1);
  const z = komponente.charAt(0).toUpperCase() + komponente.slice(1);
  return `zuschlag${k}${z}`;
}

// Neue, leere Kalkulation — ohne standardZuschlaege (siehe AdminParameterView
// "Standard-Zuschläge") alle Zuschlagskomponenten bei 0%, sonst mit dem
// firmenweit hinterlegten Schema vorbefüllt, damit nicht jede neu angelegte
// Position erst manuell auf die üblichen Sätze gebracht werden muss.
export function leereKalkulation(standardZuschlaege) {
  const kalk = {
    lohnposten: [], materialposten: [], geraetPosten: [],
    fremdleistung: 0,
  };
  for (const kostenart of KOSTENARTEN) {
    for (const komponente of ZUSCHLAG_KOMPONENTEN) {
      const feld = zuschlagFeldName(kostenart, komponente);
      kalk[feld] = standardZuschlaege?.[feld] || 0;
    }
  }
  return kalk;
}

export const ZUSCHLAG_FELD = {
  lohn: "zuschlagLohn", material: "zuschlagMaterial",
  geraet: "zuschlagGeraet", fremdleistung: "zuschlagFremdleistung",
};

function hatGranularenZuschlag(kalk, kostenart) {
  return ZUSCHLAG_KOMPONENTEN.some(komponente => kalk[zuschlagFeldName(kostenart, komponente)] != null);
}

// BGK/AGK/WuG-Einzelsätze (%) einer Kostenart, für die Kalkulations-UI (nur
// sinnvoll, wenn hatGranularenZuschlag() — siehe kalkulationZuschlagProzent
// JeKostenart() für den Rückwärtskompatibilitäts-Fall ohne granulare Felder).
export function kalkulationZuschlagKomponenten(kalk, kostenart) {
  return Object.fromEntries(
    ZUSCHLAG_KOMPONENTEN.map(komponente => [komponente, kalk[zuschlagFeldName(kostenart, komponente)] || 0])
  );
}

// Zuschlagssatz (%) einer einzelnen Kostenart — siehe Rückwärtskompatibilitäts-
// Hinweis oben.
export function kalkulationZuschlagProzentJeKostenart(kalk, kostenart) {
  if (hatGranularenZuschlag(kalk, kostenart)) {
    const komp = kalkulationZuschlagKomponenten(kalk, kostenart);
    return komp.bgk + komp.agk + komp.wg;
  }
  const eigener = kalk[ZUSCHLAG_FELD[kostenart]];
  if (eigener != null) return eigener;
  return (kalk.zuschlagGemeinkosten || 0) + (kalk.zuschlagWagnis || 0) + (kalk.zuschlagGewinn || 0);
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

// Gesamtkosten für die GESAMTE Position (nicht pro Einheit) — die erfassten
// Posten-Mengen sind die für die ganze Position benötigte Menge (z.B.
// "40 Stunden Facharbeiter"), nicht ein Wert pro Mengeneinheit der Position.
// Jede Kostenart wird mit ihrem EIGENEN Zuschlagssatz hochgerechnet (siehe
// Datei-Kommentar oben), dann summiert.
export function kalkulationGesamtkosten(kalk, stammdaten) {
  const a = kalkulationAufschluesselung(kalk, stammdaten);
  return KOSTENARTEN.reduce((summe, kostenart) => {
    const satz = kalkulationZuschlagProzentJeKostenart(kalk, kostenart);
    return summe + a[kostenart] * (1 + satz / 100);
  }, 0);
}

// Effektiver (gewichteter) Zuschlagssatz über ALLE Kostenarten hinweg, für
// die Summenzeile in der UI — kein konfigurierter Einzelsatz mehr (die
// Kostenarten können unterschiedliche Sätze haben), sondern aus Gesamt-/
// Einzelkosten zurückgerechnet.
export function kalkulationZuschlagProzent(kalk, stammdaten) {
  const einzel = kalkulationEinzelkosten(kalk, stammdaten);
  if (!einzel) return 0;
  return (kalkulationGesamtkosten(kalk, stammdaten) / einzel - 1) * 100;
}

// EP (€ pro Mengeneinheit der Position) aus der Kalkulation ableiten.
export function kalkulationEp(kalk, stammdaten, menge) {
  if (!menge) return 0;
  return kalkulationGesamtkosten(kalk, stammdaten) / menge;
}

// Soll-Übersicht (Vorkalkulation) über mehrere Angebote: summiert die
// kalkulierten Kosten aller Positionen mit Kalkulationsschema (pos.kalk) je
// Kostenart, für die Kalkulationsübersicht in KostenView.jsx. Positionen
// ohne Kalkulationsschema (direkter EP) fließen hier bewusst nicht ein —
// für sie gibt es keine Kostenarten-Aufschlüsselung, nur einen EP.
//
// Rechnet mit den AKTUELLEN Kalkulationspreisen (Stammdaten), nicht mit dem
// Stand zum Zeitpunkt der Angebotserstellung — bei späteren Preisänderungen
// weicht die Soll-Übersicht dadurch bewusst vom ursprünglich kalkulierten
// Angebotspreis ab (zeigt den heutigen Kostenstand, nicht den historischen).
export function kalkulationSollAufschluesselung(angebote, stammdaten) {
  const summe = { lohn: 0, material: 0, geraet: 0, fremdleistung: 0, zuschlag: 0 };
  for (const angebot of angebote || []) {
    for (const pos of angebot.positionen || []) {
      if (!pos.kalk) continue;
      const a = kalkulationAufschluesselung(pos.kalk, stammdaten);
      const gesamt = kalkulationGesamtkosten(pos.kalk, stammdaten);
      summe.lohn += a.lohn;
      summe.material += a.material;
      summe.geraet += a.geraet;
      summe.fremdleistung += a.fremdleistung;
      summe.zuschlag += gesamt - (a.lohn + a.material + a.geraet + a.fremdleistung);
    }
  }
  return summe;
}
