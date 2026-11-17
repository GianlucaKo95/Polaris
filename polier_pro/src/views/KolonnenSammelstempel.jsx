import { useState } from "react";
import { createPortal } from "react-dom";
import { HardHat, X, MapPin, Check, CircleCheckBig, TriangleAlert, Play, KeyRound, SkipForward } from "lucide-react";
import { getGPSPosition, reverseGeocode } from "../lib/geo.js";
import { sbFetch } from "../lib/supabase.js";
import { sha256Hex } from "../lib/utils.js";
import { Label } from "../components/Label.jsx";
import { TAETIGKEITEN } from "../config/konstanten.js";

const MAX_VERSUCHE = 3;

export function KolonnenSammelstempel({ kolonne, projekte, aufgaben = [], session, onClose }) {
  const [ausgewaehlt, setAusgewaehlt] = useState(() => {
    const sel = {};
    (kolonne.mitarbeiter || []).forEach((_, i) => sel[i] = true);
    return sel;
  });
  const [aktivProjekt, setAktivProjekt] = useState(projekte[0]?.id || null);
  const [taetigkeit,   setTaetigkeit]   = useState("beton");
  const [aufgabeId,    setAufgabeId]    = useState(null);
  const [gpsLaden,     setGpsLaden]     = useState(false);

  const offeneAufgaben = aufgaben.filter(a => a.projekt_id === aktivProjekt && a.status !== "abgeschlossen");

  // auswahl → pin (jede Person bestätigt sich selbst) → ergebnis
  const [phase,        setPhase]        = useState("auswahl");
  const [warteschlange,setWarteschlange]= useState([]); // Mitarbeiter mit PIN, einer nach dem anderen
  const [index,        setIndex]        = useState(0);
  const [pinEingabe,   setPinEingabe]   = useState("");
  const [pinFehler,    setPinFehler]    = useState("");
  const [versuche,     setVersuche]     = useState(0);
  const [posDaten,     setPosDaten]     = useState(null);
  const [buchtGerade,  setBuchtGerade]  = useState(false);
  const [ergebnisse,   setErgebnisse]   = useState([]); // {name, status}

  const anzahlAusgewaehlt = Object.values(ausgewaehlt).filter(Boolean).length;

  async function weiterZurBestaetigung() {
    setGpsLaden(true);
    let pos = null, adresse = null;
    try {
      pos = await getGPSPosition();
      adresse = await reverseGeocode(pos.lat, pos.lng);
    } catch { /* GPS optional — Buchung geht auch ohne */ }
    setGpsLaden(false);
    setPosDaten({ pos, adresse });

    const ausgewaehlteMitarbeiter = (kolonne.mitarbeiter || []).filter((_, i) => ausgewaehlt[i]);
    const mitPin  = ausgewaehlteMitarbeiter.filter(m => m.pinHash);
    const ohnePin = ausgewaehlteMitarbeiter.filter(m => !m.pinHash);

    setErgebnisse(ohnePin.map(m => ({ name: m.name, status: "keine_pin" })));
    setWarteschlange(mitPin);
    setIndex(0);
    setPinEingabe("");
    setPinFehler("");
    setVersuche(0);

    if (mitPin.length === 0) setPhase("ergebnis");
    else setPhase("pin");
  }

  async function buchePerson(mitarbeiter) {
    const { pos, adresse } = posDaten || {};
    const buchung = {
      profil_id:        null, // kein eigener Account — Name in Notiz
      projekt_id:       aktivProjekt,
      kolonne_id:       kolonne.id,
      eingestempelt_at: new Date().toISOString(),
      ein_lat:          pos?.lat,
      ein_lng:          pos?.lng,
      ein_adresse:      adresse || null,
      status:           "aktiv",
      taetigkeit:       taetigkeit,
      aufgabe_id:       aufgabeId,
      notiz:            `Sammelbuchung Kolonne ${kolonne.name}: ${mitarbeiter.name}`,
    };
    if (session?.access_token) {
      const data = await sbFetch("zeitbuchungen", {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify(buchung),
      });
      return !!data?.[0];
    }
    return true; // Demo-Modus: immer "erfolgreich"
  }

  function naechstePerson() {
    if (index + 1 >= warteschlange.length) { setPhase("ergebnis"); return; }
    setIndex(i => i + 1);
    setPinEingabe("");
    setPinFehler("");
    setVersuche(0);
  }

  async function pinBestaetigen() {
    if (buchtGerade || pinEingabe.length !== 4) return;
    const mitarbeiter = warteschlange[index];
    const hash = await sha256Hex(pinEingabe);
    if (hash !== mitarbeiter.pinHash) {
      const neueVersuche = versuche + 1;
      setVersuche(neueVersuche);
      setPinEingabe("");
      if (neueVersuche >= MAX_VERSUCHE) {
        setErgebnisse(prev => [...prev, { name: mitarbeiter.name, status: "falsche_pin" }]);
        naechstePerson();
      } else {
        setPinFehler(`Falsche PIN — noch ${MAX_VERSUCHE - neueVersuche} Versuch${MAX_VERSUCHE - neueVersuche===1?"":"e"}.`);
      }
      return;
    }
    setBuchtGerade(true);
    const erfolg = await buchePerson(mitarbeiter);
    setBuchtGerade(false);
    setErgebnisse(prev => [...prev, { name: mitarbeiter.name, status: erfolg ? "bestaetigt" : "fehler" }]);
    naechstePerson();
  }

  function ueberspringen() {
    const mitarbeiter = warteschlange[index];
    setErgebnisse(prev => [...prev, { name: mitarbeiter.name, status: "uebersprungen" }]);
    naechstePerson();
  }

  const ERGEBNIS_LABEL = {
    bestaetigt:    { label: "Eingestempelt",        farbe: "var(--green)" },
    fehler:        { label: "Fehler beim Speichern", farbe: "var(--red)" },
    falsche_pin:   { label: "Falsche PIN",           farbe: "var(--red)" },
    uebersprungen: { label: "Übersprungen",          farbe: "var(--muted)" },
    keine_pin:     { label: "Keine PIN hinterlegt",  farbe: "var(--muted)" },
  };
  const anzahlErfolgreich = ergebnisse.filter(e => e.status === "bestaetigt").length;

  // Als Portal direkt in document.body gerendert — verschachtelt im
  // normalen Baum bricht die iOS-Standalone-PWA sonst denselben
  // nested-position:fixed-Stacking-Context-Bug wie beim Aufgabenformular
  // (Bootstrap-Bar der App liegt trotz korrekter z-Index-Werte darüber).
  return createPortal(
    <div className="voll-overlay" style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
      background:"var(--bg)", zIndex:500, overflowY:"auto",
      WebkitOverflowScrolling:"touch" }}>

      <div style={{ background:"var(--surface)", padding:"10px 18px",
        paddingTop:"calc(14px + env(safe-area-inset-top))",
        borderBottom:"3px solid var(--yellow)", position:"sticky", top:0,
        zIndex:10, display:"flex", justifyContent:"space-between",
        alignItems:"center" }}>
        <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:17,
          display:"flex", alignItems:"center", gap:8 }}>
          <HardHat size={16} /> Kolonne einstempeln
        </div>
        <button onClick={onClose}
          style={{ background:"var(--surface2)", border:"1px solid var(--border)",
            color:"var(--text)", borderRadius:8, padding:"6px 14px",
            cursor:"pointer", fontSize:14, fontFamily:"inherit", display:"flex" }}><X size={15} /></button>
      </div>

      <div style={{ padding:"18px 16px 100px" }}>

        {phase === "auswahl" && (
          <>
            <div style={{ color:"var(--muted)", fontSize:13, marginBottom:12,
              lineHeight:1.5 }}>
              Stempelt <strong>{kolonne.name}</strong> gesammelt ein. Jede
              ausgewählte Person mit hinterlegter PIN bestätigt sich danach
              selbst — der Vorarbeiter kann niemanden ohne dessen PIN
              einstempeln.
            </div>

            <div style={{ marginBottom:10 }}>
              <Label>Projekt</Label>
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:6 }}>
                {projekte.map(p => (
                  <button key={p.id} onClick={() => { setAktivProjekt(p.id); setAufgabeId(null); }}
                    style={{ background: aktivProjekt===p.id ? "var(--ybg)" : "var(--surface)",
                      color:"var(--text)", border:`2px solid ${aktivProjekt===p.id ? "var(--yellow)" : "var(--border)"}`,
                      borderRadius:12, padding:"10px 14px", cursor:"pointer",
                      fontFamily:"inherit", textAlign:"left",
                      fontWeight: aktivProjekt===p.id ? 700 : 400, fontSize:13 }}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:12 }}>
              <Label>Tätigkeit</Label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
                {Object.entries(TAETIGKEITEN).map(([key, t]) => (
                  <button key={key} onClick={() => setTaetigkeit(key)}
                    style={{ background: taetigkeit===key ? "var(--ybg)" : "var(--surface2)",
                      color: taetigkeit===key ? "var(--ydark)" : "var(--muted)",
                      border:`1.5px solid ${taetigkeit===key ? "var(--yellow)" : "var(--border)"}`,
                      borderRadius:20, padding:"6px 12px", cursor:"pointer",
                      fontSize:12, fontWeight: taetigkeit===key ? 700 : 400,
                      fontFamily:"inherit" }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {offeneAufgaben.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <Label>Aufgabe (optional)</Label>
                <select value={aufgabeId ?? ""} onChange={e => setAufgabeId(e.target.value ? Number(e.target.value) : null)}
                  style={{ width:"100%", background:"var(--surface)", color:"var(--text)",
                    border:"1.5px solid var(--border)", borderRadius:10, padding:"10px 12px",
                    fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }}>
                  <option value="">— keine bestimmte Aufgabe —</option>
                  {offeneAufgaben.map(a => (
                    <option key={a.id} value={a.id}>{a.titel}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:7 }}>
              <Label>Mitarbeiter</Label>
              <div style={{ color:"var(--muted)", fontSize:12 }}>
                {anzahlAusgewaehlt} / {(kolonne.mitarbeiter||[]).length} ausgewählt
              </div>
            </div>

            {(kolonne.mitarbeiter||[]).length === 0 && (
              <div style={{ background:"var(--surface)", borderRadius:12,
                padding:"14px 16px", textAlign:"center", color:"var(--muted)",
                fontSize:13, border:"1px solid var(--border)" }}>
                Diese Kolonne hat noch keine Mitarbeiter hinterlegt.
                Füge sie in der Kolonnen-Verwaltung hinzu.
              </div>
            )}

            {(kolonne.mitarbeiter||[]).map((mitarbeiter, i) => (
              <div key={mitarbeiter.id ?? i} onClick={() => setAusgewaehlt(p=>({...p,[i]:!p[i]}))}
                style={{ display:"flex", alignItems:"center", gap:10,
                  background:"var(--surface)", borderRadius:10,
                  padding:"7px 14px", marginBottom:6, cursor:"pointer",
                  border:`1.5px solid ${ausgewaehlt[i] ? "var(--yellow)" : "var(--border)"}` }}>
                <div style={{ width:22, height:22, borderRadius:6, flexShrink:0,
                  background: ausgewaehlt[i] ? "var(--yellow)" : "var(--surface2)",
                  border:`1.5px solid ${ausgewaehlt[i] ? "var(--yellow)" : "var(--border)"}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"#1a1200" }}>
                  {ausgewaehlt[i] && <Check size={14} />}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ color:"var(--text)", fontSize:13, fontWeight:600 }}>
                    {mitarbeiter.name}
                  </div>
                  {!mitarbeiter.pinHash && (
                    <div style={{ color:"var(--muted)", fontSize:10, marginTop:1 }}>
                      Keine PIN hinterlegt
                    </div>
                  )}
                </div>
                {mitarbeiter.pinHash && <KeyRound size={13} color="var(--muted)" />}
              </div>
            ))}

            <button onClick={weiterZurBestaetigung}
              disabled={gpsLaden || anzahlAusgewaehlt===0 || !aktivProjekt}
              style={{ width:"100%", background: anzahlAusgewaehlt>0 && aktivProjekt ? "var(--green)" : "var(--surface2)",
                color: anzahlAusgewaehlt>0 && aktivProjekt ? "#fff" : "var(--muted)",
                border:"none", borderRadius:14, padding:16, fontWeight:800,
                fontSize:16, marginTop:20,
                cursor: anzahlAusgewaehlt>0 && aktivProjekt ? "pointer" : "default",
                fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              {gpsLaden ? <><MapPin size={15} /> GPS…</> : <><Play size={14} /> Weiter zur Bestätigung</>}
            </button>
          </>
        )}

        {phase === "pin" && warteschlange[index] && (
          <div style={{ textAlign:"center", paddingTop:20 }}>
            <div style={{ color:"var(--muted)", fontSize:12, marginBottom:6 }}>
              Person {index+1} von {warteschlange.length}
            </div>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:"var(--yellow)" }}>
              <KeyRound size={36} />
            </div>
            <div style={{ color:"var(--text)", fontWeight:800, fontSize:20, marginBottom:4 }}>
              {warteschlange[index].name}
            </div>
            <div style={{ color:"var(--muted)", fontSize:13, marginBottom:20 }}>
              Bitte eigene PIN eingeben, um sich selbst einzustempeln
            </div>
            <input value={pinEingabe} onChange={e=>setPinEingabe(e.target.value.replace(/\D/g,"").slice(0,4))}
              type="password" inputMode="numeric" maxLength={4} autoFocus disabled={buchtGerade}
              onKeyDown={e => e.key==="Enter" && pinBestaetigen()}
              style={{ width:140, textAlign:"center", fontSize:28, fontWeight:800,
                letterSpacing:12, padding:"12px 0", borderRadius:12,
                border:`2px solid ${pinFehler ? "var(--red)" : "var(--border)"}`,
                background:"var(--surface)", color:"var(--text)", fontFamily:"inherit" }} />
            {pinFehler && (
              <div style={{ color:"var(--red)", fontSize:12, marginTop:8, fontWeight:700 }}>
                {pinFehler}
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:24 }}>
              <button onClick={ueberspringen} disabled={buchtGerade}
                style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
                  border:"1px solid var(--border)", borderRadius:12, padding:14,
                  cursor:"pointer", fontWeight:700, fontSize:13, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <SkipForward size={15} /> Überspringen
              </button>
              <button onClick={pinBestaetigen} disabled={buchtGerade || pinEingabe.length !== 4}
                style={{ flex:2, background: pinEingabe.length === 4 ? "var(--green)" : "var(--surface2)",
                  color: pinEingabe.length === 4 ? "#fff" : "var(--muted)",
                  border:"none", borderRadius:12, padding:14,
                  cursor: pinEingabe.length === 4 ? "pointer" : "default",
                  fontWeight:800, fontSize:14, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <CircleCheckBig size={16} /> {buchtGerade ? "…" : "Bestätigen"}
              </button>
            </div>
          </div>
        )}

        {phase === "ergebnis" && (
          <div style={{ textAlign:"center", paddingTop:20 }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:12,
              color: anzahlErfolgreich === ergebnisse.length ? "var(--green)" : "var(--yellow)" }}>
              {anzahlErfolgreich === ergebnisse.length ? <CircleCheckBig size={40} /> : <TriangleAlert size={40} />}
            </div>
            <div style={{ color:"var(--text)", fontWeight:800, fontSize:18, marginBottom:16 }}>
              {anzahlErfolgreich} von {ergebnisse.length} eingestempelt
            </div>
            <div style={{ textAlign:"left" }}>
              {ergebnisse.map((e,i) => {
                const l = ERGEBNIS_LABEL[e.status];
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"center", background:"var(--surface)", borderRadius:8,
                    padding:"8px 12px", marginBottom:6, border:"1px solid var(--border)" }}>
                    <span style={{ color:"var(--text)", fontSize:13, fontWeight:600 }}>{e.name}</span>
                    <span style={{ color:l.farbe, fontSize:12, fontWeight:700 }}>{l.label}</span>
                  </div>
                );
              })}
            </div>
            <button onClick={onClose}
              style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
                borderRadius:12, padding:"12px 24px", fontWeight:800,
                cursor:"pointer", fontSize:15, fontFamily:"inherit", marginTop:16 }}>
              Fertig
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
