import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Pencil, Plus, X, Check, TriangleAlert, Sparkles } from "lucide-react";
import { leerProjekt } from "../lib/utils.js";
import { Label, inputStyle } from "../components/Label.jsx";
import { PROJEKTTYPEN, ALLE_GEWERKE } from "../config/konstanten.js";
import { DiktierFeld } from "../components/DiktierFeld.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { kiBaustelleAnlegen } from "../lib/ai.js";
import { sbFetch } from "../lib/supabase.js";

export function ProjektFormular({ initial, onSave, onClose, subs = [], speicherFehler = "", session, istAdmin = false }) {
  const [p, setP] = useState(initial || leerProjekt());
  const [wirdGespeichert, setWirdGespeichert] = useState(false);
  const [kiDiktat,  setKiDiktat]  = useState("");
  const [kiLaedt,   setKiLaedt]   = useState(false);
  const [kiFehler,  setKiFehler]  = useState("");
  const [kiErfolg,  setKiErfolg]  = useState(false);
  const [poliere,            setPoliere]            = useState([]);
  const [zugewiesenePoliere, setZugewiesenePoliere] = useState(new Set());
  const FARBEN = ["#F5C400","#4A9EE0","#2EAF6A","#C45C2A","#9B59B6","#E84393"];
  const valid = p.name.trim().length > 0;

  // Lädt die Liste aller Polier-Nutzer der Firma plus (beim Bearbeiten) den
  // bereits bestehenden Baustellen-Zugriff dieses Projekts, damit die
  // Checkliste unten vorbelegt ist. Nur für Admins relevant — Vergabe von
  // Baustellen-Zugriff ist ein Admin-Thema (siehe Nutzerverwaltung).
  useEffect(() => {
    if (!session?.access_token || !istAdmin) return;
    let abgebrochen = false;
    (async () => {
      const [profile, zugriffe] = await Promise.all([
        sbFetch("profile?select=id,vorname,nachname&rolle=eq.polier&order=vorname.asc", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        initial?.id
          ? sbFetch(`projekt_zugriff?select=profil_id&projekt_id=eq.${initial.id}`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            })
          : Promise.resolve([]),
      ]);
      if (abgebrochen) return;
      setPoliere(profile || []);
      setZugewiesenePoliere(new Set((zugriffe || []).map(z => z.profil_id)));
    })();
    return () => { abgebrochen = true; };
  }, [session?.access_token, istAdmin, initial?.id]);

  function togglePolier(id) {
    setZugewiesenePoliere(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function kiUebernehmen() {
    if (!kiDiktat.trim() || kiLaedt) return;
    setKiLaedt(true);
    setKiFehler("");
    setKiErfolg(false);
    try {
      const ergebnis = await kiBaustelleAnlegen(kiDiktat, session);
      if (!ergebnis) { setKiFehler("Konnte aus dem Diktat keine Baustellendaten erkennen."); return; }
      setP(prev => ({ ...prev, ...ergebnis }));
      setKiErfolg(true);
    } catch (e) {
      setKiFehler(e.message || "KI-Anfrage fehlgeschlagen.");
    } finally {
      setKiLaedt(false);
    }
  }

  async function speichernKlick() {
    if (!valid) return;
    setWirdGespeichert(true);
    await onSave({ ...p,
      polierIds: Array.from(zugewiesenePoliere),
      polierOptionenIds: poliere.map(u => u.id),
    });
    // Formular schließt sich nur bei Erfolg (onClose wird vom Parent via
    // setNeuProjekt(false) ausgelöst) — bei Fehler bleibt wirdGespeichert
    // kurz sichtbar und die Fehlermeldung erscheint über speicherFehler.
    setWirdGespeichert(false);
  }

  function toggleSub(id) {
    setP(prev => ({
      ...prev,
      subIds: (prev.subIds||[]).includes(id)
        ? (prev.subIds||[]).filter(x=>x!==id)
        : [...(prev.subIds||[]), id]
    }));
  }

  // Als Portal gerendert — Fullscreen allein reicht nicht: verschachtelt
  // im normalen Baum bricht die iOS-Standalone-PWA denselben
  // nested-position:fixed-Bug wie beim Aufgabenformular.
  return createPortal(
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
      background:"var(--bg)", zIndex:500, overflowY:"auto",
      WebkitOverflowScrolling:"touch" }}>

      {/* Header */}
      <div style={{ background:"var(--surface)", padding:"10px 18px",
        paddingTop:"calc(14px + env(safe-area-inset-top))",
        borderBottom:"3px solid var(--yellow)", position:"sticky", top:0,
        zIndex:10, display:"flex", justifyContent:"space-between",
        alignItems:"center" }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:17,
          display:"flex", alignItems:"center", gap:8 }}>
          {initial?.name ? <><Pencil size={15} /> Baustelle bearbeiten</> : <><Plus size={15} /> Neue Baustelle</>}
        </div>
        <button onClick={onClose}
          style={{ background:"var(--surface2)", border:"1px solid var(--border)",
            color:"var(--text)", borderRadius:8, padding:"6px 14px",
            cursor:"pointer", fontSize:14, fontFamily:"inherit", display:"flex" }}><X size={15} /></button>
      </div>

      <div style={{ padding:"20px 16px 100px" }}>

        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:13 }}>
          <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:17,
            display:"flex", alignItems:"center", gap:8 }}>
            {initial?.name ? <><Pencil size={15} /> Baustelle bearbeiten</> : <><Plus size={15} /> Neue Baustelle</>}
          </div>
          <button onClick={onClose}
            style={{ background:"none", border:"none", color:"var(--muted)",
              cursor:"pointer", display:"flex" }}><X size={20} /></button>
        </div>

        {/* KI-Diktat — nur beim Neuanlegen, nur für Administrator. Füllt das
            Formular unten vor, angelegt wird die Baustelle weiterhin erst
            über den normalen "Speichern"-Klick, damit ein Verhören oder eine
            falsch verstandene Angabe nicht ungeprüft durchrutscht. */}
        {!initial && istAdmin && (
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)",
            borderRadius:12, padding:12, marginBottom:16 }}>
            <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:6,
              display:"flex", alignItems:"center", gap:6 }}>
              <Sparkles size={14} color="var(--yellow)" /> Per Sprache anlegen
            </div>
            <DiktierFeld label="Diktat" value={kiDiktat} onChange={setKiDiktat} rows={2} />
            <button onClick={kiUebernehmen} disabled={!kiDiktat.trim() || kiLaedt}
              style={{ width:"100%", background: kiDiktat.trim() && !kiLaedt ? "var(--yellow)" : "var(--surface2)",
                color: kiDiktat.trim() && !kiLaedt ? "#1a1200" : "var(--muted)",
                border:"none", borderRadius:8, padding:"9px 0", fontWeight:700, fontSize:12.5,
                cursor: kiDiktat.trim() && !kiLaedt ? "pointer" : "default", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              {kiLaedt ? <><Spinner size={12} /> Erkenne Felder…</> : "Felder mit KI übernehmen"}
            </button>
            {kiErfolg && (
              <div style={{ color:"var(--green)", fontSize:11.5, marginTop:6, display:"flex", alignItems:"center", gap:5 }}>
                <Check size={12} /> Felder unten übernommen — bitte prüfen und ergänzen.
              </div>
            )}
            {kiFehler && (
              <div style={{ color:"var(--red)", fontSize:11.5, marginTop:6, display:"flex", alignItems:"center", gap:5 }}>
                <TriangleAlert size={12} />{kiFehler}
              </div>
            )}
          </div>
        )}

        {/* Projekttyp */}
        <div style={{ marginBottom:13 }}>
          <Label>Projekttyp *</Label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:6 }}>
            {Object.entries(PROJEKTTYPEN).map(([key, cfg]) => (
              <div key={key} onClick={() => setP(prev=>({...prev, typ:key}))}
                style={{ background: p.typ===key ? "var(--ybg)" : "var(--surface2)",
                  border:`2px solid ${p.typ===key ? "var(--yellow)" : "var(--border)"}`,
                  borderRadius:12, padding:"9px 12px", cursor:"pointer",
                  display:"flex", alignItems:"center", gap:8,
                  transition:"all 0.15s" }}>
                <span style={{ fontSize:20 }}>{cfg.icon}</span>
                <span style={{ color: p.typ===key ? "var(--text)" : "var(--muted)",
                  fontSize:12, fontWeight: p.typ===key ? 700 : 400 }}>
                  {cfg.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {[
          ["Projektname *",  "name",          "Neubau Wohnanlage Nord"],
          ["Straße + Nr.",   "adresse",       "Musterstraße 1"],
        ].map(([label, key, ph]) => (
          <div key={key} style={{ marginBottom:9 }}>
            <Label>{label}</Label>
            <input value={p[key]} onChange={e => setP(prev=>({...prev,[key]:e.target.value}))}
              placeholder={ph} style={inputStyle()} />
          </div>
        ))}

        {/* PLZ + Ort getrennt — Ort wird für die Wetter-Standortsuche genutzt,
            eine vollständige Straßenadresse ist dafür nicht nötig und führte
            bisher zu missverständlicher Anzeige (Straßenname statt Stadt). */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:10, marginBottom:9 }}>
          <div>
            <Label>PLZ</Label>
            <input value={p.plz||""} onChange={e => setP(prev=>({...prev,plz:e.target.value}))}
              placeholder="80331" style={inputStyle()} />
          </div>
          <div>
            <Label>Ort *</Label>
            <input value={p.ort||""} onChange={e => setP(prev=>({...prev,ort:e.target.value}))}
              placeholder="München" style={inputStyle()} />
          </div>
        </div>

        {[
          ["Projektnummer",  "projektnummer", "PRJ-2025-001"],
          ["Bauleiter",      "bauleiter",     "Max Mustermann"],
          ["Auftraggeber",   "auftraggeber",  "Muster GmbH"],
        ].map(([label, key, ph]) => (
          <div key={key} style={{ marginBottom:9 }}>
            <Label>{label}</Label>
            <input value={p[key]} onChange={e => setP(prev=>({...prev,[key]:e.target.value}))}
              placeholder={ph} style={inputStyle()} />
          </div>
        ))}

        {/* Farbe */}
        <div style={{ marginBottom:12 }}>
          <Label>Projektfarbe</Label>
          <div style={{ display:"flex", gap:10, marginTop:6 }}>
            {FARBEN.map(f => (
              <div key={f} onClick={() => setP(prev=>({...prev,farbe:f}))}
                style={{ width:36, height:36, borderRadius:18, background:f,
                  cursor:"pointer",
                  border:`3px solid ${p.farbe===f ? "var(--surface)" : "transparent"}`,
                  boxShadow: p.farbe===f ? `0 0 0 2px ${f}` : "none",
                  transition:"transform 0.15s",
                  transform: p.farbe===f ? "scale(1.2)" : "scale(1)" }} />
            ))}
          </div>
        </div>

        {/* Subunternehmer */}
        {subs.filter(s=>s.status==="aktiv").length > 0 && (
          <div style={{ marginBottom:14 }}>
            <Label>Subunternehmer zuweisen</Label>
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:8 }}>
              {subs.filter(s=>s.status==="aktiv").map(s => {
                const aktiv = (p.subIds||[]).includes(s.id);
                return (
                  <div key={s.id} onClick={() => toggleSub(s.id)}
                    style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"center",
                      background: aktiv ? "var(--bbg)" : "var(--surface2)",
                      border:`1.5px solid ${aktiv ? "var(--blue)" : "var(--border)"}`,
                      borderRadius:10, padding:"7px 12px", cursor:"pointer" }}>
                    <div>
                      <div style={{ color:"var(--text)", fontSize:13,
                        fontWeight: aktiv ? 700 : 400 }}>{s.name}</div>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:3 }}>
                        {(s.gewerke||[]).map(k => {
                          const g = ALLE_GEWERKE.find(x=>x.key===k);
                          return g ? (
                            <span key={k} style={{ color:"var(--muted)", fontSize:10 }}>
                              {g.icon} {g.label}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <div style={{ display:"flex", color: aktiv ? "var(--blue)" : "var(--muted)" }}>
                      {aktiv ? <Check size={16} /> : "○"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Polier zuweisen — vergibt automatisch Baustellen-Zugriff
            (projekt_zugriff), ohne das danach manuell in der
            Nutzerverwaltung nachtragen zu müssen. */}
        {istAdmin && poliere.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <Label>Polier zuweisen</Label>
            <div style={{ color:"var(--muted)", fontSize:10.5, marginTop:2, marginBottom:8, lineHeight:1.4 }}>
              Zugewiesene Poliere bekommen automatisch Baustellen-Zugriff für diese Baustelle —
              ohne das zusätzlich in der Nutzerverwaltung nachzutragen.
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {poliere.map(u => {
                const aktiv = zugewiesenePoliere.has(u.id);
                return (
                  <div key={u.id} onClick={() => togglePolier(u.id)}
                    style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"center",
                      background: aktiv ? "var(--ybg)" : "var(--surface2)",
                      border:`1.5px solid ${aktiv ? "var(--yellow)" : "var(--border)"}`,
                      borderRadius:10, padding:"7px 12px", cursor:"pointer" }}>
                    <div style={{ color:"var(--text)", fontSize:13,
                      fontWeight: aktiv ? 700 : 400 }}>
                      {u.vorname || "—"} {u.nachname || ""}
                    </div>
                    <div style={{ display:"flex", color: aktiv ? "var(--ydark)" : "var(--muted)" }}>
                      {aktiv ? <Check size={16} /> : "○"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {speicherFehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:12,
            padding:"9px 16px", marginBottom:10, fontSize:12,
            border:"1px solid var(--red)",
            display:"flex", alignItems:"center", gap:6 }}>
            <TriangleAlert size={14} /> {speicherFehler}
          </div>
        )}

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose}
            style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
              border:"1.5px solid var(--border)", borderRadius:12, padding:14,
              cursor:"pointer", fontFamily:"inherit" }}>
            Abbrechen
          </button>
          <button onClick={speichernKlick} disabled={!valid || wirdGespeichert}
            style={{ flex:2,
              background: valid ? "var(--yellow)" : "var(--surface2)",
              color: valid ? "#1a1200" : "var(--muted)",
              border:"none", borderRadius:12, padding:14, fontWeight:800,
              cursor: valid && !wirdGespeichert ? "pointer" : "default", fontSize:15,
              fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            {wirdGespeichert ? <><Spinner size={14} /> Speichert…</> : "Speichern"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
