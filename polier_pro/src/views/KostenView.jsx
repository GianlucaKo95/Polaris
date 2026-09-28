import { useState } from "react";
import { Euro, Check } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { sbProjektKostenSpeichern } from "../lib/supabase.js";
import { Spinner } from "../components/Spinner.jsx";

export function KostenView({ projekt, aufgaben, kolonnen, zeitbuchungen, session, onKostenGespeichert }) {
  const [budgetPos, setBudgetPos] = useState(projekt?.budget_positionen?.length ? projekt.budget_positionen : [
    { id:1, bezeichnung:"Betonarbeiten",    budget:0, einheit:"m²" },
    { id:2, bezeichnung:"Schalung",         budget:0, einheit:"m²" },
    { id:3, bezeichnung:"Bewehrung",        budget:0, einheit:"t"  },
    { id:4, bezeichnung:"Sonstige Arbeit",  budget:0, einheit:"h"  },
    { id:5, bezeichnung:"Material",         budget:0, einheit:"€"  },
  ]);
  const [editPos, setEditPos] = useState(null);
  const [stundensatz, setStundensatz] = useState(projekt?.stundensatz ?? 55); // €/h Default
  const [speichern, setSpeichern] = useState(false);
  const [gespeichertOk, setGespeichertOk] = useState(false);

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
            ["Budget gesamt",  `${budgetGesamt.toLocaleString("de-DE")} €`, "var(--text)"],
            ["Ist bisher",     `${istGesamt.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,".").replace(".",",")} €`, auslastung>80?"var(--red)":"var(--green)"],
            ["Rest-Budget",    `${restBudget.toFixed(0)} €`, restBudget<0?"var(--red)":"var(--green)"],
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

      {/* Budget-Positionen */}
      <div style={{ color:"var(--text)", fontWeight:700, fontSize:14,
        marginBottom:7 }}>Budget-Positionen</div>
      {budgetPos.map((pos,i) => (
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
          <div style={{ display:"flex", gap:8 }}>
            <input type="number" value={pos.budget||""}
              onChange={e => setBudgetPos(prev => prev.map((p,j) =>
                j===i ? { ...p, budget:Number(e.target.value) } : p))}
              placeholder="0"
              style={{ flex:1, ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
            <div style={{ color:"var(--muted)", fontSize:12, padding:"8px 0",
              flexShrink:0 }}>{pos.einheit}</div>
          </div>
        </div>
      ))}

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
