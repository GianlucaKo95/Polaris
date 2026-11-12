// Schutz vor Datenverlust: Formulare melden ungespeicherte Änderungen an.
// Solange etwas offen ist,
//   – fragt der Browser beim Schließen/Neuladen nach (beforeunload),
//   – fragt die App nach, bevor ein Klick in einem Navigationsbereich
//     ([data-navigation]: Seitenleiste, Reiter, untere Leiste …) die Ansicht
//     wechselt (VerlassenDialog.jsx fängt diese Klicks ab),
//   – und verlassenBestaetigen() kann von Zurück-Knöpfen direkt gefragt werden.
// Formulare nutzen dafür den Hook useUngespeichert (hooks/useUngespeichert.js).

const eintraege = new Map();   // id → { titel, speichern?, verwerfen? }
let naechsteId = 1;
let dialog = null;             // vom VerlassenDialog gesetzt: offen => Promise<boolean>

export function anmelden(eintrag) { const id = naechsteId++; eintraege.set(id, eintrag); return id; }
export function aktualisieren(id, eintrag) { if (eintraege.has(id)) eintraege.set(id, eintrag); }
export function abmelden(id) { eintraege.delete(id); }
export const offeneEintraege = () => [...eintraege.values()];
export const hatUngespeichert = () => eintraege.size > 0;
export function dialogRegistrieren(fn) { dialog = fn; return () => { if (dialog === fn) dialog = null; }; }

// true = weiter (gespeichert, verworfen oder nichts offen), false = bleiben
export function verlassenBestaetigen() {
  const offen = offeneEintraege();
  if (!offen.length) return Promise.resolve(true);
  if (dialog) return dialog(offen);
  return Promise.resolve(window.confirm("Es gibt ungespeicherte Änderungen. Trotzdem verlassen?"));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", e => {
    if (!hatUngespeichert()) return;
    e.preventDefault();
    e.returnValue = "";
  });
}
