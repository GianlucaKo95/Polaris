import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Bot, X, CircleX, Square, Mic, Sparkles, ClipboardList, CircleCheckBig, TriangleAlert, Wrench, CloudRain, ArrowLeft } from "lucide-react";
import { kiTagesabschluss } from "../lib/ai.js";
import { Spinner } from "../components/Spinner.jsx";
import { AUFGABEN_TYPEN, AUFGABEN_PRIO } from "../config/konstanten.js";
import { useBackButton } from "../hooks/useBackButton.js";

export function KITagesabschlussButton({ projekt, kolonnen, wetter, onErgebnis, session }) {
  const [offen,    setOffen]    = useState(false);
  useBackButton(offen, () => setOffen(false));
  const [diktat,   setDiktat]   = useState("");
  const [laden,    setLaden]    = useState(false);
  const [ergebnis, setErgebnis] = useState(null);
  const [aufnahme, setAufnahme] = useState(false);
  const [fehler,   setFehler]   = useState("");
  const srRef = useRef(null);

  function startDiktat() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (!srRef.current) {
      const er = new SR();
      er.lang = "de-DE"; er.continuous = true; er.interimResults = false;
      er.onresult = e => {
        const t = Array.from(e.results).map(r=>r[0].transcript).join(" ");
        setDiktat(t);
      };
      er.onend = () => setAufnahme(false);
      srRef.current = er;
    }
    if (aufnahme) { srRef.current.stop(); setAufnahme(false); }
    else { srRef.current.start(); setAufnahme(true); }
  }

  async function analysieren() {
    if (!diktat.trim()) return;
    setLaden(true);
    setFehler("");
    try {
      const result = await kiTagesabschluss(diktat, projekt, kolonnen, wetter, session);
      if (!result) { setFehler("KI-Antwort konnte nicht ausgewertet werden."); return; }
      setErgebnis(result);
    } catch (e) {
      setFehler("KI ist gerade nicht verfügbar. Bitte später erneut versuchen.");
    } finally {
      setLaden(false);
    }
  }

  function uebernehmen() {
    onErgebnis(ergebnis);
    setOffen(false);
    setDiktat("");
    setErgebnis(null);
  }

  return (
    <>
      <button onClick={() => setOffen(true)}
        style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
          borderRadius:12, padding:"10px 18px", fontWeight:800, cursor:"pointer",
          fontSize:14, fontFamily:"inherit", display:"flex",
          alignItems:"center", gap:8 }}>
        <Bot size={16} /> KI-Tagesabschluss
      </button>

      {/* Als Portal gerendert — verschachtelt im normalen Baum bricht die
          iOS-Standalone-PWA sonst denselben nested-position:fixed-Bug wie
          beim Aufgabenformular. */}
      {offen && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:600, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0",
            padding:16,
            width:"100%", maxWidth:520,
            boxShadow:"0 -4px 30px rgba(0,0,0,0.2)" }}>

            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:12,
              paddingTop:"calc(6px + env(safe-area-inset-top))",
              position:"sticky", top:0, background:"var(--surface)", zIndex:5 }}>
              <div style={{ fontWeight:800, fontSize:17, color:"var(--text)",
                display:"flex", alignItems:"center", gap:8 }}>
                <Bot size={16} /> KI-Tagesabschluss
              </div>
              <button onClick={() => { setOffen(false); setErgebnis(null); }}
                style={{ background:"none", border:"none", color:"var(--muted)",
                  cursor:"pointer", display:"flex" }}><X size={22} /></button>
            </div>

            {!ergebnis ? (
              <>
                <div style={{ color:"var(--text2)", fontSize:13, marginBottom:10,
                  lineHeight:1.6 }}>
                  Beschreibe kurz was heute auf der Baustelle passiert ist.
                  Die KI erstellt automatisch den Tagesbericht, neue Aufgaben und Mängel.
                </div>

                {fehler && (
                  <div style={{ background:"var(--rbg)", color:"var(--red)",
                    borderRadius:10, padding:"7px 14px", marginBottom:10,
                    fontSize:13, border:"1px solid var(--red)",
                    display:"flex", alignItems:"center", gap:6 }}>
                    <CircleX size={13} /> {fehler}
                  </div>
                )}

                <div style={{ position:"relative", marginBottom:10 }}>
                  <textarea rows={6} value={diktat}
                    onChange={e=>setDiktat(e.target.value)}
                    placeholder='z.B. "Heute Bodenplatte B1 fertig betoniert, 8 Mann, Kolonne Huber. Elektriker hat Schalung beschädigt, muss morgen repariert werden. Bewehrung C1 fange ich morgen an..."'
                    style={{ width:"100%", background: aufnahme ? "#0f1f4a" : "var(--surface2)",
                      color:"var(--text)",
                      border:`1.5px solid ${aufnahme ? "var(--blue)" : "var(--border)"}`,
                      borderRadius:12, padding:12, fontSize:13, resize:"none",
                      boxSizing:"border-box", fontFamily:"inherit",
                      transition:"border-color 0.2s" }} />
                  <button onClick={startDiktat}
                    style={{ position:"absolute", bottom:10, right:10,
                      background: aufnahme ? "var(--red)" : "var(--surface)",
                      color: aufnahme ? "#fff" : "var(--muted)",
                      border:`1px solid ${aufnahme ? "var(--red)" : "var(--border)"}`,
                      borderRadius:20, padding:"4px 12px", cursor:"pointer",
                      fontSize:12, fontFamily:"inherit",
                      display:"flex", alignItems:"center", gap:5 }}>
                    {aufnahme ? <><Square size={11} /> Stopp</> : <><Mic size={12} /> Diktieren</>}
                  </button>
                </div>

                <button onClick={analysieren}
                  disabled={!diktat.trim() || laden}
                  style={{ width:"100%",
                    background: diktat.trim() && !laden ? "var(--yellow)" : "var(--surface2)",
                    color: diktat.trim() && !laden ? "#1a1200" : "var(--muted)",
                    border:"none", borderRadius:12, padding:15, fontWeight:800,
                    fontSize:15, cursor: diktat.trim() ? "pointer" : "default",
                    fontFamily:"inherit",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                  {laden ? <><Spinner size={15} /> KI analysiert…</> : <><Sparkles size={15} /> Analysieren & Vorschlag erstellen</>}
                </button>
              </>
            ) : (
              <>
                {/* Bericht-Vorschau */}
                <div style={{ background:"var(--gbg)", borderRadius:12, padding:10,
                  marginBottom:9, border:"1px solid var(--green)" }}>
                  <div style={{ color:"var(--green)", fontWeight:700, fontSize:12,
                    marginBottom:6, display:"flex", alignItems:"center", gap:6 }}><ClipboardList size={13} /> Tagesbericht</div>
                  <div style={{ color:"var(--text)", fontSize:13,
                    lineHeight:1.6 }}>{ergebnis.bericht?.taetigkeit}</div>
                  {ergebnis.bericht?.besonderheiten && (
                    <div style={{ color:"var(--text2)", fontSize:12,
                      marginTop:6, display:"flex", alignItems:"center", gap:5 }}><TriangleAlert size={11} /> {ergebnis.bericht.besonderheiten}</div>
                  )}
                </div>

                {/* Neue Aufgaben */}
                {ergebnis.neue_aufgaben?.length > 0 && (
                  <div style={{ marginBottom:9 }}>
                    <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:12,
                      marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      <CircleCheckBig size={13} /> {ergebnis.neue_aufgaben.length} neue Aufgaben erkannt
                    </div>
                    {ergebnis.neue_aufgaben.map((a,i) => (
                      <div key={i} style={{ background:"var(--ybg)", borderRadius:10,
                        padding:"6px 12px", marginBottom:6,
                        border:"1px solid var(--yellow)" }}>
                        <div style={{ color:"var(--text)", fontWeight:600, fontSize:12 }}>
                          {AUFGABEN_TYPEN[a.typ]?.icon} {a.titel}
                        </div>
                        <div style={{ color:"var(--muted)", fontSize:11 }}>
                          {AUFGABEN_PRIO[a.prioritaet]?.icon} {AUFGABEN_PRIO[a.prioritaet]?.label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Neue Mängel */}
                {ergebnis.neue_maengel?.length > 0 && (
                  <div style={{ marginBottom:9 }}>
                    <div style={{ color:"var(--red)", fontWeight:700, fontSize:12,
                      marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      <TriangleAlert size={13} /> {ergebnis.neue_maengel.length} Mängel erkannt
                    </div>
                    {ergebnis.neue_maengel.map((m,i) => (
                      <div key={i} style={{ background:"var(--rbg)", borderRadius:10,
                        padding:"6px 12px", marginBottom:6,
                        border:"1px solid var(--red)" }}>
                        <div style={{ color:"var(--red)", fontWeight:600, fontSize:12 }}>
                          {m.titel}
                        </div>
                        {m.mangel_verursacher && (
                          <div style={{ color:"var(--muted)", fontSize:11,
                            display:"flex", alignItems:"center", gap:4 }}>
                            <Wrench size={10} /> {m.mangel_verursacher}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Wetter-Warnung */}
                {ergebnis.wetter_warnung && (
                  <div style={{ background:"var(--obg)", borderRadius:10, padding:9,
                    marginBottom:9, border:"1px solid var(--orange)" }}>
                    <div style={{ color:"var(--orange)", fontWeight:700, fontSize:12,
                      display:"flex", alignItems:"center", gap:6 }}>
                      <CloudRain size={13} /> Wetter-Warnung
                    </div>
                    <div style={{ color:"var(--text)", fontSize:12, marginTop:4 }}>
                      {ergebnis.wetter_warnung}
                    </div>
                  </div>
                )}

                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => setErgebnis(null)}
                    style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
                      border:"1.5px solid var(--border)", borderRadius:12, padding:13,
                      cursor:"pointer", fontFamily:"inherit",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                    <ArrowLeft size={14} /> Zurück
                  </button>
                  <button onClick={uebernehmen}
                    style={{ flex:2, background:"var(--green)", color:"#fff",
                      border:"none", borderRadius:12, padding:13, fontWeight:800,
                      cursor:"pointer", fontSize:15, fontFamily:"inherit",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                    <CircleCheckBig size={15} /> Alles übernehmen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
