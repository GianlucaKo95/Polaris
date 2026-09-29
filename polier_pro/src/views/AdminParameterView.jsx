import { useState } from "react";
import { createPortal } from "react-dom";
import { Settings, Euro, ClipboardList, Pencil, X, Plus, FileText, NotebookPen } from "lucide-react";
import { PreisFormular } from "./PreisFormular.jsx";
import { VorlageFormular } from "./VorlageFormular.jsx";
import { useBackButton } from "../hooks/useBackButton.js";
import { VorlagenUploadPanel } from "../components/VorlagenUploadPanel.jsx";
import { kiAngebotVorlageAnalysieren, kiTagebuchVorlageAnalysieren } from "../lib/ai.js";

export function AdminParameterView({ einheitspreise, setEinheitspreise, lvVorlagen, setLvVorlagen, angebotVorlage, setAngebotVorlage, tagebuchVorlage, setTagebuchVorlage, session }) {
  const [aktiv,    setAktiv]    = useState("preise"); // preise | vorlagen | angebotsvorlage | tagebuchvorlage
  const [neuPreis, setNeuPreis] = useState(null);
  const [neuVorlage,setNeuVorlage] = useState(null);
  const [editPreis, setEditPreis] = useState(null);
  useBackButton(neuPreis || editPreis, () => { setNeuPreis(null); setEditPreis(null); });
  useBackButton(neuVorlage, () => setNeuVorlage(null));

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

      {/* Tab-Toggle — 2x2-Grid statt einer Reihe: bei 4 Tabs lief eine
          gemeinsame flex:1-Reihe auf schmalen Bildschirmen aus dem
          sichtbaren Bereich heraus (der letzte Tab war nicht mehr erreichbar). */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:12 }}>
        {[["preise",Euro,"Einheitspreise"],["vorlagen",ClipboardList,"LV-Vorlagen"],["angebotsvorlage",FileText,"Angebots-Vorlage"],["tagebuchvorlage",NotebookPen,"Bautagebuch-Vorlage"]].map(([k,Icon,l]) => (
          <button key={k} onClick={() => setAktiv(k)}
            style={{ background: aktiv===k ? "var(--yellow)" : "var(--surface2)",
              color: aktiv===k ? "#1a1200" : "var(--muted)",
              border:`1.5px solid ${aktiv===k ? "var(--yellow)" : "var(--border)"}`,
              borderRadius:10, padding:10, fontWeight: aktiv===k ? 700 : 400,
              cursor:"pointer", fontSize:13, fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
              textAlign:"center" }}><Icon size={13} /> {l}</button>
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
        <VorlagenUploadPanel
          beschreibung="Word-Dokument (.docx) mit eurem gewohnten Angebotstext hochladen — die KI schlägt daraus Einleitungs-/Schlusstext und Spaltenbeschriftungen vor. Jedes künftige Angebot wird damit als eigenes, sauber generiertes Word-Dokument exportierbar, nicht als Bearbeitung der hochgeladenen Datei selbst."
          analysiereFn={kiAngebotVorlageAnalysieren}
          session={session}
          vorlage={angebotVorlage}
          setVorlage={setAngebotVorlage}
          textFelder={[
            ["Einleitungstext","intro_text"],
            ["Schlusstext","footer_text"],
          ]}
          kurzFelder={[
            ["Spalte Bezeichnung","spalte_bez","Bezeichnung"],
            ["Spalte Menge","spalte_menge","Menge"],
            ["Spalte Einheit","spalte_einheit","Einheit"],
            ["Spalte EP","spalte_ep","EP (€)"],
            ["Spalte GP","spalte_gp","GP (€)"],
          ]}
        />
      )}

      {/* BAUTAGEBUCH-VORLAGE */}
      {aktiv === "tagebuchvorlage" && (
        <VorlagenUploadPanel
          beschreibung="Word-Dokument (.docx) mit eurem gewohnten Bautagebuch-Text hochladen — die KI schlägt daraus Einleitungs-/Schlusstext und Abschnittsbeschriftungen vor. Jeder künftige Tagesbericht wird damit als eigenes, sauber generiertes Word-Dokument exportierbar, nicht als Bearbeitung der hochgeladenen Datei selbst."
          analysiereFn={kiTagebuchVorlageAnalysieren}
          session={session}
          vorlage={tagebuchVorlage}
          setVorlage={setTagebuchVorlage}
          textFelder={[
            ["Einleitungstext","intro_text"],
            ["Schlusstext","footer_text"],
          ]}
          kurzFelder={[
            ["Abschnitt Tätigkeiten","label_taetigkeit","Tätigkeiten"],
            ["Abschnitt Besonderheiten","label_besonderheiten","Besonderheiten / Mängel"],
            ["Abschnitt Material","label_material","Materiallieferungen"],
            ["Abschnitt Personal","label_personal","Personal & Stunden"],
          ]}
        />
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
