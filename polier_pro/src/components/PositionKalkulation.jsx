import { Plus, X } from "lucide-react";
import { Label, inputStyle } from "./Label.jsx";
import {
  kalkulationAufschluesselung, kalkulationZuschlagProzent,
  kalkulationGesamtkosten, kalkulationEp,
} from "../lib/kalkulation.js";

const KATEGORIE_FELD = { lohn: "lohnposten", material: "materialposten", geraet: "geraetPosten" };

function PostenKategorie({ titel, kategorie, kalk, stammdaten, menge, gesperrt, onChange }) {
  const feld = KATEGORIE_FELD[kategorie];
  const posten = kalk[feld] || [];
  const auswahl = stammdaten.filter(s => s.kategorie === kategorie);

  function postenAendern(i, aenderung) {
    onChange({ ...kalk, [feld]: posten.map((p, j) => j === i ? { ...p, ...aenderung } : p) });
  }
  function postenEntfernen(i) {
    onChange({ ...kalk, [feld]: posten.filter((_, j) => j !== i) });
  }
  function postenHinzufuegen() {
    if (!auswahl.length) return;
    onChange({ ...kalk, [feld]: [...posten, { stammId: auswahl[0].id, menge: 0 }] });
  }

  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
        <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>{titel}</div>
        {!gesperrt && auswahl.length > 0 && (
          <button onClick={postenHinzufuegen}
            style={{ background:"var(--surface2)", border:"1px solid var(--border)",
              color:"var(--text)", borderRadius:6, padding:"2px 8px",
              cursor:"pointer", fontSize:11, fontFamily:"inherit", display:"flex", alignItems:"center", gap:3 }}>
            <Plus size={11} /> Posten
          </button>
        )}
      </div>
      {auswahl.length === 0 && (
        <div style={{ color:"var(--muted)", fontSize:11.5 }}>
          Keine {titel}-Preise hinterlegt (unter Angebots-Parameter → Kalkulationspreise anlegen).
        </div>
      )}
      {posten.map((p, i) => {
        const stamm = auswahl.find(s => s.id === p.stammId);
        return (
          <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 70px 24px", gap:5, marginBottom:4, alignItems:"center" }}>
            <select value={p.stammId} disabled={gesperrt}
              onChange={e => postenAendern(i, { stammId: Number(e.target.value) })}
              style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }}>
              {auswahl.map(s => <option key={s.id} value={s.id}>{s.bezeichnung}</option>)}
            </select>
            <input type="number" min="0" value={p.menge || ""} disabled={gesperrt}
              onChange={e => postenAendern(i, { menge: Number(e.target.value) })}
              placeholder={stamm?.einheit || ""}
              style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }} />
            {!gesperrt && (
              <button onClick={() => postenEntfernen(i)}
                style={{ background:"var(--rbg)", color:"var(--red)", border:"none",
                  borderRadius:6, padding:"4px", cursor:"pointer", display:"flex", justifyContent:"center" }}><X size={12} /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Inline-Panel für die EP-Kalkulation einer Position: Lohn-/Material-/
// Geräte-Posten aus den Kalkulations-Stammdaten zusammenstellen, direkte
// Fremdleistungskosten eintragen, drei getrennte Zuschlagssätze (Gemein-
// kosten/Wagnis/Gewinn) — der EP der Position wird daraus automatisch
// berechnet (siehe lib/kalkulation.js) statt direkt eingegeben zu werden.
export function PositionKalkulation({ kalk, stammdaten, menge, gesperrt, onChange }) {
  const aufschluesselung = kalkulationAufschluesselung(kalk, stammdaten);
  const einzelkosten = aufschluesselung.lohn + aufschluesselung.material + aufschluesselung.geraet + aufschluesselung.fremdleistung;
  const zuschlagProzent = kalkulationZuschlagProzent(kalk);
  const gesamtkosten = kalkulationGesamtkosten(kalk, stammdaten);
  const ep = kalkulationEp(kalk, stammdaten, menge);

  return (
    <div style={{ background:"var(--surface2)", borderRadius:10, padding:"10px 12px", marginTop:6 }}>
      <PostenKategorie titel="Lohn" kategorie="lohn" kalk={kalk} stammdaten={stammdaten} gesperrt={gesperrt}
        onChange={onChange} />
      <PostenKategorie titel="Material" kategorie="material" kalk={kalk} stammdaten={stammdaten} gesperrt={gesperrt}
        onChange={onChange} />
      <PostenKategorie titel="Gerät" kategorie="geraet" kalk={kalk} stammdaten={stammdaten} gesperrt={gesperrt}
        onChange={onChange} />

      <div style={{ marginBottom:10 }}>
        <Label>Fremdleistung (€, Gesamtbetrag)</Label>
        <input type="number" min="0" value={kalk.fremdleistung || ""} disabled={gesperrt}
          onChange={e => onChange({ ...kalk, fremdleistung: Number(e.target.value) })}
          placeholder="0" style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
      </div>

      <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase", marginBottom:5 }}>
        Zuschläge (%)
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:10 }}>
        {[["Gemeinkosten","zuschlagGemeinkosten"],["Wagnis","zuschlagWagnis"],["Gewinn","zuschlagGewinn"]].map(([l,k]) => (
          <div key={k}>
            <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>{l}</div>
            <input type="number" min="0" value={kalk[k] || ""} disabled={gesperrt}
              onChange={e => onChange({ ...kalk, [k]: Number(e.target.value) })}
              placeholder="0" style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
          </div>
        ))}
      </div>

      <div style={{ borderTop:"1px solid var(--border)", paddingTop:8, fontSize:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", color:"var(--muted)", marginBottom:2 }}>
          <span>Einzelkosten (Selbstkosten)</span>
          <span>{einzelkosten.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", color:"var(--muted)", marginBottom:2 }}>
          <span>+ Zuschlag ({zuschlagProzent.toLocaleString("de-DE")} %)</span>
          <span>{(gesamtkosten - einzelkosten).toLocaleString("de-DE",{minimumFractionDigits:2})} €</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontWeight:700, color:"var(--text)" }}>
          <span>= Gesamtkosten Position</span>
          <span>{gesamtkosten.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontWeight:800, color:"var(--yellow)", marginTop:4 }}>
          <span>→ EP (€/Einheit)</span>
          <span>{ep.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span>
        </div>
      </div>
    </div>
  );
}
