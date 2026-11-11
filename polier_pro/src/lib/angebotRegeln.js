// Kompetenzgrenze des Poliers: bis zu welcher Angebotssumme er ein Angebot
// selbst versenden darf, ohne dass die Geschäftsführung es freigibt.
//
// Unterhalb der Grenze bleibt ein Sicherheitsnetz: Auch ein kleines Angebot
// braucht die Freigabe, wenn die Preisprüfung (plausibilitaet.js) rote
// Positionen meldet — also Positionen ohne Preis oder mit mehr als 60 %
// Abweichung von den eigenen Vergleichswerten — oder wenn der Polier Preise
// von Hand überschrieben hat. Genau das sind die Fälle, in denen die KI
// danebenliegen kann; alles andere darf er allein.
//
// regeln (firmen.angebot_regeln):
//   { kompetenzgrenzePolier: number (€ netto, 0 = immer Freigabe),
//     rotErfordertFreigabe: boolean (Standard true),
//     manuellePreiseErfordernFreigabe: boolean (Standard true) }

export const STANDARD_REGELN = {
  kompetenzgrenzePolier: 0,
  rotErfordertFreigabe: true,
  manuellePreiseErfordernFreigabe: true,
};

const euro = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function angebotNetto(angebot) {
  const netto = (angebot?.positionen || []).reduce((s, p) => s + (p.menge || 0) * (p.ep || 0) * (1 - (p.rabatt || 0) / 100), 0);
  return netto * (1 - (angebot?.rabatt || 0) / 100);
}

// Ergebnis: { pflicht, gruende: [string], grenze }
export function freigabePflicht({ angebot, rolle, regeln, pruefung }) {
  if (rolle !== "polier") return { pflicht: false, gruende: [], grenze: null };
  const r = { ...STANDARD_REGELN, ...(regeln || {}) };
  const grenze = Number(r.kompetenzgrenzePolier) || 0;
  const gruende = [];
  const netto = angebotNetto(angebot);

  if (netto > grenze) {
    gruende.push(grenze > 0
      ? `Angebotssumme ${euro(netto)} € netto liegt über deiner Kompetenzgrenze von ${euro(grenze)} €.`
      : "Für Poliere ist keine Kompetenzgrenze hinterlegt — jedes Angebot braucht die Freigabe.");
  }
  if (r.rotErfordertFreigabe && pruefung?.zaehler?.rot > 0) {
    gruende.push(`${pruefung.zaehler.rot} Position(en) in der Preisprüfung rot (ohne Preis oder stark abweichend).`);
  }
  if (r.manuellePreiseErfordernFreigabe) {
    const manuell = (angebot?.positionen || []).filter(p => p.preisquelle?.art === "manuell").length;
    if (manuell > 0) gruende.push(`${manuell} Preis(e) von Hand überschrieben.`);
  }
  return { pflicht: gruende.length > 0, gruende, grenze };
}
