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
//   variablen?: [{ name, bez, standard }],      // z.B. { name:"d", bez:"Dicke m", standard:0.25 }
//   rezeptur: [{ stammId, mengeJeEinheit | formel }        // stammId → kalkulationspreise
//            | { unterpositionId, mengeJeEinheit | formel }],// andere Stammposition (Baustein)
//   fremdleistungJeEinheit?: number }           // € je Einheit (Nachunternehmer)
//
// Formeln: Ausdruck mit den Variablen der Stammposition, z.B. "d * 1,02"
// (m³ Beton je m² Platte bei Dicke d). Die Werte kommen aus der
// Angebotsposition (position.variablen), sonst aus dem Standardwert.
//
// Bausteine: eine Rezepturzeile kann eine andere Stammposition enthalten
// (z.B. "Wand komplett" = Mauerwerk + Putz + Gerüstanteil). Sie wird
// rekursiv aufgelöst (max. MAX_TIEFE Ebenen, Zyklen werden abgebrochen).

import { leereKalkulation, kalkulationEp, ZUSCHLAG_FELD } from "./kalkulation.js";
import { rechnen } from "./bauwissen.js";

export const MAX_TIEFE = 5;

export function variablenWerte(sp, werte) {
  const ergebnis = {};
  for (const v of sp?.variablen || []) {
    if (!v?.name) continue;
    const w = werte?.[v.name];
    ergebnis[v.name] = Number.isFinite(Number(w)) && w !== "" && w != null ? Number(w) : Number(v.standard) || 0;
  }
  return ergebnis;
}

// Menge einer Rezepturzeile je Einheit — Formel oder fester Wert. Eine
// fehlerhafte Formel ergibt 0 und wird über formelFehler() gemeldet.
export function zeilenMenge(zeile, werte) {
  if (zeile?.formel && String(zeile.formel).trim()) {
    let ausdruck = String(zeile.formel);
    const namen = Object.keys(werte || {}).sort((a, b) => b.length - a.length);
    for (const n of namen) ausdruck = ausdruck.replace(new RegExp(`\\b${n}\\b`, "g"), `(${werte[n]})`);
    try { return rechnen(ausdruck); } catch { return 0; }
  }
  return Number(zeile?.mengeJeEinheit) || 0;
}

export function formelFehler(zeile, werte) {
  if (!zeile?.formel || !String(zeile.formel).trim()) return null;
  let ausdruck = String(zeile.formel);
  for (const n of Object.keys(werte || {}).sort((a, b) => b.length - a.length)) {
    ausdruck = ausdruck.replace(new RegExp(`\\b${n}\\b`, "g"), `(${werte[n]})`);
  }
  try { rechnen(ausdruck); return null; } catch (e) { return e.message; }
}

// Löst Bausteine und Formeln in eine flache Rezeptur je Einheit auf:
// { zeilen: [{ stammId, mengeJeEinheit }], fremdleistungJeEinheit }
export function rezepturAufloesen(sp, stammpositionen = [], werte = null, tiefe = 0, pfad = []) {
  const ergebnis = { zeilen: [], fremdleistungJeEinheit: Number(sp?.fremdleistungJeEinheit) || 0 };
  if (!sp || tiefe > MAX_TIEFE || pfad.includes(sp.id)) return ergebnis;
  const w = variablenWerte(sp, werte);
  for (const zeile of sp.rezeptur || []) {
    const menge = zeilenMenge(zeile, w);
    if (zeile.unterpositionId != null) {
      const unter = (stammpositionen || []).find(s => s.id === zeile.unterpositionId);
      if (!unter) continue;
      // Gleichnamige Variablen werden an den Baustein durchgereicht.
      const unterAufgeloest = rezepturAufloesen(unter, stammpositionen, w, tiefe + 1, [...pfad, sp.id]);
      for (const z of unterAufgeloest.zeilen) ergebnis.zeilen.push({ stammId: z.stammId, mengeJeEinheit: z.mengeJeEinheit * menge });
      ergebnis.fremdleistungJeEinheit += unterAufgeloest.fremdleistungJeEinheit * menge;
      continue;
    }
    if (zeile.stammId != null) ergebnis.zeilen.push({ stammId: zeile.stammId, mengeJeEinheit: menge });
  }
  return ergebnis;
}

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
export function stammpositionKalk(sp, menge, kalkulationspreise, standardZuschlaege, { stammpositionen = [], variablen = null } = {}) {
  const kalk = leereKalkulation();
  const flach = rezepturAufloesen(sp, stammpositionen, variablen);
  for (const zeile of flach.zeilen) {
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
  kalk.fremdleistung = rund(kalk.fremdleistung + flach.fremdleistungJeEinheit * (menge || 0), 2);
  for (const feld of Object.values(ZUSCHLAG_FELD)) {
    kalk[feld] = Number(standardZuschlaege?.[feld]) || 0;
  }
  return kalk;
}

// EP je Einheit. Unabhängig von der Menge (Rezeptur ist linear) — gerechnet
// über eine Bezugsmenge von 1, damit ein Katalogeintrag ohne Projektbezug
// einen Preis anzeigen kann.
export function stammpositionEp(sp, kalkulationspreise, standardZuschlaege, optionen = {}) {
  const kalk = stammpositionKalk(sp, 1, kalkulationspreise, standardZuschlaege, optionen);
  return Math.round(kalkulationEp(kalk, kalkulationspreise, 1) * 100) / 100;
}

// Lohnstunden je Einheit (Zeitansatz) — für EFB 223 und die Anzeige.
export function stammpositionZeitansatz(sp, kalkulationspreise, { stammpositionen = [], variablen = null } = {}) {
  return rezepturAufloesen(sp, stammpositionen, variablen).zeilen.reduce((s, z) => {
    const stamm = (kalkulationspreise || []).find(k => k.id === z.stammId);
    return stamm?.kategorie === "lohn" && stamm.einheit === "h" ? s + (z.mengeJeEinheit || 0) : s;
  }, 0);
}

// Angebotsposition aus einer Stammposition. stammpositionId bleibt an der
// Position hängen, damit der Editor bei einer Mengenänderung die Rezeptur
// neu hochrechnen kann (positionMengeAendern) statt die Gesamtmengen der
// Kalkulation einzufrieren — sonst würde der EP bei mehr Menge sinken.
export function positionAusStammposition(sp, menge, kalkulationspreise, standardZuschlaege, { stammpositionen = [], variablen = null } = {}) {
  const werte = variablenWerte(sp, variablen);
  const optionen = { stammpositionen, variablen: werte };
  const kalk = stammpositionKalk(sp, menge, kalkulationspreise, standardZuschlaege, optionen);
  return {
    bez: sp.bez,
    ...(sp.langtext ? { langtext: sp.langtext } : {}),
    einheit: sp.einheit,
    menge: menge || 0,
    rabatt: 0,
    kalk,
    ep: menge ? kalkulationEp(kalk, kalkulationspreise, menge) : stammpositionEp(sp, kalkulationspreise, standardZuschlaege, optionen),
    stammpositionId: sp.id,
    ...(Object.keys(werte).length ? { variablen: werte } : {}),
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
  const kalk = stammpositionKalk(sp, neueMenge, kalkulationspreise, zuschlaege, { stammpositionen, variablen: position.variablen });
  return { ...position, menge: neueMenge, kalk, ep: neueMenge ? kalkulationEp(kalk, kalkulationspreise, neueMenge) : position.ep };
}

// Variablenwert an einer Position ändern → Kalkulation neu aufbauen.
export function positionVariableAendern(position, name, wert, stammpositionen, kalkulationspreise) {
  const mitWert = { ...position, variablen: { ...(position.variablen || {}), [name]: Number(wert) || 0 } };
  return positionMengeAendern(mitWert, position.menge, stammpositionen, kalkulationspreise) || mitWert;
}

export function leereStammposition() {
  return { bez: "", langtext: "", gewerk: "", einheit: "m²", variablen: [], rezeptur: [], fremdleistungJeEinheit: 0 };
}
