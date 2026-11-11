import { useState } from "react";
import { Calendar, CalendarX, Users, Pencil } from "lucide-react";
import { WeatherView } from "./WeatherView.jsx";
import { terminprognose } from "../lib/terminkette.js";
import { useIstDesktop } from "../hooks/useIstDesktop.js";

export function DashboardView({ aufgaben, kolonnen, sbConnected, onNavigate, projekt, wetter, onEdit }) {
  const istDesktop = useIstDesktop();
  const [wetterInfo, setWetterInfo] = useState(null);
  const offeneAufgaben = aufgaben.filter(a => a.status !== "abgeschlossen");
  const kritisch  = aufgaben.filter(a => a.prioritaet === "kritisch" && a.status !== "abgeschlossen").length;
  const maengel   = aufgaben.filter(a => a.ist_mangel && a.status !== "abgeschlossen").length;
  const ueberfaellig = aufgaben.filter(a => a.faellig_am &&
    new Date(a.faellig_am) < new Date() && a.status !== "abgeschlossen");
  const totalMann = kolonnen.reduce((s,k) => s + (k.mitarbeiter?.length || 0), 0);

  // Baustellen-Cockpit — automatische Zusammenfassung ohne manuelles
  // Eintragen: Ampel aus dem berechneten kritischen Pfad statt aus
  // Priorität allein, geplante Stunden aus den Soll-Stunden offener
  // Aufgaben, Terminprognose aus derselben Terminketten-Berechnung wie
  // im Zeitplan-Tab.
  const { proAufgabe: terminketten, deltaTage } = terminprognose(aufgaben);
  let ampelRot = 0, ampelOrange = 0, ampelGruen = 0;
  for (const a of offeneAufgaben) {
    const info = terminketten.get(a.id);
    const istUeberfaellig = ueberfaellig.includes(a);
    if (istUeberfaellig || info?.terminkonflikt) ampelRot++;
    else if (info?.kritisch) ampelOrange++;
    else ampelGruen++;
  }
  const stundenGeplant = offeneAufgaben.reduce((s,a) => s + (a.soll_stunden || 0), 0);

  const betonM2Gesamt = aufgaben.filter(a=>a.typ==="beton").reduce((s,a)=>s+(a.m2||0),0);
  const betonM2Fertig = aufgaben.filter(a=>a.typ==="beton" && a.status==="abgeschlossen").reduce((s,a)=>s+(a.m2||0),0);

  // "Heute dran" — Aufgaben, denen man zuerst begegnen sollte: überfällige zuerst, danach die nächsten offenen
  const heuteDran = [
    ...ueberfaellig,
    ...offeneAufgaben.filter(a => !ueberfaellig.includes(a)).slice(0, 3 - ueberfaellig.length),
  ].slice(0, 3);

  function springeZu(tabId, filter) {
    if (filter) onNavigate(tabId, filter);
    else onNavigate(tabId);
  }

  // Nur Betonage-Aufgaben, die auch im angezeigten Zeitraum liegen (überfällig
  // oder in den nächsten 7 Tagen fällig — deckt sich mit der 7-Tage-Vorschau
  // im Wetterbanner), machen eine Wetter-Einschätzung für "Betonage möglich"
  // überhaupt relevant. Eine Betonage-Aufgabe in 3 Wochen wird vom heutigen
  // Wetter nicht betroffen sein.
  const heute = new Date(); heute.setHours(0,0,0,0);
  const in7Tagen = new Date(heute); in7Tagen.setDate(in7Tagen.getDate() + 7);
  const hatOffeneBetonage = offeneAufgaben.some(a =>
    a.typ === "beton" && a.faellig_am && new Date(a.faellig_am) <= in7Tagen);
  // wetterInfo kommt auch bei fehlgeschlagenem Abruf, dann aber mit
  // weather:null — nur dann gilt das Risiko als tatsächlich eingeschätzt.
  const wetterVorhanden = !!wetterInfo?.weather;
  const wetterWarnungen = wetterInfo?.warn || [];
  const betonageKritisch = wetterWarnungen.some(w => w.startsWith("🚫"));
  const betonageVorsicht = wetterWarnungen.length > 0;

  return (
    <div>
      {/* Baustellen-Name + Bearbeiten direkt hier im Übersichts-Dashboard
          sichtbar — vorher stand der Bearbeiten-Stift nur ganz klein/grau
          oben in der dünnen ProjektInfoStrip, hier ist er prominenter. */}
      {onEdit && (
        <div className="seiten-kopf" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ color:"var(--text)", fontWeight:800, fontSize:15 }}>{projekt?.name}</div>
          <button onClick={onEdit}
            style={{ background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
              borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:700,
              fontFamily:"inherit", display:"flex", alignItems:"center", gap:5 }}>
            <Pencil size={12} /> Bearbeiten
          </button>
        </div>
      )}

      <WeatherView compact ort={projekt?.ort} plz={projekt?.plz} projektId={projekt?.id}
        onData={setWetterInfo} hatOffeneBetonage={hatOffeneBetonage} />

      {/* Baustellen-Cockpit — automatischer Tagesüberblick, bevor man
          irgendwo hinklicken muss. */}
      {(offeneAufgaben.length > 0 || totalMann > 0) && (
        <CockpitKarte
          ampelRot={ampelRot} ampelOrange={ampelOrange} ampelGruen={ampelGruen}
          totalMann={totalMann} stundenGeplant={stundenGeplant}
          wetterGeladen={wetterVorhanden} betonageVorsicht={betonageVorsicht} betonageKritisch={betonageKritisch}
          hatOffeneBetonage={hatOffeneBetonage} deltaTage={deltaTage} />
      )}

      {/* Kennzahlen — jede Kachel ist ein Sprungziel */}
      <div style={{ display:"grid", gridTemplateColumns: istDesktop ? "repeat(4, minmax(0, 1fr))" : "1fr 1fr", gap: istDesktop ? 16 : 10, marginBottom: istDesktop ? 24 : 12 }}>
        <KpiKachel d={istDesktop} label="Offene Aufgaben" wert={offeneAufgaben.length}
          farbe="var(--yellow)" onClick={() => springeZu("aufgaben","offen")} />
        <KpiKachel d={istDesktop} label="Kritisch" wert={kritisch}
          farbe={kritisch>0 ? "var(--red)" : "var(--green)"} onClick={() => springeZu("aufgaben","kritisch")} />
        <KpiKachel d={istDesktop} label="Mängel" wert={maengel}
          farbe={maengel>0 ? "var(--red)" : "var(--green)"} onClick={() => springeZu("aufgaben","maengel")} />
        <KpiKachel d={istDesktop} label="Überfällig" wert={ueberfaellig.length}
          farbe={ueberfaellig.length>0 ? "var(--orange)" : "var(--green)"} onClick={() => springeZu("aufgaben","alle")} />
      </div>

      {/* Heute dran */}
      {heuteDran.length > 0 && (
        <>
          <SektionsTitel label="Heute dran" />
          {heuteDran.map(a => {
            const istUeberfaellig = ueberfaellig.includes(a);
            return (
              <div key={a.id} onClick={() => springeZu("aufgaben")}
                className={istDesktop ? "desk-zeile" : undefined}
                style={{ background:"var(--surface)", border:"1px solid var(--border)",
                  borderLeft: istDesktop ? "1px solid var(--border)" : `4px solid ${istUeberfaellig ? "var(--red)" : "var(--yellow)"}`,
                  borderRadius: istDesktop ? 8 : undefined,
                  marginBottom:6, display:"flex", cursor:"pointer" }}>
                <div style={{ flex:1, padding:"9px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"var(--text)" }}>{a.titel}</div>
                    <div style={{ background: istUeberfaellig ? "var(--rbg)" : "var(--ybg)",
                      color: istUeberfaellig ? "var(--red)" : "var(--ydark)",
                      padding:"3px 8px", fontSize:10, fontWeight:800, whiteSpace:"nowrap" }}>
                      {istDesktop ? (istUeberfaellig ? "Überfällig" : "Offen") : istUeberfaellig ? "ÜBERFÄLLIG" : "OFFEN"}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:14, marginTop:6, color:"var(--muted)", fontSize:11.5, fontWeight:600 }}>
                    {a.faellig_am && (
                      <span style={{ display:"flex", alignItems:"center", gap:4,
                        color: istUeberfaellig ? "var(--red)" : "var(--muted)" }}>
                        {istUeberfaellig ? <CalendarX size={13}/> : <Calendar size={13}/>}
                        {new Date(a.faellig_am).toLocaleDateString("de-DE")}
                      </span>
                    )}
                    {a.zustaendig && <span>{a.zustaendig}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Betonage-Fortschritt */}
      {betonM2Gesamt > 0 && (
        <>
          <SektionsTitel label="Fortschritt" />
          <div onClick={() => springeZu("aufgaben","beton")}
            style={{ background:"var(--surface)", padding:12,
              marginBottom:12, cursor:"pointer", border:"1px solid var(--border)" }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"baseline", marginBottom:6 }}>
              <div style={{ color:"var(--text)", fontWeight:700, fontSize:13 }}>Betonage</div>
              <div className="num" style={{ color:"var(--text)", fontWeight:800, fontSize:13 }}>
                {betonM2Fertig} / {betonM2Gesamt} m²
              </div>
            </div>
            <div style={{ background:"var(--surface2)", height:8 }}>
              <div style={{ background:"var(--yellow)", height:"100%",
                width:`${betonM2Gesamt>0 ? (betonM2Fertig/betonM2Gesamt*100) : 0}%`,
                transition:"width 0.5s" }} />
            </div>
          </div>
        </>
      )}

      {/* Kolonnen vor Ort */}
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:7 }}>
        <SektionsLabel label="Kolonnen vor Ort" />
        {kolonnen.length > 0 && (
          <button onClick={() => springeZu("kolonnen")}
            style={{ background:"none", border:"none", color:"var(--ydark)",
              fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            Alle ansehen →
          </button>
        )}
      </div>
      {kolonnen.length === 0 && (
        <div style={{ background:"var(--surface)", padding:"14px 16px",
          textAlign:"center", color:"var(--muted)", fontSize:13,
          border:"1px solid var(--border)" }}>
          Noch keine Kolonnen eingeteilt
        </div>
      )}
      {kolonnen.slice(0,3).map(k => (
        <div key={k.id} onClick={() => springeZu("kolonnen")}
          style={{ background:"var(--surface)", padding:"9px 16px",
            marginBottom:6, cursor:"pointer", border:"1px solid var(--border)",
            display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:34, height:34, background:"var(--ink)", color:"var(--yellow)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:12, fontWeight:800, flexShrink:0 }}>
            {initialen(k.name)}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:"var(--text)", fontSize:13.5, fontWeight:700 }}>{k.name}</div>
            {k.vorarbeiter && (
              <div style={{ color:"var(--muted)", fontSize:11.5 }}>Vorarbeiter {k.vorarbeiter}</div>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5, color:"var(--green)",
            fontSize:12.5, fontWeight:800 }}>
            <Users size={13} />{(k.mitarbeiter||[]).length} Mann
          </div>
        </div>
      ))}
    </div>
  );
}

function CockpitKarte({ ampelRot, ampelOrange, ampelGruen, totalMann, stundenGeplant,
  wetterGeladen, betonageVorsicht, betonageKritisch, hatOffeneBetonage, deltaTage }) {
  if (document.documentElement.dataset.layout === "desktop") {
    // Desktop: Ampel als Punkte, Lage als ruhige Wertepaare statt Emoji-Zeilen
    const punkt = farbe => <span aria-hidden="true" style={{ width:8, height:8, borderRadius:4, background:farbe }} />;
    const paar = (l, w, farbe) => (
      <div><div style={{ fontSize:13, color:"var(--text2)" }}>{l}</div><div style={{ marginTop:4, color: farbe || "var(--text)" }}>{w}</div></div>
    );
    return (
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ display:"flex", gap:24, flexWrap:"wrap", alignItems:"center", paddingBottom:12, borderBottom:"1px solid var(--border)" }}>
          <span style={{ color:"var(--text2)", fontSize:13 }}>Termine</span>
          {[[ampelGruen, "im Plan", "var(--green)"], [ampelOrange, "gefährdet", "var(--akzent)"], [ampelRot, "Terminrisiko", "var(--red)"]].map(([n, l, f]) => (
            <span key={l} style={{ display:"inline-flex", alignItems:"center", gap:8 }}>{punkt(f)}
              <span style={{ fontFamily:"var(--font-zahl)" }}>{n}</span> {l}</span>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:16, paddingTop:12 }}>
          {paar("Eingeplant", `${totalMann} Mitarbeiter${stundenGeplant > 0 ? `, ${stundenGeplant} h` : ""}`)}
          {wetterGeladen && paar("Wetterrisiko", betonageKritisch ? "hoch" : betonageVorsicht ? "erhöht" : "gering", betonageKritisch ? "var(--red)" : undefined)}
          {wetterGeladen && hatOffeneBetonage && paar("Betonage", betonageKritisch ? "nicht empfohlen" : betonageVorsicht ? "mit Vorsicht" : "möglich")}
          {deltaTage !== null && paar("Terminprognose", deltaTage > 0 ? `${deltaTage} Tag${deltaTage === 1 ? "" : "e"} Verzug` : "im Plan", deltaTage > 0 ? "var(--red)" : undefined)}
        </div>
      </div>
    );
  }
  const zeile = { display:"flex", alignItems:"center", gap:6, fontSize:12.5, color:"var(--text)", fontWeight:600 };
  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)",
      padding:"12px 16px", marginBottom:12 }}>
      <div style={{ color:"var(--muted)", fontSize:10.5, fontWeight:700, textTransform:"uppercase",
        letterSpacing:0.8, marginBottom:8 }}>Baustellen-Cockpit</div>

      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:8 }}>
        <span style={zeile}>🟢 {ampelGruen} im Plan</span>
        <span style={zeile}>🟠 {ampelOrange} gefährdet</span>
        <span style={zeile}>🔴 {ampelRot} Terminrisiko</span>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
        <span style={zeile}>👷 {totalMann} Mitarbeiter eingeplant</span>
        {stundenGeplant > 0 && <span style={zeile}>⏱️ {stundenGeplant}h geplant</span>}
        {wetterGeladen && (
          <span style={zeile}>
            🌦️ Wetterrisiko: {betonageKritisch ? "hoch" : betonageVorsicht ? "erhöht" : "gering"}
          </span>
        )}
        {wetterGeladen && hatOffeneBetonage && (
          <span style={zeile}>
            🏗️ Betonage: {betonageKritisch ? "nicht empfohlen" : betonageVorsicht ? "mit Vorsicht möglich" : "möglich"}
          </span>
        )}
        {deltaTage !== null && (
          <span style={{ ...zeile, gridColumn:"1 / -1", color: deltaTage > 0 ? "var(--red)" : "var(--green)" }}>
            📅 Terminprognose: {deltaTage > 0 ? `+${deltaTage} Tag${deltaTage===1?"":"e"} Verzug` : "im Plan"}
          </span>
        )}
      </div>
    </div>
  );
}

function initialen(name = "") {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0,2).join("").toUpperCase() || "?";
}

function KpiKachel({ label, wert, farbe, onClick, d = false }) {
  // Desktop: Kennzahl ohne Farbrand; ein Punkt nur, wenn die Zahl Handlung verlangt
  if (d) {
    const warnt = wert > 0 && (farbe === "var(--red)" || farbe === "var(--orange)");
    return (
      <button onClick={onClick} className="desk-zeile"
        style={{ textAlign:"left", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px",
          cursor:"pointer", fontFamily:"inherit", color:"var(--text)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, color:"var(--text2)", fontSize:13 }}>
          {label}{warnt && <span aria-hidden="true" style={{ width:6, height:6, borderRadius:3, background: farbe }} />}
        </div>
        <div style={{ fontFamily:"var(--font-zahl)", fontVariantNumeric:"tabular-nums", fontSize:24, lineHeight:"32px", fontWeight:500, marginTop:8 }}>{wert}</div>
      </button>
    );
  }
  return (
    <div onClick={onClick}
      style={{ background:"var(--surface)", padding:"10px 16px",
        borderLeft:`4px solid ${farbe}`, border:"1px solid var(--border)",
        borderLeftWidth:4, borderLeftColor:farbe, cursor:"pointer" }}>
      <div style={{ color:"var(--muted)", fontSize:10.5, fontWeight:700, textTransform:"uppercase",
        letterSpacing:0.8 }}>{label}</div>
      <div className="num" style={{ color:"var(--text)", fontSize:26, fontWeight:800, marginTop:2 }}>
        {wert}
      </div>
    </div>
  );
}

function SektionsTitel({ label }) {
  return (
    <div style={{ color:"var(--text)", fontWeight:800, marginBottom:7, fontSize:13,
      letterSpacing:0.3 }}>
      {label}
    </div>
  );
}

function SektionsLabel({ label }) {
  return (
    <div style={{ color:"var(--text)", fontWeight:800, fontSize:13 }}>{label}</div>
  );
}
