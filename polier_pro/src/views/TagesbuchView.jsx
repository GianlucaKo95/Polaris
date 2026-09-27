import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Mic, Camera, PenLine, CloudSun, CloudRain, Users, TriangleAlert } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { KITagesabschlussButton } from "./KITagesabschlussButton.jsx";
import { leereAufgabe } from "../lib/utils.js";
import { PDFExportButton } from "../components/PDFExportButton.jsx";
import { RevisionssichererExport } from "./RevisionssichererExport.jsx";
import { Label, inputStyle } from "../components/Label.jsx";
import { DiktierFeld } from "../components/DiktierFeld.jsx";
import { useBackButton } from "../hooks/useBackButton.js";
import { AUFGABEN_STATUS, AUFGABEN_PRIO } from "../config/konstanten.js";

export function TagesbuchView({ berichte, setBerichte, sbConnected, projekt, eigeneFirma, kolonnen, offlineSpeichern, aufgaben, setAufgaben, session, onNavigate }) {
  const [open,       setOpen]       = useState(false);
  const [detail,     setDetail]     = useState(null);
  const [form,       setForm]       = useState({ taetigkeit:"", besonderheiten:"", material:"", arbeiter:0, maengel:0 });
  const [bilder,     setBilder]     = useState([]);
  const [uploading,  setUploading]  = useState(false);
  const [wetter,     setWetter]     = useState(null);
  const fileRef = useRef(null);
  useBackButton(open,   () => setOpen(false));
  useBackButton(detail, () => setDetail(null));

  // Mängel-Aufgaben, die am Tag dieses Berichts angelegt wurden — der
  // Zähler im Bericht ist nur eine Zahl, ohne diese Zuordnung gäbe es
  // keinen Weg, sich den konkreten Mangel anzusehen.
  const maengelDesTages = detail
    ? (aufgaben || []).filter(a => a.ist_mangel && (a.created_at || "").slice(0, 10) === detail.datum)
    : [];

  // Wetter für PDF laden
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=48.137&longitude=11.576&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&timezone=Europe%2FBerlin")
      .then(r => r.json()).then(d => {
        const c = d.current;
        setWetter({ temp: Math.round(c.temperature_2m), wind: Math.round(c.wind_speed_10m), rain: c.precipitation, humidity: c.relative_humidity_2m });
      }).catch(() => {});
  }, []);

  function handleKIGenerated(result) {
    setForm(p => ({ ...p,
      taetigkeit:    result.taetigkeit    || p.taetigkeit,
      besonderheiten:result.besonderheiten|| p.besonderheiten,
      material:      result.material      || p.material,
    }));
    setOpen(true);
  }

  function handleBilderWahl(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        setBilder(prev => [...prev, {
          dataUrl: ev.target.result,
          name:    file.name,
          typ:     file.type,
          groesse: (file.size / 1024).toFixed(0) + " KB",
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = ""; // Reset damit gleiche Datei erneut wählbar
  }

  function bildEntfernen(i) {
    setBilder(prev => prev.filter((_, idx) => idx !== i));
  }

  async function uploadBildSupabase(bild, berichtId) {
    if (!sbConnected) return bild.dataUrl; // Fallback: lokal als dataUrl
    try {
      const base64 = bild.dataUrl.split(",")[1];
      const ext    = bild.typ.split("/")[1] || "jpg";
      const pfad   = `tagesberichte/${berichtId}/${Date.now()}.${ext}`;
      const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const { error } = await supabase.storage
        .from("bautagebuch")
        .upload(pfad, bytes, { contentType: bild.typ });
      if (error) return bild.dataUrl;

      const { data } = supabase.storage.from("bautagebuch").getPublicUrl(pfad);
      return data.publicUrl;
    } catch {
      return bild.dataUrl;
    }
  }

  async function saveBericht() {
    setUploading(bilder.length > 0);
    const berichtId = Date.now();
    const bildUrls = await Promise.all(bilder.map(b => uploadBildSupabase(b, berichtId)));
    const wetterStr = wetter ? `${wetter.temp}°C · ${wetter.wind}km/h Wind · ${wetter.rain}mm Regen` : "—";

    const nb = {
      id:             berichtId,
      datum:          new Date().toLocaleDateString("de-DE"),
      datumRaw:       new Date().toISOString().slice(0,10),
      wetter:         wetterStr,
      wetterData:     wetter,
      arbeiter:       Number(form.arbeiter) || 0,
      taetigkeit:     form.taetigkeit,
      besonderheiten: form.besonderheiten,
      material:       form.material,
      maengel:        Number(form.maengel) || 0,
      bilder:         bildUrls,
    };
    setBerichte(prev => [nb, ...prev]);

    // Die eigentliche Persistierung übernimmt bereits setBerichte() (App.jsx),
    // das sbBerichtSpeichern() mit korrekter projekt_id und Auth-Session
    // aufruft — ein zweiter direkter sbFetch-Call hier war redundant und lief
    // ohnehin immer ins Leere (fehlende projekt_id, kein Auth-Header).
    if (!sbConnected && offlineSpeichern) {
      const berichtData = {
        ...form, projekt_id: projekt?.id,
        datum: new Date().toISOString().slice(0,10),
        bilder: JSON.stringify(bildUrls), wetter: wetterStr,
      };
      await offlineSpeichern("save-bericht", berichtData, session?.access_token);
    }
    setUploading(false);
    setOpen(false);
    setForm({ taetigkeit:"", besonderheiten:"", material:"", arbeiter:0, maengel:0 });
    setBilder([]);
  }

  function resetForm() {
    setOpen(false);
    setForm({ taetigkeit:"", besonderheiten:"", material:"", arbeiter:0, maengel:0 });
    setBilder([]);
  }

  return (
    <div>
      {/* Diktat zuerst: der Haupteinstieg in einen neuen Bericht */}
      <div onClick={() => setOpen(true)}
        style={{ background:"var(--ink)", color:"#fff", padding:13, marginBottom:9, cursor:"pointer" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:52, height:52, background:"var(--yellow)", color:"var(--ink)",
            display:"flex", alignItems:"center", justifyContent:"center", flex:"none" }}>
            <Mic size={26} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14.5, fontWeight:700 }}>Bericht diktieren</div>
            <div style={{ fontSize:11.5, color:"var(--ink-text2)", marginTop:2 }}>
              Sprechen — Polaris füllt Tätigkeit, Besonderheiten und Material
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[[Camera,"Foto"],[PenLine,"Tippen"]].map(([Icon,label]) => (
          <button key={label} onClick={() => setOpen(true)}
            style={{ flex:1, background:"var(--surface)", border:"1px solid var(--border)",
              padding:12, display:"flex", flexDirection:"column", alignItems:"center", gap:6,
              cursor:"pointer", fontFamily:"inherit" }}>
            <Icon size={20} color="var(--text2)" />
            <span style={{ fontSize:11.5, fontWeight:700, color:"var(--text)" }}>{label}</span>
          </button>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:9, gap:10, flexWrap:"wrap" }}>
        <div style={{ color: "var(--text)", fontWeight:800, fontSize:13, paddingTop:6 }}>Einträge</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <KITagesabschlussButton
            projekt={projekt} kolonnen={kolonnen} wetter={wetter} session={session}
            onErgebnis={result => {
              if (result?.bericht) {
                setForm(p => ({ ...p,
                  taetigkeit:     result.bericht.taetigkeit     || p.taetigkeit,
                  besonderheiten: result.bericht.besonderheiten || p.besonderheiten,
                  material:       result.bericht.material       || p.material,
                  arbeiter:       result.bericht.arbeiter       || p.arbeiter,
                }));
                // Neue Aufgaben aus KI-Analyse übernehmen
                if (result.neue_aufgaben?.length && setAufgaben) {
                  const neue = result.neue_aufgaben.map(a => ({
                    ...leereAufgabe(),
                    id: Date.now() + Math.random(),
                    titel: a.titel,
                    typ: a.typ || "allgemein",
                    prioritaet: a.prioritaet || "mittel",
                    beschreibung: a.beschreibung || "",
                  }));
                  setAufgaben(prev => [...neue, ...prev]);
                }
                // Neue Mängel aus KI-Analyse übernehmen
                if (result.neue_maengel?.length && setAufgaben) {
                  const neueMaengel = result.neue_maengel.map(m => ({
                    ...leereAufgabe(),
                    id: Date.now() + Math.random(),
                    titel: m.titel,
                    typ: "mangel",
                    ist_mangel: true,
                    mangel_verursacher: m.mangel_verursacher || "",
                    prioritaet: m.prioritaet || "mittel",
                  }));
                  setAufgaben(prev => [...neueMaengel, ...prev]);
                }
                setOpen(true);
              }
            }}
          />
          <button onClick={() => setOpen(true)}
            style={{ background: "var(--yellow)", color:"#1C2027", border:"none",
              padding:"6px 14px", fontWeight:700, cursor:"pointer", fontSize:13 }}>
            + Bericht
          </button>
        </div>
      </div>

      {/* Berichtsliste */}
      {berichte.map((b, i) => (
        <div key={i} onClick={() => setDetail(b)}
          style={{ background:"var(--surface)", padding:"12px 18px", marginBottom:7,
            borderLeft:`4px solid ${'var(--yellow)'}`, border:"1px solid var(--border)", cursor:"pointer" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, alignItems:"flex-start" }}>
            <div style={{ color: "var(--text)", fontWeight:700 }}>{b.datum}</div>
            <div style={{ display:"flex", gap:6, alignItems:"center" }} onClick={e => e.stopPropagation()}>
              <PDFExportButton bericht={b} projekt={projekt} eigeneFirma={eigeneFirma} wetter={b.wetterData || wetter} kolonnen={kolonnen} typ="bericht" />
              {b.bilder?.length > 0 && (
                <div style={{ background: "var(--blue)"+"33", color: "var(--blue)", fontSize:10, padding:"2px 7px", display:"flex", alignItems:"center", gap:3 }}>
                  <Camera size={10} />{b.bilder.length}
                </div>
              )}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, color: "var(--muted)", fontSize:11.5, fontWeight:600, marginBottom:6 }}>
            <span style={{ display:"flex", alignItems:"center", gap:4 }}>
              {(b.wetterData?.rain ?? 0) > 0 ? <CloudRain size={13} /> : <CloudSun size={13} />}{b.wetter}
            </span>
            <span style={{ display:"flex", alignItems:"center", gap:4 }}><Users size={13} />{b.arbeiter}</span>
          </div>
          <div style={{ color: "var(--text2)", fontSize:13.5, lineHeight:1.4 }}>{b.taetigkeit}</div>
          {b.maengel > 0 && <div style={{ color: "var(--orange)", fontSize:12, marginTop:6, fontWeight:700 }}>⚠ {b.maengel} Mängel</div>}
          {b.bilder?.length > 0 && (
            <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
              {b.bilder.slice(0,4).map((url, j) => (
                <img key={j} src={url} alt="" style={{ width:56, height:56, objectFit:"cover", border:`1px solid ${'var(--border)'}` }} />
              ))}
              {b.bilder.length > 4 && (
                <div style={{ width:56, height:56, background: "var(--border)", display:"flex", alignItems:"center", justifyContent:"center", color: "var(--muted)", fontSize:12, fontWeight:700 }}>
                  +{b.bilder.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* ── Detail-Ansicht ── */}
      {/* Als Portal gerendert — verschachtelt im normalen Baum bricht die
          iOS-Standalone-PWA sonst denselben nested-position:fixed-Bug wie
          beim Aufgabenformular (App-Bootstrap-Bar liegt trotz korrektem
          z-Index darüber). */}
      {detail && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:300,
          overflowY:"auto" }}>
          <div style={{ background: "var(--surface)", minHeight:"100dvh", maxWidth:520, margin:"0 auto", padding:14,
            paddingTop:"calc(20px + env(safe-area-inset-top))" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ color: "var(--yellow)", fontWeight:700, fontSize:16 }}>📋 {detail.datum}</div>
              <div style={{ display:"flex", gap:8 }}>
                <RevisionssichererExport
                  bericht={detail}
                  projekt={projekt}
                  eigeneFirma={eigeneFirma}
                  wetter={detail?.wetterData}
                  maengel={aufgaben?.filter(a => a.ist_mangel) || []}
                  datum={detail?.datum}
                  session={session}
                />
                <button onClick={() => setDetail(null)}
                  style={{ background: "var(--border)", border:"none", color: "var(--text)",
                    borderRadius:8, padding:"6px 14px", cursor:"pointer", fontFamily:"inherit" }}>✕</button>
              </div>
            </div>

            {/* Meta */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
              {[
                ["Wetter",    detail.wetter],
                ["Arbeiter",  detail.arbeiter],
                ["Mängel",    detail.maengel || 0],
                ["Fotos",     detail.bilder?.length || 0],
              ].map(([k,v]) => (
                <div key={k} style={{ background: "var(--border)", borderRadius:8, padding:"7px 12px" }}>
                  <div style={{ color: "var(--muted)", fontSize:10 }}>{k}</div>
                  <div style={{ color: "var(--text)", fontWeight:700, fontSize:16 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Textfelder */}
            {[
              ["Tätigkeiten",            detail.taetigkeit],
              ["Besonderheiten / Mängel", detail.besonderheiten],
              ["Materiallieferungen",    detail.material],
            ].filter(([,v]) => v).map(([k,v]) => (
              <div key={k} style={{ marginBottom:10 }}>
                <div style={{ color: "var(--muted)", fontSize:11, marginBottom:4 }}>{k}</div>
                <div style={{ background: "var(--border)", borderRadius:8, padding:"7px 12px",
                  color: "var(--text2)", fontSize:13, lineHeight:1.5 }}>{v}</div>
              </div>
            ))}

            {/* Mängel-Liste */}
            {maengelDesTages.length > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ color: "var(--muted)", fontSize:11, marginBottom:6 }}>
                  MÄNGEL ({maengelDesTages.length})
                </div>
                {maengelDesTages.map(m => {
                  const statusCfg = AUFGABEN_STATUS[m.status] || AUFGABEN_STATUS.offen;
                  const prioCfg   = AUFGABEN_PRIO[m.prioritaet] || AUFGABEN_PRIO.mittel;
                  return (
                    <div key={m.id}
                      onClick={() => onNavigate && onNavigate("aufgaben", "maengel")}
                      style={{ background: "var(--border)", borderRadius:8, padding:"9px 12px",
                        marginBottom:6, cursor: onNavigate ? "pointer" : "default",
                        borderLeft:`3px solid ${prioCfg.farbe}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                        <div style={{ color: "var(--text)", fontWeight:700, fontSize:13.5, display:"flex", alignItems:"center", gap:5 }}>
                          <TriangleAlert size={13} color="var(--orange)" />{m.titel || "Ohne Titel"}
                        </div>
                        <div style={{ background:statusCfg.bg, color:statusCfg.farbe, fontSize:10,
                          fontWeight:700, padding:"2px 7px", borderRadius:6, whiteSpace:"nowrap" }}>
                          {statusCfg.label}
                        </div>
                      </div>
                      {m.mangel_verursacher && (
                        <div style={{ color: "var(--muted)", fontSize:11.5, marginTop:3 }}>
                          Verursacher: {m.mangel_verursacher}
                        </div>
                      )}
                      {m.beschreibung && (
                        <div style={{ color: "var(--text2)", fontSize:12.5, marginTop:4, lineHeight:1.4 }}>
                          {m.beschreibung}
                        </div>
                      )}
                    </div>
                  );
                })}
                {onNavigate && (
                  <button onClick={() => onNavigate("aufgaben", "maengel")}
                    style={{ background:"none", border:"1px solid var(--border)", color:"var(--text2)",
                      borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer",
                      fontFamily:"inherit", width:"100%" }}>
                    Alle Mängel im Aufgaben-Bereich öffnen →
                  </button>
                )}
              </div>
            )}

            {/* Bilder Galerie */}
            {detail.bilder?.length > 0 && (
              <div>
                <div style={{ color: "var(--muted)", fontSize:11, marginBottom:6 }}>
                  FOTOS ({detail.bilder.length})
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {detail.bilder.map((url, i) => (
                    <img key={i} src={url} alt={`Foto ${i+1}`}
                      onClick={() => window.open(url, "_blank")}
                      style={{ width:"100%", aspectRatio:"4/3", objectFit:"cover",
                        borderRadius:10, cursor:"pointer",
                        border:`1px solid ${'var(--border)'}` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Neuer Bericht Modal ── */}
      {open && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:200, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background: "var(--surface)", borderRadius:"16px 16px 0 0", padding:16,
            width:"100%", maxWidth:520 }}>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              marginBottom:12, paddingTop:"calc(6px + env(safe-area-inset-top))",
              position:"sticky", top:0, background:"var(--surface)", zIndex:5 }}>
              <div style={{ color: "var(--yellow)", fontWeight:700, fontSize:16 }}>
                📋 Tagesbericht – {new Date().toLocaleDateString("de-DE")}
              </div>
              <button onClick={resetForm}
                style={{ background:"none", border:"none", color: "var(--muted)", fontSize:22, cursor:"pointer" }}>✕</button>
            </div>

            {/* Zahlenfelder */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <div>
                <Label>Arbeiter heute</Label>
                <input type="number" value={form.arbeiter||""}
                  onChange={e => setForm(p=>({...p, arbeiter:e.target.value}))}
                  placeholder="0" style={inputStyle()} />
              </div>
              <div>
                <Label>Mängel</Label>
                <input type="number" value={form.maengel||""}
                  onChange={e => setForm(p=>({...p, maengel:e.target.value}))}
                  placeholder="0" style={inputStyle()} />
              </div>
            </div>

            {/* Textfelder mit Diktierfunktion */}
            {[
              ["Tätigkeiten",             "taetigkeit",    4],
              ["Besonderheiten / Mängel", "besonderheiten",3],
              ["Materiallieferungen",     "material",      2],
            ].map(([label, key, rows]) => (
              <DiktierFeld
                key={key}
                label={label}
                value={form[key]}
                rows={rows}
                onChange={val => setForm(p => ({ ...p, [key]: val }))}
              />
            ))}

            {/* ── Foto Upload ── */}
            <div style={{ marginBottom:13 }}>
              <Label>Fotos ({bilder.length})</Label>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment"
                style={{ display:"none" }} onChange={handleBilderWahl} />

              {/* Upload-Button */}
              <div style={{ display:"flex", gap:8, marginTop:6, marginBottom:7 }}>
                <button onClick={() => { fileRef.current.removeAttribute("capture"); fileRef.current.click(); }}
                  style={{ flex:1, background: "var(--border)", color: "var(--text)",
                    border:`1px dashed ${'var(--muted)'}`, borderRadius:10, padding:"10px 0",
                    cursor:"pointer", fontSize:13 }}>
                  📁 Galerie
                </button>
                <button onClick={() => { fileRef.current.setAttribute("capture","environment"); fileRef.current.click(); }}
                  style={{ flex:1, background: "var(--border)", color: "var(--text)",
                    border:`1px dashed ${'var(--muted)'}`, borderRadius:10, padding:"10px 0",
                    cursor:"pointer", fontSize:13 }}>
                  📷 Kamera
                </button>
              </div>

              {/* Vorschau */}
              {bilder.length > 0 && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
                  {bilder.map((b, i) => (
                    <div key={i} style={{ position:"relative" }}>
                      <img src={b.dataUrl} alt=""
                        style={{ width:"100%", aspectRatio:"1", objectFit:"cover",
                          borderRadius:8, display:"block" }} />
                      {/* Löschen-Button */}
                      <button onClick={() => bildEntfernen(i)}
                        style={{ position:"absolute", top:4, right:4,
                          background:"rgba(0,0,0,0.65)", border:"none",
                          color:"#fff", borderRadius:12, width:22, height:22,
                          cursor:"pointer", fontSize:12, display:"flex",
                          alignItems:"center", justifyContent:"center", padding:0 }}>
                        ✕
                      </button>
                      <div style={{ color: "var(--muted)", fontSize:9, marginTop:2,
                        textAlign:"center", overflow:"hidden", textOverflow:"ellipsis",
                        whiteSpace:"nowrap" }}>{b.groesse}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Speichern */}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={resetForm}
                style={{ flex:1, background: "var(--surface2)", color: "var(--muted)",
                  border:"1px solid var(--border)", padding:15, cursor:"pointer", fontWeight:600 }}>
                Abbrechen
              </button>
              <button onClick={saveBericht} disabled={uploading}
                style={{ flex:2, background: uploading ? "var(--border)" : "var(--yellow)",
                  color: uploading ? "var(--muted)" : "#1C2027",
                  border:"none", padding:15, fontWeight:800,
                  cursor: uploading ? "default" : "pointer", fontSize:15 }}>
                {uploading ? "Bilder werden hochgeladen…"
                  : sbConnected ? "Speichern & Sync" : "Speichern"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
