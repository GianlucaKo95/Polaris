import { Plus, X, TriangleAlert } from "lucide-react";
import { mittellohnBerechnen, geraetekostenJeStunde } from "../lib/kalkulationsgrundlagen.js";
import { STANDARD_DATEV } from "../lib/datev.js";

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

  if (typeof document !== "undefined" && document.documentElement.dataset.layout === "desktop") {
    return <DeskGrundlagen grundlagen={grundlagen} onChange={onChange} status={status} ml={ml} erg={erg} setMl={setMl} gruppen={gruppen} geraete={geraete} setGeraet={setGeraet} />;
  }

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

      {(() => {
        const d = { ...STANDARD_DATEV, ...(grundlagen.datev || {}) };
        const setD = (k, v) => onChange({ ...grundlagen, datev: { ...(grundlagen.datev || {}), [k]: v } });
        const textFeld = (label, k, ph) => (
          <div><div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>{label}</div>
            <input value={d[k] ?? ""} placeholder={ph} onChange={e => setD(k, e.target.value.trim())} style={feld} /></div>
        );
        return (
          <div style={karte}>
            <div style={titel}>DATEV-Export (Rechnungen, Eingangsrechnungen, Zahlungen)</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {textFeld("Beraternummer", "beraternummer", "vom Steuerberater")}
              {textFeld("Mandantennummer", "mandantennummer", "vom Steuerberater")}
              {textFeld("Debitorenkonto", "debitorenkonto", "10000")}
              {textFeld("Erlöskonto", "erloeskonto", "8400")}
              {textFeld("Kontenrahmen (03/04)", "kontenrahmen", "03")}
              {textFeld("Beginn Wirtschaftsjahr", "wjBeginn", "2026-01-01")}
              {textFeld("Kreditorenkonto", "kreditorenkonto", "70000")}
              {textFeld("Aufwand Material", "aufwandskonto", "3400")}
              {textFeld("Aufwand Subunternehmer", "nuAufwandskonto", "3100")}
              {textFeld("Bankkonto", "bankkonto", "1200")}
            </div>
            <div style={{ color:"var(--muted)", fontSize:11, marginTop:6, lineHeight:1.4 }}>
              Bauleistungen an Bauunternehmer (§ 13b UStG) brauchen ein eigenes Erlöskonto — mit dem Steuerberater abstimmen.
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Desktop: Tabellen statt gestapelter Handy-Felder ─────────────────────
// Felder erscheinen erst beim Zeigen als Feld (.desk-feld), Zahlen rechtsbündig
// in Plex Mono, Ergebnisse als Zahl am Zeilenende.
const LOHN_SPALTEN = "minmax(0, 1fr) 96px 128px 32px";
const GERAET_SPALTEN = "minmax(0, 1fr) 120px 88px 88px 88px 88px 88px 104px 32px";
const zahlFeld = { width:"100%", textAlign:"right", fontFamily:"var(--font-zahl)" };
const h2 = { margin:"0 0 4px", fontSize:16, lineHeight:"24px", fontWeight:500 };
const hinweis = { color:"var(--text2)", margin:"0 0 12px", maxWidth:720 };
const kopf = { fontSize:13, color:"var(--text2)" };
const leiseKnopf = { height:32, padding:"0 12px", marginTop:12, borderRadius:8, border:"1px solid var(--border2)", background:"var(--surface)",
  color:"var(--text)", fontFamily:"inherit", fontSize:14, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 };

function DeskZahl({ label, value, onChange, suffix, breite = 96 }) {
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <span style={{ fontSize:13, color:"var(--text2)" }}>{label}</span>
      <span style={{ display:"flex", alignItems:"center", gap:8 }}>
        <input type="number" step="0.01" className="desk-feld" value={value ?? ""} onChange={e => onChange(num(e.target.value))}
          style={{ ...zahlFeld, width:breite, border:"1px solid var(--border2)", height:36 }} />
        {suffix && <span style={{ color:"var(--muted)" }}>{suffix}</span>}
      </span>
    </label>
  );
}

function DeskGrundlagen({ grundlagen, onChange, status, ml, erg, setMl, gruppen, geraete, setGeraet }) {
  const d = { ...STANDARD_DATEV, ...(grundlagen.datev || {}) };
  const setD = (k, v) => onChange({ ...grundlagen, datev: { ...(grundlagen.datev || {}), [k]: v } });
  const loeschen = (aktion, was) => (
    <button className="zeilen-knopf loeschen" onClick={aktion} aria-label={`${was} entfernen`} title={`${was} entfernen`}><X size={16} strokeWidth={1.5} /></button>
  );
  return (
    <div className="lv-tabelle" style={{ display:"flex", flexDirection:"column", gap:32 }}>
      {status === "fehlt" && (
        <div style={{ color:"var(--akzent)", display:"flex", gap:8, alignItems:"center" }}>
          <TriangleAlert size={16} strokeWidth={1.5} /> Bitte supabase-kalkulation.sql ausführen, bis dahin wird hier nichts gespeichert
        </div>
      )}

      <section>
        <h2 style={h2}>Mittellohn</h2>
        <p style={hinweis}>Lohngruppen mit Anzahl und Stundenlohn ergeben den Mittellohn, Zuschläge darauf den Kalkulationslohn.</p>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(0, 640px) minmax(0, 1fr)", gap:24, alignItems:"start" }}>
          <div>
            <div className="listen-gruppe">
              <div aria-hidden="true" style={{ display:"grid", gridTemplateColumns: LOHN_SPALTEN, gap:16, ...kopf }}>
                <span>Lohngruppe</span><span style={{ textAlign:"right" }}>Anzahl</span><span style={{ textAlign:"right" }}>Stundenlohn</span><span />
              </div>
              {gruppen.map((g, i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns: LOHN_SPALTEN, gap:16, alignItems:"center" }}>
                  <input className="desk-feld" value={g.bez || ""} placeholder="z. B. Facharbeiter" aria-label="Lohngruppe"
                    onChange={e => setMl({ lohngruppen: gruppen.map((x, j) => j === i ? { ...x, bez: e.target.value } : x) })} style={{ width:"100%" }} />
                  <input type="number" className="desk-feld" value={g.anzahl ?? ""} aria-label="Anzahl"
                    onChange={e => setMl({ lohngruppen: gruppen.map((x, j) => j === i ? { ...x, anzahl: num(e.target.value) } : x) })} style={zahlFeld} />
                  <input type="number" step="0.01" className="desk-feld" value={g.stundenlohn ?? ""} aria-label="Stundenlohn in Euro"
                    onChange={e => setMl({ lohngruppen: gruppen.map((x, j) => j === i ? { ...x, stundenlohn: num(e.target.value) } : x) })} style={zahlFeld} />
                  {loeschen(() => setMl({ lohngruppen: gruppen.filter((_, j) => j !== i) }), "Lohngruppe")}
                </div>
              ))}
              {!gruppen.length && <div style={{ color:"var(--text2)" }}>Noch keine Lohngruppe</div>}
            </div>
            <button onClick={() => setMl({ lohngruppen: [...gruppen, { bez: "", anzahl: 1, stundenlohn: 0 }] })} style={leiseKnopf}>
              <Plus size={16} strokeWidth={1.5} /> Lohngruppe
            </button>
            <div style={{ display:"flex", gap:24, marginTop:24, flexWrap:"wrap" }}>
              <DeskZahl label="Zulagen" suffix="€/h" value={ml.zulagen} onChange={v => setMl({ zulagen: v })} />
              <DeskZahl label="Sozialkosten" suffix="%" value={ml.sozialkostenProzent} onChange={v => setMl({ sozialkostenProzent: v })} />
              <DeskZahl label="Lohnnebenkosten" suffix="€/h" value={ml.lohnnebenkosten} onChange={v => setMl({ lohnnebenkosten: v })} />
            </div>
          </div>
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
            {[["Mittellohn", erg.mittellohn, "€/h"], ["Sozialkosten", erg.sozialkosten, "€/h"], ["Lohnnebenkosten", erg.lohnnebenkosten, "€/h"]].map(([l, w, e]) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between", gap:16, lineHeight:"28px" }}>
                <span style={{ color:"var(--text2)" }}>{l}</span>
                <span className="num" style={{ fontFamily:"var(--font-zahl)" }}>{erg.koepfe > 0 ? `${euro(w)} ${e}` : "–"}</span>
              </div>
            ))}
            <div style={{ borderTop:"1px solid var(--border)", marginTop:8, paddingTop:12 }}>
              <div style={{ color:"var(--text2)" }}>Kalkulationslohn</div>
              <div className="num" style={{ fontFamily:"var(--font-zahl)", fontSize:24, lineHeight:"32px", marginTop:4, color: erg.koepfe > 0 ? "var(--akzent)" : "var(--muted)" }}>
                {erg.koepfe > 0 ? `${euro(erg.kalkulationslohn)} €/h` : "–"}
              </div>
              <div style={{ fontSize:13, color:"var(--muted)", marginTop:4 }}>steht als „Mittellohn (Kalkulationslohn)“ in den Kalkulationspreisen</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 style={h2}>Geräte</h2>
        <p style={hinweis}>Nach BGL: Kosten je Betriebsstunde = Neuwert × (A+V % + Reparatur %) ÷ Stunden im Monat + Verbrauch × Kraftstoffpreis</p>
        <div className="listen-gruppe">
          <div aria-hidden="true" style={{ display:"grid", gridTemplateColumns: GERAET_SPALTEN, gap:12, ...kopf }}>
            <span>Gerät</span><span style={{ textAlign:"right" }}>Neuwert €</span><span style={{ textAlign:"right" }}>A+V %/Mon.</span>
            <span style={{ textAlign:"right" }}>Rep. %/Mon.</span><span style={{ textAlign:"right" }}>h/Mon.</span><span style={{ textAlign:"right" }}>l/h</span>
            <span style={{ textAlign:"right" }}>€/l</span><span style={{ textAlign:"right" }}>€ je h</span><span />
          </div>
          {geraete.map((g, i) => {
            const k = geraetekostenJeStunde(g);
            const f = (feld, label) => (
              <input type="number" step="0.01" className="desk-feld" aria-label={label} value={g[feld] ?? ""} onChange={e => setGeraet(i, { [feld]: num(e.target.value) })} style={zahlFeld} />
            );
            return (
              <div key={g.id} style={{ display:"grid", gridTemplateColumns: GERAET_SPALTEN, gap:12, alignItems:"center" }}>
                <input className="desk-feld" value={g.bez || ""} placeholder="z. B. Hydraulikbagger 14 t" aria-label="Gerät" onChange={e => setGeraet(i, { bez: e.target.value })} style={{ width:"100%" }} />
                {f("neuwert", "Neuwert")}{f("avProzent", "Abschreibung und Verzinsung je Monat in Prozent")}{f("repProzent", "Reparatur je Monat in Prozent")}
                {f("stundenJeMonat", "Stunden je Monat")}{f("verbrauchJeH", "Verbrauch Liter je Stunde")}{f("betriebsstoffPreis", "Kraftstoffpreis je Liter")}
                <span className="num" title={`${euro(k.vorhaltung)} € Vorhaltung + ${euro(k.betriebsstoff)} € Betriebsstoff`}
                  style={{ fontFamily:"var(--font-zahl)", textAlign:"right" }}>{euro(k.gesamt)}</span>
                {loeschen(() => onChange({ ...grundlagen, geraete: geraete.filter((_, j) => j !== i) }), "Gerät")}
              </div>
            );
          })}
          {!geraete.length && <div style={{ color:"var(--text2)" }}>Noch kein Gerät</div>}
        </div>
        <button onClick={() => onChange({ ...grundlagen, geraete: [...geraete, { id: `g${Date.now()}`, bez: "", stundenJeMonat: 170 }] })} style={leiseKnopf}>
          <Plus size={16} strokeWidth={1.5} /> Gerät
        </button>
      </section>

      <section>
        <h2 style={h2}>DATEV-Export</h2>
        <p style={hinweis}>Für Rechnungen, Eingangsrechnungen und Zahlungen. Bauleistungen an Bauunternehmer (§ 13b UStG) brauchen ein eigenes Erlöskonto, mit dem Steuerberater abstimmen.</p>
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"20px", display:"grid", gridTemplateColumns:"repeat(5, minmax(0, 1fr))", gap:"16px 24px" }}>
          {[["Beraternummer", "beraternummer", "vom Steuerberater"], ["Mandantennummer", "mandantennummer", "vom Steuerberater"], ["Kontenrahmen", "kontenrahmen", "03"],
            ["Beginn Wirtschaftsjahr", "wjBeginn", "2026-01-01"], ["Bankkonto", "bankkonto", "1200"],
            ["Debitorenkonto", "debitorenkonto", "10000"], ["Erlöskonto", "erloeskonto", "8400"], ["Kreditorenkonto", "kreditorenkonto", "70000"],
            ["Aufwand Material", "aufwandskonto", "3400"], ["Aufwand Subunternehmer", "nuAufwandskonto", "3100"]].map(([l, k, ph]) => (
            <label key={k} style={{ display:"flex", flexDirection:"column", gap:4, minWidth:0 }}>
              <span style={{ fontSize:13, color:"var(--text2)" }}>{l}</span>
              <input className="desk-feld" value={d[k] ?? ""} placeholder={ph} onChange={e => setD(k, e.target.value.trim())}
                style={{ width:"100%", height:36, fontFamily:"var(--font-zahl)", border:"1px solid var(--border2)" }} />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
