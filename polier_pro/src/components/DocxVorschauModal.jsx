import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import { erzeugeDocxVorschauHtml } from "../lib/docxUtils.js";
import { VorschauModal } from "./VorschauModal.jsx";

// Vorschau für ein selbst erzeugtes .docx (Angebot/Bautagebuch) vor dem
// Download — vorher gab es nur "Generieren" mit sofortigem Download, ohne
// vorher zu sehen, ob z.B. die Vorlage/Positionen wie gewünscht aussehen.
//
// blob kommt bereits fertig generiert rein (von erzeugeAngebotDocx/
// erzeugeBerichtDocx) — dieses Modal erzeugt nichts selbst, es zeigt nur
// die Vorschau und übernimmt den eigentlichen Download-Klick. Kein
// letterhead-Branding hier (siehe VorschauModal) — der generierte Inhalt
// selbst beginnt bereits mit Logo+Firmenname, das würde doppelt erscheinen.
export function DocxVorschauModal({ blob, dateiname, eigeneFirma, onClose }) {
  const offen = !!blob;
  const [html, setHtml] = useState("");
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    if (!blob) { setHtml(""); setFehler(""); return; }
    setLaedt(true); setFehler("");
    erzeugeDocxVorschauHtml(blob)
      .then(setHtml)
      .catch(() => setFehler("Vorschau konnte nicht erzeugt werden — die Datei lässt sich trotzdem herunterladen."))
      .finally(() => setLaedt(false));
  }, [blob]);

  function herunterladen() {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = dateiname;
    link.click(); URL.revokeObjectURL(url);
  }

  return (
    <VorschauModal offen={offen} titel={dateiname} Icon={FileText} eigeneFirma={eigeneFirma}
      onClose={onClose} laden={laedt} fehler={fehler} onDownload={herunterladen}>
      <style>{`
        .docx-vorschau table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        .docx-vorschau td, .docx-vorschau th { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
        .docx-vorschau img { max-width: 100%; }
        .docx-vorschau h1, .docx-vorschau h2, .docx-vorschau h3 { line-height: 1.3; }
      `}</style>
      <div className="docx-vorschau" dangerouslySetInnerHTML={{ __html: html }} />
    </VorschauModal>
  );
}
