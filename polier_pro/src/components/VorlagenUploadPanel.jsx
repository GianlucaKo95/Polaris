import { Upload, Sparkles, TriangleAlert, X } from "lucide-react";
import { Spinner } from "./Spinner.jsx";
import { inputStyle, Label } from "./Label.jsx";
import { useVorlagenUpload } from "../hooks/useVorlagenUpload.js";

// Gemeinsame UI für alle ".docx-Vorlage hochladen → KI schlägt Textbausteine
// vor → Admin prüft/korrigiert"-Tabs. textFelder sind mehrzeilige Textareas
// (z.B. Einleitung/Schlusstext), kurzFelder einzeilige Inputs im 2er-Grid
// (z.B. Spalten-/Abschnittsbeschriftungen) — beides [Label, Key, Platzhalter?].
export function VorlagenUploadPanel({ beschreibung, analysiereFn, session, vorlage, setVorlage, textFelder, kurzFelder }) {
  const { hochladen, laedt, fehler } = useVorlagenUpload(analysiereFn, session, setVorlage);

  return (
    <div>
      <div style={{ color:"var(--muted)", fontSize:12, marginBottom:10, lineHeight:1.5 }}>
        {beschreibung}
      </div>

      <label style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7,
        background:"var(--surface2)", border:"1.5px dashed var(--border)",
        borderRadius:10, padding:14, cursor: laedt ? "default" : "pointer",
        color:"var(--text)", fontSize:13, fontWeight:700, marginBottom:10 }}>
        {laedt
          ? <><Spinner size={14} /> Analysiere Vorlage…</>
          : <><Upload size={14} /> .docx hochladen &amp; analysieren</>}
        <input type="file" accept=".docx" disabled={laedt}
          onChange={hochladen} style={{ display:"none" }} />
      </label>

      {fehler && (
        <div style={{ color:"var(--red)", fontSize:12, marginBottom:10,
          display:"flex", alignItems:"center", gap:5 }}>
          <TriangleAlert size={13} /> {fehler}
        </div>
      )}

      {vorlage && (
        <div style={{ background:"var(--surface)", borderRadius:12,
          padding:"12px 14px", border:"1.5px solid var(--border)" }}>
          <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:12,
            marginBottom:9, display:"flex", alignItems:"center", gap:5 }}>
            <Sparkles size={12} /> Vorschlag prüfen &amp; anpassen
          </div>
          {textFelder.map(([l,k]) => (
            <div key={k} style={{ marginBottom:9 }}>
              <Label>{l}</Label>
              <textarea value={vorlage[k]||""} rows={3}
                onChange={e=>setVorlage(v=>({...v,[k]:e.target.value}))}
                style={{ ...inputStyle(), resize:"vertical", fontFamily:"inherit" }} />
            </div>
          ))}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {kurzFelder.map(([l,k,ph]) => (
              <div key={k} style={{ marginBottom:9 }}>
                <Label>{l}</Label>
                <input value={vorlage[k]||""} placeholder={ph}
                  onChange={e=>setVorlage(v=>({...v,[k]:e.target.value}))}
                  style={inputStyle()} />
              </div>
            ))}
          </div>
          <button onClick={() => setVorlage(null)}
            style={{ background:"var(--rbg)", border:"1px solid var(--red)",
              color:"var(--red)", borderRadius:8, padding:"7px 12px",
              cursor:"pointer", fontSize:12, fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:5 }}><X size={12} /> Vorlage entfernen</button>
        </div>
      )}
    </div>
  );
}
