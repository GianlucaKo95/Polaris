// Plan-Assistent: ein Einstieg für alle Profile. Jedes Profil erkennt seine
// Bauteile im Vektor-PDF und schlägt die Zuordnung zu LV-Positionen vor.
// Neue Profile (z. B. Fassade, Bodenplatte) hängen sich hier ein.

import { dachErkennen, zuordnungVorschlagen as zuordnungFlachdach } from "./dachAssistent.js";
import { steildachErkennen, zuordnungSteildach } from "./steildach.js";
import { parkflaecheErkennen, zuordnungPark } from "./parkflaeche.js";
import { titel } from "./zuordnung.js";

export const PROFILE = [
  { id: "flachdach", name: "Flachdach", hinweis: "Bitumen, Kunststoff, Flüssig, Kies-, Grün- und Umkehrdach",
    optionen: [{ id: "randstreifen", name: "Randstreifen", einheit: "m", platzhalter: "auto" }],
    erkennen: (plan, o) => ({ profil: "flachdach", ...dachErkennen(plan, o) }), zuordnen: zuordnungFlachdach },
  { id: "steildach", name: "Steildach", hinweis: "Ziegel, Dachstein, Schiefer, Blech — Sattel-, Walm-, Pultdach",
    optionen: [{ id: "neigung", name: "Neigung", einheit: "°", platzhalter: "auto" }],
    erkennen: steildachErkennen, zuordnen: zuordnungSteildach },
  { id: "parkflaeche", name: "Parkfläche", hinweis: "Parkdeck, Tiefgaragendach, Stellplatzfläche",
    optionen: [], erkennen: parkflaecheErkennen, zuordnen: zuordnungPark },
];
export const profil = id => PROFILE.find(p => p.id === id) || PROFILE[0];

const MERKMALE = {
  steildach: /ziegel|pfanne|dachstein|biber|schiefer|konterlattung|lattung|unterdeck|unterspann|\bfirst|ortgang|\btrauf|\bgrat\b|kehlblech|dachfenster/i,
  parkflaeche: /stellpl|parkdeck|parkhaus|tiefgarage|fahrgasse|\bos\s*(8|10|11|13)\b|gussasphalt|markierung|radabweiser|piktogramm/i,
  flachdach: /attika|kies|bitumen|schwei[ßs]bahn|dampfsperre|gef[äa]lled[äa]mm|extensiv|substrat|lichtkuppel|flachdach|umkehrdach|epdm|fpo|kunststoffbahn/i,
};

// Profil aus den LV-Kurztiteln (und optional Plantexten) vorschlagen
export function profilVorschlagen(positionen = [], texte = []) {
  const punkte = { flachdach: 0, steildach: 0, parkflaeche: 0 };
  for (const p of positionen) for (const [id, re] of Object.entries(MERKMALE)) if (re.test(titel(p.kurztext, 6))) punkte[id] += 2;
  for (const t of texte) for (const [id, re] of Object.entries(MERKMALE)) if (re.test(String(t.text))) punkte[id] += 1;
  const [best, wert] = Object.entries(punkte).sort((a, b) => b[1] - a[1])[0];
  return wert > 0 ? best : "flachdach";
}

export function planErkennen(profilId, plan, optionen = {}) {
  const p = profil(profilId);
  return { profil: p.id, ...p.erkennen(plan, optionen) };
}

export const zuordnen = (profilId, positionen, mengen) => profil(profilId).zuordnen(positionen, mengen);
