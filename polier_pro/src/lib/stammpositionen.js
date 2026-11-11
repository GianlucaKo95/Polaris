// Stammpositionen: firmeneigene Leistungspositionen mit Rezeptur JE
// MENGENEINHEIT (z.B. "Perimeterdämmung XPS 120 mm" je m²: 0,25 h
// Facharbeiter + 1,05 m² XPS-Platte + 0,02 h Rüttelplatte) — das Herz des
// Stammdatenverzeichnisses, aus dem der KI-Angebots-Agent (siehe
// kiAngebotAgent.js) Angebote zusammenstellt.
//
// Abgrenzung zu den bestehenden Stammdaten:
// - einheitspreise: fertiger Verkaufs-EP je Gewerk, ohne Aufschlüsselung.
// - kalkulationspreise: Kostenbausteine (Lohn/Material/Gerät/Fremdleistung
//   mit €/Einheit) — die ZUTATEN einer Rezeptur hier.
// - Kalkulation je Angebotsposition (kalkulation.js): Posten-Mengen gelten
//   für die GESAMTE Position ("40 h Facharbeiter"). Eine Stammposition
//   speichert dagegen Mengen je Einheit; stammpositionKalk() rechnet sie
//   für eine konkrete Positionsmenge hoch und liefert eine ganz normale
//   Kalkulation im Format von kalkulation.js — der Angebotseditor
//   (PositionKalkulation.jsx) zeigt sie also ohne Sonderfall an.
//
// Form einer Stammposition:
// { id, bez, langtext?, gewerk?, einheit,
//   rezeptur: [{ stammId, mengeJeEinheit }],   // stammId → kalkulationspreise
//   fremdleistungJeEinheit?: number }           // € je Einheit (Nachunternehmer)

import { leereKalkulation, kalkulationEp, ZUSCHLAG_FELD } from "./kalkulation.js";

const KATEGORIE_FELD = { lohn: "lohnposten", material: "materialposten", geraet: "geraetPosten" };

function rund(n, stellen = 4) {
  const f = 10 ** stellen;
  return Math.round(n * f) / f;
}

// Kalkulation (Format kalkulation.js) für eine konkrete Positionsmenge.
// Zuschläge kommen aus dem firmenweiten Standard-Zuschlagsschema
// (standardZuschlaege, AdminParameterView), fehlende Sätze zählen als 0 %.
// Rezepturzeilen, deren Kalkulationspreis inzwischen gelöscht wurde, werden
// ausgelassen statt mit Preis 0 mitgeführt — sonst stünde im Editor ein
// Posten ohne zugehörige Auswahl.
export function stammpositionKalk(sp, menge, kalkulationspreise, standardZuschlaege) {
  const kalk = leereKalkulation();
  for (const zeile of sp?.rezeptur || []) {
    const stamm = (kalkulationspreise || []).find(k => k.id === zeile.stammId);
    if (!stamm) continue;
    const gesamtMenge = rund((zeile.mengeJeEinheit || 0) * (menge || 0));
    if (stamm.kategorie === "fremdleistung") {
      kalk.fremdleistung += (stamm.preis || 0) * gesamtMenge;
      continue;
    }
    const feld = KATEGORIE_FELD[stamm.kategorie];
    if (feld) kalk[feld].push({ stammId: stamm.id, menge: gesamtMenge });
  }
  kalk.fremdleistung = rund(kalk.fremdleistung + (sp?.fremdleistungJeEinheit || 0) * (menge || 0), 2);
  for (const feld of Object.values(ZUSCHLAG_FELD)) {
    kalk[feld] = Number(standardZuschlaege?.[feld]) || 0;
  }
  return kalk;
}

// EP je Einheit. Unabhängig von der Menge (Rezeptur ist linear) — gerechnet
// über eine Bezugsmenge von 1, damit ein Katalogeintrag ohne Projektbezug
// einen Preis anzeigen kann.
export function stammpositionEp(sp, kalkulationspreise, standardZuschlaege) {
  const kalk = stammpositionKalk(sp, 1, kalkulationspreise, standardZuschlaege);
  return Math.round(kalkulationEp(kalk, kalkulationspreise, 1) * 100) / 100;
}

// Lohnstunden je Einheit (Zeitansatz) — für EFB 223 und die Anzeige.
export function stammpositionZeitansatz(sp, kalkulationspreise) {
  return (sp?.rezeptur || []).reduce((s, z) => {
    const stamm = (kalkulationspreise || []).find(k => k.id === z.stammId);
    return stamm?.kategorie === "lohn" && stamm.einheit === "h" ? s + (z.mengeJeEinheit || 0) : s;
  }, 0);
}

// Angebotsposition aus einer Stammposition. stammpositionId bleibt an der
// Position hängen, damit der Editor bei einer Mengenänderung die Rezeptur
// neu hochrechnen kann (positionMengeAendern) statt die Gesamtmengen der
// Kalkulation einzufrieren — sonst würde der EP bei mehr Menge sinken.
export function positionAusStammposition(sp, menge, kalkulationspreise, standardZuschlaege) {
  const kalk = stammpositionKalk(sp, menge, kalkulationspreise, standardZuschlaege);
  return {
    bez: sp.bez,
    ...(sp.langtext ? { langtext: sp.langtext } : {}),
    einheit: sp.einheit,
    menge: menge || 0,
    rabatt: 0,
    kalk,
    ep: menge ? kalkulationEp(kalk, kalkulationspreise, menge) : stammpositionEp(sp, kalkulationspreise, standardZuschlaege),
    stammpositionId: sp.id,
  };
}

// Mengenänderung an einer Position: stammt sie aus einer Stammposition, die
// noch existiert, wird die Kalkulation aus der Rezeptur neu aufgebaut —
// die vom Nutzer gesetzten Zuschläge der Position bleiben dabei erhalten.
// Gibt null zurück, wenn kein Neuaufbau möglich ist (Aufrufer fällt dann
// auf das bisherige Verhalten zurück).
export function positionMengeAendern(position, neueMenge, stammpositionen, kalkulationspreise) {
  if (!position?.stammpositionId || !position.kalk) return null;
  const sp = (stammpositionen || []).find(s => s.id === position.stammpositionId);
  if (!sp) return null;
  const zuschlaege = {};
  for (const feld of Object.values(ZUSCHLAG_FELD)) zuschlaege[feld] = position.kalk[feld];
  const kalk = stammpositionKalk(sp, neueMenge, kalkulationspreise, zuschlaege);
  return { ...position, menge: neueMenge, kalk, ep: neueMenge ? kalkulationEp(kalk, kalkulationspreise, neueMenge) : position.ep };
}

export function leereStammposition() {
  return { bez: "", langtext: "", gewerk: "", einheit: "m²", rezeptur: [], fremdleistungJeEinheit: 0 };
}
