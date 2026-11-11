import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, TriangleAlert, CircleHelp, Check, Paperclip, FileText } from "lucide-react";
import { DiktierFeld } from "./DiktierFeld.jsx";
import { Spinner } from "./Spinner.jsx";
import { inputStyle } from "./Label.jsx";
import { kiToolAufruf } from "../lib/ai.js";
import { katalogBauen, QUELLEN_LABEL } from "../lib/katalog.js";
import { agentStarten, agentFortsetzen, vorschlagZuPositionen } from "../lib/kiAngebotAgent.js";

// Datei → Anthropic-Content-Block. Fotos werden auf max. 1600 px verkleinert
// und als JPEG gesendet (Handyfotos haben sonst 5–10 MB und werden in jeder
// Agenten-Runde erneut übertragen); PDFs gehen unverändert als Dokument.
const MAX_PDF_BYTES = 8 * 1024 * 1024;
function base64AusDataUrl(url) { return url.slice(url.indexOf(",") + 1); }
async function anhangAusDatei(datei) {
  if (datei.type === "application/pdf") {
    if (datei.size > MAX_PDF_BYTES) throw new Error(`${datei.name} ist größer als 8 MB.`);
    const url = await new Promise((ok, fehler) => {
      const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fehler; r.readAsDataURL(datei);
    });
    return { name: datei.name, block: { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64AusDataUrl(url) } } };
  }
  if (!datei.type.startsWith("image/")) throw new Error(`${datei.name}: nur Fotos und PDFs möglich.`);
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, 1600 / Math.max(bild.width, bild.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bild.width * faktor); canvas.height = Math.round(bild.height * faktor);
  canvas.getContext("2d").drawImage(bild, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { name: datei.name, vorschau: url, block: { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64AusDataUrl(url) } } };
}

const euro = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Vollbild-Dialog für den KI-Angebots-Agenten (lib/kiAngebotAgent.js):
// Anfrage → (Rückfragen) → Vorschau mit Preisquelle je Position → Übernehmen.
// Die Vorschau zeigt bewusst VOR der Übernahme, welche Positionen ohne
// Preis bleiben, damit der Polier weiß, was er noch klären muss.
export function KiAngebotAssistent({ projekt, eigeneFirma, stammpositionen = [], einheitspreise = [], lvVorlagen = [],
  kalkulationspreise = [], standardZuschlaege, nachtragZu = null, session, onUebernehmen, onClose }) {
  const [anfrage, setAnfrage] = useState("");
  const [phase, setPhase] = useState("eingabe"); // eingabe | laeuft | rueckfrage | vorschau
  const [fehler, setFehler] = useState("");
  const [zwischenstand, setZwischenstand] = useState(null); // { messages, offen, fragen }
  const [antworten, setAntworten] = useState([]);
  const [ergebnis, setErgebnis] = useState(null);
  const [anhaenge, setAnhaenge] = useState([]); // [{ name, vorschau?, block }]
  const dateiRef = useRef(null);

  async function dateienGewaehlt(e) {
    const dateien = [...(e.target.files || [])];
    e.target.value = "";
    setFehler("");
    for (const d of dateien) {
      try {
        const a = await anhangAusDatei(d);
        setAnhaenge(x => [...x, a].slice(0, 5));
      } catch (err) { setFehler(err.message || "Datei konnte nicht gelesen werden."); }
    }
  }

  const katalog = useMemo(
    () => katalogBauen({ stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege, urkalkulation: nachtragZu }),
    [stammpositionen, einheitspreise, lvVorlagen, kalkulationspreise, standardZuschlaege, nachtragZu],
  );
  const kontext = { projekt, gewerke: eigeneFirma?.gewerke, nachtragZu };
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
    if (!anfrage.trim() && !anhaenge.length) return;
    setFehler(""); setPhase("laeuft");
    try {
      verarbeiten(await agentStarten({ anfrage, anhaenge: anhaenge.map(a => a.block), katalog, kontext, rufeKi }));
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
          <Sparkles size={15} /> {nachtragZu ? "KI-Nachtrag" : "KI-Angebot"}
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
          {nachtragZu && (
            <div style={{ background:"var(--bbg)", color:"var(--blue)", borderRadius:10, padding:"8px 12px", fontSize:12, marginBottom:10, lineHeight:1.4 }}>
              Nachtrag zu „{nachtragZu.titel}“: Die KI nimmt zuerst die Preise aus diesem Auftrag (Urkalkulation, VOB/B § 2).
            </div>
          )}
          <DiktierFeld label={nachtragZu ? "Was ist zusätzlich oder anders?" : "Anfrage des Kunden"} value={anfrage} onChange={setAnfrage} rows={6} />
          <input ref={dateiRef} type="file" accept="image/*,application/pdf" multiple onChange={dateienGewaehlt} style={{ display:"none" }} />
          <button onClick={() => dateiRef.current?.click()} disabled={anhaenge.length >= 5}
            style={{ marginTop:8, background:"var(--surface2)", color:"var(--text)", border:"1.5px dashed var(--border)",
              borderRadius:10, padding:"9px 12px", width:"100%", cursor:"pointer", fontSize:12.5, fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Paperclip size={13} /> Foto, Plan oder PDF anhängen (max. 5)
          </button>
          {anhaenge.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
              {anhaenge.map((a, i) => (
                <div key={i} style={{ position:"relative", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden",
                  width:72, height:72, background:"var(--surface)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {a.vorschau
                    ? <img src={a.vorschau} alt={a.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    : <div style={{ fontSize:10, color:"var(--muted)", textAlign:"center", padding:4 }}><FileText size={18} /><div style={{ wordBreak:"break-all" }}>{a.name.slice(0, 18)}</div></div>}
                  <button onClick={() => setAnhaenge(x => x.filter((_, j) => j !== i))}
                    style={{ position:"absolute", top:2, right:2, background:"rgba(0,0,0,.6)", color:"#fff", border:"none",
                      borderRadius:"50%", width:18, height:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={starten} disabled={!anfrage.trim() && !anhaenge.length} style={knopf(!!anfrage.trim() || anhaenge.length > 0)}>
            <Sparkles size={14} /> {nachtragZu ? "Nachtrag erstellen" : "Angebot erstellen"}
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
