import { Plus, X, TriangleAlert } from "lucide-react";
import { mittellohnBerechnen, geraetekostenJeStunde } from "../lib/kalkulationsgrundlagen.js";

const feld = { width:"100%", background:"var(--surface)", color:"var(--text)", border:"1.5px solid var(--border)",
  borderRadius:8, padding:"7px 9px", fontSize:12.5, boxSizing:"border-box", fontFamily:"inherit" };
const titel = { color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase", marginBottom:6 };
const karte = { background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 12px", marginBottom:12 };
const euro = n => (n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = v => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : 0; };

function Zahl({ label, value, onChange, suffix }) {
  return (
    <div>
      <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
        <input type="number" step="0.01" value={value ?? ""} onChange={e => onChange(num(e.target.value))} style={feld} />
        {suffix && <span style={{ color:"var(--muted)", fontSize:11 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// Mittellohn und Gerätekosten (lib/kalkulationsgrundlagen.js). Jede
// Änderung schreibt die abgeleiteten Kalkulationspreise neu (App.jsx).
export function KalkulationsgrundlagenPanel({ grundlagen, onChange, status }) {
  const ml = grundlagen.mittellohn || {};
  const geraete = grundlagen.geraete || [];
  const erg = mittellohnBerechnen(ml);
  const setMl = aenderung => onChange({ ...grundlagen, mittellohn: { ...ml, ...aenderung } });
  const gruppen = ml.lohngruppen || [];
  const setGeraet = (i, aenderung) => onChange({ ...grundlagen, geraete: geraete.map((g, j) => j === i ? { ...g, ...aenderung } : g) });

  return (
    <div>
      {status === "fehlt" && (
        <div style={{ background:"var(--ybg)", color:"var(--ydark)", borderRadius:10, padding:"9px 12px", fontSize:12, marginBottom:10, display:"flex", gap:7 }}>
          <TriangleAlert size={14} style={{ flexShrink:0, marginTop:1 }} /> Bitte supabase-kalkulation.sql ausführen — bis dahin wird hier nichts gespeichert.
        </div>
      )}

      <div style={karte}>
        <div style={titel}>Mittellohn</div>
        {gruppen.map((g, i) => (
          <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 56px 80px 24px", gap:5, marginBottom:5, alignItems:"end" }}>
            <input value={g.bez || ""} placeholder="Lohngruppe, z.B. Facharbeiter"
              onChange={e => setMl({ lohngruppen: gruppen.map((x, j) => j === i ? { ...x, bez: e.target.value } : x) })} style={feld} />
            <input type="number" value={g.anzahl ?? ""} placeholder="Anz."
              onChange={e => setMl({ lohngruppen: gruppen.map((x, j) => j === i ? { ...x, anzahl: num(e.target.value) } : x) })} style={feld} />
            <input type="number" step="0.01" value={g.stundenlohn ?? ""} placeholder="€/h"
              onChange={e => setMl({ lohngruppen: gruppen.map((x, j) => j === i ? { ...x, stundenlohn: num(e.target.value) } : x) })} style={feld} />
            <button onClick={() => setMl({ lohngruppen: gruppen.filter((_, j) => j !== i) })}
              style={{ background:"var(--rbg)", color:"var(--red)", border:"none", borderRadius:6, height:30, cursor:"pointer" }}><X size={12} /></button>
          </div>
        ))}
        <button onClick={() => setMl({ lohngruppen: [...gruppen, { bez: "", anzahl: 1, stundenlohn: 0 }] })}
          style={{ background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:6, padding:"4px 10px",
            cursor:"pointer", fontSize:11.5, fontFamily:"inherit", display:"flex", alignItems:"center", gap:3, marginBottom:8 }}>
          <Plus size={11} /> Lohngruppe
        </button>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
          <Zahl label="Zulagen" suffix="€/h" value={ml.zulagen} onChange={v => setMl({ zulagen: v })} />
          <Zahl label="Sozialkosten" suffix="%" value={ml.sozialkostenProzent} onChange={v => setMl({ sozialkostenProzent: v })} />
          <Zahl label="Lohnnebenkosten" suffix="€/h" value={ml.lohnnebenkosten} onChange={v => setMl({ lohnnebenkosten: v })} />
        </div>
        {erg.koepfe > 0 && (
          <div style={{ marginTop:10, fontSize:12, color:"var(--text)", lineHeight:1.6 }}>
            Mittellohn ML <b>{euro(erg.mittellohn)} €/h</b> · Sozialkosten {euro(erg.sozialkosten)} € · Lohnnebenkosten {euro(erg.lohnnebenkosten)} €
            <div>Kalkulationslohn KL <b style={{ color:"var(--yellow)" }}>{euro(erg.kalkulationslohn)} €/h</b> — steht als „Mittellohn (Kalkulationslohn)“ in den Kalkulationspreisen.</div>
          </div>
        )}
      </div>

      <div style={karte}>
        <div style={titel}>Geräte (BGL-Schema)</div>
        <div style={{ color:"var(--muted)", fontSize:11.5, marginBottom:8, lineHeight:1.4 }}>
          Werte aus eurer Baugeräteliste: mittlerer Neuwert, monatliche Sätze für Abschreibung und Verzinsung sowie Reparatur.
          Kosten je Betriebsstunde = Neuwert × (A+V % + R %) ÷ Stunden im Monat + Betriebsstoffe.
        </div>
        {geraete.map((g, i) => {
          const k = geraetekostenJeStunde(g);
          return (
            <div key={g.id} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:8, marginBottom:7 }}>
              <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                <input value={g.bez || ""} placeholder="Gerät, z.B. Hydraulikbagger 14 t" onChange={e => setGeraet(i, { bez: e.target.value })} style={feld} />
                <button onClick={() => onChange({ ...grundlagen, geraete: geraete.filter((_, j) => j !== i) })}
                  style={{ background:"var(--rbg)", color:"var(--red)", border:"none", borderRadius:6, width:30, cursor:"pointer" }}><X size={12} /></button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                <Zahl label="Neuwert" suffix="€" value={g.neuwert} onChange={v => setGeraet(i, { neuwert: v })} />
                <Zahl label="A+V je Monat" suffix="%" value={g.avProzent} onChange={v => setGeraet(i, { avProzent: v })} />
                <Zahl label="Reparatur je Monat" suffix="%" value={g.repProzent} onChange={v => setGeraet(i, { repProzent: v })} />
                <Zahl label="Stunden je Monat" value={g.stundenJeMonat} onChange={v => setGeraet(i, { stundenJeMonat: v })} />
                <Zahl label="Verbrauch" suffix="l/h" value={g.verbrauchJeH} onChange={v => setGeraet(i, { verbrauchJeH: v })} />
                <Zahl label="Kraftstoff" suffix="€/l" value={g.betriebsstoffPreis} onChange={v => setGeraet(i, { betriebsstoffPreis: v })} />
              </div>
              <div style={{ fontSize:12, marginTop:6, color:"var(--text)" }}>
                {euro(k.vorhaltung)} € Vorhaltung + {euro(k.betriebsstoff)} € Betriebsstoff = <b>{euro(k.gesamt)} €/h</b>
              </div>
            </div>
          );
        })}
        <button onClick={() => onChange({ ...grundlagen, geraete: [...geraete, { id: `g${Date.now()}`, bez: "", stundenJeMonat: 170 }] })}
          style={{ background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:6, padding:"4px 10px",
            cursor:"pointer", fontSize:11.5, fontFamily:"inherit", display:"flex", alignItems:"center", gap:3 }}>
          <Plus size={11} /> Gerät
        </button>
      </div>
    </div>
  );
}
