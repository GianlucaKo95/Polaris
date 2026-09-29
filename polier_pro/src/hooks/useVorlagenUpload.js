import { useState } from "react";
import { extrahiereDocxText } from "../lib/docxUtils.js";

// Gemeinsame Upload/Analyse-Logik für alle ".docx-Vorlage hochladen → KI
// schlägt Textbausteine vor"-Tabs (Angebot, Bautagebuch, ggf. weitere) —
// EINE Stelle für die Fehlerbehandlung, statt sie pro Vorlagen-Typ separat
// nachzuziehen und dabei auseinanderlaufen zu lassen.
export function useVorlagenUpload(analysiereFn, session, onErgebnis) {
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState("");

  async function hochladen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFehler("");

    if (!file.name.toLowerCase().endsWith(".docx")) {
      setFehler(`Bitte eine .docx-Datei hochladen (erhalten: .${file.name.split(".").pop() || "?"}).`);
      return;
    }

    setLaedt(true);

    // Eigener try/catch fürs Auslesen, getrennt von der KI-Anfrage: mammoth
    // wirft bei einer beschädigten/keiner echten .docx-Datei nur einen
    // technischen Fehler (z.B. "end of central directory record signature
    // not found") — der wäre für den Admin nicht verständlich, deshalb hier
    // durch eine eigene, konkrete Meldung ersetzt statt 1:1 durchgereicht.
    let text;
    try {
      text = await extrahiereDocxText(file);
    } catch {
      setFehler("Die Datei konnte nicht gelesen werden — ist es eine gültige, unbeschädigte .docx-Datei?");
      setLaedt(false);
      return;
    }

    try {
      const vorschlag = await analysiereFn(text, session);
      if (!vorschlag) {
        setFehler("Konnte die Vorlage nicht auswerten. Bitte Felder unten manuell ausfüllen.");
        onErgebnis(v => v || {});
        return;
      }
      onErgebnis(vorschlag);
    } catch (err) {
      setFehler(err.message || "Analyse fehlgeschlagen.");
    } finally {
      setLaedt(false);
    }
  }

  return { hochladen, laedt, fehler, setFehler };
}
