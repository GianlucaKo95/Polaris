import { useEffect, useRef } from "react";
import { anmelden, abmelden, verlassenBestaetigen } from "../lib/ungespeichert.js";

// Meldet ungespeicherte Änderungen an, solange aktiv true ist.
//   titel      — was offen ist, z. B. „Angebot Rohbau Tiefgarage“
//   speichern  — optional, async, true bei Erfolg: der Dialog bietet dann „Speichern“
//   verwerfen  — optional, z. B. lokalen Entwurf löschen
export function useUngespeichert(aktiv, { titel, speichern, verwerfen } = {}) {
  const fns = useRef({});
  fns.current = { titel, speichern, verwerfen };
  const id = useRef(null);
  useEffect(() => {
    if (!aktiv) return undefined;
    const eintrag = {
      get titel() { return fns.current.titel; },
      speichern: () => fns.current.speichern?.(),
      hatSpeichern: () => !!fns.current.speichern,
      verwerfen: () => fns.current.verwerfen?.(),
    };
    id.current = anmelden(eintrag);
    return () => { abmelden(id.current); id.current = null; };
  }, [aktiv]);
}

// Für Formulare: merkt sich den Ausgangswert beim Öffnen (bzw. wenn sich
// basisSchluessel ändert, z. B. ein anderer Datensatz gewählt wird) und
// meldet Änderungen an. pruefen() fragt vor dem Schließen nach.
export function useFormularSchutz(wert, { titel, aktiv = true, basisSchluessel = null, speichern, verwerfen } = {}) {
  const json = JSON.stringify(wert ?? null);
  const basis = useRef(null);
  const schluessel = useRef(basisSchluessel);
  if (basis.current === null || schluessel.current !== basisSchluessel) { basis.current = json; schluessel.current = basisSchluessel; }
  const geaendert = aktiv && json !== basis.current;
  useUngespeichert(geaendert, { titel, speichern, verwerfen });
  return {
    geaendert,
    alsGespeichert: (neu = wert) => { basis.current = JSON.stringify(neu ?? null); },
    pruefen: async () => !geaendert || await verlassenBestaetigen(),
  };
}
