import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, FileText, TriangleAlert } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { erzeugeDocxVorschauHtml } from "../lib/docxUtils.js";
import { useBackButton } from "../hooks/useBackButton.js";

// Vorschau für ein selbst erzeugtes .docx (Angebot/Bautagebuch) vor dem
// Download — vorher gab es nur "Generieren" mit sofortigem Download, ohne
// vorher zu sehen, ob z.B. die Vorlage/Positionen wie gewünscht aussehen.
//
// blob kommt bereits fertig generiert rein (von erzeugeAngebotDocx/
// erzeugeBerichtDocx) — dieses Modal erzeugt nichts selbst, es zeigt nur
// die Vorschau und übernimmt den eigentlichen Download-Klick.
export function DocxVorschauModal({ blob, dateiname, onClose }) {
  const offen = !!blob;
  useBackButton(offen, onClose);
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

  if (!offen) return null;

  return createPortal(
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
      background:"var(--bg)", zIndex:650, overflowY:"auto",
      WebkitOverflowScrolling:"touch", display:"flex", flexDirection:"column" }}>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"14px 18px", paddingTop:"calc(14px + env(safe-area-inset-top))",
        background:"var(--surface)", borderBottom:"1px solid var(--border)",
        position:"sticky", top:0, zIndex:5 }}>
        <div style={{ fontWeight:800, fontSize:16, color:"var(--text)",
          display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
          <FileText size={16} style={{ flexShrink:0 }} />
          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{dateiname}</span>
        </div>
        <button onClick={onClose}
          style={{ background:"none", border:"none", color:"var(--muted)",
            cursor:"pointer", display:"flex", flexShrink:0, marginLeft:10 }}><X size={22} /></button>
      </div>

      <div style={{ flex:1, padding:"20px 14px", display:"flex", justifyContent:"center" }}>
        {laedt ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
            gap:10, color:"var(--muted)", paddingTop:60 }}>
            <Spinner size={20} /> Vorschau wird erzeugt…
          </div>
        ) : fehler ? (
          <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
            padding:"10px 14px", fontSize:13, display:"flex", alignItems:"center", gap:7,
            alignSelf:"flex-start", maxWidth:520 }}>
            <TriangleAlert size={14} /> {fehler}
          </div>
        ) : (
          // Bewusst weißes "Papier" unabhängig vom App-Theme (auch im
          // Dark Mode) — die Vorschau soll aussehen wie das später
          // gedruckte/geöffnete Word-Dokument, nicht wie der Rest der App.
          <div style={{ background:"#fff", color:"#1a1a1a", width:"100%", maxWidth:760,
            borderRadius:4, padding:"40px 48px", boxShadow:"0 2px 16px rgba(0,0,0,0.12)",
            lineHeight:1.5, fontSize:14 }}>
            <style>{`
              .docx-vorschau table { border-collapse: collapse; width: 100%; margin: 10px 0; }
              .docx-vorschau td, .docx-vorschau th { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
              .docx-vorschau img { max-width: 100%; }
              .docx-vorschau h1, .docx-vorschau h2, .docx-vorschau h3 { line-height: 1.3; }
            `}</style>
            <div className="docx-vorschau" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
      </div>

      <div style={{ padding:"12px 18px", paddingBottom:"calc(12px + env(safe-area-inset-bottom))",
        background:"var(--surface)", borderTop:"1px solid var(--border)",
        position:"sticky", bottom:0 }}>
        <button onClick={herunterladen}
          style={{ width:"100%", background:"var(--yellow)", color:"#1a1200", border:"none",
            borderRadius:10, padding:13, fontWeight:800, fontSize:15, cursor:"pointer",
            fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <Download size={15} /> Herunterladen
        </button>
      </div>
    </div>,
    document.body
  );
}
