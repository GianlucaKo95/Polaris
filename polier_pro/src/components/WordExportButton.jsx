import { useState } from "react";
import { FileText } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { erzeugeBerichtDocx } from "../lib/tagebuchVorlage.js";

export function WordExportButton({ bericht, projekt, eigeneFirma, wetter, kolonnen, tagebuchVorlage }) {
  const [laedt, setLaedt] = useState(false);

  async function handleExport() {
    if (laedt) return;
    setLaedt(true);
    try {
      const b = { ...bericht, kolonnen: kolonnen || [] };
      const blob = await erzeugeBerichtDocx({ bericht: b, projekt, eigeneFirma, wetter, tagebuchVorlage });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `Bautagebuch_${bericht.datum}.docx`;
      link.click(); URL.revokeObjectURL(url);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <button onClick={handleExport} disabled={laedt}
      style={{ background: "var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
        borderRadius:8, padding:"6px 14px", fontWeight:700, cursor: laedt ? "default" : "pointer", fontSize:13,
        display:"flex", alignItems:"center", gap:6 }}>
      {laedt ? <Spinner size={13} /> : <FileText size={13} />} Word
    </button>
  );
}
