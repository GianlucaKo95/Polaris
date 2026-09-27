import { useState, useEffect } from "react";
import { CircleX, Wind, Droplet, CloudRain, CircleCheckBig, Ban, MapPin, Blocks, Calendar, ChevronDown, Clock3 } from "lucide-react";
import { geocodePLZ, geocodeAdresse, wmoIcon, betonCheck, holeStuendlicheVorhersage, betonageEignung, besteZeitfenster } from "../lib/geo.js";

export function WeatherView({ compact = false, ort = null, plz = null, projektId = null, onData, hatOffeneBetonage = true }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loc, setLoc] = useState({ lat: 48.137, lon: 11.576, name: "München" });
  const [standortAufgeloest, setStandortAufgeloest] = useState(false);
  const [ausgewaehlterTag, setAusgewaehlterTag] = useState(null); // date-string des aufgeklappten Tages
  const [stundenDaten,      setStundenDaten]      = useState(null);
  const [stundenLaden,      setStundenLaden]       = useState(false);

  // PLZ ist eindeutig und daher die zuverlässigste Suchgrundlage —
  // Ortsnamen können mehrfach vorkommen (z.B. "Neustadt" >20x in
  // Deutschland). Ohne PLZ wird notfalls nur nach dem Ortsnamen gesucht.
  useEffect(() => {
    let abgebrochen = false;
    setStandortAufgeloest(false);

    if (!plz?.trim() && !ort?.trim()) {
      setStandortAufgeloest(true);
      return;
    }

    const suche = plz?.trim()
      ? geocodePLZ(plz, ort)
      : geocodeAdresse(ort); // Fallback: nur Ortsname ohne PLZ vorhanden

    suche.then(result => {
      if (abgebrochen) return;
      if (result) {
        setLoc({ lat: result.lat, lon: result.lon, name: ort || result.name });
      }
      // Bei fehlgeschlagenem Geocoding bleibt der bisherige/Default-Standort bestehen
      setStandortAufgeloest(true);
    });

    return () => { abgebrochen = true; };
  }, [plz, ort]);

  useEffect(() => {
    if (!standortAufgeloest) return; // erst Wetter laden wenn Standort feststeht
    fetchWeather(loc.lat, loc.lon);
  }, [loc.lat, loc.lon, standortAufgeloest]);

  // Erlaubt einem Elternteil (z.B. dem Baustellen-Cockpit im Dashboard),
  // das Wetterrisiko ohne eigenen zweiten API-Call mitzubekommen.
  useEffect(() => {
    onData?.({ weather, warn: betonCheck(weather) });
  }, [weather]);

  async function fetchWeather(lat, lon) {
    setLoading(true);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code`
        + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code`
        + `&timezone=Europe%2FBerlin&forecast_days=7`;
      const res = await fetch(url);
      const data = await res.json();
      const cur = data.current;
      setWeather({
        temp:     Math.round(cur.temperature_2m),
        humidity: cur.relative_humidity_2m,
        rain:     cur.precipitation,
        wind:     Math.round(cur.wind_speed_10m),
        icon:     wmoIcon(cur.weather_code),
        forecast: data.daily.time.slice(0,7).map((day,i) => ({
          day:  ["So","Mo","Di","Mi","Do","Fr","Sa"][new Date(day).getDay()],
          date: day,
          max:  Math.round(data.daily.temperature_2m_max[i]),
          min:  Math.round(data.daily.temperature_2m_min[i]),
          rain: data.daily.precipitation_sum[i],
          wind: Math.round(data.daily.wind_speed_10m_max[i]),
          icon: wmoIcon(data.daily.weather_code[i]),
        })),
      });
    } catch (e) {
      setWeather(null);
    }
    setLoading(false);
  }

  async function tagAufklappen(datumISO) {
    if (ausgewaehlterTag === datumISO) { setAusgewaehlterTag(null); return; }
    setAusgewaehlterTag(datumISO);
    setStundenDaten(null);
    setStundenLaden(true);
    const daten = await holeStuendlicheVorhersage(ort, plz, datumISO);
    setStundenDaten(daten);
    setStundenLaden(false);
  }

  const warn = betonCheck(weather);
  const ok = warn.length === 0;
  const empfehlung = stundenDaten ? besteZeitfenster(stundenDaten) : null;

  if (loading) return (
    <div style={{ background: "var(--surface)", borderRadius: 12, padding:14, textAlign:"center", color: "var(--muted)" }}>
      Wetterdaten werden geladen…
    </div>
  );

  if (!weather) return (
    <div style={{ background: "var(--surface)", borderRadius: 12, padding:14, textAlign:"center", color: "var(--red)",
      display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
      <CircleX size={15} /> Wetterdaten nicht verfügbar
    </div>
  );

  if (compact) return (
    <div style={{ background: "var(--surface)", borderRadius: 12, padding:"10px 16px", border: `1px solid ${ok ? "var(--green)" : "var(--orange)"}`, marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ color: "var(--muted)", fontSize: 11, textTransform:"uppercase", letterSpacing:1 }}>{loc.name}</div>
          <div style={{ color: "var(--text)", fontSize: 26, fontWeight: 700 }}>{weather.icon} {weather.temp}°C</div>
          <div style={{ color: "var(--muted)", fontSize: 12, display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
            <Wind size={11} /> {weather.wind} km/h · <Droplet size={11} /> {weather.humidity}% · <CloudRain size={11} /> {weather.rain}mm jetzt
          </div>
        </div>
        {hatOffeneBetonage && (
          <div style={{ background: ok ? "var(--green)" : "var(--orange)", color:"#fff", borderRadius:8, padding:"6px 14px", fontWeight:700, fontSize:13, textAlign:"center",
            display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
            {ok ? <><CircleCheckBig size={16} /> Betonage möglich</> : <><Ban size={16} /> Prüfen</>}
          </div>
        )}
      </div>
      {hatOffeneBetonage && warn.length > 0 && (
        <div style={{ background:"#3A1A1A", borderRadius:8, padding:"6px 12px", marginTop:10 }}>
          {warn.map((w,i) => <div key={i} style={{ color:"#FF9999", fontSize:12 }}>{w}</div>)}
        </div>
      )}
      <div style={{ display:"flex", gap:6, marginTop:10, overflowX:"auto" }}>
        {weather.forecast.map((f,i) => (
          <div key={i} style={{ minWidth:52, background: "var(--surface2)", borderRadius:12, padding:"6px 4px", textAlign:"center",
            border: betonCheck({temp:f.max,wind:f.wind,rain:f.rain}).length > 0
              ? `2px solid ${'var(--red)'}` : `1px solid ${'var(--border)'}` }}>
            <div style={{ color: "var(--muted)", fontSize:10 }}>{f.day}</div>
            <div style={{ fontSize:16 }}>{f.icon}</div>
            <div style={{ color: "var(--text)", fontSize:11, fontWeight:600 }}>{f.max}°</div>
            {f.rain > 0 && <div style={{ color:"#6CA8FF", fontSize:10 }}>{f.rain}mm</div>}
          </div>
        ))}
      </div>
    </div>
  );

  // Full weather view
  return (
    <div>
      <div style={{ background: "var(--surface)", borderRadius:12, padding:13, border:`1px solid ${ok ? "var(--green)" : "var(--orange)"}`, marginBottom:10 }}>
        <div style={{ color: "var(--muted)", fontSize:11, textTransform:"uppercase", letterSpacing:1, marginBottom:4,
          display:"flex", alignItems:"center", gap:4 }}><MapPin size={10} /> {loc.name} · Live-Wetter</div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ color: "var(--text)", fontSize:42, fontWeight:800 }}>{weather.icon} {weather.temp}°C</div>
            <div style={{ color: "var(--muted)", fontSize:13, marginTop:4,
              display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
              <Wind size={12} /> {weather.wind} km/h Wind &nbsp;|&nbsp; <Droplet size={12} /> {weather.humidity}% Feuchte &nbsp;|&nbsp; <CloudRain size={12} /> {weather.rain} mm jetzt
            </div>
          </div>
        </div>
        <div style={{ background: ok ? "#1A3A28" : "#3A1A1A", borderRadius:10, padding:10, marginTop:14 }}>
          <div style={{ color: ok ? "var(--green)" : "var(--red)", fontWeight:700, fontSize:15, marginBottom: warn.length ? 8 : 0,
            display:"flex", alignItems:"center", gap:7 }}>
            {ok ? <><CircleCheckBig size={15} /> Betonage heute möglich</> : <><Ban size={15} /> Betonage eingeschränkt</>}
          </div>
          {warn.map((w,i) => <div key={i} style={{ color:"#FF9999", fontSize:13, marginTop:4 }}>{w}</div>)}
        </div>
      </div>

      {/* Checkliste */}
      <div style={{ background: "var(--surface)", borderRadius:12, padding:12, marginBottom:10 }}>
        <div style={{ color: "var(--yellow)", fontWeight:700, marginBottom:9,
          display:"flex", alignItems:"center", gap:7 }}><Blocks size={15} /> Betonier-Checkliste</div>
        {[
          ["Temperatur",    `${weather.temp}°C`,        weather.temp >= 5 && weather.temp <= 30, "5°C – 30°C"],
          ["Wind",          `${weather.wind} km/h`,     weather.wind <= 40,                      "max. 40 km/h"],
          ["Niederschlag (jetzt)", `${weather.rain} mm`, weather.rain <= 5,                       "max. 5 mm"],
          ["Luftfeuchte",   `${weather.humidity}%`,     weather.humidity <= 90,                  "max. 90%"],
        ].map(([k,v,ok,limit]) => (
          <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${'var(--border)'}` }}>
            <div>
              <div style={{ color: "var(--text2)", fontSize:14 }}>{k}</div>
              <div style={{ color: "var(--muted)", fontSize:11 }}>Grenzwert: {limit}</div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ color: "var(--text)", fontWeight:700 }}>{v}</span>
              <span style={{ display:"flex", color: ok ? "var(--green)" : "var(--red)" }}>{ok ? <CircleCheckBig size={17} /> : <Ban size={17} />}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 7-Tage */}
      <div style={{ background: "var(--surface)", borderRadius:12, padding:12 }}>
        <div style={{ color: "var(--yellow)", fontWeight:700, marginBottom:9,
          display:"flex", alignItems:"center", gap:7 }}><Calendar size={15} /> 7-Tage Betonierplan</div>
        {weather.forecast.map((f,i) => {
          const dayWarn = betonCheck({ temp:f.max, wind:f.wind, rain:f.rain });
          const dayOk = dayWarn.length === 0;
          const aufgeklappt = ausgewaehlterTag === f.date;
          return (
            <div key={i} style={{ marginBottom:6 }}>
              <div onClick={() => tagAufklappen(f.date)}
                style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer",
                padding:"7px 12px", borderRadius: aufgeklappt ? "8px 8px 0 0" : 8,
                background: dayOk ? "#1A2E1E" : "#2E1A1A",
                border: `1px solid ${dayOk ? "var(--green)" : "var(--red)"}`, borderBottom: aufgeklappt ? "none" : undefined }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>{f.icon}</span>
                  <div>
                    <div style={{ color: "var(--text)", fontWeight:600, fontSize:13 }}>{f.day} · {new Date(f.date).getDate()}.{(new Date(f.date).getMonth()+1).toString().padStart(2,"0")}.</div>
                    <div style={{ color: "var(--muted)", fontSize:11, display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                      {f.min}° – {f.max}° · <Wind size={10} /> {f.wind} km/h · {f.rain > 0 ? <><CloudRain size={10} /> {f.rain}mm</> : "kein Regen"}
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ color: dayOk ? "var(--green)" : "var(--red)", fontWeight:700, fontSize:12,
                    display:"flex", alignItems:"center", gap:4 }}>
                    {dayOk ? <><CircleCheckBig size={13} /> OK</> : <><Ban size={13} /> Nein</>}
                  </div>
                  <ChevronDown size={14} color="var(--muted)" style={{ transform: aufgeklappt ? "rotate(180deg)" : "none", transition:"transform 0.2s" }} />
                </div>
              </div>

              {aufgeklappt && (
                <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderTop:"none",
                  borderRadius:"0 0 8px 8px", padding:"10px 12px" }}>
                  {stundenLaden && (
                    <div style={{ color:"var(--muted)", fontSize:12, textAlign:"center", padding:8 }}>Stündliche Vorhersage wird geladen…</div>
                  )}
                  {!stundenLaden && !stundenDaten && (
                    <div style={{ color:"var(--red)", fontSize:12, textAlign:"center", padding:8 }}>Stündliche Vorhersage nicht verfügbar</div>
                  )}
                  {!stundenLaden && stundenDaten && (
                    <>
                      <div style={{ color:"var(--muted)", fontSize:10.5, marginBottom:8, lineHeight:1.4 }}>
                        Eignungswert je Stunde — grobe Heuristik aus Regenwahrscheinlichkeit (echte Modelldaten), Temperatur und Wind, keine wissenschaftliche Vorhersage.
                      </div>
                      {empfehlung && (
                        <div style={{ background:"var(--ybg)", border:"1px solid var(--yellow)", borderRadius:8,
                          padding:"8px 12px", marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
                          <Clock3 size={14} color="var(--ydark)" />
                          <div style={{ color:"var(--ydark)", fontSize:12.5, fontWeight:700 }}>
                            Empfohlenes Zeitfenster: {empfehlung.start}:00–{empfehlung.ende}:00 Uhr (Ø Eignung {empfehlung.avg}%)
                          </div>
                        </div>
                      )}
                      <div style={{ display:"flex", gap:5, overflowX:"auto", paddingBottom:4 }}>
                        {stundenDaten.filter(s => s.stunde >= 6 && s.stunde <= 18).map(s => {
                          const { wert, gruende } = betonageEignung(s);
                          const farbe = wert >= 70 ? "var(--green)" : wert >= 40 ? "var(--yellow)" : "var(--red)";
                          return (
                            <div key={s.stunde} title={gruende.join("; ") || "keine Einschränkungen"}
                              style={{ minWidth:54, background:"var(--surface2)", borderRadius:8, padding:"6px 4px",
                                textAlign:"center", border:`1.5px solid ${farbe}` }}>
                              <div style={{ color:"var(--muted)", fontSize:9.5 }}>{s.stunde}:00</div>
                              <div style={{ fontSize:14, marginTop:2 }}>{s.icon}</div>
                              <div style={{ color:"var(--text)", fontSize:10.5, fontWeight:600, marginTop:2 }}>{s.temp}°</div>
                              <div style={{ color:farbe, fontSize:10.5, fontWeight:800, marginTop:2 }}>{wert}%</div>
                              {s.regenWahrscheinlichkeit > 0 && (
                                <div style={{ color:"#6CA8FF", fontSize:9 }}>{s.regenWahrscheinlichkeit}% Regen</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
