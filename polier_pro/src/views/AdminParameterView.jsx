import { useState } from "react";
import { createPortal } from "react-dom";
import { Settings, Euro, ClipboardList, Pencil, X, Plus, FileText, Upload, Sparkles, TriangleAlert } from "lucide-react";
import { PreisFormular } from "./PreisFormular.jsx";
import { VorlageFormular } from "./VorlageFormular.jsx";
import { useBackButton } from "../hooks/useBackButton.js";
import { inputStyle, Label } from "../components/Label.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { extrahiereDocxText } from "../lib/angebotVorlage.js";
import { kiVorlageAnalysieren } from "../lib/ai.js";

export function AdminParameterView({ einheitspreise, setEinheitspreise, lvVorlagen, setLvVorlagen, angebotVorlage, setAngebotVorlage, session }) {
  const [aktiv,    setAktiv]    = useState("preise"); // preise | vorlagen | angebotsvorlage
  const [neuPreis, setNeuPreis] = useState(null);
  const [neuVorlage,setNeuVorlage] = useState(null);
  const [editPreis, setEditPreis] = useState(null);
  const [vorlageLaedt, setVorlageLaedt] = useState(false);
  const [vorlageFehler, setVorlageFehler] = useState("");
  useBackButton(neuPreis || editPreis, () => { setNeuPreis(null); setEditPreis(null); });
  useBackButton(neuVorlage, () => setNeuVorlage(null));

  async function docxHochladen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setVorlageFehler("");
    setVorlageLaedt(true);
    try {
      const text = await extrahiereDocxText(file);
      const vorschlag = await kiVorlageAnalysieren(text, session);
      if (!vorschlag) {
        setVorlageFehler("Konnte die Vorlage nicht auswerten. Bitte Felder unten manuell ausfüllen.");
        setAngebotVorlage(v => v || {});
        return;
      }
      setAngebotVorlage(vorschlag);
    } catch (err) {
      setVorlageFehler(err.message || "Datei konnte nicht gelesen werden.");
    } finally {
      setVorlageLaedt(false);
    }
  }

  function preisLoeschen(id) {
    setEinheitspreise(prev => prev.filter(p => p.id !== id));
  }

  function preisSpeichern(p) {
    if (p.id && einheitspreise.find(x=>x.id===p.id)) {
      setEinheitspreise(prev => prev.map(x => x.id===p.id ? p : x));
    } else {
      setEinheitspreise(prev => [...prev, { ...p, id:Date.now() }]);
    }
    setNeuPreis(null); setEditPreis(null);
  }

  return (
    <div>
      <div style={{ color:"var(--text)", fontWeight:700, fontSize:15, marginBottom:10,
        display:"flex", alignItems:"center", gap:7 }}>
        <Settings size={16} /> Angebots-Parameter
      </div>

      {/* Tab-Toggle */}
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {[["preise",Euro,"Einheitspreise"],["vorlagen",ClipboardList,"LV-Vorlagen"],["angebotsvorlage",FileText,"Angebots-Vorlage"]].map(([k,Icon,l]) => (
          <button key={k} onClick={() => setAktiv(k)}
            style={{ flex:1, background: aktiv===k ? "var(--yellow)" : "var(--surface2)",
              color: aktiv===k ? "#1a1200" : "var(--muted)",
              border:`1.5px solid ${aktiv===k ? "var(--yellow)" : "var(--border)"}`,
              borderRadius:10, padding:10, fontWeight: aktiv===k ? 700 : 400,
              cursor:"pointer", fontSize:13, fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><Icon size={13} /> {l}</button>
        ))}
      </div>

      {/* EINHEITSPREISE */}
      {aktiv === "preise" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:7 }}>
            <div style={{ color:"var(--muted)", fontSize:12 }}>
              {einheitspreise.length} Positionen
            </div>
            <button onClick={() => setNeuPreis({ gewerk:"", einheit:"m²", preis:0, beschreibung:"" })}
              style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
                borderRadius:10, padding:"7px 14px", fontWeight:700,
                cursor:"pointer", fontSize:12, fontFamily:"inherit",
                display:"flex", alignItems:"center", gap:5 }}>
              <Plus size={13} /> Position
            </button>
          </div>

          {einheitspreise.map(p => (
            <div key={p.id} style={{ background:"var(--surface)", borderRadius:12,
              padding:"9px 14px", marginBottom:6,
              border:"1.5px solid var(--border)" }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ color:"var(--text)", fontWeight:700, fontSize:13 }}>
                    {p.gewerk} · {p.beschreibung}
                  </div>
                  <div style={{ color:"var(--muted)", fontSize:12, marginTop:2 }}>
                    {p.einheit} · {p.preis.toLocaleString("de-DE")} €/{p.einheit}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => setEditPreis(p)}
                    style={{ background:"var(--surface2)", border:"1px solid var(--border)",
                      color:"var(--muted)", borderRadius:8, padding:"4px 10px",
                      cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}><Pencil size={13} /></button>
                  <button onClick={() => preisLoeschen(p.id)}
                    style={{ background:"var(--rbg)", border:"1px solid var(--red)",
                      color:"var(--red)", borderRadius:8, padding:"4px 10px",
                      cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}><X size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LV-VORLAGEN */}
      {aktiv === "vorlagen" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:7 }}>
            <div style={{ color:"var(--muted)", fontSize:12 }}>
              {lvVorlagen.length} Vorlagen
            </div>
            <button onClick={() => setNeuVorlage({ name:"", gewerk:"", positionen:[] })}
              style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
                borderRadius:10, padding:"7px 14px", fontWeight:700,
                cursor:"pointer", fontSize:12, fontFamily:"inherit",
                display:"flex", alignItems:"center", gap:5 }}>
              <Plus size={13} /> Vorlage
            </button>
          </div>

          {lvVorlagen.map(v => (
            <div key={v.id} style={{ background:"var(--surface)", borderRadius:12,
              padding:"9px 14px", marginBottom:6,
              border:"1.5px solid var(--border)" }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:6 }}>
                <div style={{ color:"var(--text)", fontWeight:700, fontSize:13 }}>
                  {v.name}
                </div>
                <button onClick={() => setLvVorlagen(prev => prev.filter(x=>x.id!==v.id))}
                  style={{ background:"var(--rbg)", border:"1px solid var(--red)",
                    color:"var(--red)", borderRadius:8, padding:"4px 10px",
                    cursor:"pointer", fontSize:12, fontFamily:"inherit", display:"flex" }}><X size={13} /></button>
              </div>
              {v.positionen.map((pos,i) => (
                <div key={i} style={{ color:"var(--muted)", fontSize:11,
                  padding:"3px 0", borderBottom:"1px solid var(--border)" }}>
                  {pos.bez} · {pos.einheit}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ANGEBOTS-VORLAGE */}
      {aktiv === "angebotsvorlage" && (
        <div>
          <div style={{ color:"var(--muted)", fontSize:12, marginBottom:10, lineHeight:1.5 }}>
            Word-Dokument (.docx) mit eurem gewohnten Angebotstext hochladen — die
            KI schlägt daraus Einleitungs-/Schlusstext und Spaltenbeschriftungen
            vor. Jedes künftige Angebot wird damit als eigenes, sauber
            generiertes Word-Dokument exportierbar, nicht als Bearbeitung der
            hochgeladenen Datei selbst.
          </div>

          <label style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7,
            background:"var(--surface2)", border:"1.5px dashed var(--border)",
            borderRadius:10, padding:14, cursor: vorlageLaedt ? "default" : "pointer",
            color:"var(--text)", fontSize:13, fontWeight:700, marginBottom:10 }}>
            {vorlageLaedt
              ? <><Spinner size={14} /> Analysiere Vorlage…</>
              : <><Upload size={14} /> .docx hochladen &amp; analysieren</>}
            <input type="file" accept=".docx" disabled={vorlageLaedt}
              onChange={docxHochladen} style={{ display:"none" }} />
          </label>

          {vorlageFehler && (
            <div style={{ color:"var(--red)", fontSize:12, marginBottom:10,
              display:"flex", alignItems:"center", gap:5 }}>
              <TriangleAlert size={13} /> {vorlageFehler}
            </div>
          )}

          {angebotVorlage && (
            <div style={{ background:"var(--surface)", borderRadius:12,
              padding:"12px 14px", border:"1.5px solid var(--border)" }}>
              <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:12,
                marginBottom:9, display:"flex", alignItems:"center", gap:5 }}>
                <Sparkles size={12} /> Vorschlag prüfen &amp; anpassen
              </div>
              {[
                ["Einleitungstext","intro_text"],
                ["Schlusstext","footer_text"],
              ].map(([l,k]) => (
                <div key={k} style={{ marginBottom:9 }}>
                  <Label>{l}</Label>
                  <textarea value={angebotVorlage[k]||""} rows={3}
                    onChange={e=>setAngebotVorlage(v=>({...v,[k]:e.target.value}))}
                    style={{ ...inputStyle(), resize:"vertical", fontFamily:"inherit" }} />
                </div>
              ))}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  ["Spalte Bezeichnung","spalte_bez","Bezeichnung"],
                  ["Spalte Menge","spalte_menge","Menge"],
                  ["Spalte Einheit","spalte_einheit","Einheit"],
                  ["Spalte EP","spalte_ep","EP (€)"],
                  ["Spalte GP","spalte_gp","GP (€)"],
                ].map(([l,k,ph]) => (
                  <div key={k} style={{ marginBottom:9 }}>
                    <Label>{l}</Label>
                    <input value={angebotVorlage[k]||""} placeholder={ph}
                      onChange={e=>setAngebotVorlage(v=>({...v,[k]:e.target.value}))}
                      style={inputStyle()} />
                  </div>
                ))}
              </div>
              <button onClick={() => setAngebotVorlage(null)}
                style={{ background:"var(--rbg)", border:"1px solid var(--red)",
                  color:"var(--red)", borderRadius:8, padding:"7px 12px",
                  cursor:"pointer", fontSize:12, fontFamily:"inherit",
                  display:"flex", alignItems:"center", gap:5 }}><X size={12} /> Vorlage entfernen</button>
            </div>
          )}
        </div>
      )}

      {/* Preis-Formular — als Portal gerendert, sonst derselbe
          nested-position:fixed-Bug wie beim Aufgabenformular */}
      {(neuPreis || editPreis) && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:600, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0",
            padding:16,
            width:"100%", maxWidth:480 }}>
            <PreisFormular
              initial={editPreis || neuPreis}
              onSave={preisSpeichern}
              onClose={() => { setNeuPreis(null); setEditPreis(null); }}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Vorlagen-Formular */}
      {neuVorlage && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:600, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0",
            padding:16,
            width:"100%", maxWidth:480 }}>
            <VorlageFormular
              initial={neuVorlage}
              einheitspreise={einheitspreise}
              onSave={v => { setLvVorlagen(prev=>[...prev,{...v,id:Date.now()}]); setNeuVorlage(null); }}
              onClose={() => setNeuVorlage(null)}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
