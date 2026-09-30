import { useEffect, useRef, useState } from "react";
import { Calendar, TriangleAlert, Zap, Info } from "lucide-react";
import { daysBetween } from "../lib/utils.js";
import { terminprognose } from "../lib/terminkette.js";
import { AUFGABEN_STATUS } from "../config/konstanten.js";

export function GanttView({ felder, onAufgabeKlick }) {
  const [legendeOffen, setLegendeOffen] = useState(false);
  const DAY_W = 36;
  const heute = new Date();
  // Start des heutigen Tages (Uhrzeit genullt) — ein Feld mit faellig_am
  // von heute (Mitternacht) galt sonst ab der ersten Sekunde nach 0 Uhr
  // fälschlich schon als "0 Tage Verzug", weil new Date(faellig_am) gegen
  // die tatsächliche aktuelle Uhrzeit statt gegen den Tagesbeginn verglichen
  // wurde.
  const heuteStart = new Date(heute); heuteStart.setHours(0,0,0,0);
  const startDate = new Date(heute); startDate.setDate(startDate.getDate() - 14);
  const endDate   = new Date(heute); endDate.setDate(endDate.getDate() + 42);
  const totalDays = daysBetween(startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10));
  const scrollRef = useRef(null);

  // Kritischer Pfad + berechnetes Projektende aus Dauer + Abhängigkeiten —
  // über alle Aufgaben, nicht nur die mit gesetztem Fälligkeitsdatum, da
  // undatierte Aufgaben trotzdem Teil einer Abhängigkeitskette sein können.
  const { proAufgabe: terminketten, projektEnde, zielTermin, deltaTage } = terminprognose(felder);

  // Scroll to today on mount — bei größeren Balken (siehe DAY_W unten)
  // zeigt der sichtbare Ausschnitt dadurch von selbst nur eine knappe
  // Woche um "heute" herum, der Rest bleibt per Scroll erreichbar statt
  // wie zuvor auf einen Blick zusammengequetscht zu werden.
  useEffect(() => {
    if (scrollRef.current) {
      const todayOffset = daysBetween(startDate.toISOString().slice(0,10), heute.toISOString().slice(0,10));
      scrollRef.current.scrollLeft = todayOffset * DAY_W - 60;
    }
  }, []);

  // Generate day headers
  const days = [];
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const todayOffset = daysBetween(startDate.toISOString().slice(0,10), heute.toISOString().slice(0,10));

  return (
    <div>
      <div style={{ color: "var(--text)", fontWeight:700, marginBottom:9,
        display:"flex", alignItems:"center", gap:7 }}><Calendar size={16} /> Betonfeld-Terminplan</div>

      {/* Berechneter Fertigstellungstermin — aus Dauer + Abhängigkeiten,
          keine Schätzung. Nur sichtbar, wenn wenigstens eine Aufgabe ein
          Fälligkeitsdatum als Vergleichsziel hat. */}
      {zielTermin && (
        <div style={{ background: deltaTage > 0 ? "#2E1A1A" : "var(--gbg)", borderRadius:10,
          padding:"10px 14px", marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
          <Calendar size={15} color={deltaTage > 0 ? "var(--red)" : "var(--green)"} />
          <div style={{ fontSize:12.5, color: deltaTage > 0 ? "#FF9999" : "var(--green)" }}>
            <strong>Berechneter Fertigstellungstermin: {projektEnde.toLocaleDateString("de-DE")}</strong>
            {deltaTage > 0
              ? ` — ${deltaTage} Tag${deltaTage===1?"":"e"} später als geplant (Ziel: ${zielTermin.toLocaleDateString("de-DE")})`
              : " — im Plan"}
          </div>
        </div>
      )}

      {/* Legende — eingeklappt, damit nicht dauerhaft alle Farben/Symbole
          gleichzeitig sichtbar sind, sondern nur bei Bedarf. */}
      <button onClick={() => setLegendeOffen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:6, fontSize:11.5, color:"var(--muted)",
          background:"var(--surface)", border:"1px solid var(--border)", borderRadius:20,
          padding:"6px 12px", marginBottom:9, cursor:"pointer", fontFamily:"inherit" }}>
        <Info size={12} /> Legende &amp; Symbole
      </button>
      {legendeOffen && (
        <div style={{ display:"flex", gap:12, marginBottom:9, flexWrap:"wrap",
          background:"var(--surface2)", borderRadius:10, padding:"9px 12px" }}>
          {Object.entries(AUFGABEN_STATUS).map(([k,v]) => (
            <div key={k} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
              <div style={{ width:10, height:10, borderRadius:2, background: v.farbe }} />
              <span style={{ color: "var(--muted)" }}>{v.label}</span>
            </div>
          ))}
          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
            <Zap size={11} color="var(--yellow)" fill="var(--yellow)" />
            <span style={{ color: "var(--muted)" }}>Kritischer Pfad (kein Puffer)</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
            <span>⛓</span>
            <span style={{ color: "var(--muted)" }}>Wartet auf andere Aufgabe</span>
          </div>
        </div>
      )}

      {/* Scrollable Gantt */}
      <div style={{ background:"var(--surface)", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${'var(--border)'}` }}>
        <div ref={scrollRef} style={{ overflowX:"auto" }}>
          <div style={{ minWidth: (totalDays + 1) * DAY_W + 140 }}>

            {/* Header row */}
            <div style={{ display:"flex", borderBottom:`2px solid ${'var(--border)'}`, background: "var(--surface2)" }}>
              <div style={{ width:140, minWidth:140, padding:"7px 10px", color: "var(--muted)", fontSize:11, borderRight:`1px solid ${'var(--border)'}` }}>Feld</div>
              {days.map((d,i) => {
                const isToday = d.toDateString() === heute.toDateString();
                const isMon = d.getDay() === 1;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div key={i} style={{
                    width: DAY_W, minWidth: DAY_W, textAlign:"center", padding:"5px 0",
                    background: isToday ? "var(--yellow)"+"33" : isWeekend ? "var(--surface2)" : "transparent",
                    borderRight: isMon ? `1px solid ${'var(--border)'}` : "none",
                  }}>
                    {(isMon || isToday) && (
                      <div style={{ color: isToday ? "var(--yellow)" : "var(--muted)", fontSize:10, fontWeight: isToday ? 700 : 400 }}>
                        {isToday ? "●" : `${d.getDate()}.${(d.getMonth()+1).toString().padStart(2,"0")}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Felder rows */}
            {felder.filter(f => f.faellig_am).map(f => {
              const startOff = daysBetween(startDate.toISOString().slice(0,10), f.faellig_am);
              const dur = f.dauer_tage || 1;
              const isLate = f.status !== "abgeschlossen" && new Date(f.faellig_am) < heuteStart;
              const info = terminketten.get(f.id);
              const wartetAuf = (f.abhaengig_von || [])
                .map(id => felder.find(x => x.id === id))
                .filter(x => x && x.status !== "abgeschlossen");
              return (
                <div key={f.id} onClick={() => onAufgabeKlick?.(f.id)}
                  style={{ display:"flex", alignItems:"center", borderBottom:`1px solid ${'var(--border)'}`, minHeight:54,
                    cursor: onAufgabeKlick ? "pointer" : "default" }}>
                  <div style={{ width:140, minWidth:140, padding:"7px 10px", borderRight:`1px solid ${'var(--border)'}` }}>
                    <div style={{ color: "var(--text)", fontSize:12.5, fontWeight:600, lineHeight:1.25,
                      display:"flex", alignItems:"center", gap:4 }}>
                      {info?.kritisch && <Zap size={11} color="var(--yellow)" fill="var(--yellow)" />}
                      {f.titel}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize:10.5 }}>{f.m2}m²</div>
                    {wartetAuf.length > 0 && (
                      <div style={{ color:"var(--muted)", fontSize:10, marginTop:1 }}
                        title={`Wartet auf: ${wartetAuf.map(x=>x.titel).join(", ")}`}>
                        ⛓ wartet auf {wartetAuf.length} Aufgabe{wartetAuf.length===1?"":"n"}
                      </div>
                    )}
                  </div>
                  {/* overflow:"hidden": ein Balken, dessen Fälligkeitsdatum mehr
                      als die sichtbaren 14 Tage in der Vergangenheit liegt,
                      bekommt sonst eine negative left-Position und rutscht
                      optisch in die "Feld"-Spalte links hinein, statt am
                      Zeitachsen-Rand sauber abgeschnitten zu werden. */}
                  <div style={{ flex:1, position:"relative", height:54, overflow:"hidden" }}>
                    {/* Today line */}
                    <div style={{ position:"absolute", left: todayOffset * DAY_W, top:0, bottom:0, width:2, background: "var(--yellow)", opacity:0.7, zIndex:10 }} />

                    {/* Bar — kritischer Pfad jetzt als schmaler Rand statt
                        zusätzlichem Ring, damit nur echte Alarme (Verzug,
                        Terminkonflikt) den auffälligeren roten Ring bekommen
                        und nicht mehrere Signalfarben gleichzeitig konkurrieren. */}
                    <div title={info?.terminkonflikt ? "Termin durch Vorgänger gefährdet" : info?.kritisch ? "Kritischer Pfad — kein Puffer" : undefined}
                      style={{
                      position:"absolute",
                      left: startOff * DAY_W + 2,
                      top: 11, height: 32,
                      width: dur * DAY_W - 4,
                      background: AUFGABEN_STATUS[f.status]?.farbe || AUFGABEN_STATUS.offen.farbe,
                      borderRadius: 7,
                      opacity: 0.92,
                      display:"flex", alignItems:"center", paddingLeft:8,
                      overflow:"hidden",
                      borderLeft: info?.kritisch && !isLate && !info?.terminkonflikt ? "4px solid var(--ydark)" : "none",
                      boxShadow: isLate || info?.terminkonflikt ? `0 0 0 2px ${'var(--red)'}` : "none",
                    }}>
                      <span style={{ color:"#fff", fontSize:11.5, fontWeight:700, whiteSpace:"nowrap",
                        display:"flex", alignItems:"center", gap:4 }}>
                        {f.status === "in_arbeit" ? "▶ " : ""}{f.titel}
                        {(isLate || info?.terminkonflikt) ? <TriangleAlert size={11} /> : null}
                      </span>
                    </div>

                    {/* Festigkeit indicator */}
                    {f.festigkeit && (
                      <div style={{
                        position:"absolute",
                        left: (startOff + dur) * DAY_W + 5,
                        top:17, height:14,
                        width: 34,
                        background: f.festigkeit >= 95 ? "var(--green)"+"44" : "var(--yellow)"+"44",
                        borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center"
                      }}>
                        <span style={{ fontSize:10, color: "var(--text)" }}>{f.festigkeit}%</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Verzögerungen */}
      {felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) < heuteStart).length > 0 && (
        <div style={{ background:"#2E1A1A", borderRadius:10, padding:10, marginTop:12 }}>
          <div style={{ color: "var(--red)", fontWeight:700, marginBottom:6,
            display:"flex", alignItems:"center", gap:6 }}><TriangleAlert size={14} /> Verzögerungen</div>
          {felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) < heuteStart).map(f => (
            <div key={f.id} style={{ color:"#FF9999", fontSize:13, marginBottom:4 }}>
              {f.titel} – {daysBetween(f.faellig_am, heute.toISOString().slice(0,10))} Tage Verzug
            </div>
          ))}
        </div>
      )}

      {/* Terminkonflikte durch die Kette — noch nicht überfällig, aber laut
          Vorgängerkette wird der eigene Fälligkeitstermin nicht mehr
          erreicht. Frühwarnung, bevor der Termin tatsächlich reißt. */}
      {felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) >= heuteStart
        && terminketten.get(f.id)?.terminkonflikt).length > 0 && (
        <div style={{ background:"var(--ybg)", borderRadius:10, padding:10, marginTop:12 }}>
          <div style={{ color:"var(--ydark)", fontWeight:700, marginBottom:6,
            display:"flex", alignItems:"center", gap:6 }}><Zap size={14} /> Terminrisiko durch Vorgänger</div>
          {felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) >= heuteStart
            && terminketten.get(f.id)?.terminkonflikt).map(f => (
            <div key={f.id} style={{ color:"var(--ydark)", fontSize:13, marginBottom:4 }}>
              {f.titel} – Vorgänger verzögern den Start, Fälligkeitstermin voraussichtlich nicht mehr erreichbar
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
