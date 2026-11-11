import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { KALKULATIONSPREIS_KATEGORIEN } from "./KalkulationspreisFormular.jsx";
import { leereStammposition, stammpositionEp, stammpositionZeitansatz } from "../lib/stammpositionen.js";

const EINHEITEN = ["m²", "m³", "m", "Stk", "t", "kg", "h", "Psch"];

function zahl(wert) {
  const n = Number(String(wert).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const euro = n => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Formular für eine Stammposition (lib/stammpositionen.js): Leistungstext
// plus Rezeptur je Mengeneinheit aus den Kalkulationspreisen. Der EP wird
// live aus Rezeptur und Standard-Zuschlägen gerechnet, damit der Nutzer
// sofort sieht, was ein Angebot mit dieser Position kosten würde.
export function StammpositionFormular({ initial, kalkulationspreise = [], standardZuschlaege, onSave, onClose }) {
  const [sp, setSp] = useState(() => ({ ...leereStammposition(), ...(initial || {}) }));
  const gueltig = sp.bez?.trim() && sp.einheit;
  const ep = stammpositionEp(sp, kalkulationspreise, standardZuschlaege);
  const zeit = stammpositionZeitansatz(sp, kalkulationspreise);

  function zeileAendern(i, aenderung) {
    setSp(x => ({ ...x, rezeptur: x.rezeptur.map((z, j) => j === i ? { ...z, ...aenderung } : z) }));
  }
  function zeileHinzufuegen() {
    if (!kalkulationspreise.length) return;
    setSp(x => ({ ...x, rezeptur: [...x.rezeptur, { stammId: kalkulationspreise[0].id, mengeJeEinheit: 0 }] }));
  }
  function zeileEntfernen(i) {
    setSp(x => ({ ...x, rezeptur: x.rezeptur.filter((_, j) => j !== i) }));
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        marginBottom:12, paddingTop:"calc(6px + env(safe-area-inset-top))",
        position:"sticky", top:0, background:"var(--surface)", zIndex:5 }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:16,
          display:"flex", alignItems:"center", gap:7 }}>
          {initial?.id ? <><Pencil size={15} /> Stammposition bearbeiten</> : <><Plus size={15} /> Neue Stammposition</>}
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none",
          color:"var(--muted)", fontSize:24, cursor:"pointer" }}>✕</button>
      </div>

      <div style={{ marginBottom:9 }}>
        <Label>Kurztext</Label>
        <input value={sp.bez} onChange={e => setSp(x => ({ ...x, bez: e.target.value }))}
          placeholder="z.B. Perimeterdämmung XPS 120 mm" style={inputStyle()} />
      </div>
      <div style={{ marginBottom:9 }}>
        <Label>Langtext (optional)</Label>
        <textarea value={sp.langtext || ""} rows={3}
          onChange={e => setSp(x => ({ ...x, langtext: e.target.value }))}
          placeholder="Ausführungsbeschreibung für das Angebot"
          style={{ ...inputStyle(), resize:"vertical" }} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10, marginBottom:12 }}>
        <div>
          <Label>Gewerk</Label>
          <input value={sp.gewerk || ""} onChange={e => setSp(x => ({ ...x, gewerk: e.target.value }))}
            placeholder="z.B. Abdichtung" style={inputStyle()} />
        </div>
        <div>
          <Label>Einheit</Label>
          <select value={sp.einheit} onChange={e => setSp(x => ({ ...x, einheit: e.target.value }))}
            style={{ ...inputStyle(), padding:"11px 12px" }}>
            {EINHEITEN.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div style={{ background:"var(--surface2)", border:"1px solid var(--border)",
        borderRadius:12, padding:"10px 12px", marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>
            Rezeptur je {sp.einheit}
          </div>
          {kalkulationspreise.length > 0 && (
            <button onClick={zeileHinzufuegen}
              style={{ background:"var(--surface)", border:"1px solid var(--border)",
                color:"var(--text)", borderRadius:6, padding:"3px 9px", cursor:"pointer",
                fontSize:11.5, fontFamily:"inherit", display:"flex", alignItems:"center", gap:3 }}>
              <Plus size={11} /> Zeile
            </button>
          )}
        </div>
        {kalkulationspreise.length === 0 && (
          <div style={{ color:"var(--muted)", fontSize:12 }}>
            Erst unter „Kalkulationspreise“ Lohn, Material und Geräte anlegen.
          </div>
        )}
        {sp.rezeptur.map((z, i) => {
          const stamm = kalkulationspreise.find(k => k.id === z.stammId);
          return (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 78px 24px", gap:5, marginBottom:5, alignItems:"center" }}>
              <select value={z.stammId} onChange={e => zeileAendern(i, { stammId: Number(e.target.value) })}
                style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }}>
                {KALKULATIONSPREIS_KATEGORIEN.map(([kKey, kLabel]) => {
                  const gruppe = kalkulationspreise.filter(k => k.kategorie === kKey);
                  if (!gruppe.length) return null;
                  return (
                    <optgroup key={kKey} label={kLabel}>
                      {gruppe.map(k => <option key={k.id} value={k.id}>{k.bezeichnung} ({euro(k.preis)} €/{k.einheit})</option>)}
                    </optgroup>
                  );
                })}
              </select>
              <input type="number" min="0" step="0.001" value={z.mengeJeEinheit || ""}
                onChange={e => zeileAendern(i, { mengeJeEinheit: zahl(e.target.value) })}
                placeholder={stamm?.einheit || ""} style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }} />
              <button onClick={() => zeileEntfernen(i)}
                style={{ background:"var(--rbg)", color:"var(--red)", border:"none", borderRadius:6,
                  height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <X size={12} />
              </button>
            </div>
          );
        })}
        <div style={{ marginTop:8 }}>
          <Label>Nachunternehmer / Fremdleistung (€ je {sp.einheit})</Label>
          <input type="number" min="0" step="0.01" value={sp.fremdleistungJeEinheit || ""}
            onChange={e => setSp(x => ({ ...x, fremdleistungJeEinheit: zahl(e.target.value) }))}
            placeholder="0" style={inputStyle()} />
        </div>
      </div>

      <div style={{ background:"var(--surface)", border:"1.5px solid var(--yellow)", borderRadius:12,
        padding:"10px 12px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ color:"var(--muted)", fontSize:12 }}>
          Zeitansatz {zeit.toLocaleString("de-DE", { maximumFractionDigits: 3 })} h/{sp.einheit}
          <div style={{ fontSize:11, marginTop:2 }}>inkl. Standard-Zuschlägen</div>
        </div>
        <div style={{ color:"var(--text)", fontWeight:800, fontSize:16 }}>{euro(ep)} €/{sp.einheit}</div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button onClick={onClose} style={{ flex:1, background:"var(--surface2)",
          color:"var(--muted)", border:"1.5px solid var(--border)", borderRadius:12,
          padding:13, cursor:"pointer", fontFamily:"inherit" }}>Abbrechen</button>
        <button onClick={() => gueltig && onSave(sp)} disabled={!gueltig}
          style={{ flex:2, background: gueltig ? "var(--yellow)" : "var(--surface2)",
            color: gueltig ? "#1a1200" : "var(--muted)",
            border:"none", borderRadius:12, padding:13, fontWeight:800,
            cursor: gueltig ? "pointer" : "default", fontFamily:"inherit" }}>Speichern</button>
      </div>
    </div>
  );
}
