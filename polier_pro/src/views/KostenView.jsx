import { useState } from "react";
import { Euro, Check, FileText } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { sbProjektKostenSpeichern } from "../lib/supabase.js";
import { Spinner } from "../components/Spinner.jsx";

const STANDARD_POSITIONEN = [
  { id:1, bezeichnung:"Betonarbeiten",    menge:0, einheitspreis:0, budget:0, einheit:"m²" },
  { id:2, bezeichnung:"Schalung",         menge:0, einheitspreis:0, budget:0, einheit:"m²" },
  { id:3, bezeichnung:"Bewehrung",        menge:0, einheitspreis:0, budget:0, einheit:"t"  },
  { id:4, bezeichnung:"Sonstige Arbeit",  menge:0, einheitspreis:0, budget:0, einheit:"h"  },
  { id:5, bezeichnung:"Material",         budget:0, einheit:"€"  },
];

// Positionen mit Einheit "€" bleiben direkte Eurobeträge (Material hat
// keine sinnvolle physische Einheit) — alle anderen werden aus Menge ×
// Einheitspreis berechnet, budget ist dort immer nur das Ergebnis.
//
// Altdaten (vor dieser Änderung gespeichert) hatten nie menge/einheits-
// preis, nur einen budget-Wert, der fälschlich 1:1 als € behandelt wurde,
// obwohl daneben z.B. "m²" stand (siehe Bugreport: "120" + "m²" zeigte
// oben "120 €"). Damit aus einer vorher gespeicherten Zahl keine neue,
// andere Summe wird, übernehmen wir sie unverändert als menge mit
// einheitspreis 1 — der Gesamtbetrag bleibt exakt gleich, ist jetzt aber
// in zwei editierbare Felder aufgeteilt, die der Nutzer korrigieren kann.
function positionNormalisieren(p) {
  if (p.einheit === "€") return { ...p, budget: p.budget || 0 };
  if (p.menge != null || p.einheitspreis != null) {
    const menge = p.menge || 0, einheitspreis = p.einheitspreis || 0;
    return { ...p, menge, einheitspreis, budget: menge * einheitspreis };
  }
  const menge = p.budget || 0;
  return { ...p, menge, einheitspreis: 1, budget: menge };
}

// Angebots-Positionen ({bez, einheit, menge, ep, rabatt}) in Budget-
// Positionen ({bezeichnung, einheit, menge, einheitspreis, budget})
// umrechnen. Der Positions-Rabatt UND der Gesamt-Rabatt des Angebots
// fließen in den Einheitspreis ein, damit die Summe exakt dem
// vereinbarten Netto-Preis entspricht (gleiche Rechnung wie gpOf() in
// AngebotEditor.jsx, nur auf Einheitspreis-Ebene statt Zeilensumme).
function ausAngebotUebernehmen(angebot) {
  const gesamtRabatt = angebot.rabatt || 0;
  return (angebot.positionen || []).map(p => {
    const menge = p.menge || 0;
    const einheitspreis = (p.ep || 0) * (1 - (p.rabatt || 0) / 100) * (1 - gesamtRabatt / 100);
    return {
      id: Date.now() + Math.random(),
      bezeichnung: p.bez || "",
      einheit: p.einheit || "Stk",
      menge,
      einheitspreis,
      budget: menge * einheitspreis,
    };
  });
}

export function KostenView({ projekt, aufgaben, kolonnen, zeitbuchungen, angebote, session, onKostenGespeichert }) {
  const [budgetPos, setBudgetPos] = useState(
    (projekt?.budget_positionen?.length ? projekt.budget_positionen : STANDARD_POSITIONEN)
      .map(positionNormalisieren)
  );
  const [stundensatz, setStundensatz] = useState(projekt?.stundensatz ?? 55); // €/h Default
  const [speichern, setSpeichern] = useState(false);
  const [gespeichertOk, setGespeichertOk] = useState(false);

  const angenommeneAngebote = (angebote || [])
    .filter(a => a.status === "angenommen" && a.positionen?.length)
    .sort((a,b) => (b.datum||"").localeCompare(a.datum||""));
  const [angebotWahl, setAngebotWahl] = useState(angenommeneAngebote[0]?.id ?? "");

  async function jetztSpeichern() {
    if (!projekt?.id) return;
    setSpeichern(true);
    setGespeichertOk(false);
    const ok = await sbProjektKostenSpeichern(projekt.id, budgetPos, stundensatz, session);
    if (ok) {
      onKostenGespeichert?.({ budget_positionen: budgetPos, stundensatz });
      setGespeichertOk(true);
    }
    setSpeichern(false);
  }

  // Ist-Kosten aus Zeitbuchungen berechnen
  const stundenGesamt = (zeitbuchungen||[])
    .filter(z => z.status === "abgeschlossen")
    .reduce((s,z) => s + (z.netto_minuten||0)/60, 0);

  const istArbeit = stundenGesamt * stundensatz;
  const budgetGesamt = budgetPos.reduce((s,p) => s + (p.budget||0), 0);
  const istGesamt = istArbeit; // Materialkosten kämen dazu
  const restBudget = budgetGesamt - istGesamt;
  const auslastung = budgetGesamt > 0
    ? Math.min(Math.round(istGesamt/budgetGesamt*100), 100) : 0;

  function positionAendern(i, feld, wert) {
    setBudgetPos(prev => prev.map((p,j) => {
      if (j !== i) return p;
      const neu = { ...p, [feld]: wert };
      if (neu.einheit !== "€") neu.budget = (neu.menge||0) * (neu.einheitspreis||0);
      return neu;
    }));
  }

  // Vorher per Hand mit einer Tausender-Regex + anschließendem
  // .replace(".",",") formatiert — der replace() ersetzt aber nur den
  // ERSTEN Punkt im String, bei Beträgen ≥ 1.000 wurde also aus dem
  // Tausenderpunkt ein Komma (z.B. "12345" → "12,345" statt "12.345"),
  // bei ≥ 100.000 sogar nur der erste von mehreren Tausenderpunkten.
  // toLocaleString("de-DE") macht das korrekt, wie bei "Budget gesamt".
  const euro = n => `${Math.round(n).toLocaleString("de-DE")} €`;

  return (
    <div>
      {/* Übersicht */}
      <div style={{ background:"var(--surface)", borderRadius:16, padding:13,
        marginBottom:12, border:"1.5px solid var(--border)" }}>
        <div style={{ color:"var(--text)", fontWeight:700, fontSize:15,
          marginBottom:10, display:"flex", alignItems:"center", gap:7 }}><Euro size={16} /> Kostenübersicht</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10,
          marginBottom:10 }}>
          {[
            ["Budget gesamt",  euro(budgetGesamt), "var(--text)"],
            ["Ist bisher",     euro(istGesamt), auslastung>80?"var(--red)":"var(--green)"],
            ["Rest-Budget",    euro(restBudget), restBudget<0?"var(--red)":"var(--green)"],
            ["Stunden",        `${stundenGesamt.toFixed(1)} h`, "var(--blue)"],
          ].map(([l,v,c]) => (
            <div key={l} style={{ background:"var(--surface2)", borderRadius:12,
              padding:"9px 14px", border:"1px solid var(--border)" }}>
              <div style={{ color:"var(--muted)", fontSize:10, fontWeight:700,
                textTransform:"uppercase", marginBottom:4 }}>{l}</div>
              <div style={{ color:c, fontWeight:900, fontSize:18 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Fortschrittsbalken */}
        <div style={{ marginBottom:4 }}>
          <div style={{ display:"flex", justifyContent:"space-between",
            fontSize:11, color:"var(--muted)", marginBottom:4 }}>
            <span>Budget-Auslastung</span>
            <span style={{ fontWeight:700,
              color: auslastung>90 ? "var(--red)" : "var(--text)" }}>
              {auslastung}%
            </span>
          </div>
          <div style={{ background:"var(--surface2)", borderRadius:6,
            height:10, overflow:"hidden",
            border:"1px solid var(--border)" }}>
            <div style={{ height:"100%", borderRadius:6,
              background: auslastung>90 ? "var(--red)"
                : auslastung>70 ? "var(--orange)" : "var(--green)",
              width:`${auslastung}%`, transition:"width 0.5s" }} />
          </div>
        </div>
      </div>

      {/* Stundensatz */}
      <div style={{ background:"var(--surface)", borderRadius:12, padding:10,
        marginBottom:10, border:"1.5px solid var(--border)" }}>
        <Label>Stundensatz (€/h)</Label>
        <input type="number" value={stundensatz}
          onChange={e=>setStundensatz(Number(e.target.value))}
          style={{ ...inputStyle(), marginTop:6 }} />
        <div style={{ color:"var(--muted)", fontSize:11, marginTop:4 }}>
          Basis für Ist-Kostenberechnung aus GPS-Zeiterfassung
        </div>
      </div>

      {/* Vorschlag: Budget aus angenommenem Angebot übernehmen */}
      {angenommeneAngebote.length > 0 && (
        <div style={{ background:"var(--ybg)", borderRadius:12, padding:"10px 14px",
          marginBottom:10, border:"1.5px solid var(--yellow)",
          display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7,
            color:"var(--ydark)", fontWeight:700, fontSize:13 }}>
            <FileText size={15} /> Angenommenes Angebot gefunden
          </div>
          {angenommeneAngebote.length > 1 && (
            <select value={angebotWahl} onChange={e => setAngebotWahl(e.target.value)}
              style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }}>
              {angenommeneAngebote.map(a => (
                <option key={a.id} value={a.id}>{a.titel || "Angebot"} ({a.datum})</option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              const gewaehlt = angenommeneAngebote.find(a => a.id === angebotWahl) || angenommeneAngebote[0];
              if (gewaehlt) setBudgetPos(ausAngebotUebernehmen(gewaehlt));
            }}
            style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
              borderRadius:8, padding:"8px 12px", fontWeight:700, fontSize:12,
              cursor:"pointer", fontFamily:"inherit" }}>
            Positionen als Budget übernehmen
          </button>
          <div style={{ color:"var(--ydark)", fontSize:11, opacity:0.85 }}>
            Ersetzt die Budget-Positionen unten (Stand nur lokal — erst mit „Speichern" verbindlich).
          </div>
        </div>
      )}

      {/* Budget-Positionen */}
      <div style={{ color:"var(--text)", fontWeight:700, fontSize:14,
        marginBottom:7 }}>Budget-Positionen</div>
      {budgetPos.map((pos,i) => {
        const istGeld = pos.einheit === "€";
        return (
          <div key={pos.id} style={{ background:"var(--surface)", borderRadius:12,
            padding:"10px 16px", marginBottom:6,
            border:"1.5px solid var(--border)" }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:6 }}>
              <div style={{ color:"var(--text)", fontWeight:600, fontSize:13 }}>
                {pos.bezeichnung}
              </div>
              <div style={{ color:"var(--yellow)", fontWeight:800, fontSize:14 }}>
                {(pos.budget||0).toLocaleString("de-DE")} €
              </div>
            </div>

            {istGeld ? (
              <div style={{ display:"flex", gap:8 }}>
                <input type="number" value={pos.budget||""}
                  onChange={e => positionAendern(i, "budget", Number(e.target.value))}
                  placeholder="0"
                  style={{ flex:1, minWidth:0, ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
                <div style={{ color:"var(--muted)", fontSize:12, padding:"8px 0",
                  flexShrink:0 }}>{pos.einheit}</div>
              </div>
            ) : (
              // Menge × Einheitspreis statt eines einzelnen Felds — vorher
              // stand neben dem Eingabefeld zwar "m²"/"t"/"h", der Wert
              // wurde oben aber trotzdem 1:1 als € übernommen (120 m² →
              // "120 €"). Jetzt rechnet sich das Budget tatsächlich aus
              // beiden Werten zusammen.
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <input type="number" value={pos.menge||""}
                    onChange={e => positionAendern(i, "menge", Number(e.target.value))}
                    placeholder="0"
                    style={{ width:"100%", ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
                  <div style={{ color:"var(--muted)", fontSize:10, marginTop:2 }}>Menge ({pos.einheit})</div>
                </div>
                <div style={{ color:"var(--muted)", fontSize:13, flexShrink:0, paddingTop:8 }}>×</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <input type="number" value={pos.einheitspreis||""}
                    onChange={e => positionAendern(i, "einheitspreis", Number(e.target.value))}
                    placeholder="0"
                    style={{ width:"100%", ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
                  <div style={{ color:"var(--muted)", fontSize:10, marginTop:2 }}>€ / {pos.einheit}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button onClick={jetztSpeichern} disabled={speichern}
        style={{ width:"100%", background: "var(--yellow)", color:"#1a1200",
          border:"none", borderRadius:12, padding:14, fontWeight:800,
          cursor: speichern ? "default" : "pointer", fontSize:15,
          fontFamily:"inherit", marginTop:4,
          display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
        {gespeichertOk ? <><Check size={16} /> Gespeichert</> : speichern ? <><Spinner size={14} /> Speichert…</> : "Speichern"}
      </button>
    </div>
  );
}
