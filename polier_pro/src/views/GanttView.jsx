import { useEffect, useRef, useState } from "react";
import { Calendar, TriangleAlert, Zap, Info } from "lucide-react";
import { daysBetween } from "../lib/utils.js";
import { terminprognose } from "../lib/terminkette.js";
import { AUFGABEN_STATUS } from "../config/konstanten.js";
import { useIstDesktop } from "../hooks/useIstDesktop.js";

export function GanttView({ felder, onAufgabeKlick }) {
  const [legendeOffen, setLegendeOffen] = useState(false);
  const d = useIstDesktop();
  const [platz, setPlatz] = useState(0); // Desktop: verfügbare Breite der Zeitachse
  const NAME_W = d ? 240 : 140;
  const heute = new Date();
  // Start des heutigen Tages (Uhrzeit genullt) — ein Feld mit faellig_am
  // von heute (Mitternacht) galt sonst ab der ersten Sekunde nach 0 Uhr
  // fälschlich schon als "0 Tage Verzug", weil new Date(faellig_am) gegen
  // die tatsächliche aktuelle Uhrzeit statt gegen den Tagesbeginn verglichen
  // wurde.
  const heuteStart = new Date(heute); heuteStart.setHours(0,0,0,0);
  const startDate = new Date(heute); startDate.setDate(startDate.getDate() - 14);
  const endDate   = new Date(heute); endDate.setDate(endDate.getDate() + 42);
  // Desktop: Zeitachse reicht bis zur frühesten und spätesten Aufgabe, damit
  // überfällige Balken nicht links aus dem Plan fallen
  if (d) {
    for (const f of felder) {
      if (!f.faellig_am) continue;
      const a = new Date(f.faellig_am); a.setDate(a.getDate() - 3);
      const e = new Date(f.faellig_am); e.setDate(e.getDate() + (f.dauer_tage || 1) + 7);
      if (a < startDate) startDate.setTime(a.getTime());
      if (e > endDate) endDate.setTime(e.getTime());
    }
    // auf Montag ausrichten, damit die Wochenspalten sauber beginnen
    startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
  }
  const totalDays = daysBetween(startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10));
  // Desktop: der ganze Plan passt in die Breite (mind. 10 px je Tag), Handy: feste 36 px mit Scroll
  const DAY_W = d ? Math.max(10, Math.min(28, platz ? Math.floor((platz - NAME_W) / (totalDays + 1)) : 28)) : 36;
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
    if (!d || !scrollRef.current) return;
    const el = scrollRef.current;
    const ro = new ResizeObserver(() => setPlatz(el.clientWidth));
    ro.observe(el); setPlatz(el.clientWidth);
    return () => ro.disconnect();
  }, [d]);
  useEffect(() => {
    if (scrollRef.current) {
      const todayOffset = daysBetween(startDate.toISOString().slice(0,10), heute.toISOString().slice(0,10));
      // Desktop: der Plan passt meist ganz hinein, dann bleibt er am Anfang; sonst so, dass heute sichtbar ist
      scrollRef.current.scrollLeft = d ? Math.max(0, (todayOffset + 14) * DAY_W + NAME_W - scrollRef.current.clientWidth) : todayOffset * DAY_W - 60;
    }
  }, [d ? DAY_W : 0]); // Desktop: nach dem Messen der Breite neu ausrichten

  // Generate day headers
  const days = [];
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const todayOffset = daysBetween(startDate.toISOString().slice(0,10), heute.toISOString().slice(0,10));

  if (d) {
    const sichtbar = felder.filter(f => f.faellig_am).sort((a, b) => a.faellig_am.localeCompare(b.faellig_am));
    const verzug = felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) < heuteStart);
    const konflikte = felder.filter(f => f.faellig_am && f.status !== "abgeschlossen" && new Date(f.faellig_am) >= heuteStart && terminketten.get(f.id)?.terminkonflikt);
    const balkenFarbe = { offen:"var(--text2)", in_arbeit:"var(--akzent)", zur_pruefung:"var(--blue)", abgeschlossen:"var(--green)", blockiert:"var(--red)" };
    const kw = dt => { const t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n);
      return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7); };
    const name = { position:"sticky", left:0, zIndex:3, width:NAME_W, minWidth:NAME_W, boxSizing:"border-box", padding:"0 16px",
      background:"var(--surface)", borderRight:"1px solid var(--border)", alignSelf:"stretch", display:"flex", flexDirection:"column", justifyContent:"center" };
    const breite = (totalDays + 1) * DAY_W;
    return (
      <div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, marginBottom:16 }}>
          <div>
            <h2 style={{ margin:0, fontSize:16, lineHeight:"24px", fontWeight:500 }}>Terminplan</h2>
            {zielTermin && (
              <div style={{ marginTop:4, color:"var(--text2)" }}>
                Fertigstellung berechnet <span className="num" style={{ fontFamily:"var(--font-zahl)", color:"var(--text)" }}>{projektEnde.toLocaleDateString("de-DE")}</span>
                {deltaTage > 0
                  ? <span style={{ color:"var(--red)" }}> · {deltaTage} Tag{deltaTage===1?"":"e"} nach dem Ziel {zielTermin.toLocaleDateString("de-DE")}</span>
                  : <span style={{ color:"var(--green)" }}> · im Plan</span>}
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap", fontSize:13, color:"var(--text2)" }} aria-label="Legende">
            {Object.entries(AUFGABEN_STATUS).map(([k,v]) => (
              <span key={k} style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                <span aria-hidden="true" style={{ width:12, height:8, borderRadius:2, background: balkenFarbe[k] || "var(--text2)" }} />{v.label}
              </span>
            ))}
            <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><Zap size={14} strokeWidth={1.5} /> Kritischer Pfad</span>
          </div>
        </div>

        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
          <div ref={scrollRef} style={{ overflowX:"auto" }}>
            <div style={{ width: NAME_W + breite }}>
              <div style={{ display:"flex", height:40, borderBottom:"1px solid var(--border)", fontSize:12, color:"var(--muted)" }}>
                <div style={{ ...name, fontSize:13, color:"var(--text2)" }}>Aufgabe</div>
                <div style={{ position:"relative", width: breite }}>
                  {days.map((dt,i) => dt.getDay() === 1 && (
                    <div key={i} style={{ position:"absolute", left: i * DAY_W, top:0, bottom:0, borderLeft:"1px solid var(--border)", padding:"4px 6px", whiteSpace:"nowrap", lineHeight:"16px" }}>
                      <div>KW {kw(dt)}</div>
                      <div className="num" style={{ fontFamily:"var(--font-zahl)" }}>{dt.getDate()}.{dt.getMonth()+1}.</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ position:"relative" }}>
                {/* Wochenlinien, Wochenenden und Heute über alle Zeilen */}
                <div aria-hidden="true" style={{ position:"absolute", left: NAME_W, top:0, bottom:0, width: breite, pointerEvents:"none" }}>
                  {days.map((dt,i) => (dt.getDay() === 0 || dt.getDay() === 6) && (
                    <div key={i} style={{ position:"absolute", left: i * DAY_W, width: DAY_W, top:0, bottom:0, background:"var(--bg)" }} />
                  ))}
                  {days.map((dt,i) => dt.getDay() === 1 && (
                    <div key={`m${i}`} style={{ position:"absolute", left: i * DAY_W, top:0, bottom:0, borderLeft:"1px solid var(--border)" }} />
                  ))}
                  <div style={{ position:"absolute", left: todayOffset * DAY_W + DAY_W / 2, top:0, bottom:0, width:1, background:"var(--akzent)", zIndex:2 }} />
                </div>
                {sichtbar.length === 0 && <div style={{ padding:"16px", color:"var(--text2)" }}>Noch keine Aufgaben mit Fälligkeitsdatum</div>}
                {sichtbar.map(f => {
                  const startOff = daysBetween(startDate.toISOString().slice(0,10), f.faellig_am);
                  const dur = f.dauer_tage || 1;
                  const isLate = f.status !== "abgeschlossen" && new Date(f.faellig_am) < heuteStart;
                  const info = terminketten.get(f.id);
                  const wartetAuf = (f.abhaengig_von || []).map(id => felder.find(x => x.id === id)).filter(x => x && x.status !== "abgeschlossen");
                  const warnung = isLate || info?.terminkonflikt;
                  return (
                    <div key={f.id} onClick={() => onAufgabeKlick?.(f.id)} className="desk-zeile"
                      style={{ display:"flex", alignItems:"center", height:40, borderBottom:"1px solid var(--border)", cursor: onAufgabeKlick ? "pointer" : "default", position:"relative" }}>
                      <div style={name}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                          {info?.kritisch && <Zap size={14} strokeWidth={1.5} style={{ flexShrink:0, color:"var(--akzent)" }} aria-label="Kritischer Pfad" />}
                          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: f.status === "abgeschlossen" ? "var(--muted)" : "var(--text)" }}>{f.titel}</span>
                        </div>
                        {wartetAuf.length > 0 && (
                          <div style={{ fontSize:12, color:"var(--muted)" }} title={`Wartet auf: ${wartetAuf.map(x=>x.titel).join(", ")}`}>
                            wartet auf {wartetAuf.length} Aufgabe{wartetAuf.length===1?"":"n"}
                          </div>
                        )}
                      </div>
                      <div style={{ position:"relative", width: breite, height:40 }}>
                        <div title={[f.titel, isLate ? `${daysBetween(f.faellig_am, heute.toISOString().slice(0,10))} Tage Verzug` : null, info?.terminkonflikt ? "Termin durch Vorgänger gefährdet" : null, info?.kritisch ? "Kritischer Pfad" : null].filter(Boolean).join(" · ")}
                          style={{ position:"absolute", left: startOff * DAY_W + 2, width: Math.max(dur * DAY_W - 4, 8), top:10, height:20, borderRadius:4,
                            background: balkenFarbe[f.status] || "var(--text2)", opacity: f.status === "abgeschlossen" ? 0.5 : 1,
                            boxShadow: warnung ? "0 0 0 2px var(--surface), 0 0 0 3px var(--red)" : "none", zIndex:1 }} />
                        <span style={{ position:"absolute", left: (startOff + dur) * DAY_W + 6, top:10, lineHeight:"20px", fontSize:12, whiteSpace:"nowrap",
                          color: warnung ? "var(--red)" : "var(--text2)", zIndex:1 }}>
                          {warnung && <TriangleAlert size={12} strokeWidth={1.5} style={{ verticalAlign:"-2px", marginRight:4 }} />}
                          {f.festigkeit ? `${f.festigkeit} %` : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {(verzug.length > 0 || konflikte.length > 0) && (
          <div style={{ display:"grid", gridTemplateColumns: verzug.length && konflikte.length ? "1fr 1fr" : "1fr", gap:16, marginTop:24 }}>
            {verzug.length > 0 && (
              <div>
                <h2 style={{ margin:"0 0 12px", fontSize:16, lineHeight:"24px", fontWeight:500 }}>Verzug</h2>
                <div className="listen-gruppe">
                  {verzug.map(f => (
                    <div key={f.id} onClick={() => onAufgabeKlick?.(f.id)} style={{ display:"flex", justifyContent:"space-between", gap:16, cursor:"pointer" }}>
                      <span>{f.titel}</span>
                      <span className="num" style={{ fontFamily:"var(--font-zahl)", fontSize:13, color:"var(--red)", whiteSpace:"nowrap" }}>{daysBetween(f.faellig_am, heute.toISOString().slice(0,10))} Tage</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {konflikte.length > 0 && (
              <div>
                <h2 style={{ margin:"0 0 12px", fontSize:16, lineHeight:"24px", fontWeight:500 }}>Terminrisiko durch Vorgänger</h2>
                <div className="listen-gruppe">
                  {konflikte.map(f => (
                    <div key={f.id} onClick={() => onAufgabeKlick?.(f.id)} style={{ display:"flex", justifyContent:"space-between", gap:16, cursor:"pointer" }}>
                      <span>{f.titel}</span>
                      <span style={{ fontSize:13, color:"var(--akzent)", whiteSpace:"nowrap" }}>Termin nicht mehr erreichbar</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

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
