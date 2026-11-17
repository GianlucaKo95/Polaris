import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Scale, X, Upload, Check, TriangleAlert } from "lucide-react";
import { gaebXmlDateiLesen, parseGaebXml } from "../lib/gaebXml.js";
import { gaeb90DateiLesen, parseGaeb90Preise, gaeb90PreiseZuPositionen, gaeb90ZuPositionen } from "../lib/gaeb90.js";
import { preisspiegelBauen, nuPreiseUebernehmen } from "../lib/preisspiegel.js";
import { anhangAusDatei } from "../lib/anhaenge.js";
import { nuAngebotEinlesen } from "../lib/angebotEinlesen.js";
import { kiToolAufruf } from "../lib/ai.js";

const euro = n => n == null ? "—" : n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function nuAngebotLesen(datei) {
  const name = datei.name.replace(/\.[^.]+$/, "");
  if (/\.x8[46]$/i.test(datei.name)) {
    const geparst = parseGaebXml(await gaebXmlDateiLesen(datei));
    return { name, positionen: gaeb90ZuPositionen(geparst) };
  }
  if (/\.[dp]8[46]$/i.test(datei.name)) {
    return { name, positionen: gaeb90PreiseZuPositionen(parseGaeb90Preise(await gaeb90DateiLesen(datei))) };
  }
  return null; // kein GAEB: wird per KI gelesen
}

// Preisspiegel für Nachunternehmer-Angebote (lib/preisspiegel.js): mehrere
// bepreiste GAEB-Dateien hochladen, je Position den Bieter wählen (Vorgabe:
// günstigster), übernehmen → NU-Preis als Fremdleistung mit Zuschlag.
export function NuPreisspiegel({ positionen, zuschlagFremdleistung = 0, session = null, onUebernehmen, onClose }) {
  const [nuAngebote, setNuAngebote] = useState([]);
  const [fehler, setFehler] = useState("");
  const [wahl, setWahl] = useState({});
  const [liest, setLiest] = useState(null);
  const [mailOffen, setMailOffen] = useState(false);
  const [mailText, setMailText] = useState("");
  const rufeKi = (system, messages, tools, toolChoice) => kiToolAufruf({ system, messages, tools, toolChoice, maxTokens: 6000 }, session);
  async function perKi({ datei, text }) {
    if (!session?.access_token) throw new Error("PDF, Fotos und Mailtext liest die KI; dafür bitte anmelden");
    setLiest(datei?.name || "Mailtext");
    try {
      const anhang = datei ? await anhangAusDatei(datei) : null;
      const a = await nuAngebotEinlesen({ anhang, text, positionen, rufeKi });
      setNuAngebote(x => [...x, a]);
    } finally { setLiest(null); }
  }
  const ref = useRef(null);
  const spiegel = useMemo(() => preisspiegelBauen(positionen, nuAngebote), [positionen, nuAngebote]);

  async function dateien(e) {
    const liste = [...(e.target.files || [])];
    e.target.value = "";
    setFehler("");
    for (const d of liste) {
      try {
        const a = await nuAngebotLesen(d);
        if (a) setNuAngebote(x => [...x, a]); else await perKi({ datei: d });
      }
      catch (err) { setFehler(err.message || String(err)); }
    }
    setWahl({});
  }

  const effektiveWahl = Object.fromEntries(spiegel.zeilen.map(z => [z.id, wahl[z.id] ?? z.minIndex]));
  const anzahlGewaehlt = Object.values(effektiveWahl).filter(i => i >= 0).length;

  return createPortal(
    <div className="voll-overlay" style={{ position:"fixed", inset:0, background:"var(--bg)", zIndex:700, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
      <div style={{ background:"var(--surface)", padding:"10px 18px", paddingTop:"calc(14px + env(safe-area-inset-top))",
        borderBottom:"3px solid var(--yellow)", position:"sticky", top:0, zIndex:2,
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:16, display:"flex", alignItems:"center", gap:8 }}>
          <Scale size={15} /> NU-Preisspiegel
        </div>
        <button onClick={onClose} style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)",
          borderRadius:8, padding:"6px 14px", cursor:"pointer", fontFamily:"inherit", display:"flex" }}><X size={15} /></button>
      </div>
      <div style={{ padding:"14px 16px" }}>
        <div style={{ color:"var(--muted)", fontSize:12, marginBottom:10, lineHeight:1.5 }}>
          Bepreiste Angebote eurer Nachunternehmer hochladen: GAEB X84/D84 direkt, PDF, Foto oder Mailtext liest die KI. Zugeordnet wird über die Ordnungszahl,
          sonst über ähnlichen Text und gleiche Einheit. Der gewählte Preis wird als Fremdleistung mit {zuschlagFremdleistung} % Zuschlag übernommen.
        </div>
        <input ref={ref} type="file" multiple accept=".x84,.X84,.x86,.X86,.d84,.D84,.d86,.D86,.p84,.P84,application/pdf,image/*" onChange={dateien} style={{ display:"none" }} />
        <button onClick={() => ref.current?.click()}
          style={{ width:"100%", background:"var(--surface2)", color:"var(--text)", border:"1.5px dashed var(--border)", borderRadius:10,
            padding:11, cursor:"pointer", fontSize:13, fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          {liest ? <>KI liest {liest} …</> : <><Upload size={14} /> NU-Angebot hinzufügen (GAEB, PDF, Foto)</>}
        </button>
        <button onClick={() => setMailOffen(o => !o)} style={{ marginTop:8, background:"none", border:"none", color:"var(--text2)", fontFamily:"inherit", fontSize:13, cursor:"pointer", padding:0 }}>
          {mailOffen ? "Mailtext schließen" : "Angebot aus Mailtext einfügen"}
        </button>
        {mailOffen && (
          <div style={{ marginTop:8 }}>
            <textarea value={mailText} onChange={e => setMailText(e.target.value)} rows={6} placeholder="Text der Angebotsmail hier einfügen"
              style={{ boxSizing:"border-box", width:"100%", padding:"10px 12px", border:"1px solid var(--border2)", borderRadius:8, background:"var(--surface)", color:"var(--text)", fontFamily:"inherit", fontSize:13, resize:"vertical" }} />
            <button disabled={!mailText.trim() || !!liest} onClick={async () => { setFehler(""); try { await perKi({ text: mailText }); setMailText(""); setMailOffen(false); } catch (e) { setFehler(e.message); } }}
              style={{ marginTop:6, height:32, padding:"0 12px", borderRadius:8, border:"none", background:"var(--text)", color:"var(--surface)", fontFamily:"inherit", fontSize:13, cursor:"pointer", opacity: mailText.trim() ? 1 : 0.5 }}>Einlesen</button>
          </div>
        )}
        {nuAngebote.some(a => a.quelle === "ki") && (
          <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:8 }}>
            {nuAngebote.filter(a => a.quelle === "ki").map((a, i) => (
              <div key={i} style={{ border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px", fontSize:13, background:"var(--surface)" }}>
                <div style={{ fontWeight:500, color:"var(--text)" }}>{a.name}{a.gueltigBis ? <span style={{ color:"var(--text2)", fontWeight:400 }}> · gültig bis {a.gueltigBis}</span> : null}</div>
                {!a.summe.ok && <div style={{ color:"var(--red)", marginTop:4 }}>Summe passt nicht: gelesen {euro(a.summe.berechnet)} €, im Angebot {euro(a.summe.angegeben)} €. Bitte Preise prüfen</div>}
                {a.summe.ok && a.summe.angegeben != null && <div style={{ color:"var(--text2)", marginTop:4 }}>Summe stimmt mit dem Angebot überein ({euro(a.summe.angegeben)} €)</div>}
                {a.vorbehalte.length > 0 && <div style={{ color:"var(--akzent)", marginTop:4 }}>Vorbehalte: {a.vorbehalte.join(" · ")}</div>}
                {a.nichtAngeboten.length > 0 && <div style={{ color:"var(--text2)", marginTop:4 }}>Nicht angeboten: {a.nichtAngeboten.join(", ")}</div>}
                {a.positionen.some(p => p.hinweis) && <div style={{ color:"var(--text2)", marginTop:4 }}>{a.positionen.filter(p => p.hinweis).map(p => `${p.oz || p.bez}: ${p.hinweis}`).join(" · ")}</div>}
              </div>
            ))}
          </div>
        )}
        {fehler && <div style={{ color:"var(--red)", fontSize:12, marginTop:8, display:"flex", gap:5 }}><TriangleAlert size={13} /> {fehler}</div>}

        {nuAngebote.length > 0 && (
          <div style={{ overflowX:"auto", marginTop:12 }}>
            <table style={{ borderCollapse:"collapse", fontSize:12, minWidth:"100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign:"left", padding:6, color:"var(--muted)", borderBottom:"1px solid var(--border)" }}>Position</th>
                  {spiegel.bieter.map((b, i) => (
                    <th key={i} style={{ textAlign:"right", padding:6, color:"var(--text)", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>
                      {b}
                      <button onClick={() => setNuAngebote(x => x.filter((_, j) => j !== i))}
                        style={{ marginLeft:4, background:"none", border:"none", color:"var(--muted)", cursor:"pointer", verticalAlign:"middle" }}><X size={11} /></button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spiegel.zeilen.map(z => (
                  <tr key={z.id}>
                    <td style={{ padding:6, borderBottom:"1px solid var(--border)", color:"var(--text)", maxWidth:220 }}>
                      {z.oz && <span style={{ color:"var(--muted)" }}>{z.oz} </span>}{z.bez}
                      <div style={{ color:"var(--muted)", fontSize:11 }}>{z.menge.toLocaleString("de-DE")} {z.einheit}</div>
                    </td>
                    {z.preise.map((p, i) => {
                      const gewaehlt = effektiveWahl[z.id] === i;
                      return (
                        <td key={i} onClick={() => p != null && setWahl(w => ({ ...w, [z.id]: gewaehlt ? -1 : i }))}
                          style={{ padding:6, textAlign:"right", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap",
                            cursor: p != null ? "pointer" : "default",
                            background: gewaehlt ? "var(--gbg)" : "transparent",
                            color: p == null ? "var(--muted)" : z.minIndex === i ? "var(--green)" : "var(--text)",
                            fontWeight: z.minIndex === i ? 800 : 400 }}>
                          {euro(p)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding:6, fontWeight:800, color:"var(--text)" }}>Summe netto</td>
                  {spiegel.summen.map((s, i) => (
                    <td key={i} style={{ padding:6, textAlign:"right", fontWeight:800, color:"var(--text)" }}>
                      {euro(s)}
                      {spiegel.fehlend[i] > 0 && <div style={{ color:"var(--red)", fontSize:10.5, fontWeight:600 }}>{spiegel.fehlend[i]} fehlen</div>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {nuAngebote.length > 0 && (
          <button onClick={() => onUebernehmen(nuPreiseUebernehmen(positionen, spiegel, effektiveWahl, zuschlagFremdleistung))}
            disabled={!anzahlGewaehlt}
            style={{ width:"100%", marginTop:14, background: anzahlGewaehlt ? "var(--yellow)" : "var(--surface2)",
              color: anzahlGewaehlt ? "#1a1200" : "var(--muted)", border:"none", borderRadius:10, padding:14, fontWeight:800,
              cursor: anzahlGewaehlt ? "pointer" : "default", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            <Check size={15} /> {anzahlGewaehlt} NU-Preis(e) übernehmen
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
