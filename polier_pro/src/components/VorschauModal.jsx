import { createPortal } from "react-dom";
import { X, Download, TriangleAlert } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { useBackButton } from "../hooks/useBackButton.js";

const GELB = "#F5C400";

// Gemeinsames Gerüst für Dokument-Vorschauen (Word/Excel) vor dem Download —
// Kopfleiste mit Firmenlogo statt generischem Icon (sofern vorhanden) und ein
// gelber Akzentstreifen auf dem "Papier" selbst sorgen für etwas Wiedererken-
// nungswert, auch wenn Admin keine eigene Vorlage (Intro-Text/Labels)
// konfiguriert hat und der generierte Inhalt entsprechend schlicht ausfällt.
//
// letterhead=true blendet zusätzlich Logo+Firmenname oben im Papier selbst
// ein — nur für Inhalte ohne eigenen Briefkopf (z.B. die Excel-Vorschau)
// gedacht. Bei Word-Exporten enthält der generierte Inhalt bereits einen
// Briefkopf (siehe tagebuchVorlage.js/angebotVorlage.js); dort würde das
// doppelt erscheinen, deshalb Default false.
export function VorschauModal({ offen, titel, Icon, eigeneFirma, onClose,
  laden, ladenText, fehler, downloadLabel = "Herunterladen", onDownload,
  letterhead = false, children }) {
  useBackButton(offen, onClose);
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
          {eigeneFirma?.logo
            ? <img src={eigeneFirma.logo} alt="" style={{ width:22, height:22, objectFit:"contain", borderRadius:4, flexShrink:0 }} />
            : <Icon size={16} style={{ flexShrink:0 }} />}
          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{titel}</span>
        </div>
        <button onClick={onClose}
          style={{ background:"none", border:"none", color:"var(--muted)",
            cursor:"pointer", display:"flex", flexShrink:0, marginLeft:10 }}><X size={22} /></button>
      </div>

      <div style={{ flex:1, padding:"20px 14px", display:"flex", justifyContent:"center" }}>
        {laden ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
            gap:10, color:"var(--muted)", paddingTop:60 }}>
            <Spinner size={20} /> {ladenText || "Vorschau wird erzeugt…"}
          </div>
        ) : fehler ? (
          <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
            padding:"10px 14px", fontSize:13, display:"flex", alignItems:"center", gap:7,
            alignSelf:"flex-start", maxWidth:520 }}>
            <TriangleAlert size={14} /> {fehler}
          </div>
        ) : (
          // Bewusst weißes "Papier" unabhängig vom App-Theme (auch im Dark
          // Mode) — die Vorschau soll aussehen wie das später geöffnete
          // Word-/Excel-Dokument, nicht wie der Rest der App. Der gelbe
          // Streifen oben ist die einzige "Branding"-Zutat, die garantiert
          // ankommt — anders als z.B. Textfarben aus dem Word-Inhalt selbst,
          // die beim HTML-Rendering der Vorschau verloren gehen können.
          <div style={{ background:"#fff", color:"#1a1a1a", width:"100%", maxWidth:760,
            borderRadius:4, borderTop:`4px solid ${GELB}`,
            padding:"32px 40px 40px", boxShadow:"0 2px 16px rgba(0,0,0,0.12)",
            lineHeight:1.5, fontSize:14 }}>
            {letterhead && (eigeneFirma?.logo || eigeneFirma?.name) && (
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
                {eigeneFirma?.logo && (
                  <img src={eigeneFirma.logo} alt="" style={{ width:42, height:42, objectFit:"contain", flexShrink:0 }} />
                )}
                <div style={{ fontWeight:800, fontSize:18, color:"#1a1a1a" }}>{eigeneFirma?.name}</div>
              </div>
            )}
            {children}
          </div>
        )}
      </div>

      <div style={{ padding:"12px 18px", paddingBottom:"calc(12px + env(safe-area-inset-bottom))",
        background:"var(--surface)", borderTop:"1px solid var(--border)",
        position:"sticky", bottom:0 }}>
        <button onClick={onDownload}
          style={{ width:"100%", background:"var(--yellow)", color:"#1a1200", border:"none",
            borderRadius:10, padding:13, fontWeight:800, fontSize:15, cursor:"pointer",
            fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <Download size={15} /> {downloadLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}
