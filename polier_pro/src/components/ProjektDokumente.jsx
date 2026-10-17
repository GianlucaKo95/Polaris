import { useState, useEffect, useRef } from "react";
import { FileText, Upload, X, TriangleAlert } from "lucide-react";
import { sbProjektDokumenteLaden, sbProjektDokumentHochladen, sbProjektDokumentLoeschen } from "../lib/supabase.js";
import { Spinner } from "./Spinner.jsx";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — Inhalt landet direkt als base64 in der DB-Zeile, kein Storage-Bucket

// Dokumente (PDF), die die Firma für den Kunden im Kundenportal zum
// Download bereitstellt (z.B. Abnahmeprotokoll, Rechnung, Plan-Änderung).
export function ProjektDokumente({ projektId, firmaId, profil, session }) {
  const [dokumente, setDokumente] = useState([]);
  const [laden,     setLaden]     = useState(true);
  const [hochladen, setHochladen] = useState(false);
  const [fehler,    setFehler]    = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    let aktiv = true;
    sbProjektDokumenteLaden(projektId, session).then(d => { if (aktiv) { setDokumente(d); setLaden(false); } });
    return () => { aktiv = false; };
  }, [projektId]);

  async function handleDatei(e) {
    const datei = e.target.files?.[0];
    e.target.value = "";
    if (!datei) return;
    setFehler("");
    if (datei.type !== "application/pdf") { setFehler("Bitte nur PDF-Dateien hochladen."); return; }
    if (datei.size > MAX_BYTES) { setFehler("Datei zu groß (max. 8 MB)."); return; }
    setHochladen(true);
    const daten = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = ev => resolve(ev.target.result);
      r.readAsDataURL(datei);
    });
    const { ok, daten: neu, fehler: err } = await sbProjektDokumentHochladen(projektId, firmaId, profil?.id, datei.name, daten, session);
    setHochladen(false);
    if (!ok) { setFehler(err || "Hochladen fehlgeschlagen."); return; }
    setDokumente(prev => [neu, ...prev]);
  }

  async function loeschen(id) {
    const { ok, fehler: err } = await sbProjektDokumentLoeschen(id, session);
    if (!ok) { setFehler(err || "Löschen fehlgeschlagen."); return; }
    setDokumente(prev => prev.filter(d => d.id !== id));
  }

  if (laden) return null;

  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12,
      padding:14, marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, fontWeight:700, fontSize:13, marginBottom:8 }}>
        <FileText size={15} />Kundendokumente
      </div>
      <div style={{ color:"var(--muted)", fontSize:12, lineHeight:1.5, marginBottom:10 }}>
        PDFs, die der Bauherr im Kundenportal zum Download sieht (z.B. Abnahmeprotokoll, Rechnung) — max. 3 Dokumente, je max. 8 MB.
      </div>

      {dokumente.map(d => (
        <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          background:"var(--surface2)", borderRadius:8, padding:"7px 10px", marginBottom:6 }}>
          <div style={{ fontSize:12.5, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {d.dateiname}
          </div>
          <button onClick={() => loeschen(d.id)}
            style={{ background:"var(--rbg)", border:"1px solid var(--red)", color:"var(--red)",
              borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:11, fontFamily:"inherit",
              display:"flex", flexShrink:0, marginLeft:8 }}><X size={12} /></button>
        </div>
      ))}

      {dokumente.length < 3 && (
        <>
          <input ref={fileRef} type="file" accept="application/pdf" style={{ display:"none" }} onChange={handleDatei} />
          <button onClick={() => fileRef.current?.click()} disabled={hochladen}
            style={{ background:"var(--surface2)", color:"var(--muted)",
              border:"1.5px dashed var(--border)", borderRadius:10,
              padding:"8px 16px", cursor: hochladen ? "default" : "pointer", fontSize:12,
              fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
            {hochladen ? <Spinner size={13} /> : <Upload size={14} />}
            {hochladen ? "Lädt hoch…" : "PDF hochladen"}
          </button>
        </>
      )}

      {fehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:8,
          padding:"8px 12px", fontSize:11.5, marginTop:10, display:"flex", alignItems:"center", gap:6 }}>
          <TriangleAlert size={13} />{fehler}
        </div>
      )}
    </div>
  );
}
