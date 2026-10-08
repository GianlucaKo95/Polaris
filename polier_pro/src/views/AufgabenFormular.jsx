import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { leereAufgabe } from "../lib/utils.js";
import { Label, inputStyle } from "../components/Label.jsx";
import { AUFGABEN_TYPEN, AUFGABEN_STATUS, AUFGABEN_PRIO, extraFeldLabelFuer,
  PROJEKTTYPEN_MIT_IMMER_SICHTBAREN_EXTRAFELDERN } from "../config/konstanten.js";
import { AufgabenKommentare } from "../components/AufgabenKommentare.jsx";

export function AufgabenFormular({ initial, kolonnen, alleAufgaben = [], onSave, onClose, projektTyp,
  session, firmaId, profil }) {
  const [a,       setA]       = useState(initial || leereAufgabe());
  const extraLabel = extraFeldLabelFuer(projektTyp);
  const immerExtraFelder = PROJEKTTYPEN_MIT_IMMER_SICHTBAREN_EXTRAFELDERN.includes(projektTyp);
  const [bilder,  setBilder]  = useState([]);
  const [planMode,setPlanMode]= useState(false);
  const fileRef               = useRef(null);
  const planRef               = useRef(null);
  const scrollRef              = useRef(null);

  // Auf installierten iOS-PWAs öffnet sich dieses (das mit Abstand längste)
  // Formular teils bereits nach unten verschoben, ganz ohne Tipp-/Tastatur-
  // Interaktion — der Header bleibt erreichbar, man muss nur manuell
  // hochscrollen. Die genaue WebKit-Ursache dafür lässt sich ohne
  // Gerätezugriff nicht zuverlässig eingrenzen; deshalb hier unabhängig
  // davon aktiv auf Position 0 zurücksetzen, sobald das Formular öffnet.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    // Falls der Verschub erst nach dem ersten Layout-Pass passiert (z.B.
    // durch verzögert nachladende Web-Fonts), sicherheitshalber im
    // nächsten Frame nochmal zurücksetzen.
    const id = requestAnimationFrame(() => scrollRef.current?.scrollTo(0, 0));
    return () => cancelAnimationFrame(id);
  }, []);

  function handleBild(e) {
    Array.from(e.target.files).forEach(file => {
      const r = new FileReader();
      r.onload = ev => setA(p => ({ ...p, fotos:[...p.fotos, ev.target.result] }));
      r.readAsDataURL(file);
    });
  }

  function handlePlanKlick(e) {
    if (!planRef.current || !planMode) return;
    const rect = planRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
    const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
    setA(p => ({ ...p, plan_x:Number(x), plan_y:Number(y) }));
    setPlanMode(false);
  }

  const valid = a.titel.trim().length > 0;

  // Über ein Portal direkt an document.body gerendert statt in der
  // normalen Baumtiefe (App-Root → CONTENT → AufgabenView → …): der
  // App-Root selbst ist position:fixed und damit sein eigener Stacking-
  // Context. In installierten iOS-PWAs deckte dieses tief verschachtelte
  // position:fixed-Overlay die TOP BAR/Baustellen-Navigation des App-Roots
  // (ebenfalls position:fixed, aber mit niedrigerem z-index) trotzdem
  // nicht zuverlässig ab — sie blieb sichtbar, wo eigentlich der Header
  // dieses Formulars hingehört. Ein Portal umgeht jede Unsicherheit beim
  // verschachtelten Stacking, indem es das Overlay als direktes Kind von
  // <body> rendert, exakt auf einer Ebene mit dem App-Root selbst.
  return createPortal(
    <div ref={scrollRef} style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
      background:"var(--bg)", zIndex:500, overflowY:"auto",
      WebkitOverflowScrolling:"touch" }}>

      <div style={{ background:"var(--surface)", padding:"10px 18px",
        paddingTop:"calc(14px + env(safe-area-inset-top))",
        borderBottom:"3px solid var(--yellow)", position:"sticky", top:0,
        zIndex:10, display:"flex", justifyContent:"space-between",
        alignItems:"center" }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:17 }}>
          {initial ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
        </div>
        <button onClick={onClose}
          style={{ background:"var(--surface2)", border:"1px solid var(--border)",
            color:"var(--text)", borderRadius:8, padding:"6px 14px",
            cursor:"pointer", fontSize:14, fontFamily:"inherit", display:"flex" }}>✕</button>
      </div>

      <div style={{ padding:"18px 16px 16px" }}>

        {/* Typ */}
        <div style={{ marginBottom:10 }}>
          <Label>Aufgabentyp</Label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
            {Object.entries(AUFGABEN_TYPEN).map(([key, t]) => (
              <button key={key} onClick={() => setA(p=>({...p, typ:key,
                ist_mangel:key==="mangel"}))}
                style={{ background: a.typ===key ? t.farbe+"22" : "var(--surface2)",
                  border:`1.5px solid ${a.typ===key ? t.farbe : "var(--border)"}`,
                  borderRadius:20, padding:"6px 12px", cursor:"pointer",
                  fontSize:12, fontWeight: a.typ===key ? 700 : 400,
                  color: a.typ===key ? t.farbe : "var(--muted)",
                  fontFamily:"inherit" }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Titel */}
        <div style={{ marginBottom:9 }}>
          <Label>Titel *</Label>
          <input value={a.titel} onChange={e=>setA(p=>({...p,titel:e.target.value}))}
            placeholder="z.B. Bodenplatte B1 betonieren" style={inputStyle()} />
        </div>

        {/* Status + Priorität */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:9 }}>
          <div>
            <Label>Status</Label>
            <select value={a.status} onChange={e=>setA(p=>({...p,status:e.target.value}))}
              style={{ ...inputStyle(), padding:"11px 12px" }}>
              {Object.entries(AUFGABEN_STATUS).map(([k,s]) => (
                <option key={k} value={k}>{s.icon} {s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Priorität</Label>
            <select value={a.prioritaet} onChange={e=>setA(p=>({...p,prioritaet:e.target.value}))}
              style={{ ...inputStyle(), padding:"11px 12px" }}>
              {Object.entries(AUFGABEN_PRIO).map(([k,s]) => (
                <option key={k} value={k}>{s.icon} {s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Zuständig + Fällig */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:9 }}>
          <div>
            <Label>Zuständig</Label>
            <select value={a.zustaendig} onChange={e=>setA(p=>({...p,zustaendig:e.target.value}))}
              style={{ ...inputStyle(), padding:"11px 12px" }}>
              <option value="">— auswählen —</option>
              {kolonnen.map(k => (
                <option key={k.id} value={k.name}>{k.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Fällig am</Label>
            <input type="date" value={a.faellig_am}
              onChange={e=>setA(p=>({...p,faellig_am:e.target.value}))}
              style={{ ...inputStyle(), padding:"11px 12px" }} />
          </div>
        </div>

        {/* Soll-Stunden — Grundlage für den Produktivitätsvergleich gegen
            die über die Stempeluhr erfassten Ist-Stunden dieser Aufgabe.
            Dauer — Grundlage für den kritischen Pfad (siehe unten).
            Mindestbesetzung — Grenze für die "Mitarbeiter verschieben"-
            Simulation: manche Arbeiten gehen nicht schneller mit mehr,
            aber auch nicht mit beliebig wenig Personal. */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:9 }}>
          <div>
            <Label>Soll-Stunden (optional)</Label>
            <input type="number" min="0" step="0.5" value={a.soll_stunden ?? ""}
              onChange={e=>setA(p=>({...p, soll_stunden: e.target.value === "" ? null : Number(e.target.value)}))}
              placeholder="z.B. 120" style={inputStyle()} />
          </div>
          <div>
            <Label>Dauer in Tagen (optional)</Label>
            <input type="number" min="0" step="0.5" value={a.dauer_tage ?? ""}
              onChange={e=>setA(p=>({...p, dauer_tage: e.target.value === "" ? null : Number(e.target.value)}))}
              placeholder="z.B. 3" style={inputStyle()} />
          </div>
        </div>

        {a.typ === "beton" && (
          <div style={{ color:"var(--muted)", fontSize:10.5, marginTop:-4, marginBottom:9, lineHeight:1.4 }}>
            Bei Betonage-Aufgaben bestimmt meist die Aushärtezeit (7–28 Tage, wetterabhängig) die Dauer,
            nicht die Mannstärke — die Dauer hier entsprechend als Ausführung + Aushärtung ansetzen.
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:9 }}>
          <div>
            <Label>Mindestbesetzung (optional)</Label>
            <input type="number" min="1" step="1" value={a.mindest_mitarbeiter ?? ""}
              onChange={e=>setA(p=>({...p, mindest_mitarbeiter: e.target.value === "" ? null : Number(e.target.value)}))}
              placeholder="z.B. 4 — geht nicht mit weniger" style={inputStyle()} />
          </div>
          <div>
            <Label>Maximalbesetzung (optional)</Label>
            <input type="number" min="1" step="1" value={a.maximal_mitarbeiter ?? ""}
              onChange={e=>setA(p=>({...p, maximal_mitarbeiter: e.target.value === "" ? null : Number(e.target.value)}))}
              placeholder="z.B. 3 — mehr bringt nichts" style={inputStyle()} />
          </div>
        </div>

        {/* Abhängigkeiten — diese Aufgabe kann laut Terminketten-Berechnung
            erst starten, wenn die ausgewählten Aufgaben fertig sind. */}
        {alleAufgaben.filter(x => x.id !== a.id).length > 0 && (
          <div style={{ marginBottom:9 }}>
            <Label>Abhängig von (optional)</Label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
              {alleAufgaben.filter(x => x.id !== a.id).map(x => {
                const gewaehlt = (a.abhaengig_von || []).includes(x.id);
                return (
                  <button key={x.id} type="button"
                    onClick={() => setA(p => ({ ...p, abhaengig_von: gewaehlt
                      ? (p.abhaengig_von||[]).filter(id => id !== x.id)
                      : [...(p.abhaengig_von||[]), x.id] }))}
                    style={{ background: gewaehlt ? "var(--ink)" : "var(--surface2)",
                      color: gewaehlt ? "#fff" : "var(--muted)",
                      border:`1px solid ${gewaehlt ? "var(--ink)" : "var(--border)"}`,
                      borderRadius:20, padding:"5px 12px", cursor:"pointer",
                      fontSize:11.5, fontWeight: gewaehlt ? 700 : 500, fontFamily:"inherit" }}>
                    {x.titel || "Unbenannte Aufgabe"}
                  </button>
                );
              })}
            </div>
            <div style={{ color:"var(--muted)", fontSize:10.5, marginTop:5 }}>
              Startet laut Terminplan erst, wenn die ausgewählten Aufgaben abgeschlossen sind.
            </div>
          </div>
        )}

        {/* Beschreibung */}
        <div style={{ marginBottom:9 }}>
          <Label>Beschreibung</Label>
          <textarea rows={3} value={a.beschreibung}
            onChange={e=>setA(p=>({...p,beschreibung:e.target.value}))}
            placeholder="Details zur Aufgabe…"
            style={{ width:"100%", background:"var(--surface2)", color:"var(--text)",
              border:"1.5px solid var(--border)", borderRadius:10, padding:10,
              fontSize:13, resize:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
        </div>

        {/* Zusatzfelder (m²/Sorte) — bei Beton-Projekten nur für Betonage-
            Aufgaben relevant, bei Dach/PV unabhängig vom Aufgabentyp */}
        {(a.typ === "beton" || immerExtraFelder) && (
          <div style={{ background:"var(--ybg)", borderRadius:12, padding:10,
            marginBottom:10, border:"1px solid var(--yellow)" }}>
            <div style={{ color:"var(--ydark)", fontWeight:700, fontSize:12,
              marginBottom:7 }}>🏗️ Details</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <div>
                <Label>{extraLabel.m2}</Label>
                <input type="number" value={a.m2||""}
                  onChange={e=>setA(p=>({...p,m2:Number(e.target.value)}))}
                  placeholder="0" style={inputStyle()} />
              </div>
              <div>
                <Label>{extraLabel.sorte}</Label>
                <input value={a.betonsorte||""}
                  onChange={e=>setA(p=>({...p,betonsorte:e.target.value}))}
                  placeholder={extraLabel.sortePlatzhalter} style={inputStyle()} />
              </div>
            </div>
          </div>
        )}

        {/* Mangel-spezifisch */}
        {a.ist_mangel && (
          <div style={{ background:"var(--rbg)", borderRadius:12, padding:10,
            marginBottom:10, border:"1px solid var(--red)" }}>
            <div style={{ color:"var(--red)", fontWeight:700, fontSize:12,
              marginBottom:7 }}>⚠️ Mangel-Details</div>
            <div style={{ marginBottom:7 }}>
              <Label>Verursacher / Gewerk</Label>
              <input value={a.mangel_verursacher||""}
                onChange={e=>setA(p=>({...p,mangel_verursacher:e.target.value}))}
                placeholder="z.B. Elektriker, Maler…" style={inputStyle()} />
            </div>
            {/* Planverortung */}
            {a.plan_bild_url ? (
              <div>
                <Label>Planverortung</Label>
                <div ref={planRef} onClick={handlePlanKlick}
                  style={{ position:"relative", borderRadius:10, overflow:"hidden",
                    cursor: planMode ? "crosshair" : "default",
                    border:"2px solid var(--red)", marginTop:6 }}>
                  <img src={a.plan_bild_url} alt="Plan"
                    style={{ width:"100%", display:"block" }} />
                  {a.plan_x !== null && a.plan_y !== null && (
                    <div style={{ position:"absolute",
                      left:`${a.plan_x}%`, top:`${a.plan_y}%`,
                      transform:"translate(-50%,-50%)",
                      width:24, height:24, borderRadius:12,
                      background:"var(--red)", border:"2px solid #fff",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:12, color:"#fff", fontWeight:700 }}>!</div>
                  )}
                  {planMode && (
                    <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0,
                      background:"rgba(220,38,38,0.1)",
                      display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <div style={{ color:"var(--red)", fontWeight:700,
                        background:"var(--surface)", borderRadius:8,
                        padding:"6px 12px", fontSize:12 }}>
                        Auf Plan tippen zum Verorten
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={() => setPlanMode(true)}
                  style={{ marginTop:8, background:"var(--red)", color:"#fff",
                    border:"none", borderRadius:8, padding:"6px 14px",
                    cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>
                  📍 {a.plan_x ? "Neu verorten" : "Auf Plan verorten"}
                </button>
              </div>
            ) : (
              <div>
                <Label>Grundriss hochladen (optional)</Label>
                <input type="file" accept="image/*"
                  onChange={e => {
                    const f = e.target.files[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = ev => setA(p=>({...p,plan_bild_url:ev.target.result}));
                    r.readAsDataURL(f);
                  }}
                  style={{ marginTop:6, fontSize:12, color:"var(--muted)" }} />
              </div>
            )}
          </div>
        )}

        {/* Fotos */}
        <div style={{ marginBottom:12 }}>
          <Label>Fotos ({a.fotos?.length || 0})</Label>
          <input ref={fileRef} type="file" accept="image/*" multiple
            style={{ display:"none" }} onChange={handleBild} />
          <button onClick={() => fileRef.current.click()}
            style={{ background:"var(--surface2)", color:"var(--muted)",
              border:"1.5px dashed var(--border)", borderRadius:10,
              padding:"8px 16px", cursor:"pointer", fontSize:12,
              fontFamily:"inherit", marginTop:6 }}>
            📷 Fotos hinzufügen
          </button>
          {a.fotos?.length > 0 && (
            <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
              {a.fotos.map((url, i) => (
                <div key={i} style={{ position:"relative" }}>
                  <img src={url} alt="" style={{ width:56, height:56,
                    borderRadius:8, objectFit:"cover" }} />
                  <button onClick={() => setA(p=>({...p,
                    fotos:p.fotos.filter((_,j)=>j!==i)}))}
                    style={{ position:"absolute", top:-4, right:-4,
                      width:18, height:18, borderRadius:9,
                      background:"var(--red)", color:"#fff", border:"none",
                      cursor:"pointer", fontSize:10, padding:0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kommentare — erst sinnvoll, wenn die Aufgabe bereits in der DB
            existiert (bei "Neue Aufgabe"/"Neuer Mangel" hat initial zwar
            schon eine lokale id von leereAufgabe(), aber noch keine Zeile,
            an die ein Kommentar per Fremdschlüssel hängen könnte — deshalb
            Abgleich gegen alleAufgaben statt bloß initial?.id). */}
        {initial?.id && alleAufgaben.some(x => x.id === initial.id) && session && firmaId && (
          <AufgabenKommentare aufgabeId={initial.id} firmaId={firmaId} session={session} profil={profil} />
        )}
      </div>

      {/* Sticky statt im normalen Fluss am Formularende: bleibt immer
         erreichbar, ohne bis ganz nach unten scrollen zu müssen, und
         verschwindet nicht mehr hinter der Home-Indicator-Leiste. */}
      <div style={{ position:"sticky", bottom:0, display:"flex", gap:10,
        background:"var(--bg)", borderTop:"1px solid var(--border)",
        padding:"12px 16px", paddingBottom:"calc(12px + env(safe-area-inset-bottom))" }}>
        <button onClick={onClose}
          style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
            border:"1.5px solid var(--border)", padding:16,
            cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>Abbrechen</button>
        <button onClick={() => valid && onSave(a)} disabled={!valid}
          style={{ flex:2, background: valid ? "var(--yellow)" : "var(--surface2)",
            color: valid ? "#1a1200" : "var(--muted)",
            border:"none", padding:16, fontWeight:800,
            cursor: valid ? "pointer" : "default", fontSize:16,
            fontFamily:"inherit" }}>
          Speichern
        </button>
      </div>
    </div>,
    document.body
  );
}
