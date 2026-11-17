import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Ruler, ArrowLeft, X, TriangleAlert, Check, Save } from "lucide-react";
import { parseDXFFlaechen } from "../lib/dxf.js";
import { leereAufgabe } from "../lib/utils.js";
import { inputStyle } from "../components/Label.jsx";

export function PlanErkennung({ onSave, onClose, onZurueck }) {
  const fileRef = useRef(null);
  const [phase,       setPhase]       = useState("idle"); // idle | result | error
  const [ergebnis,    setErgebnis]    = useState(null);    // { felder }
  const [fehler,      setFehler]      = useState("");
  const [ausgewaehlt, setAusgewaehlt] = useState({}); // index -> bool
  const [bearbeitet,  setBearbeitet]  = useState({}); // index -> { name, m2 }

  function handleFile(file) {
    if (!file) return;
    setFehler(""); setErgebnis(null);
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext !== "dxf") {
      setFehler(`Nur DXF-Dateien werden unterstützt (erhalten: .${ext}). Exportiere den Plan aus deinem CAD-Programm als DXF.`);
      setPhase("error");
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const felder = parseDXFFlaechen(e.target.result);
        // Koordinaten für Anzeige normalisieren (0-100%)
        const xs = felder.map(f=>f.plan_x), ys = felder.map(f=>f.plan_y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const normFelder = felder.map(f => ({
          ...f,
          plan_x: maxX>minX ? ((f.plan_x-minX)/(maxX-minX))*100 : 50,
          plan_y: maxY>minY ? (1-(f.plan_y-minY)/(maxY-minY))*100 : 50, // Y invertieren (DXF: unten=0)
        }));
        setErgebnis({ felder: normFelder });
        const sel = {}; normFelder.forEach((_,i)=>sel[i]=true);
        setAusgewaehlt(sel);
        setPhase("result");
      } catch (err) {
        setFehler(err.message || "DXF konnte nicht gelesen werden.");
        setPhase("error");
      }
    };
    reader.readAsText(file);
  }

  function reset() {
    setPhase("idle"); setErgebnis(null); setFehler("");
    setAusgewaehlt({}); setBearbeitet({});
  }

  function uebernehmen() {
    const neue = ergebnis.felder
      .filter((_,i) => ausgewaehlt[i])
      .map((f,i) => {
        const b = bearbeitet[i] || {};
        return {
          ...leereAufgabe(),
          id: Date.now() + Math.random(),
          titel: b.name ?? f.name,
          typ: "beton",
          m2: b.m2 ?? f.m2,
          plan_bild_url: null,
          plan_x: f.plan_x,
          plan_y: f.plan_y,
        };
      });
    onSave(neue);
  }

  const anzahlAusgewaehlt = Object.values(ausgewaehlt).filter(Boolean).length;

  // Als Portal gerendert — verschachtelt im normalen Baum bricht die
  // iOS-Standalone-PWA sonst denselben nested-position:fixed-Bug wie
  // beim Aufgabenformular.
  return createPortal(
    <div className="voll-overlay" style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
      background:"var(--bg)", zIndex:500, overflowY:"auto",
      WebkitOverflowScrolling:"touch" }}>

      <div style={{ background:"var(--surface)", padding:"10px 18px",
        paddingTop:"calc(14px + env(safe-area-inset-top))",
        borderBottom:"3px solid var(--yellow)", position:"sticky", top:0,
        zIndex:10, display:"flex", justifyContent:"space-between",
        alignItems:"center" }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:17,
          display:"flex", alignItems:"center", gap:8 }}>
          <Ruler size={16} /> DXF-Plan hochladen
        </div>
        <button onClick={onZurueck || onClose}
          style={{ background:"var(--surface2)", border:"1px solid var(--border)",
            color:"var(--text)", borderRadius:8, padding:"6px 14px",
            cursor:"pointer", fontSize:14, fontFamily:"inherit", display:"flex" }}>
          {onZurueck ? <ArrowLeft size={15} /> : <X size={15} />}
        </button>
      </div>

      <div style={{ padding:"18px 16px 100px" }}>

        {/* IDLE: Datei wählen */}
        {phase === "idle" && (
          <div>
            <div style={{ color:"var(--muted)", fontSize:13, marginBottom:13,
              lineHeight:1.6 }}>
              Lade eine DXF-Datei aus deinem CAD-Programm hoch — die App
              erkennt automatisch geschlossene Flächen (Polylinien, Blöcke,
              verkettete Linien) und schlägt daraus Betonfelder mit exakter
              Flächenberechnung vor.
            </div>
            <input ref={fileRef} type="file" accept=".dxf"
              style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
            <div onClick={() => fileRef.current.click()}
              style={{ border:"2px dashed var(--yellow)", borderRadius:20,
                padding:"35px 20px", textAlign:"center", cursor:"pointer",
                background:"var(--ybg)" }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:9, color:"var(--ydark)" }}><Ruler size={40} /></div>
              <div style={{ color:"var(--ydark)", fontWeight:700, fontSize:16 }}>
                DXF-Datei hochladen
              </div>
              <div style={{ color:"var(--muted)", fontSize:13, marginTop:6 }}>
                Antippen zum Auswählen
              </div>
            </div>
            <div style={{ background:"var(--surface)", borderRadius:10,
              padding:"7px 12px", marginTop:14, fontSize:11, color:"var(--muted)",
              border:"1px solid var(--border)", lineHeight:1.5 }}>
              Unterstützt: LWPOLYLINE, POLYLINE (inkl. Bögen), HATCH, CIRCLE,
              ARC, verkettete LINE-Segmente sowie INSERT-Blockreferenzen
              mit Skalierung/Rotation. Kein Internet nötig — die Erkennung
              läuft vollständig lokal auf dem Gerät.
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase === "error" && (
          <div>
            <div style={{ background:"var(--rbg)", borderRadius:12, padding:12,
              marginBottom:12, border:"1px solid var(--red)" }}>
              <div style={{ color:"var(--red)", fontWeight:700, fontSize:14,
                marginBottom:4, display:"flex", alignItems:"center", gap:6 }}><TriangleAlert size={14} /> Datei konnte nicht verarbeitet werden</div>
              <div style={{ color:"var(--text)", fontSize:13 }}>{fehler}</div>
            </div>
            <button onClick={reset}
              style={{ width:"100%", background:"var(--yellow)", color:"#1a1200",
                border:"none", borderRadius:12, padding:14, fontWeight:800,
                cursor:"pointer", fontSize:15, fontFamily:"inherit" }}>
              Erneut versuchen
            </button>
          </div>
        )}

        {/* RESULT: Vorschau mit Bestätigung */}
        {phase === "result" && ergebnis && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:10 }}>
              <div style={{ color:"var(--text)", fontWeight:700, fontSize:14 }}>
                {ergebnis.felder.length} Fläche{ergebnis.felder.length!==1?"n":""} erkannt
              </div>
              <div style={{ color:"var(--muted)", fontSize:12 }}>
                {anzahlAusgewaehlt} ausgewählt
              </div>
            </div>

            {ergebnis.felder.map((f, i) => (
              <div key={i} style={{ background:"var(--surface)", borderRadius:12,
                padding:"9px 14px", marginBottom:6,
                border:`1.5px solid ${ausgewaehlt[i] ? "var(--yellow)" : "var(--border)"}`,
                opacity: ausgewaehlt[i] ? 1 : 0.5 }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <div onClick={() => setAusgewaehlt(p=>({...p,[i]:!p[i]}))}
                    style={{ width:24, height:24, borderRadius:6, flexShrink:0,
                      background: ausgewaehlt[i] ? "var(--yellow)" : "var(--surface2)",
                      border:`1.5px solid ${ausgewaehlt[i] ? "var(--yellow)" : "var(--border)"}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      cursor:"pointer", fontSize:14, color:"#1a1200", marginTop:2 }}>
                    {ausgewaehlt[i] && <Check size={14} />}
                  </div>
                  <div style={{ flex:1 }}>
                    <input
                      value={bearbeitet[i]?.name ?? f.name}
                      onChange={e => setBearbeitet(p=>({...p,[i]:{...p[i], name:e.target.value}}))}
                      style={{ ...inputStyle(), padding:"6px 10px", fontSize:13,
                        fontWeight:700, marginBottom:6 }} />
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ color:"var(--muted)", fontSize:11 }}>Fläche:</span>
                      <input type="number"
                        value={bearbeitet[i]?.m2 ?? f.m2}
                        onChange={e => setBearbeitet(p=>({...p,[i]:{...p[i], m2:Number(e.target.value)}}))}
                        style={{ ...inputStyle(), padding:"4px 8px", fontSize:12,
                          width:70 }} />
                      <span style={{ color:"var(--muted)", fontSize:11 }}>m²</span>
                      <span style={{ color:"var(--muted)", fontSize:10, marginLeft:"auto" }}>
                        {f.quelle}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button onClick={reset}
                style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
                  border:"1px solid var(--border)", borderRadius:12, padding:14,
                  cursor:"pointer", fontFamily:"inherit" }}>Verwerfen</button>
              <button onClick={uebernehmen} disabled={anzahlAusgewaehlt===0}
                style={{ flex:2,
                  background: anzahlAusgewaehlt>0 ? "var(--yellow)" : "var(--surface2)",
                  color: anzahlAusgewaehlt>0 ? "#1a1200" : "var(--muted)",
                  border:"none", borderRadius:12, padding:14, fontWeight:800,
                  cursor: anzahlAusgewaehlt>0 ? "pointer" : "default", fontSize:15,
                  fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                <Save size={15} /> {anzahlAusgewaehlt} Feld{anzahlAusgewaehlt!==1?"er":""} übernehmen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
