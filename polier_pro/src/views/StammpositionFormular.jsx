import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { KALKULATIONSPREIS_KATEGORIEN } from "./KalkulationspreisFormular.jsx";
import { leereStammposition, stammpositionEp, stammpositionZeitansatz, variablenWerte, zeilenMenge, formelFehler } from "../lib/stammpositionen.js";
import { useFormularSchutz } from "../hooks/useUngespeichert.js";

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
export function StammpositionFormular({ initial, kalkulationspreise = [], standardZuschlaege, stammpositionen = [], onSave, onClose }) {
  const [sp, setSp] = useState(() => ({ ...leereStammposition(), ...(initial || {}) }));
  // Rückfrage beim Schließen mit ungespeicherten Änderungen (lib/ungespeichert.js)
  const schutz = useFormularSchutz(sp, { titel: "Die Stammposition" });
  const gueltig = sp.bez?.trim() && sp.einheit;
  const optionen = { stammpositionen };
  const ep = stammpositionEp(sp, kalkulationspreise, standardZuschlaege, optionen);
  const zeit = stammpositionZeitansatz(sp, kalkulationspreise, optionen);
  const werte = variablenWerte(sp, null);
  const bausteine = stammpositionen.filter(x => x.id !== sp.id);
  const variablen = sp.variablen || [];

  // Eine Zeile zeigt entweder eine Zahl oder eine Formel — die Eingabe
  // entscheidet: reine Zahl → mengeJeEinheit, sonst Formel.
  function mengeEingabe(i, text) {
    const zahlText = text.trim().replace(",", ".");
    if (zahlText === "" || /^-?\d*\.?\d+$/.test(zahlText)) zeileAendern(i, { mengeJeEinheit: zahl(text), formel: "", eingabe: text });
    else zeileAendern(i, { formel: text, eingabe: text });
  }
  function quelleAendern(i, wert) {
    const [typ, id] = wert.split(":");
    if (typ === "s") zeileAendern(i, { unterpositionId: Number(id), stammId: undefined });
    else zeileAendern(i, { stammId: Number(id), unterpositionId: undefined });
  }

  function zeileAendern(i, aenderung) {
    setSp(x => ({ ...x, rezeptur: x.rezeptur.map((z, j) => j === i ? { ...z, ...aenderung } : z) }));
  }
  function zeileHinzufuegen() {
    if (kalkulationspreise.length) setSp(x => ({ ...x, rezeptur: [...x.rezeptur, { stammId: kalkulationspreise[0].id, mengeJeEinheit: 0 }] }));
    else if (bausteine.length) setSp(x => ({ ...x, rezeptur: [...x.rezeptur, { unterpositionId: bausteine[0].id, mengeJeEinheit: 0 }] }));
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
        <button onClick={async () => { if (await schutz.pruefen()) onClose(); }} style={{ background:"none", border:"none",
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

      <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 12px", marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>Variablen (optional)</div>
          <button onClick={() => setSp(x => ({ ...x, variablen: [...(x.variablen || []), { name: "", bez: "", standard: 0 }] }))}
            style={{ background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:6,
              padding:"3px 9px", cursor:"pointer", fontSize:11.5, fontFamily:"inherit", display:"flex", alignItems:"center", gap:3 }}>
            <Plus size={11} /> Variable
          </button>
        </div>
        {variablen.length === 0 && (
          <div style={{ color:"var(--muted)", fontSize:11.5, lineHeight:1.4 }}>
            Z.B. Dicke d = 0,25 m. In der Rezeptur dann als Formel „d*1,02“ (m³ Beton je m²) verwenden. Im Angebot ist der Wert je Position änderbar.
          </div>
        )}
        {variablen.map((v, i) => (
          <div key={i} style={{ display:"grid", gridTemplateColumns:"56px 1fr 72px 24px", gap:5, marginBottom:5 }}>
            <input value={v.name} placeholder="d" onChange={e => setSp(x => ({ ...x, variablen: x.variablen.map((y, j) => j === i ? { ...y, name: e.target.value.replace(/[^a-zA-Z_]/g, "") } : y) }))}
              style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }} />
            <input value={v.bez} placeholder="Dicke in m" onChange={e => setSp(x => ({ ...x, variablen: x.variablen.map((y, j) => j === i ? { ...y, bez: e.target.value } : y) }))}
              style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }} />
            <input type="number" step="0.01" value={v.standard ?? ""} onChange={e => setSp(x => ({ ...x, variablen: x.variablen.map((y, j) => j === i ? { ...y, standard: zahl(e.target.value) } : y) }))}
              style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }} />
            <button onClick={() => setSp(x => ({ ...x, variablen: x.variablen.filter((_, j) => j !== i) }))}
              style={{ background:"var(--rbg)", color:"var(--red)", border:"none", borderRadius:6, height:28, cursor:"pointer" }}><X size={12} /></button>
          </div>
        ))}
      </div>

      <div style={{ background:"var(--surface2)", border:"1px solid var(--border)",
        borderRadius:12, padding:"10px 12px", marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>
            Rezeptur je {sp.einheit}
          </div>
          {(kalkulationspreise.length > 0 || bausteine.length > 0) && (
            <button onClick={zeileHinzufuegen}
              style={{ background:"var(--surface)", border:"1px solid var(--border)",
                color:"var(--text)", borderRadius:6, padding:"3px 9px", cursor:"pointer",
                fontSize:11.5, fontFamily:"inherit", display:"flex", alignItems:"center", gap:3 }}>
              <Plus size={11} /> Zeile
            </button>
          )}
        </div>
        {kalkulationspreise.length === 0 && bausteine.length === 0 && (
          <div style={{ color:"var(--muted)", fontSize:12 }}>
            Erst unter „Kalkulationspreise“ Lohn, Material und Geräte anlegen.
          </div>
        )}
        {sp.rezeptur.map((z, i) => {
          const stamm = kalkulationspreise.find(k => k.id === z.stammId);
          const fehler = formelFehler(z, werte);
          const anzeige = z.eingabe ?? (z.formel || (z.mengeJeEinheit ? String(z.mengeJeEinheit).replace(".", ",") : ""));
          return (
            <div key={i} style={{ marginBottom:6 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 92px 24px", gap:5, alignItems:"center" }}>
                <select value={z.unterpositionId != null ? `s:${z.unterpositionId}` : `k:${z.stammId}`} onChange={e => quelleAendern(i, e.target.value)}
                  style={{ ...inputStyle(), padding:"6px 8px", fontSize:12 }}>
                  {KALKULATIONSPREIS_KATEGORIEN.map(([kKey, kLabel]) => {
                    const gruppe = kalkulationspreise.filter(k => k.kategorie === kKey);
                    if (!gruppe.length) return null;
                    return (
                      <optgroup key={kKey} label={kLabel}>
                        {gruppe.map(k => <option key={k.id} value={`k:${k.id}`}>{k.bezeichnung} ({euro(k.preis)} €/{k.einheit})</option>)}
                      </optgroup>
                    );
                  })}
                  {bausteine.length > 0 && (
                    <optgroup label="Baustein (Stammposition)">
                      {bausteine.map(b => <option key={b.id} value={`s:${b.id}`}>{b.bez} (je {b.einheit})</option>)}
                    </optgroup>
                  )}
                </select>
                <input value={anzeige} onChange={e => mengeEingabe(i, e.target.value)}
                  placeholder={z.unterpositionId != null ? "Menge" : (stamm?.einheit || "Menge")}
                  style={{ ...inputStyle(), padding:"6px 8px", fontSize:12, borderColor: fehler ? "var(--red)" : undefined }} />
                <button onClick={() => zeileEntfernen(i)}
                  style={{ background:"var(--rbg)", color:"var(--red)", border:"none", borderRadius:6,
                    height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <X size={12} />
                </button>
              </div>
              {z.formel && (
                <div style={{ fontSize:11, marginTop:2, color: fehler ? "var(--red)" : "var(--muted)" }}>
                  {fehler ? `Formel: ${fehler}` : `= ${zeilenMenge(z, werte).toLocaleString("de-DE", { maximumFractionDigits: 4 })} bei Standardwerten`}
                </div>
              )}
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
        <button onClick={async () => { if (await schutz.pruefen()) onClose(); }} style={{ flex:1, background:"var(--surface2)",
          color:"var(--muted)", border:"1.5px solid var(--border)", borderRadius:12,
          padding:13, cursor:"pointer", fontFamily:"inherit" }}>Abbrechen</button>
        <button onClick={() => gueltig && onSave({ ...sp, rezeptur: sp.rezeptur.map(({ eingabe, ...z }) => z),
          variablen: variablen.filter(v => v.name) })} disabled={!gueltig}
          style={{ flex:2, background: gueltig ? "var(--yellow)" : "var(--surface2)",
            color: gueltig ? "#1a1200" : "var(--muted)",
            border:"none", borderRadius:12, padding:13, fontWeight:800,
            cursor: gueltig ? "pointer" : "default", fontFamily:"inherit" }}>Speichern</button>
      </div>
    </div>
  );
}
