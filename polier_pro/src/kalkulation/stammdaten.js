// Stammdaten aus Polaris (gemeinsam mit der übrigen App): Kalkulationspreise,
// Stammpositionen (Bausteine), Kalkulationsgrundlagen, Firma.
import { createContext, useContext } from "react";

export const StammdatenKontext = createContext({
  kalkulationspreise: [], stammpositionen: [], kalkulationsgrundlagen: null, standardZuschlaege: null,
  eigeneFirma: null, onStammpositionenAendern: null,
});

export const useStammdaten = () => useContext(StammdatenKontext);
