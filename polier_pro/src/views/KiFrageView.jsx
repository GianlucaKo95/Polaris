import { useState, useEffect, useRef } from "react";
import { Send, Sparkles, TriangleAlert } from "lucide-react";
import { Spinner } from "../components/Spinner.jsx";
import { kiProjektFrage } from "../lib/ai.js";
import { holeWettervorhersage } from "../lib/geo.js";
import { terminprognose } from "../lib/terminkette.js";

const VORSCHLAEGE = [
  "Was steht heute an?",
  "Was ist überfällig?",
  "Können wir morgen betonieren?",
  "Wie ist die Terminlage?",
];

export function KiFrageView({ projekt, aufgaben = [], kolonnen = [], tagesberichte = [], kommentare = [], session }) {
  const [verlauf,   setVerlauf]   = useState([]); // { rolle: "user"|"ki", text }
  const [eingabe,   setEingabe]   = useState("");
  const [laedt,     setLaedt]     = useState(false);
  const [fehler,    setFehler]    = useState("");
  const [wetterVorhersage, setWetterVorhersage] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    let abgebrochen = false;
    holeWettervorhersage(projekt?.ort, projekt?.plz).then(f => { if (!abgebrochen) setWetterVorhersage(f); });
    return () => { abgebrochen = true; };
  }, [projekt?.ort, projekt?.plz]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [verlauf, laedt]);

  async function senden(text) {
    const frage = (text ?? eingabe).trim();
    if (!frage || laedt) return;
    setFehler("");
    setEingabe("");
    const neuerVerlauf = [...verlauf, { rolle: "user", text: frage }];
    setVerlauf(neuerVerlauf);
    setLaedt(true);
    try {
      const antwort = await kiProjektFrage(frage, verlauf, {
        projekt, aufgaben, kolonnen, wetterVorhersage, tagesberichte, kommentare,
        terminprognose: terminprognose(aufgaben),
      }, session);
      setVerlauf(prev => [...prev, { rolle: "ki", text: antwort || "Keine Antwort erhalten." }]);
    } catch (e) {
      setFehler(e.message || "KI-Anfrage fehlgeschlagen.");
    } finally {
      setLaedt(false);
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100dvh - 220px)", minHeight:320 }}>
      <div style={{ color:"var(--text)", fontWeight:700, marginBottom:9,
        display:"flex", alignItems:"center", gap:7 }}><Sparkles size={16} color="var(--yellow)" /> KI fragen</div>

      <div ref={listRef} style={{ flex:1, overflowY:"auto", paddingBottom:8 }}>
        {verlauf.length === 0 && (
          <div style={{ color:"var(--muted)", fontSize:12.5, marginBottom:14, lineHeight:1.5 }}>
            Fragen zu diesem Projekt — die Antwort stützt sich ausschließlich auf die
            hier erfassten Aufgaben (offen und erledigt), Kommentare, Tagesberichte,
            Kolonnen, die Wettervorhersage und die berechnete Terminprognose. Fehlen
            Daten, sagt die KI das offen statt zu raten.
          </div>
        )}

        {verlauf.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.rolle === "user" ? "flex-end" : "flex-start", marginBottom:8 }}>
            <div style={{ maxWidth:"85%", padding:"9px 13px", fontSize:13, lineHeight:1.45, whiteSpace:"pre-wrap",
              background: m.rolle === "user" ? "var(--yellow)" : "var(--surface)",
              color: m.rolle === "user" ? "#1a1200" : "var(--text)",
              border: m.rolle === "user" ? "none" : "1px solid var(--border)",
              borderRadius:12,
              borderBottomRightRadius: m.rolle === "user" ? 3 : 12,
              borderBottomLeftRadius: m.rolle === "ki" ? 3 : 12 }}>
              {m.text}
            </div>
          </div>
        ))}

        {laedt && (
          <div style={{ display:"flex", justifyContent:"flex-start", marginBottom:8 }}>
            <div style={{ padding:"9px 13px", background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:12, borderBottomLeftRadius:3, color:"var(--muted)", fontSize:13,
              display:"flex", alignItems:"center", gap:7 }}>
              <Spinner size={13} /> denkt nach…
            </div>
          </div>
        )}

        {fehler && (
          <div style={{ background:"var(--rbg)", color:"var(--red)", padding:"8px 12px",
            borderRadius:10, fontSize:12.5, display:"flex", alignItems:"center", gap:7, marginBottom:8 }}>
            <TriangleAlert size={14} />{fehler}
          </div>
        )}
      </div>

      {verlauf.length === 0 && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
          {VORSCHLAEGE.map(v => (
            <button key={v} onClick={() => senden(v)}
              style={{ background:"var(--surface2)", color:"var(--text2)", border:"1px solid var(--border)",
                borderRadius:20, padding:"6px 12px", fontSize:11.5, cursor:"pointer", fontFamily:"inherit" }}>
              {v}
            </button>
          ))}
        </div>
      )}

      <div style={{ display:"flex", gap:8 }}>
        <input value={eingabe} onChange={e => setEingabe(e.target.value)}
          onKeyDown={e => e.key === "Enter" && senden()}
          placeholder="Frage zum Projekt stellen…" disabled={laedt}
          style={{ flex:1, background:"var(--surface)", color:"var(--text)",
            border:"1px solid var(--border)", borderRadius:10,
            padding:"11px 14px", fontSize:13.5, fontFamily:"inherit" }} />
        <button onClick={() => senden()} disabled={laedt || !eingabe.trim()}
          style={{ width:44, background: eingabe.trim() && !laedt ? "var(--yellow)" : "var(--surface2)",
            color: eingabe.trim() && !laedt ? "#1a1200" : "var(--muted)",
            border:"none", borderRadius:10, cursor: eingabe.trim() && !laedt ? "pointer" : "default",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
          {laedt ? <Spinner size={16} /> : <Send size={17} />}
        </button>
      </div>
    </div>
  );
}
