import { Loader2 } from "lucide-react";

// Rotierender Lade-Indikator für Buttons/Panels, deren einzige bisherige
// Rückmeldung ein statischer Text war ("Suche…", "Speichert…") — der
// bleibt zusätzlich stehen, der Spinner macht "es passiert gerade etwas"
// auch auf einen flüchtigen Blick erkennbar.
export function Spinner({ size = 14, color = "currentColor" }) {
  return (
    <Loader2 size={size} color={color} style={{ animation: "polaris-spin 0.8s linear infinite" }} />
  );
}
