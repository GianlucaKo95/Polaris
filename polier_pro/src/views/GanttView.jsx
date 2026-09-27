import { useEffect, useRef } from "react";
import { Calendar, TriangleAlert, Zap } from "lucide-react";
import { daysBetween } from "../lib/utils.js";
import { terminprognose } from "../lib/terminkette.js";
import { AUFGABEN_STATUS } from "../config/konstanten.js";

export function GanttView({ felder, onAufgabeKlick }) {
  const heute = new Date();
  const startDate = new Date(heute); startDate.setDate(startDate.getDate() - 14);
  const endDate   = new Date(heute); endDate.setDate(endDate.getDate() + 42);
  const totalDays = daysBetween(startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10));
  const scrollRef = useRef(null);

  // Kritischer Pfad + berechnetes Projektende aus Dauer + Abhängigkeiten —
  // über alle Aufgaben, nicht nur die mit gesetztem Fälligkeitsdatum, da
  // undatierte Aufgaben trotzdem Teil einer Abhängigkeitskette sein können.
  const { proAufgabe: terminketten, projektEnde, zielTermin, deltaTage } = terminprognose(felder);

  // Scroll to today on mount
  useEffect(() => {
    if (scrollRef.current) {
      const todayOffset = daysBetween(startDate.toISOString().slice(0,10), heute.toISOString().slice(0,10));
      scrollRef.current.scrollLeft = todayOffset * 28 - 60;
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
  const DAY_W = 28;

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

      {/* Legend */}
      <div style={{ display:"flex", gap:12, marginBottom:9, flexWrap:"wrap" }}>
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

      {/* Scrollable Gantt */}
      <div style={{ background:"var(--surface)", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${'var(--border)'}` }}>
        <div ref={scrollRef} style={{ overflowX:"auto" }}>
          <div style={{ minWidth: (totalDays + 1) * DAY_W + 130 }}>

            {/* Header row */}
            <div style={{ display:"flex", borderBottom:`2px solid ${'var(--border)'}`, background: "var(--surface2)" }}>
              <div style={{ width:130, minWidth:130, padding:"6px 10px", color: "var(--muted)", fontSize:11, borderRight:`1px solid ${'var(--border)'}` }}>Feld</div>
              {days.map((d,i) => {
                const isToday = d.toDateString() === heute.toDateString();
                const isMon = d.getDay() === 1;
                const isSun = d.getDay() === 0;
                return (
                  <div key={i} style={{
                    width: DAY_W, minWidth: DAY_W, textAlign:"center", padding:"4px 0",
                    background: isToday ? "var(--yellow)"+"33" : isSun ? "var(--surface2)" : "transparent",
                    borderRight: isMon ? `1px solid ${'var(--border)'}` : "none",
                  }}>
                    {(isMon || isToday) && (
                      <div style={{ color: isToday ? "var(--yellow)" : "var(--muted)", fontSize:9, fontWeight: isToday ? 700 : 400 }}>
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
              const isLate = f.status !== "abgeschlossen" && new Date(f.faellig_am) < heute;
              const info = terminketten.get(f.id);
              const wartetAuf = (f.abhaengig_von || [])
                .map(id => felder.find(x => x.id === id))
                .filter(x => x && x.status !== "abgeschlossen");
              return (
                <div key={f.id} onClick={() => onAufgabeKlick?.(f.id)}
                  style={{ display:"flex", alignItems:"center", borderBottom:`1px solid ${'var(--border)'}`, minHeight:40,
                    cursor: onAufgabeKlick ? "pointer" : "default" }}>
                  <div style={{ width:130, minWidth:130, padding:"6px 10px", borderRight:`1px solid ${'var(--border)'}` }}>
                    <div style={{ color: "var(--text)", fontSize:11, fontWeight:600, lineHeight:1.2,
                      display:"flex", alignItems:"center", gap:3 }}>
                      {info?.kritisch && <Zap size={10} color="var(--yellow)" fill="var(--yellow)" />}
                      {f.titel}
                    </div>
                    <div style={{ color: "var(--muted)", fontSize:10 }}>{f.m2}m²</div>
                    {wartetAuf.length > 0 && (
                      <div style={{ color:"var(--muted)", fontSize:9, marginTop:1 }}
                        title={`Wartet auf: ${wartetAuf.map(x=>x.titel).join(", ")}`}>
                        ⛓ wartet auf {wartetAuf.length} Aufgabe{wartetAuf.length===1?"":"n"}
                      </div>
                    )}
                  </div>
                  <div style={{ flex:1, position:"relative", height:40 }}>
                    {/* Today line */}
                    <div style={{ position:"absolute", left: todayOffset * DAY_W, top:0, bottom:0, width:2, background: "var(--yellow)", opacity:0.7, zIndex:10 }} />

                    {/* Bar */}
                    <div title={info?.terminkonflikt ? "Termin durch Vorgänger gefährdet" : info?.kritisch ? "Kritischer Pfad — kein Puffer" : undefined}
                      style={{
                      position:"absolute",
                      left: startOff * DAY_W + 2,
                      top: 8, height: 24,
                      width: dur * DAY_W - 4,
                      background: AUFGABEN_STATUS[f.status]?.farbe || AUFGABEN_STATUS.offen.farbe,
                      borderRadius: 5,
                      opacity: 0.9,
                      display:"flex", alignItems:"center", paddingLeft:6,
                      overflow:"hidden",
                      boxShadow: isLate || info?.terminkonflikt ? `0 0 0 2px ${'var(--red)'}`
                        : info?.kritisch ? `0 0 0 2px ${'var(--yellow)'}` : "none",
                    }}>
                      <span style={{ color:"#fff", fontSize:10, fontWeight:700, whiteSpace:"nowrap",
                        display:"flex", alignItems:"center", gap:3 }}>
                        {f.status === "in_arbeit" ? "▶ " : ""}{f.titel}
                        {(isLate || info?.terminkonflikt) ? <TriangleAlert size={10} /> : null}
                      </span>
                    </div>

                    {/* Festigkeit indicator */}
                    {f.festigkeit && (
                      <div style={{
                        position:"absolute",
                        left: (startOff + dur) * DAY_W + 4,
                        top:14, height:12,
                        width: 32,
                        background: f.festigkeit >= 95 ? "var(--green)"+"44" : "var(--yellow)"+"44",
                        borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center"
                      }}>
                        <span style={{ fontSize:9, color: "var(--text)" }}>{f.festigkeit}%</span>
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
      {felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) < heute).length > 0 && (
        <div style={{ background:"#2E1A1A", borderRadius:10, padding:10, marginTop:12 }}>
          <div style={{ color: "var(--red)", fontWeight:700, marginBottom:6,
            display:"flex", alignItems:"center", gap:6 }}><TriangleAlert size={14} /> Verzögerungen</div>
          {felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) < heute).map(f => (
            <div key={f.id} style={{ color:"#FF9999", fontSize:13, marginBottom:4 }}>
              {f.titel} – {daysBetween(f.faellig_am, heute.toISOString().slice(0,10))} Tage Verzug
            </div>
          ))}
        </div>
      )}

      {/* Terminkonflikte durch die Kette — noch nicht überfällig, aber laut
          Vorgängerkette wird der eigene Fälligkeitstermin nicht mehr
          erreicht. Frühwarnung, bevor der Termin tatsächlich reißt. */}
      {felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) >= heute
        && terminketten.get(f.id)?.terminkonflikt).length > 0 && (
        <div style={{ background:"var(--ybg)", borderRadius:10, padding:10, marginTop:12 }}>
          <div style={{ color:"var(--ydark)", fontWeight:700, marginBottom:6,
            display:"flex", alignItems:"center", gap:6 }}><Zap size={14} /> Terminrisiko durch Vorgänger</div>
          {felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) >= heute
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
