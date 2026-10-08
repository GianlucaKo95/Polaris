import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square, Check, MapPin, Users, SatelliteDish, Clock3 } from "lucide-react";
import { ROLLEN, TAETIGKEITEN } from "../config/konstanten.js";
import { KolonnenSammelstempel } from "./KolonnenSammelstempel.jsx";
import { sbFetch } from "../lib/supabase.js";
import { getGPSPosition, reverseGeocode, geocodeAdresse, haversineMeters } from "../lib/geo.js";
import { Label, inputStyle } from "../components/Label.jsx";
import { useBackButton } from "../hooks/useBackButton.js";

// Ab dieser Entfernung zur (geocodierten) Projektadresse gilt eine
// Stempelung als geografisch unplausibel — reine Hinweis-Schwelle, kein
// hartes Limit, da Adress-Geocoding selbst ungenau sein kann.
const GEO_WARNUNG_METER = 2000;

export function StempeluhrView({ profil, projekte, session, kolonnen = [], aufgaben = [] }) {
  const [status,      setStatus]      = useState("aus");   // aus | ein | pause
  const [aktiveBuchung, setAktiveBuchung] = useState(null);
  const [gps,         setGPS]         = useState(null);
  const [gpsLaden,    setGPSLaden]    = useState(false);
  const [aktionLaeuft,setAktionLaeuft]= useState(false);
  const [gpsError,    setGPSError]    = useState("");
  const [geoWarnung,  setGeoWarnung]  = useState("");
  const [aktionsFehler, setAktionsFehler] = useState("");
  const projektGeoCache = useRef({});
  const [jetzt,       setJetzt]       = useState(new Date());
  const [buchungen,   setBuchungen]   = useState([]);
  const [aktivProjekt,setAktivProjekt]= useState(projekte[0]?.id || null);
  const [notiz,       setNotiz]       = useState("");
  const [taetigkeit,  setTaetigkeit]  = useState("beton");
  const [aufgabeId,   setAufgabeId]   = useState(null);
  // Sobald eine Aufgabe mit passendem Typ gewählt wird, ist die Tätigkeit
  // dadurch bereits eindeutig vorgegeben — die volle Auswahl-Chipleiste
  // wäre dann nur noch redundanter Klickaufwand. true = Chipleiste
  // eingeklappt (nur noch Zusammenfassung mit "Ändern"-Option).
  const [taetigkeitEingeklappt, setTaetigkeitEingeklappt] = useState(false);
  const [zeigeSammel, setZeigeSammel] = useState(false);
  useBackButton(zeigeSammel, () => setZeigeSammel(false));

  // Offene Aufgaben des gewählten Projekts — Grundlage für den späteren
  // Soll/Ist-Stundenvergleich pro Aufgabe. Optional: nicht jede Arbeitszeit
  // lässt sich einer einzelnen Aufgabe zuordnen.
  const offeneAufgaben = aufgaben.filter(a => a.projekt_id === aktivProjekt && a.status !== "abgeschlossen");

  // Tätigkeits-Chips auf das aktive Projekt zuschneiden: "Aufräumen",
  // "Transport", "Vorarbeit" und "Sonstiges" passen zu jedem Projekt und
  // bleiben deshalb immer sichtbar, unabhängig von dessen Aufgaben.
  // Gibt es im Projekt offene Aufgaben mit einem Typ, der auch eine
  // Tätigkeit ist (Beton/Schalung/Bewehrung/Abdichtung/Estrich), wird die
  // Chipleiste auf genau diese plus die generischen vier eingeschränkt.
  // Ohne ein solches Signal (noch keine Aufgaben, oder nur Allgemein/
  // Mangel-Aufgaben) bleibt die volle Liste sichtbar — eine Einschränkung
  // auf eine leere oder zu kleine Auswahl würde sonst nur im Weg stehen.
  const GENERISCHE_TAETIGKEITEN = ["aufraeumen", "transport", "vorarbeit", "sonstiges"];
  const projektTaetigkeitsTypen = new Set(
    offeneAufgaben.map(a => a.typ).filter(typ => TAETIGKEITEN[typ])
  );
  const sichtbareTaetigkeiten = projektTaetigkeitsTypen.size > 0
    ? Object.entries(TAETIGKEITEN).filter(([key]) =>
        GENERISCHE_TAETIGKEITEN.includes(key) || projektTaetigkeitsTypen.has(key))
    : Object.entries(TAETIGKEITEN);

  // Eigene Kolonne finden (für Vorarbeiter mit Team-Sammelerfassung)
  const eigeneKolonne = kolonnen.find(k => k.id === profil?.kolonne_id);
  const kannSammelStempeln = ROLLEN[profil?.rolle]?.label === "Vorarbeiter" ||
    profil?.rolle === "vorarbeiter" || profil?.rolle === "polier" || profil?.rolle === "administrator";

  // Alle Hooks müssen vor jedem bedingten return stehen (Rules of Hooks) —
  // vorher standen diese beiden useEffect() nach dem Sammelstempel-
  // Frühausstieg, sodass beim Öffnen des Sammelstempelns zwischen zwei
  // Renderdurchläufen eine unterschiedliche Anzahl Hooks aufgerufen wurde
  // und React abstürzte.

  // Uhr aktualisieren
  useEffect(() => {
    const t = setInterval(() => setJetzt(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Heutige Buchungen laden
  useEffect(() => {
    ladeBuchungen();
  }, []);

  // Bei Projektwechsel ODER wenn sich die offenen Aufgaben des aktiven
  // Projekts ändern (z.B. jemand anderes schließt währenddessen die letzte
  // Beton-Aufgabe), kann die bisherige Tätigkeits-Auswahl außerhalb der neu
  // gefilterten Chipleiste liegen — dann auf die erste sichtbare Tätigkeit
  // zurücksetzen, damit nie eine unsichtbare Auswahl aktiv bleibt. Als
  // Abhängigkeit dient ein stabiler String aus den sichtbaren Schlüsseln
  // statt sichtbareTaetigkeiten selbst, da dieses Array bei jedem Render neu
  // entsteht und sonst den Effekt bei jedem Render erneut auslösen würde.
  const sichtbareTaetigkeitenSchluessel = sichtbareTaetigkeiten.map(([key]) => key).join(",");
  useEffect(() => {
    if (sichtbareTaetigkeiten.length > 0 && !sichtbareTaetigkeiten.some(([key]) => key === taetigkeit)) {
      setTaetigkeit(sichtbareTaetigkeiten[0][0]);
    }
  }, [aktivProjekt, sichtbareTaetigkeitenSchluessel]);

  if (zeigeSammel && eigeneKolonne) {
    return (
      <KolonnenSammelstempel
        kolonne={eigeneKolonne}
        projekte={projekte}
        aufgaben={aufgaben}
        session={session}
        onClose={() => setZeigeSammel(false)}
      />
    );
  }

  async function ladeBuchungen() {
    if (!session?.access_token) return;
    const heute = new Date().toISOString().slice(0,10);
    const data = await sbFetch(
      `zeitbuchungen?profil_id=eq.${profil.id}&eingestempelt_at=gte.${heute}T00:00:00&order=eingestempelt_at.desc`,
      { headers: { "Authorization": `Bearer ${session.access_token}` } }
    );
    if (data) {
      setBuchungen(data);
      const aktive = data.find(b => b.status === "aktiv" || b.status === "pause");
      if (aktive) {
        setAktiveBuchung(aktive);
        setStatus(aktive.status);
      }
    }
  }

  async function pruefeGeoPlausibilitaet(pos) {
    const projekt = projekte.find(p => p.id === aktivProjekt);
    const adresse = projekt && [projekt.adresse, projekt.plz, projekt.ort].filter(Boolean).join(", ");
    if (!adresse) { setGeoWarnung(""); return; }

    let ziel = projektGeoCache.current[projekt.id];
    if (ziel === undefined) {
      ziel = await geocodeAdresse(adresse);
      projektGeoCache.current[projekt.id] = ziel;
    }
    if (!ziel) { setGeoWarnung(""); return; } // Adresse nicht geocodierbar — kein Fehlalarm

    const distanz = haversineMeters(pos.lat, pos.lng, ziel.lat, ziel.lon);
    setGeoWarnung(distanz > GEO_WARNUNG_METER
      ? `⚠️ Standort ist ${(distanz/1000).toFixed(1)} km von der Baustellenadresse entfernt`
      : "");
  }

  async function holeGPS() {
    setGPSLaden(true); setGPSError("");
    try {
      const pos = await getGPSPosition();
      const adresse = await reverseGeocode(pos.lat, pos.lng);
      const result = { ...pos, adresse };
      setGPS(result);
      pruefeGeoPlausibilitaet(pos); // nicht blockierend, nur Hinweis
      return result;
    } catch(e) {
      setGPSError("GPS nicht verfügbar — bitte Standort aktivieren");
      return null;
    } finally { setGPSLaden(false); }
  }

  async function einstempeln() {
    // Schutz gegen Doppel-Tap: ohne diese Sperre konnte ein zweiter Klick
    // während des GPS-Holens/POST-Requests eine zweite aktive Zeitbuchung
    // für denselben Tag erzeugen (der Button war in diesem Zeitfenster
    // wieder aktiv, da nur gpsLaden geprüft wurde).
    if (aktionLaeuft) return;
    setAktionLaeuft(true);
    setAktionsFehler("");
    try {
      const pos = await holeGPS();
      const buchung = {
        profil_id:        profil.id,
        projekt_id:       aktivProjekt,
        kolonne_id:       profil.kolonne_id || null,
        eingestempelt_at: new Date().toISOString(),
        ein_lat:          pos?.lat,
        ein_lng:          pos?.lng,
        ein_adresse:      pos?.adresse || null,
        status:           "aktiv",
        notiz:            notiz || null,
        taetigkeit:       taetigkeit,
        aufgabe_id:       aufgabeId,
      };

      if (session?.access_token) {
        const data = await sbFetch("zeitbuchungen", {
          method: "POST",
          headers: { "Authorization": `Bearer ${session.access_token}` },
          body: JSON.stringify(buchung),
        });
        // Ohne erfolgreiche Server-Antwort NICHT auf "eingestempelt" wechseln
        // — sonst zeigt die UI einen aktiven Status ohne aktiveBuchung, und
        // "Ausstempeln" läuft später ins Leere, bis der Nutzer neu lädt.
        if (!data?.[0]) {
          setAktionsFehler("Einstempeln fehlgeschlagen — bitte Verbindung prüfen und erneut versuchen.");
          return;
        }
        setAktiveBuchung(data[0]);
      } else {
        // Demo-Modus: lokal
        const demo = { ...buchung, id: Date.now() };
        setAktiveBuchung(demo);
        setBuchungen(prev => [demo, ...prev]);
      }
      setStatus("ein");
    } finally {
      setAktionLaeuft(false);
    }
  }

  async function pauseStart() {
    if (!aktiveBuchung || aktionLaeuft) return;
    setAktionLaeuft(true);
    setAktionsFehler("");
    try {
      const update = { pause_start_at: new Date().toISOString(), status: "pause" };
      if (session?.access_token) {
        const data = await sbFetch(`zeitbuchungen?id=eq.${aktiveBuchung.id}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${session.access_token}` },
          body: JSON.stringify(update),
        });
        if (!data?.length) {
          setAktionsFehler("Pause konnte nicht gestartet werden — bitte Verbindung prüfen.");
          return;
        }
      }
      setAktiveBuchung(prev => ({ ...prev, ...update }));
      setStatus("pause");
    } finally {
      setAktionLaeuft(false);
    }
  }

  async function pauseEnde() {
    if (!aktiveBuchung || aktionLaeuft) return;
    setAktionLaeuft(true);
    setAktionsFehler("");
    try {
      const update = { pause_ende_at: new Date().toISOString(), status: "aktiv" };
      if (session?.access_token) {
        const data = await sbFetch(`zeitbuchungen?id=eq.${aktiveBuchung.id}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${session.access_token}` },
          body: JSON.stringify(update),
        });
        if (!data?.length) {
          setAktionsFehler("Pause konnte nicht beendet werden — bitte Verbindung prüfen.");
          return;
        }
      }
      setAktiveBuchung(prev => ({ ...prev, ...update }));
      setStatus("ein");
    } finally {
      setAktionLaeuft(false);
    }
  }

  async function ausstempeln() {
    if (aktionLaeuft || !aktiveBuchung) return;
    setAktionLaeuft(true);
    setAktionsFehler("");
    try {
      const pos = await holeGPS();

      const ein  = new Date(aktiveBuchung.eingestempelt_at);
      const aus  = new Date();
      const pauseMin = aktiveBuchung.pause_start_at && aktiveBuchung.pause_ende_at
        ? Math.round((new Date(aktiveBuchung.pause_ende_at) - new Date(aktiveBuchung.pause_start_at)) / 60000)
        : 0;
      const nettoMin = Math.round((aus - ein) / 60000) - pauseMin;

      const update = {
        ausgestempelt_at: aus.toISOString(),
        aus_lat:          pos?.lat,
        aus_lng:          pos?.lng,
        aus_adresse:      pos?.adresse || null,
        netto_minuten:    nettoMin,
        status:           "abgeschlossen",
      };

      if (session?.access_token) {
        const data = await sbFetch(`zeitbuchungen?id=eq.${aktiveBuchung.id}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${session.access_token}` },
          body: JSON.stringify(update),
        });
        // Ohne Bestätigung vom Server NICHT auf "ausgestempelt" wechseln —
        // sonst bleibt die Buchung serverseitig aktiv, während die UI dem
        // Nutzer zeigt, die Arbeitszeit sei bereits abgeschlossen erfasst.
        if (!data?.length) {
          setAktionsFehler("Ausstempeln fehlgeschlagen — bitte Verbindung prüfen und erneut versuchen.");
          return;
        }
      }
      setAktiveBuchung(null);
      setStatus("aus");
      await ladeBuchungen();
    } finally {
      setAktionLaeuft(false);
    }
  }

  // Laufzeit berechnen
  const laufzeit = aktiveBuchung && status !== "aus"
    ? Math.round((jetzt - new Date(aktiveBuchung.eingestempelt_at)) / 60000)
    : 0;
  const laufzeitStr = `${Math.floor(laufzeit/60)}h ${(laufzeit%60).toString().padStart(2,"0")}min`;

  const STATUS_FARBE = { aus: "var(--ink-text2)", ein: "#22C55E", pause: "var(--yellow)" };

  return (
    <div>
      {/* Uhr — dunkler Anker-Header, ein Daumen, ein Tap */}
      <div style={{ background:"var(--ink)", color:"#fff", padding:"20px 20px",
        marginBottom:12, textAlign:"center", marginLeft:-14, marginRight:-14,
        width:"calc(100% + 28px)" }}>
        <div style={{ fontSize:11, fontWeight:600, color:"var(--ink-text2)",
          textTransform:"uppercase", letterSpacing:2.4, marginBottom:6 }}>
          {jetzt.toLocaleDateString("de-DE", { weekday:"long", day:"2-digit", month:"long" })}
        </div>
        <div className="num" style={{ fontSize:56, fontWeight:800, color:"#fff",
          letterSpacing:-2.5, lineHeight:1.05 }}>
          {jetzt.toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" })}
        </div>

        {/* Status */}
        <div style={{ display:"inline-flex", alignItems:"center", gap:8,
          background:"rgba(255,255,255,.09)", padding:"7px 14px", marginTop:12 }}>
          <div style={{ width:8, height:8, borderRadius:4,
            background: STATUS_FARBE[status],
            animation: status === "ein" ? "pulse 2s infinite" : "none" }} />
          <span style={{ fontSize:12.5, fontWeight:700, color: status==="aus" ? "var(--ink-text2)" : "#fff" }}>
            { status === "aus"   ? "Nicht eingestempelt"
            : status === "ein"   ? `Eingestempelt · ${laufzeitStr}`
            : `Pause · ${laufzeitStr}` }
          </span>
        </div>

        {/* GPS Position */}
        {gps && (
          <div style={{ marginTop:10, fontSize:11, color:"var(--ink-text2)", display:"flex",
            alignItems:"center", justifyContent:"center", gap:5 }}>
            <MapPin size={12} />{gps.adresse} · ±{gps.genauigkeit}m
          </div>
        )}
        {gpsError && (
          <div style={{ marginTop:8, fontSize:11, color:"#FCA5A5" }}>{gpsError}</div>
        )}
        {geoWarnung && (
          <div style={{ marginTop:8, fontSize:11, color:"#FDBA74" }}>{geoWarnung}</div>
        )}
        {aktionsFehler && (
          <div style={{ marginTop:8, fontSize:11, color:"#FCA5A5" }}>{aktionsFehler}</div>
        )}
      </div>

      {/* Kolonnen-Sammelerfassung — nur wenn eigene Kolonne + berechtigte Rolle */}
      {eigeneKolonne && kannSammelStempeln && status === "aus" && (
        <button onClick={() => setZeigeSammel(true)}
          style={{ width:"100%", background:"var(--bbg)", color:"var(--blue)",
            border:"2px solid var(--blue)", padding:14,
            fontWeight:700, fontSize:14, cursor:"pointer", marginBottom:14,
            fontFamily:"inherit", display:"flex", alignItems:"center",
            justifyContent:"center", gap:8 }}>
          <Users size={18} />Für Kolonne „{eigeneKolonne.name}" sammelbuchen
        </button>
      )}

      {/* Projekt Auswahl */}
      {status === "aus" && (
        <>
          <div style={{ marginBottom:9 }}>
            <Label>Projekt</Label>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:6 }}>
              {projekte.map(p => (
                <button key={p.id} onClick={() => { setAktivProjekt(p.id); setAufgabeId(null); }}
                  style={{ background:"var(--surface)",
                    border:`1px solid ${'var(--border)'}`,
                    borderLeft:`4px solid ${aktivProjekt===p.id ? "var(--yellow)" : "var(--border)"}`,
                    padding:"13px 15px", cursor:"pointer",
                    fontFamily:"inherit", textAlign:"left",
                    display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:22, height:22, flex:"none",
                    border:`2px solid ${aktivProjekt===p.id ? "var(--yellow)" : "rgba(0,0,0,.18)"}`,
                    background: aktivProjekt===p.id ? "var(--yellow)" : "transparent",
                    display:"flex", alignItems:"center", justifyContent:"center", color:"var(--ink)" }}>
                    {aktivProjekt===p.id && <Check size={14} strokeWidth={3} />}
                  </div>
                  <span style={{ color:"var(--text)", fontSize:14.5,
                    fontWeight: aktivProjekt===p.id ? 700 : 600 }}>{p.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <Label>Tätigkeit</Label>
            {taetigkeitEingeklappt ? (
              <div onClick={() => setTaetigkeitEingeklappt(false)}
                style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                  background:"var(--ink)", color:"#fff", padding:"10px 14px",
                  cursor:"pointer", marginTop:6 }}>
                <span style={{ fontSize:12.5, fontWeight:700 }}>
                  {TAETIGKEITEN[taetigkeit]?.icon} {TAETIGKEITEN[taetigkeit]?.label}
                  <span style={{ fontWeight:500, color:"var(--ink-text2)", marginLeft:7 }}>
                    · von Aufgabe übernommen
                  </span>
                </span>
                <span style={{ fontSize:11.5, fontWeight:700, textDecoration:"underline" }}>Ändern</span>
              </div>
            ) : (
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:6 }}>
                {sichtbareTaetigkeiten.map(([key, t]) => (
                  <button key={key} onClick={() => setTaetigkeit(key)}
                    style={{ background: taetigkeit===key ? "var(--ink)" : "var(--surface)",
                      color: taetigkeit===key ? "#fff" : "var(--text2)",
                      border:`1px solid ${taetigkeit===key ? "var(--ink)" : "var(--border2)"}`,
                      padding:"10px 14px", cursor:"pointer",
                      fontSize:12.5, fontWeight: taetigkeit===key ? 700 : 600,
                      fontFamily:"inherit" }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {offeneAufgaben.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <Label>Aufgabe (optional)</Label>
              <select value={aufgabeId ?? ""} onChange={e => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setAufgabeId(id);
                  const gewaehlte = offeneAufgaben.find(a => a.id === id);
                  // Aufgaben- und Tätigkeitstypen teilen sich dieselben
                  // Schlüssel für Beton/Schalung/Bewehrung/Abdichtung/Estrich
                  // (TAETIGKEITEN hat zusätzlich Aufräumen/Transport/
                  // Vorarbeit/Sonstiges, AUFGABEN_TYPEN zusätzlich Allgemein/
                  // Mangel) — nur bei einem gemeinsamen Schlüssel automatisch
                  // übernehmen, sonst bleibt die Auswahl dem Nutzer überlassen.
                  if (gewaehlte && TAETIGKEITEN[gewaehlte.typ]) {
                    setTaetigkeit(gewaehlte.typ);
                    setTaetigkeitEingeklappt(true);
                  } else {
                    setTaetigkeitEingeklappt(false);
                  }
                }}
                style={{ ...inputStyle(), padding:"11px 12px" }}>
                <option value="">— keine bestimmte Aufgabe —</option>
                {offeneAufgaben.map(a => (
                  <option key={a.id} value={a.id}>{a.titel}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ marginBottom:12 }}>
            <Label>Notiz (optional)</Label>
            <input value={notiz} onChange={e => setNotiz(e.target.value)}
              placeholder="z.B. Bewehrungsarbeiten B1" style={inputStyle()} />
          </div>
        </>
      )}

      {/* Aktive Buchung Info */}
      {aktiveBuchung && status !== "aus" && (
        <div style={{ background:"var(--surface)", padding:12,
          marginBottom:12, border:"1px solid var(--border)" }}>
          <div style={{ color:"var(--muted)", fontSize:11, marginBottom:4, fontWeight:700,
            textTransform:"uppercase", letterSpacing:0.6 }}>Aktuelle Buchung</div>
          <div style={{ color:"var(--text)", fontSize:14, fontWeight:700 }}>
            {projekte.find(p=>p.id===aktiveBuchung.projekt_id)?.name || "—"}
          </div>
          {aktiveBuchung.aufgabe_id && (
            <div style={{ color:"var(--text)", fontSize:12, marginTop:4 }}>
              🔧 {aufgaben.find(a=>a.id===aktiveBuchung.aufgabe_id)?.titel || "Aufgabe"}
            </div>
          )}
          {aktiveBuchung.taetigkeit && (
            <div style={{ color:"var(--ydark)", fontSize:12, marginTop:4,
              fontWeight:600 }}>
              {TAETIGKEITEN[aktiveBuchung.taetigkeit]?.icon} {TAETIGKEITEN[aktiveBuchung.taetigkeit]?.label}
            </div>
          )}
          {aktiveBuchung.ein_adresse && (
            <div style={{ color:"var(--muted)", fontSize:11, marginTop:6, display:"flex", alignItems:"center", gap:5 }}>
              <MapPin size={12} />Eingestempelt: {aktiveBuchung.ein_adresse}
            </div>
          )}
          {aktiveBuchung.notiz && (
            <div style={{ color:"var(--muted)", fontSize:11, marginTop:2 }}>
              {aktiveBuchung.notiz}
            </div>
          )}
        </div>
      )}

      {/* Buttons — ein Daumen, ein Tap: mindestens 56px hoch */}
      <div style={{ display:"flex", gap:10, marginBottom:12 }}>
        {status === "aus" && (
          <button onClick={einstempeln} disabled={gpsLaden || aktionLaeuft || !aktivProjekt}
            style={{ flex:1, background:"#15803D", color:"#fff",
              border:"none", padding:22, fontWeight:800,
              fontSize:19, cursor:"pointer", fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:12,
              letterSpacing:-0.2,
              boxShadow:"0 6px 18px rgba(21,128,61,0.28)",
              opacity: gpsLaden || aktionLaeuft || !aktivProjekt ? 0.6 : 1 }}>
            <Play size={26} fill="#fff" />{gpsLaden || aktionLaeuft ? "GPS…" : "Einstempeln"}
          </button>
        )}
        {status === "ein" && (
          <>
            <button onClick={pauseStart} disabled={aktionLaeuft}
              style={{ flex:1, background:"var(--ybg)", color:"var(--ydark)",
                border:"1.5px solid var(--yellow)", padding:18,
                fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                opacity: aktionLaeuft ? 0.6 : 1 }}>
              <Pause size={18} />Pause
            </button>
            <button onClick={ausstempeln} disabled={gpsLaden || aktionLaeuft}
              style={{ flex:1, background:"var(--red)", color:"#fff",
                border:"none", padding:18, fontWeight:800,
                fontSize:15, cursor:"pointer", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                opacity: gpsLaden || aktionLaeuft ? 0.6 : 1 }}>
              <Square size={16} fill="#fff" />{gpsLaden || aktionLaeuft ? "…" : "Ausstempeln"}
            </button>
          </>
        )}
        {status === "pause" && (
          <button onClick={pauseEnde} disabled={aktionLaeuft}
            style={{ flex:1, background:"var(--yellow)", color:"#1a1200",
              border:"none", padding:22, fontWeight:800,
              fontSize:19, cursor:"pointer", fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
            <Play size={26} fill="#1a1200" />Weiterarbeiten
          </button>
        )}
      </div>
      {status === "aus" && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6,
          marginBottom:14, color:"var(--muted)", fontSize:11.5, fontWeight:600 }}>
          <SatelliteDish size={13} />GPS wird beim Stempeln erfasst
        </div>
      )}

      {/* Heutige Buchungen */}
      {buchungen.filter(b=>b.status==="abgeschlossen").length > 0 && (
        <div style={{ marginTop: status==="aus" ? 4 : 20 }}>
          <div style={{ color:"var(--text)", fontWeight:800, fontSize:13, marginBottom:7 }}>
            Heute erfasst
          </div>
          {buchungen.filter(b=>b.status==="abgeschlossen").map(b => (
            <div key={b.id} style={{ background:"var(--surface)",
              padding:"9px 16px", marginBottom:6, border:"1px solid var(--border)",
              display:"flex", alignItems:"center", gap:12 }}>
              <Clock3 size={18} color="var(--muted)" />
              <div style={{ flex:1 }}>
                <div className="num" style={{ fontSize:13.5, fontWeight:700, color:"var(--text)" }}>
                  {new Date(b.eingestempelt_at).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}
                  {" → "}
                  {b.ausgestempelt_at ? new Date(b.ausgestempelt_at).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}) : "—"}
                </div>
                {b.ein_adresse && <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>{b.ein_adresse}</div>}
                {b.taetigkeit && (
                  <div style={{ fontSize:10, color:"var(--ydark)", marginTop:2, fontWeight:600 }}>
                    {TAETIGKEITEN[b.taetigkeit]?.icon} {TAETIGKEITEN[b.taetigkeit]?.label}
                  </div>
                )}
              </div>
              <div className="num" style={{ fontWeight:800, color:"var(--text)", fontSize:15 }}>
                {b.netto_minuten ? `${Math.floor(b.netto_minuten/60)}h ${b.netto_minuten%60}min` : "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:0.6;transform:scale(1.3)}
        }
      `}</style>
    </div>
  );
}
