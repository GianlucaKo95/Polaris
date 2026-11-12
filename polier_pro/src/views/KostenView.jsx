import { useState } from "react";
import { Euro, Check, FileText, Calculator, Gauge } from "lucide-react";
import { Label, inputStyle } from "../components/Label.jsx";
import { sbProjektKostenSpeichern } from "../lib/supabase.js";
import { Spinner } from "../components/Spinner.jsx";
import { kalkulationSollAufschluesselung } from "../lib/kalkulation.js";
import { useIstDesktop } from "../hooks/useIstDesktop.js";
import { leistungsfaktor, zeitansaetzeAnpassen } from "../lib/nachkalkulation.js";

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

export function KostenView({ projekt, aufgaben, kolonnen, zeitbuchungen, angebote, kalkulationspreise = [], baufortschritt = [], stammpositionen = [], setStammpositionen = null, istAdmin = false, session, onKostenGespeichert }) {
  const istDesktop = useIstDesktop();
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

  // Kalkulations-Soll (Vorkalkulation) aus den kalkulierten Positionen der
  // angenommenen Angebote, je Kostenart — siehe lib/kalkulation.js. Nur für
  // Lohn gibt es bisher eine echte Ist-Erfassung (Zeitbuchungen), Material/
  // Gerät/Fremdleistung zeigen daher bewusst nur den Soll-Wert statt eine
  // erfundene Ist-Zahl.
  const kalkSoll = kalkulationSollAufschluesselung(angenommeneAngebote, kalkulationspreise);
  const kalkSollGesamt = kalkSoll.lohn + kalkSoll.material + kalkSoll.geraet + kalkSoll.fremdleistung + kalkSoll.zuschlag;

  // Nachkalkulation (lib/nachkalkulation.js): Ist-Stunden gegen die
  // Soll-Stunden der bisher erbrachten Leistung → Leistungsfaktor, der auf
  // Wunsch in die Zeitansätze der verwendeten Stammpositionen zurückfließt.
  const fortschrittJeAngebot = (baufortschritt || []).reduce((m, e) => {
    (m[e.angebot_id] ||= []).push(e); return m;
  }, {});
  const nk = leistungsfaktor({ angebote: angenommeneAngebote, fortschritt: fortschrittJeAngebot, zeitbuchungen, kalkulationspreise });
  const nkStammpositionen = stammpositionen.filter(s => nk.stammpositionIds.includes(s.id));
  const [nkUebernommen, setNkUebernommen] = useState(false);
  function nkUebernehmen() {
    if (!setStammpositionen || !nk.faktor) return;
    if (!window.confirm(`Zeitansätze (Lohnstunden) von ${nkStammpositionen.length} Stammposition(en) mit Faktor ${nk.faktor.toLocaleString("de-DE", { maximumFractionDigits: 2 })} anpassen?`)) return;
    setStammpositionen(prev => zeitansaetzeAnpassen(prev, nk.stammpositionIds, nk.faktor, kalkulationspreise, { projekt: projekt?.name || "" }));
    setNkUebernommen(true);
  }

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
      {/* Übersicht — Desktop: vier Kennzahlen und eine ruhige Auslastungslinie */}
      {istDesktop && (
        <div style={{ marginBottom:24 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", gap:16 }}>
            {[
              ["Budget gesamt", euro(budgetGesamt), null],
              ["Ist bisher", euro(istGesamt), `${stundenGesamt.toLocaleString("de-DE", { minimumFractionDigits:1, maximumFractionDigits:1 })} h × ${stundensatz} €/h`],
              ["Rest-Budget", euro(restBudget), restBudget < 0 ? "über Budget" : null],
              ["Auslastung", `${auslastung} %`, budgetGesamt > 0 ? null : "noch kein Budget"],
            ].map(([l, v, u], i) => (
              <div key={l} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
                <div style={{ fontSize:13, color:"var(--text2)" }}>{l}</div>
                <div className="num" style={{ fontFamily:"var(--font-zahl)", fontSize:24, lineHeight:"32px", marginTop:8,
                  color: (i === 2 && restBudget < 0) || (i === 3 && auslastung > 90) ? "var(--red)" : "var(--text)" }}>{v}</div>
                <div style={{ fontSize:13, color: i === 2 && restBudget < 0 ? "var(--red)" : "var(--muted)", marginTop:4, minHeight:20 }}>{u}</div>
              </div>
            ))}
          </div>
          {budgetGesamt > 0 && (
            <div aria-hidden="true" style={{ height:4, borderRadius:2, background:"var(--surface2)", marginTop:16, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.min(100, auslastung)}%`, background: auslastung > 90 ? "var(--red)" : "var(--akzent)" }} />
            </div>
          )}
        </div>
      )}
      {!istDesktop && <div style={{ background:"var(--surface)", borderRadius:16, padding:13,
        marginBottom:12, border:"1.5px solid var(--border)" }}>
        <div style={{ color:"var(--text)", fontWeight:700, fontSize:15,
          marginBottom:10, display:"flex", alignItems:"center", gap:7 }}><Euro size={16} /> Kostenübersicht</div>
        <div style={{ display:"grid", gridTemplateColumns: istDesktop ? "repeat(4, minmax(0, 1fr))" : "1fr 1fr", gap:10,
          marginBottom:10 }}>
          {[
            ["Budget gesamt",  euro(budgetGesamt), "var(--text)"],
            ["Ist bisher",     euro(istGesamt), auslastung>80?"var(--red)": istDesktop ? "var(--text)" : "var(--green)"],
            ["Rest-Budget",    euro(restBudget), restBudget<0?"var(--red)": istDesktop ? "var(--text)" : "var(--green)"],
            ["Stunden",        `${stundenGesamt.toLocaleString("de-DE", { minimumFractionDigits:1, maximumFractionDigits:1 })} h`, istDesktop ? "var(--text)" : "var(--blue)"],
          ].map(([l,v,c]) => (
            <div key={l} style={{ background:"var(--surface2)", borderRadius:12,
              padding:"9px 14px", border:"1px solid var(--border)" }}>
              <div style={{ color:"var(--muted)", fontSize:10, fontWeight:700,
                textTransform:"uppercase", marginBottom:4 }}>{l}</div>
              <div style={{ color:c, fontWeight:900, fontSize:18, fontFamily: istDesktop ? "var(--font-zahl)" : undefined, fontVariantNumeric:"tabular-nums" }}>{v}</div>
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
      </div>}

      {/* Kalkulationsübersicht (Soll) — nur anzeigen, wenn es überhaupt
          kalkulierte Positionen gibt, sonst unnötige Leerkarte für Nutzer,
          die den EP noch direkt eingeben. */}
      {kalkSollGesamt > 0 && (
        <div style={{ background:"var(--surface)", borderRadius:16, padding:13,
          marginBottom:12, border:"1.5px solid var(--border)" }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:15,
            marginBottom:10, display:"flex", alignItems:"center", gap:7 }}>
            <Calculator size={16} /> Kalkulation (Soll)
          </div>
          {[
            ["Lohn", kalkSoll.lohn, istArbeit],
            ["Material", kalkSoll.material, null],
            ["Gerät", kalkSoll.geraet, null],
            ["Fremdleistung", kalkSoll.fremdleistung, null],
            ["Zuschlag (Gemeinkosten/Wagnis/Gewinn)", kalkSoll.zuschlag, null],
          ].filter(([,soll]) => soll > 0).map(([label, soll, ist]) => (
            <div key={label} style={{ display:"flex", justifyContent:"space-between",
              alignItems:"baseline", padding:"5px 0", borderBottom:"1px solid var(--border)",
              fontSize:12.5 }}>
              <span style={{ color:"var(--muted)" }}>{label}</span>
              <span>
                <span style={{ color:"var(--text)", fontWeight:700 }}>{euro(soll)}</span>
                {ist != null
                  ? <span style={{ color: ist > soll ? "var(--red)" : "var(--green)", marginLeft:8 }}>
                      (Ist: {euro(ist)})
                    </span>
                  : <span style={{ color:"var(--muted)", marginLeft:8, fontSize:11 }}>(keine Ist-Erfassung)</span>}
              </span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", paddingTop:8, fontWeight:800, fontSize:13.5 }}>
            <span>Summe Soll</span>
            <span style={{ color:"var(--yellow)" }}>{euro(kalkSollGesamt)}</span>
          </div>
        </div>
      )}

      {nk.sollStunden > 0 && (
        <div style={{ background:"var(--surface)", borderRadius:16, padding:13,
          marginBottom:12, border:"1.5px solid var(--border)" }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:15,
            marginBottom:8, display:"flex", alignItems:"center", gap:7 }}>
            <Gauge size={16} /> Nachkalkulation Stunden
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:12 }}>
            <div><div style={{ color:"var(--muted)" }}>Soll (erbracht)</div><div style={{ fontWeight:800 }}>{Math.round(nk.sollStunden).toLocaleString("de-DE")} h</div></div>
            <div><div style={{ color:"var(--muted)" }}>Ist</div><div style={{ fontWeight:800 }}>{Math.round(nk.istStunden).toLocaleString("de-DE")} h</div></div>
            <div><div style={{ color:"var(--muted)" }}>Leistungsfaktor</div>
              <div style={{ fontWeight:800, color: nk.faktor == null ? "var(--muted)" : nk.faktor > 1.1 ? "var(--red)" : nk.faktor < 0.9 ? "var(--green)" : "var(--text)" }}>
                {nk.faktor == null ? "—" : nk.faktor.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
              </div></div>
          </div>
          <div style={{ color:"var(--muted)", fontSize:11.5, marginTop:8, lineHeight:1.4 }}>
            {nk.hinweis || (nk.faktor > 1
              ? `${Math.round((nk.faktor - 1) * 100)} % mehr Stunden gebraucht als kalkuliert.`
              : `${Math.round((1 - nk.faktor) * 100)} % weniger Stunden gebraucht als kalkuliert.`)}
            {" "}Soll = Lohnstunden der Kalkulation × Leistungsstand je Position.
          </div>
          {istAdmin && nk.faktor != null && nkStammpositionen.length > 0 && setStammpositionen && (
            <button onClick={nkUebernehmen} disabled={nkUebernommen}
              style={{ width:"100%", marginTop:10, background: nkUebernommen ? "var(--gbg)" : "var(--surface2)",
                color: nkUebernommen ? "var(--green)" : "var(--text)", border:"1.5px solid var(--border)", borderRadius:10,
                padding:10, fontWeight:700, fontSize:12.5, cursor: nkUebernommen ? "default" : "pointer", fontFamily:"inherit" }}>
              {nkUebernommen ? "✓ Zeitansätze angepasst"
                : `Zeitansätze von ${nkStammpositionen.length} Stammposition(en) übernehmen`}
            </button>
          )}
        </div>
      )}

      {/* Stundensatz (Desktop: im Kopf der Budget-Tabelle) */}
      {!istDesktop && <div style={{ background:"var(--surface)", borderRadius:12, padding:10,
        marginBottom:10, border:"1.5px solid var(--border)" }}>
        <Label>Stundensatz (€/h)</Label>
        <input type="number" value={stundensatz}
          onChange={e=>setStundensatz(Number(e.target.value))}
          style={{ ...inputStyle(), marginTop:6 }} />
        <div style={{ color:"var(--muted)", fontSize:11, marginTop:4 }}>
          Basis für Ist-Kostenberechnung aus GPS-Zeiterfassung
        </div>
      </div>}

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

      {/* Budget-Positionen — Desktop: Tabelle mit Feldern, die erst beim Zeigen als Feld erscheinen */}
      {istDesktop && (
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, marginBottom:12 }}>
            <h2 style={{ margin:0, fontSize:16, lineHeight:"24px", fontWeight:500 }}>Budget-Positionen</h2>
            <label style={{ display:"flex", alignItems:"center", gap:8, color:"var(--text2)" }} title="Basis für die Ist-Kosten aus der Zeiterfassung">
              Stundensatz
              <input type="number" className="desk-feld" value={stundensatz} onChange={e => setStundensatz(Number(e.target.value))}
                style={{ width:72, textAlign:"right", fontFamily:"var(--font-zahl)", border:"1px solid var(--border2)" }} />
              €/h
            </label>
          </div>
          <div className="listen-gruppe lv-tabelle">
            <div aria-hidden="true" style={{ display:"grid", gridTemplateColumns: KOSTEN_SPALTEN, gap:16, fontSize:13, color:"var(--text2)" }}>
              <span>Position</span><span style={{ textAlign:"right" }}>Menge</span><span>Einheit</span><span style={{ textAlign:"right" }}>Preis je Einheit</span><span style={{ textAlign:"right" }}>Budget</span>
            </div>
            {budgetPos.map((pos, i) => {
              const istGeld = pos.einheit === "€";
              const zahl = { textAlign:"right", fontFamily:"var(--font-zahl)", width:"100%" };
              return (
                <div key={pos.id} style={{ display:"grid", gridTemplateColumns: KOSTEN_SPALTEN, gap:16, alignItems:"center" }}>
                  <span>{pos.bezeichnung}</span>
                  {istGeld ? <span /> : (
                    <input type="number" className="desk-feld" aria-label={`Menge ${pos.bezeichnung}`} value={pos.menge || ""} placeholder="0"
                      onChange={e => positionAendern(i, "menge", Number(e.target.value))} style={zahl} />
                  )}
                  <span style={{ color:"var(--text2)" }}>{istGeld ? "pauschal" : pos.einheit}</span>
                  {istGeld ? (
                    <input type="number" className="desk-feld" aria-label={`Betrag ${pos.bezeichnung}`} value={pos.budget || ""} placeholder="0"
                      onChange={e => positionAendern(i, "budget", Number(e.target.value))} style={zahl} />
                  ) : (
                    <input type="number" className="desk-feld" aria-label={`Preis je ${pos.einheit} ${pos.bezeichnung}`} value={pos.einheitspreis || ""} placeholder="0"
                      onChange={e => positionAendern(i, "einheitspreis", Number(e.target.value))} style={zahl} />
                  )}
                  <span className="num" style={{ textAlign:"right", fontFamily:"var(--font-zahl)" }}>{euro(pos.budget || 0)}</span>
                </div>
              );
            })}
            <div style={{ display:"grid", gridTemplateColumns: KOSTEN_SPALTEN, gap:16, alignItems:"center" }}>
              <span style={{ fontWeight:500 }}>Summe</span><span /><span /><span />
              <span className="num" style={{ textAlign:"right", fontFamily:"var(--font-zahl)", fontWeight:500 }}>{euro(budgetGesamt)}</span>
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
            <button onClick={jetztSpeichern} disabled={speichern}
              style={{ height:40, padding:"0 16px", borderRadius:8, border:"none", background:"var(--text)", color:"var(--surface)",
                fontFamily:"inherit", fontSize:14, fontWeight:500, cursor: speichern ? "default" : "pointer", display:"flex", alignItems:"center", gap:8 }}>
              {gespeichertOk ? <><Check size={16} strokeWidth={1.5} /> Gespeichert</> : speichern ? <><Spinner size={14} /> Speichert</> : "Budget speichern"}
            </button>
          </div>
        </div>
      )}
      {!istDesktop && <>
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
      </>}
    </div>
  );
}

// Desktop-Budgettabelle: Position · Menge · Einheit · Preis je Einheit · Budget
const KOSTEN_SPALTEN = "minmax(0, 1fr) 120px 96px 144px 144px";
