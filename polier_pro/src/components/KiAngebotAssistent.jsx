import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, TriangleAlert, CircleHelp, Check } from "lucide-react";
import { DiktierFeld } from "./DiktierFeld.jsx";
import { Spinner } from "./Spinner.jsx";
import { inputStyle } from "./Label.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { katalogBauen, QUELLEN_LABEL } from "../lib/katalog.js";
import { agentStarten, agentFortsetzen, vorschlagZuPositionen } from "../lib/kiAngebotAgent.js";

const euro = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Vollbild-Dialog für den KI-Angebots-Agenten (lib/kiAngebotAgent.js):
// Anfrage → (Rückfragen) → Vorschau mit Preisquelle je Position → Übernehmen.
// Die Vorschau zeigt bewusst VOR der Übernahme, welche Positionen ohne
// Preis bleiben, damit der Polier weiß, was er noch klären muss.
export function KiAngebotAssistent({ projekt, eigeneFirma, stammpositionen = [], einheitspreise = [], lvVorlagen = [],
  kalkulationspreise = [], standardZuschlaege, session, onUebernehmen, onClose }) {
  const [anfrage, setAnfrage] = useState("");
  const [phase, setPhase] = useState("eingabe"); // eingabe | laeuft | rueckfrage | vorschau
  const [fehler, setFehler] = useState("");
  const [zwischenstand, setZwischenstand] = useState(null); // { messages, offen, fragen }
  const [antworten, setAntworten] = useState([]);
  const [ergebnis, setErgebnis] = useState(null);

  const katalog = useMemo(
    () => katalogBauen({ stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege }),
    [stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege],
  );
  const kontext = { projekt, gewerke: eigeneFirma?.gewerke };
  const rufeKi = async (system, messages, tools) => kiToolAufruf({ system, messages, tools }, session);

  function verarbeiten(r) {
    if (r.status === "rueckfrage") {
      setZwischenstand(r);
      setAntworten(r.fragen.map(() => ""));
      setPhase("rueckfrage");
    } else if (r.status === "fertig") {
      setErgebnis(vorschlagZuPositionen(r.vorschlag, { katalog, stammpositionen, kalkulationspreise, standardZuschlaege }));
      setPhase("vorschau");
    } else {
      setFehler(r.fehler || "KI-Anfrage fehlgeschlagen.");
      setPhase("eingabe");
    }
  }

  async function starten() {
    if (!anfrage.trim()) return;
    setFehler(""); setPhase("laeuft");
    try {
      verarbeiten(await agentStarten({ anfrage, katalog, kontext, rufeKi }));
    } catch (e) {
      setFehler(e.message || "KI-Anfrage fehlgeschlagen."); setPhase("eingabe");
    }
  }

  async function antwortenSenden() {
    setFehler(""); setPhase("laeuft");
    try {
      verarbeiten(await agentFortsetzen({ ...zwischenstand, antworten, katalog, kontext, rufeKi }));
    } catch (e) {
      setFehler(e.message || "KI-Anfrage fehlgeschlagen."); setPhase("rueckfrage");
    }
  }

  const ohnePreis = ergebnis ? ergebnis.positionen.filter(p => !(p.ep > 0)).length : 0;
  const summe = ergebnis ? ergebnis.positionen.reduce((s, p) => s + (p.menge || 0) * (p.ep || 0), 0) : 0;
  const knopf = (aktiv) => ({
    width:"100%", marginTop:12, background: aktiv ? "var(--yellow)" : "var(--surface2)",
    color: aktiv ? "#1a1200" : "var(--muted)", border:"none", borderRadius:10, padding:14, fontWeight:800,
    cursor: aktiv ? "pointer" : "default", fontSize:14, fontFamily:"inherit",
    display:"flex", alignItems:"center", justifyContent:"center", gap:7,
  });

  return createPortal(
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:700,
      overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
      <div style={{ background:"var(--surface)", padding:"10px 18px", paddingTop:"calc(14px + env(safe-area-inset-top))",
        borderBottom:"3px solid var(--yellow)", position:"sticky", top:0, zIndex:2,
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:16, display:"flex", alignItems:"center", gap:8 }}>
          <Sparkles size={15} /> KI-Angebot
        </div>
        <button onClick={onClose} style={{ background:"var(--surface2)", border:"1px solid var(--border)",
          color:"var(--text)", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontFamily:"inherit", display:"flex" }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ padding:"14px 16px", maxWidth:640, margin:"0 auto" }}>
        {fehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10, padding:"8px 12px",
            fontSize:12, marginBottom:10, display:"flex", gap:6 }}>
            <TriangleAlert size={13} style={{ flexShrink:0, marginTop:1 }} /> {fehler}
          </div>
        )}

        {phase === "eingabe" && <>
          <div style={{ color:"var(--muted)", fontSize:12, marginBottom:10, lineHeight:1.5 }}>
            Beschreibe, was der Kunde möchte — so wie der Geschäftsführer es dir sagen würde, mit allen Maßen, die du kennst.
            Die KI sucht die Leistungen in euren Stammdaten ({katalog.length} Einträge), rechnet die Mengen
            und fragt nach, wenn etwas Preisrelevantes fehlt. Preise kommen immer aus euren Stammdaten, nie von der KI.
          </div>
          {katalog.length === 0 && (
            <div style={{ background:"var(--ybg)", color:"var(--ydark)", borderRadius:10, padding:"8px 12px", fontSize:12, marginBottom:10 }}>
              Noch keine Stammdaten mit Preisen hinterlegt — alle Positionen würden ohne Preis bleiben.
              Unter Angebots-Parameter Stammpositionen oder Einheitspreise anlegen.
            </div>
          )}
          <DiktierFeld label="Anfrage des Kunden" value={anfrage} onChange={setAnfrage} rows={6} />
          <button onClick={starten} disabled={!anfrage.trim()} style={knopf(!!anfrage.trim())}>
            <Sparkles size={14} /> Angebot erstellen
          </button>
        </>}

        {phase === "laeuft" && (
          <div style={{ textAlign:"center", padding:"40px 10px", color:"var(--muted)", fontSize:13 }}>
            <Spinner size={22} />
            <div style={{ marginTop:12 }}>Die KI sucht in euren Stammdaten und rechnet die Mengen…</div>
          </div>
        )}

        {phase === "rueckfrage" && zwischenstand && <>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:14, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
            <CircleHelp size={15} /> Die KI braucht noch {zwischenstand.fragen.length === 1 ? "eine Angabe" : "ein paar Angaben"}
          </div>
          {zwischenstand.fragen.map((f, i) => (
            <div key={i} style={{ marginBottom:10 }}>
              <div style={{ color:"var(--text)", fontSize:13, marginBottom:5 }}>{f}</div>
              <input value={antworten[i] || ""} onChange={e => setAntworten(a => a.map((x, j) => j === i ? e.target.value : x))}
                placeholder="Leer lassen = übliche Annahme" style={inputStyle()} />
            </div>
          ))}
          <button onClick={antwortenSenden} style={knopf(true)}>Weiter</button>
        </>}

        {phase === "vorschau" && ergebnis && <>
          <div style={{ color:"var(--text)", fontWeight:800, fontSize:15 }}>{ergebnis.titel || "Angebotsvorschlag"}</div>
          {ergebnis.empfaenger && <div style={{ color:"var(--muted)", fontSize:12, marginTop:2 }}>für {ergebnis.empfaenger}</div>}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"var(--surface)",
            border:"1.5px solid var(--border)", borderRadius:12, padding:"10px 12px", margin:"10px 0" }}>
            <div style={{ color:"var(--muted)", fontSize:12 }}>
              {ergebnis.positionen.length} Positionen
              {ohnePreis > 0 && <span style={{ color:"var(--red)", fontWeight:700 }}> · {ohnePreis} ohne Preis</span>}
            </div>
            <div style={{ color:"var(--text)", fontWeight:800 }}>{euro(summe)} € netto</div>
          </div>

          {ergebnis.annahmen.length > 0 && (
            <div style={{ background:"var(--surface2)", borderRadius:10, padding:"8px 12px", marginBottom:10, fontSize:12, color:"var(--text)" }}>
              <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Annahmen der KI</div>
              {ergebnis.annahmen.map((a, i) => <div key={i} style={{ marginBottom:2 }}>• {a}</div>)}
            </div>
          )}

          {ergebnis.positionen.map((p, i) => {
            const mitPreis = p.ep > 0;
            return (
              <div key={i} style={{ background:"var(--surface)", borderRadius:12, padding:"9px 12px", marginBottom:6,
                border:`1.5px solid ${mitPreis ? "var(--border)" : "var(--red)"}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                  <div style={{ color:"var(--text)", fontWeight:700, fontSize:13 }}>{p.bez}</div>
                  <div style={{ color: mitPreis ? "var(--text)" : "var(--red)", fontWeight:800, fontSize:13, whiteSpace:"nowrap" }}>
                    {mitPreis ? `${euro(p.menge * p.ep)} €` : "ohne Preis"}
                  </div>
                </div>
                <div style={{ color:"var(--muted)", fontSize:12, marginTop:3 }}>
                  {p.menge.toLocaleString("de-DE")} {p.einheit}{mitPreis && <> × {euro(p.ep)} €</>}
                  {" · "}{QUELLEN_LABEL[p.preisquelle?.art] || "—"}
                </div>
                {p.ki?.herleitung && <div style={{ color:"var(--muted)", fontSize:11.5, marginTop:3 }}>Menge: {p.ki.herleitung}</div>}
                {p.ki?.hinweis && <div style={{ color:"var(--ydark)", fontSize:11.5, marginTop:3 }}>{p.ki.hinweis}</div>}
              </div>
            );
          })}

          <button onClick={() => onUebernehmen(ergebnis)} style={knopf(true)}>
            <Check size={15} /> Positionen ins Angebot übernehmen
          </button>
          <button onClick={() => { setErgebnis(null); setPhase("eingabe"); }}
            style={{ ...knopf(false), marginTop:8, cursor:"pointer", color:"var(--text)" }}>
            Anfrage ändern
          </button>
        </>}
      </div>
    </div>,
    document.body,
  );
}
