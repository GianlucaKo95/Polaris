import { useState } from "react";
import { FileText } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { DocxVorschauModal } from "./DocxVorschauModal.jsx";
import { erzeugeBerichtDocx } from "../lib/tagebuchVorlage.js";

export function WordExportButton({ bericht, projekt, eigeneFirma, wetter, kolonnen, tagebuchVorlage }) {
  const [laedt, setLaedt] = useState(false);
  const [blob,  setBlob]  = useState(null);

  async function handleExport() {
    if (laedt) return;
    setLaedt(true);
    try {
      const b = { ...bericht, kolonnen: kolonnen || [] };
      const neuerBlob = await erzeugeBerichtDocx({ bericht: b, projekt, eigeneFirma, wetter, tagebuchVorlage });
      setBlob(neuerBlob);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <>
      <button onClick={handleExport} disabled={laedt}
        style={{ background: "var(--yellow)", color:"#1a1200", border:"none",
          borderRadius:8, padding:"6px 14px", fontWeight:700, cursor: laedt ? "default" : "pointer", fontSize:13,
          display:"flex", alignItems:"center", gap:6 }}>
        {laedt ? <><Spinner size={13} /> Generiere…</> : <><FileText size={13} /> Generieren</>}
      </button>

      <DocxVorschauModal blob={blob} dateiname={`Bautagebuch_${bericht.datum}.docx`} onClose={() => setBlob(null)} />
    </>
  );
}
