import { useState, useEffect } from "react";
import { RefreshCw, Info, CircleX, Plus, Phone, User, Building2, ChevronDown, Euro } from "lucide-react";
import { ERFASST_PROXY, erfasstQuery } from "../lib/erfasst.js";
import { sbFetch } from "../lib/supabase.js";
import { taetigkeitAnzeige } from "../config/konstanten.js";
import { Label, inputStyle } from "../components/Label.jsx";
import { KolonneKarte } from "../components/KolonneKarte.jsx";
import { ALLE_GEWERKE } from "../config/konstanten.js";

// Wandelt eine native zeitbuchungen-Zeile in die gleiche Form um, die
// KolonneKarte/MitarbeiterZeilen bisher nur von 123erfasst kannten — so
// müssen diese Komponenten nicht wissen, aus welcher Quelle die Daten kommen.
function alsZeitEintrag(b) {
  const minuten = b.netto_minuten || 0;
  return {
    person: {
      ident:         b.profil_id,
      formattedName: b.profile ? `${b.profile.vorname||""} ${b.profile.nachname||""}`.trim() : "",
    },
    hours:    Math.floor(minuten / 60),
    minutes:  minuten % 60,
    date:     b.eingestempelt_at,
    activity: b.taetigkeit ? { name: taetigkeitAnzeige(b.taetigkeit)?.label || b.taetigkeit } : null,
    note:     b.notiz || "",
  };
}

export function KolonnenView({ kolonnen, projekt, subs = [], setKolonnen, darfBearbeiten = true, kannKolonneLoeschen = false, profil, session }) {
  const [zeitdaten,   setZeitdaten]   = useState([]);
  const [ladeStatus,  setLadeStatus]  = useState("idle"); // idle | loading | ok | error
  const [datenquelle, setDatenquelle] = useState(null);   // "eigen" | "123erfasst"
  const [vonDatum,    setVonDatum]    = useState(() => {
    const d = new Date(); d.setDate(d.getDate()-6);
    return d.toISOString().slice(0,10);
  });
  const [bisDatum,    setBisDatum]    = useState(new Date().toISOString().slice(0,10));
  const [neueKolonne, setNeueKolonne] = useState(false);
  const [kName,       setKName]       = useState("");
  const [kVorarbeiter,setKVorarbeiter]= useState("");
  const [subsOffen,   setSubsOffen]   = useState({}); // { [subId]: boolean }

  const konfiguriert  = !ERFASST_PROXY.includes("DEIN-PROJEKT");
  const erfasstLinked = konfiguriert && !!projekt?.erfasstIdent;

  const totalMann = kolonnen.reduce((s,k) => s + (k.mitarbeiter?.length || 0), 0);
  const totalStd  = zeitdaten.reduce((s,z) => s + (z.hours||0) + (z.minutes||0)/60, 0);

  // Für diese Baustelle zugewiesene Subunternehmer — sub_ids liegt nur als
  // ID-Liste auf dem Projekt, subs (alle Subs der Firma) kommt von App.jsx.
  const projektSubs = (projekt?.sub_ids || [])
    .map(id => subs.find(s => s.id === id))
    .filter(Boolean);

  // Standard: eigene Zeiterfassung (Stempeluhr/zeitbuchungen). 123erfasst
  // ist nur noch Fallback für Projekte, die weiterhin darüber verknüpft
  // sind und im Zeitraum keine eigenen Buchungen haben.
  async function ladeZeiten() {
    if (!projekt?.id) return;
    setLadeStatus("loading");
    try {
      const eigene = await sbFetch(
        `zeitbuchungen?select=*,profile(vorname,nachname)&status=eq.abgeschlossen` +
        `&projekt_id=eq.${projekt.id}` +
        `&eingestempelt_at=gte.${vonDatum}T00:00:00` +
        `&eingestempelt_at=lte.${bisDatum}T23:59:59`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      );
      if (eigene?.length) {
        setZeitdaten(eigene.map(alsZeitEintrag));
        setDatenquelle("eigen");
        setLadeStatus("ok");
        return;
      }
      if (erfasstLinked) {
        const data = await erfasstQuery(Q_TIMES, {
          from:         vonDatum + "T00:00:00",
          to:           bisDatum + "T23:59:59",
          projectIdent: projekt.erfasstIdent,
        });
        setZeitdaten(data?.hoursBlocks?.nodes || []);
        setDatenquelle("123erfasst");
        setLadeStatus("ok");
        return;
      }
      setZeitdaten([]);
      setDatenquelle("eigen");
      setLadeStatus("ok");
    } catch(e) {
      setLadeStatus("error");
    }
  }

  useEffect(() => { ladeZeiten(); }, [vonDatum, bisDatum, projekt?.id, projekt?.erfasstIdent]);

  function kolonneAnlegen() {
    if (!kName.trim() || !setKolonnen) return;
    const vorarbeiterName = kVorarbeiter.trim();
    const neu = {
      id: Date.now(),
      name: kName.trim(),
      vorarbeiter: vorarbeiterName,
      // Der Vorarbeiter, nach dem die Kolonne meist benannt ist, gehört
      // ihr auch als Mitarbeiter an — sonst müsste er zusätzlich manuell
      // in der Mitarbeiterliste angelegt werden.
      mitarbeiter: vorarbeiterName
        ? [{ id: Date.now(), name: vorarbeiterName, rolle: "Vorarbeiter" }]
        : [],
    };
    setKolonnen(prev => [...prev, neu]);
    setKName(""); setKVorarbeiter(""); setNeueKolonne(false);
  }

  return (
    <div>
      {/* KPI Leiste */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
        <div style={{ background: "var(--surface)", borderRadius:10, padding:"8px 12px", borderBottom:`3px solid ${'var(--yellow)'}` }}>
          <div style={{ color: "var(--muted)", fontSize:10 }}>Kolonnen</div>
          <div style={{ color: "var(--text)", fontWeight:800, fontSize:22 }}>{kolonnen.length}</div>
        </div>
        <div style={{ background: "var(--surface)", borderRadius:10, padding:"8px 12px", borderBottom:`3px solid ${'var(--blue)'}` }}>
          <div style={{ color: "var(--muted)", fontSize:10 }}>Mitarbeiter</div>
          <div style={{ color: "var(--text)", fontWeight:800, fontSize:22 }}>{totalMann}</div>
        </div>
        <div style={{ background: "var(--surface)", borderRadius:10, padding:"8px 12px", borderBottom:`3px solid ${'var(--green)'}` }}>
          <div style={{ color: "var(--muted)", fontSize:10 }}>Stunden Σ</div>
          <div style={{ color: "var(--text)", fontWeight:800, fontSize:22 }}>
            {ladeStatus === "ok" ? totalStd.toFixed(1)+"h" : "—"}
          </div>
        </div>
      </div>

      {/* Datumsfilter */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:8, marginBottom:10, alignItems:"end" }}>
        <div>
          <Label>Von</Label>
          <input type="date" value={vonDatum} onChange={e => setVonDatum(e.target.value)} style={inputStyle()} />
        </div>
        <div>
          <Label>Bis</Label>
          <input type="date" value={bisDatum} onChange={e => setBisDatum(e.target.value)} style={inputStyle()} />
        </div>
        <div>
          {/* Unsichtbarer Platzhalter in Label-Höhe, damit der Button genauso
              hoch startet wie die Von/Bis-Felder daneben — sonst (wie vorher)
              blieb er kürzer und falsch ausgerichtet, weil nur die Felder
              selbst ein Label über sich haben. */}
          <div style={{ visibility:"hidden" }}><Label>·</Label></div>
          <button onClick={ladeZeiten}
            style={{ width:"100%", background: "var(--border)", border:`1.5px solid ${'var(--border2)'}`,
              color: "var(--text)", borderRadius:8, padding:"13px 14px", boxSizing:"border-box",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Status-Banner */}
      {ladeStatus === "ok" && datenquelle === "123erfasst" && (
        <div style={{ background: "var(--border)", borderRadius:8, padding:"6px 12px", marginBottom:9,
          display:"flex", gap:8, alignItems:"center" }}>
          <Info size={14} style={{ color:"var(--muted)", flexShrink:0 }} />
          <span style={{ color: "var(--muted)", fontSize:12 }}>
            Keine eigenen Zeitbuchungen im Zeitraum — Stunden aus 123erfasst (Fallback).
          </span>
        </div>
      )}
      {ladeStatus === "error" && (
        <div style={{ background:"#2E1A1A", borderRadius:8, padding:"6px 12px", marginBottom:9, color: "var(--red)", fontSize:12,
          display:"flex", alignItems:"center", gap:6 }}>
          <CircleX size={13} /> Zeitdaten konnten nicht geladen werden.
        </div>
      )}

      {/* Subunternehmer — zugewiesen über "Subunternehmer zuweisen" im
          Baustellen-Formular (ProjektFormular.jsx). Nur Anzeige, keine
          eigene Kolonne: Subs haben keinen Account/Zeiterfassung. */}
      {projektSubs.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:14,
            marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
            <Building2 size={14} /> Subunternehmer ({projektSubs.length})
          </div>
          {projektSubs.map(s => {
            const offen = !!subsOffen[s.id];
            return (
              <div key={s.id} style={{ background:"var(--surface)", borderRadius:11,
                marginBottom:6, overflow:"hidden",
                border:`1.5px solid ${offen ? "var(--border2)" : "var(--border)"}` }}>
                <button onClick={() => setSubsOffen(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                  aria-expanded={offen}
                  style={{ all:"unset", cursor:"pointer", display:"flex", alignItems:"center",
                    gap:10, padding:"9px 13px", width:"100%", boxSizing:"border-box" }}>
                  <div style={{ width:30, height:30, borderRadius:8, background:"var(--surface2)",
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Building2 size={15} color="var(--muted)" />
                  </div>
                  <div style={{ flex:1, minWidth:0, color:"var(--text)", fontWeight:700, fontSize:13.5,
                    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.name}</div>
                  <div style={{ width:7, height:7, borderRadius:"50%", flexShrink:0,
                    background: s.status==="aktiv" ? "var(--green)" : "var(--red)" }} />
                  <ChevronDown size={15} color="var(--muted)" style={{ flexShrink:0,
                    transform: offen ? "rotate(180deg)" : "none", transition:"transform 0.18s ease" }} />
                </button>
                {offen && (
                  <div style={{ padding:"0 14px 12px 53px", display:"flex", flexDirection:"column", gap:7 }}>
                    {(s.kontakt || s.telefon) && (
                      <div style={{ display:"flex", alignItems:"center", gap:13, flexWrap:"wrap" }}>
                        {s.kontakt && (
                          <div style={{ display:"flex", alignItems:"center", gap:4, color:"var(--muted)", fontSize:12 }}>
                            <User size={11} /> {s.kontakt}
                          </div>
                        )}
                        {s.telefon && (
                          <div style={{ display:"flex", alignItems:"center", gap:4, color:"var(--muted)", fontSize:12 }}>
                            <Phone size={11} /> {s.telefon}
                          </div>
                        )}
                      </div>
                    )}
                    {(s.gewerke||[]).length > 0 && (
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {s.gewerke.map(k => {
                          const g = ALLE_GEWERKE.find(x=>x.key===k);
                          return g ? (
                            <span key={k} style={{ background:"var(--surface2)", color:"var(--muted)",
                              fontSize:10.5, padding:"3px 9px", borderRadius:20 }}>{g.icon} {g.label}</span>
                          ) : null;
                        })}
                      </div>
                    )}
                    {s.stundensatz > 0 && (
                      <div style={{ display:"flex", alignItems:"center", gap:4, color:"var(--muted)", fontSize:11 }}>
                        <Euro size={10} /> {s.stundensatz} €/Std.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Kolonnen */}
      {kolonnen.map(k => (
        <KolonneKarte
          key={k.id}
          k={k}
          zeitdaten={zeitdaten}
          vonDatum={vonDatum}
          bisDatum={bisDatum}
          zeitenGeladen={ladeStatus === "ok"}
          setKolonnen={setKolonnen}
          darfBearbeiten={darfBearbeiten}
          kannKolonneLoeschen={kannKolonneLoeschen}
        />
      ))}

      {darfBearbeiten && (!neueKolonne ? (
        <button onClick={() => setNeueKolonne(true)}
          style={{ width:"100%", background:"var(--ybg)", color:"var(--ydark)",
            border:"2px dashed var(--yellow)", borderRadius:10, padding:12,
            cursor:"pointer", fontSize:14, fontWeight:700, fontFamily:"inherit",
            display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          <Plus size={15} /> Kolonne einteilen
        </button>
      ) : (
        <div style={{ background:"var(--surface)", borderRadius:12, padding:12,
          border:"1.5px solid var(--yellow)" }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:14,
            marginBottom:9 }}>Neue Kolonne</div>
          <div style={{ marginBottom:7 }}>
            <Label>Name</Label>
            <input value={kName} onChange={e => setKName(e.target.value)}
              placeholder="z.B. Kolonne Huber" style={inputStyle()} />
          </div>
          <div style={{ marginBottom:10 }}>
            <Label>Vorarbeiter</Label>
            <input value={kVorarbeiter} onChange={e => setKVorarbeiter(e.target.value)}
              placeholder="z.B. Thomas Huber" style={inputStyle()} />
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => { setNeueKolonne(false); setKName(""); setKVorarbeiter(""); }}
              style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
                border:"1px solid var(--border)", borderRadius:10, padding:10,
                cursor:"pointer", fontFamily:"inherit" }}>Abbrechen</button>
            <button onClick={kolonneAnlegen} disabled={!kName.trim()}
              style={{ flex:2, background: kName.trim() ? "var(--yellow)" : "var(--surface2)",
                color: kName.trim() ? "#1a1200" : "var(--muted)",
                border:"none", borderRadius:10, padding:10, fontWeight:700,
                cursor: kName.trim() ? "pointer" : "default", fontFamily:"inherit" }}>
              Anlegen
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
