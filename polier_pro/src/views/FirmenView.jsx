import { useState } from "react";
import { Building2, MapPin, User, Phone, Euro, RefreshCw, Pencil, Plus, CircleX, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { sbClientMitToken, sbSubSpeichern, sbSubLoeschen } from "../lib/supabase.js";
import { ALLE_GEWERKE, ONBOARDING_KEY } from "../config/konstanten.js";
import { Chip } from "../components/Chip.jsx";
import { Label, inputStyle } from "../components/Label.jsx";
import { SwipeToDelete } from "../components/SwipeToDelete.jsx";
import { Spinner } from "../components/Spinner.jsx";

export function FirmenView({ owneFirma, setEigeneFirma, subs, setSubs, onOnboardingReset, session = null, firmaId = null }) {
  const [screen, setScreen]     = useState("home"); // home | eigene | subs | subEdit
  const [editSub, setEditSub]   = useState(null);
  const [editOwn, setEditOwn]   = useState(false);
  const [tmpFirma, setTmpFirma] = useState(owneFirma);
  const [speichern, setSpeichern] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState("");
  // Der KI-Key wird bewusst NIE aus der Datenbank geladen/vorausgefüllt
  // (siehe App.jsx: die firmen-Abfrage lässt anthropic_api_key explizit
  // aus) — das Feld ist reines "write-only": leer lassen behält den
  // bestehenden Key, ein neuer Wert überschreibt ihn.
  const [neuerKiKey, setNeuerKiKey] = useState("");
  const [subFehler, setSubFehler] = useState("");
  const [subSpeichert, setSubSpeichert] = useState(false);

  async function subLoeschen(id) {
    setSubs(prev => prev.filter(x => x.id !== id));
    const ok = await sbSubLoeschen(id, session);
    if (!ok) setSubFehler("Subunternehmer konnte nicht auf dem Server gelöscht werden.");
  }

  async function subSpeichern(sub) {
    setSubSpeichert(true);
    setSubFehler("");
    const gespeichert = await sbSubSpeichern(sub, firmaId, session, !sub.id);
    if (!gespeichert) {
      setSubFehler("Subunternehmer konnte nicht auf dem Server gespeichert werden.");
      setSubSpeichert(false);
      return;
    }
    setSubs(prev => sub.id
      ? prev.map(s => s.id === sub.id ? gespeichert : s)
      : [...prev, gespeichert]);
    setSubSpeichert(false);
    setScreen("home");
  }

  async function firmaSpeichern() {
    setEigeneFirma(tmpFirma);

    // Bei echtem Login (mit firmaId aus Supabase) auch in der Datenbank
    // aktualisieren — sonst gehen Änderungen beim nächsten Login/Gerät
    // wieder verloren, weil sie nur lokal im State standen.
    if (session?.access_token && firmaId) {
      setSpeichern(true); setSpeicherFehler("");
      try {
        const client = sbClientMitToken(session);
        const payload = {
          name:              tmpFirma.name || "",
          adresse:           tmpFirma.strasse || "",
          plz:               tmpFirma.plz || "",
          ort:               tmpFirma.ort || "",
          telefon:           tmpFirma.telefon || "",
          email:             tmpFirma.email || "",
          steuernummer:      tmpFirma.steuernummer || "",
          logo_url:          tmpFirma.logo || null,
          geschaeftsfuehrer: tmpFirma.geschaeftsfuehrer || "",
          gewerke:           tmpFirma.gewerke || [],
        };
        if (neuerKiKey.trim()) payload.anthropic_api_key = neuerKiKey.trim();
        const { error } = await client.from("firmen").update(payload).eq("id", firmaId);
        if (error) {
          setSpeicherFehler("Änderungen konnten nicht auf dem Server gespeichert werden.");
        }
      } catch {
        setSpeicherFehler("Netzwerkfehler beim Speichern.");
      }
      setSpeichern(false);
    }

    setNeuerKiKey("");
    setScreen("home");
  }

  return (
    <div>
      {/* Home */}
      {screen === "home" && (
        <>
          {/* Eigene Firma Karte */}
          <div onClick={() => { setTmpFirma({...owneFirma}); setScreen("eigene"); }}
            style={{ background: "var(--surface)", borderRadius:14, padding:"12px 18px", marginBottom:10,
              border:`2px solid ${'var(--yellow)'}`, cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ color: "var(--muted)", fontSize:11, marginBottom:2,
                  display:"flex", alignItems:"center", gap:4 }}><Building2 size={11} /> Eigenes Unternehmen</div>
                <div style={{ color: "var(--text)", fontWeight:700, fontSize:16 }}>{owneFirma.name || "Firma hinterlegen"}</div>
                {owneFirma.ort && <div style={{ color: "var(--muted)", fontSize:12, marginTop:2,
                  display:"flex", alignItems:"center", gap:4 }}><MapPin size={11} /> {owneFirma.plz} {owneFirma.ort}</div>}
                {owneFirma.gewerke?.length > 0 && (
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:8 }}>
                    {owneFirma.gewerke.map(k => {
                      const g = ALLE_GEWERKE.find(x=>x.key===k);
                      return g ? <Chip key={k} icon={g.icon} label={g.label} /> : null;
                    })}
                  </div>
                )}
              </div>
              <div style={{ color: "var(--muted)", display:"flex" }}><ChevronRight size={20} /></div>
            </div>
          </div>

          {/* Subunternehmer */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
            <div style={{ color: "var(--text)", fontWeight:700 }}>Subunternehmer ({subs.length})</div>
            <button onClick={() => { setEditSub({ id:null, name:"", gewerke:[], kontakt:"", telefon:"", email:"", status:"aktiv", stundensatz:0 }); setScreen("subEdit"); }}
              style={{ background: "var(--yellow)", color:"#1C2027", border:"none", borderRadius:9,
                padding:"7px 14px", fontWeight:700, cursor:"pointer", fontSize:13,
                display:"flex", alignItems:"center", gap:5 }}>
              <Plus size={13} /> Sub
            </button>
          </div>

          {subFehler && (
            <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
              padding:"7px 14px", marginBottom:9, fontSize:12,
              border:"1px solid var(--red)" }}>
              {subFehler}
            </div>
          )}

          {subs.length === 0 ? (
            <div style={{ background: "var(--surface)", borderRadius:12, padding:17, textAlign:"center" }}>
              <div style={{ display:"flex", justifyContent:"center", color:"var(--muted)" }}><Building2 size={28} /></div>
              <div style={{ color: "var(--muted)", marginTop:8 }}>Noch keine Subunternehmer angelegt.</div>
            </div>
          ) : subs.map(s => (
            <SwipeToDelete key={s.id} style={{ marginBottom:6 }}
              onDelete={() => subLoeschen(s.id)}
              onClick={() => { setEditSub({...s}); setScreen("subEdit"); }}>
            <div
              style={{ background: "var(--surface)", borderRadius:11, padding:"9px 15px",
                border:`1.5px solid ${s.status==="aktiv" ? "var(--border)" : "var(--red)"}`, cursor:"pointer" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ color: "var(--text)", fontWeight:700 }}>{s.name}</div>
                    <div style={{ background: s.status==="aktiv" ? "var(--green)" : "var(--red)",
                      color:"#fff", fontSize:9, padding:"2px 7px", borderRadius:20 }}>
                      {s.status}
                    </div>
                  </div>
                  <div style={{ color: "var(--muted)", fontSize:12, marginTop:3,
                    display:"flex", alignItems:"center", gap:4 }}><User size={11} /> {s.kontakt} · <Phone size={11} /> {s.telefon}</div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:7 }}>
                    {s.gewerke.map(k => {
                      const g = ALLE_GEWERKE.find(x=>x.key===k);
                      return g ? <Chip key={k} icon={g.icon} label={g.label} /> : null;
                    })}
                  </div>
                  {s.stundensatz > 0 && (
                    <div style={{ color: "var(--muted)", fontSize:11, marginTop:5,
                      display:"flex", alignItems:"center", gap:4 }}><Euro size={10} /> {s.stundensatz} €/Std.</div>
                  )}
                </div>
                <div style={{ color: "var(--muted)", display:"flex" }}><ChevronRight size={17} /></div>
              </div>
            </div>
            </SwipeToDelete>
          ))}

          {/* Onboarding zurücksetzen */}
          {onOnboardingReset && (
            <div style={{ marginTop:24, borderTop:`1px solid ${'var(--border)'}`, paddingTop:16 }}>
              <button onClick={() => {
                  if (window.confirm("Onboarding zurücksetzen? Die App startet beim nächsten Laden neu mit dem Einrichtungsassistenten.")) {
                    localStorage.removeItem(ONBOARDING_KEY);
                    onOnboardingReset();
                  }
                }}
                style={{ width:"100%", background: "var(--border)", color: "var(--muted)",
                  border:`1px solid ${'var(--border)'}`, borderRadius:10, padding:12,
                  cursor:"pointer", fontSize:13,
                  display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <RefreshCw size={13} /> Einrichtungsassistent erneut starten
              </button>
            </div>
          )}
        </>
      )}

      {/* Eigene Firma bearbeiten */}
      {screen === "eigene" && (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <button onClick={() => setScreen("home")}
              style={{ background: "var(--border)", border:"none", color: "var(--text)", borderRadius:8,
                padding:"6px 10px", cursor:"pointer", display:"flex" }}><ChevronLeft size={16} /></button>
            <div style={{ color: "var(--yellow)", fontWeight:700, fontSize:16,
              display:"flex", alignItems:"center", gap:7 }}><Building2 size={15} /> Eigenes Unternehmen</div>
          </div>

          {[
            ["Firmenname",          "name",              "Bauunternehmen GmbH"],
            ["Geschäftsführer",     "geschaeftsfuehrer", "Max Mustermann"],
            ["Straße + Nr.",        "strasse",           "Musterstraße 12"],
            ["PLZ",                 "plz",               "80331"],
            ["Ort",                 "ort",               "München"],
            ["Telefon",             "telefon",           "+49 89 123456"],
            ["E-Mail",              "email",             "info@firma.de"],
            ["Steuernummer",        "steuernummer",      "123/456/78900"],
          ].map(([label, key, ph]) => (
            <div key={key} style={{ marginBottom:9 }}>
              <Label>{label}</Label>
              <input value={tmpFirma[key]||""} onChange={e => setTmpFirma(p=>({...p,[key]:e.target.value}))}
                placeholder={ph} style={inputStyle()} />
            </div>
          ))}

          {/* KI-Anbindung — write-only: der bestehende Key wird nie geladen/
              angezeigt, nur ein neu eingegebener Wert wird beim Speichern
              übernommen. Wird serverseitig für alle KI-Funktionen (z.B.
              KI-Tagesabschluss) genutzt, erreicht den Browser sonst nie. */}
          <div style={{ marginBottom:14 }}>
            <Label>Anthropic API-Key (für KI-Funktionen)</Label>
            <input type="password" value={neuerKiKey}
              onChange={e => setNeuerKiKey(e.target.value)}
              placeholder="sk-ant-… (leer lassen = unverändert)"
              autoComplete="off" style={inputStyle()} />
            <div style={{ color:"var(--muted)", fontSize:11, marginTop:4 }}>
              Wird nur zum Speichern übertragen, aus Sicherheitsgründen nie wieder angezeigt.
              Ohne eigenen Key funktionieren KI-Funktionen wie der KI-Tagesabschluss nicht.
            </div>
          </div>

          {/* Gewerke */}
          <div style={{ marginBottom:14 }}>
            <Label>Ausgeführte Gewerke</Label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:8 }}>
              {ALLE_GEWERKE.map(g => {
                const aktiv = (tmpFirma.gewerke||[]).includes(g.key);
                return (
                  <div key={g.key} onClick={() => setTmpFirma(p => ({
                    ...p, gewerke: aktiv
                      ? p.gewerke.filter(x=>x!==g.key)
                      : [...(p.gewerke||[]), g.key]
                  }))}
                    style={{ background: aktiv ? "var(--surface2)" : "var(--border)",
                      border:`2px solid ${aktiv ? "var(--yellow)" : "transparent"}`,
                      borderRadius:9, padding:"6px 10px", cursor:"pointer",
                      display:"flex", alignItems:"center", gap:7 }}>
                    <span style={{ fontSize:16 }}>{g.icon}</span>
                    <span style={{ color: aktiv ? "var(--text)" : "var(--muted)", fontSize:11, fontWeight: aktiv ? 700 : 400 }}>{g.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {speicherFehler && (
            <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
              padding:"7px 14px", marginBottom:9, fontSize:12,
              border:"1px solid var(--red)",
              display:"flex", alignItems:"center", gap:6 }}>
              <CircleX size={13} /> {speicherFehler}
            </div>
          )}

          <button onClick={firmaSpeichern} disabled={speichern}
            style={{ width:"100%", background: "var(--yellow)", color:"#1C2027", border:"none",
              borderRadius:10, padding:14, fontWeight:700, cursor:"pointer", fontSize:15,
              display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            {speichern ? <><Spinner size={14} /> Speichert…</> : "Speichern"}
          </button>
        </div>
      )}

      {/* Sub bearbeiten / anlegen */}
      {screen === "subEdit" && editSub && (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <button onClick={() => setScreen("home")}
              style={{ background: "var(--border)", border:"none", color: "var(--text)", borderRadius:8,
                padding:"6px 10px", cursor:"pointer", display:"flex" }}><ChevronLeft size={16} /></button>
            <div style={{ color: "var(--yellow)", fontWeight:700, fontSize:16,
              display:"flex", alignItems:"center", gap:7 }}>
              {editSub.id ? <><Pencil size={14} /> Subunternehmer</> : <><Plus size={14} /> Neuer Subunternehmer</>}
            </div>
          </div>

          {[
            ["Firmenname *",     "name",     "Elektro Huber GmbH"],
            ["Ansprechpartner",  "kontakt",  "Max Mustermann"],
            ["Telefon",          "telefon",  "+49 89 123456"],
            ["E-Mail",           "email",    "info@firma.de"],
          ].map(([label, key, ph]) => (
            <div key={key} style={{ marginBottom:9 }}>
              <Label>{label}</Label>
              <input value={editSub[key]||""} onChange={e => setEditSub(p=>({...p,[key]:e.target.value}))}
                placeholder={ph} style={inputStyle()} />
            </div>
          ))}

          <div style={{ marginBottom:9 }}>
            <Label>Stundensatz (€)</Label>
            <input type="number" value={editSub.stundensatz||""} onChange={e => setEditSub(p=>({...p,stundensatz:+e.target.value}))}
              placeholder="85" style={inputStyle()} />
          </div>

          {/* Status */}
          <div style={{ marginBottom:12 }}>
            <Label>Status</Label>
            <div style={{ display:"flex", gap:8, marginTop:6 }}>
              {["aktiv","inaktiv","gesperrt"].map(s => (
                <button key={s} onClick={() => setEditSub(p=>({...p,status:s}))}
                  style={{ flex:1, background: editSub.status===s ? "var(--yellow)" : "var(--border)",
                    color: editSub.status===s ? "#1C2027" : "var(--muted)",
                    border:"none", borderRadius:8, padding:10, cursor:"pointer",
                    fontWeight: editSub.status===s ? 700 : 400, fontSize:12 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Gewerke des Subs */}
          <div style={{ marginBottom:14 }}>
            <Label>Gewerke dieses Subunternehmers</Label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:8 }}>
              {ALLE_GEWERKE.map(g => {
                const aktiv = (editSub.gewerke||[]).includes(g.key);
                return (
                  <div key={g.key} onClick={() => setEditSub(p => ({
                    ...p, gewerke: aktiv
                      ? p.gewerke.filter(x=>x!==g.key)
                      : [...(p.gewerke||[]), g.key]
                  }))}
                    style={{ background: aktiv ? "var(--surface2)" : "var(--border)",
                      border:`2px solid ${aktiv ? "var(--blue)" : "transparent"}`,
                      borderRadius:9, padding:"6px 10px", cursor:"pointer",
                      display:"flex", alignItems:"center", gap:7 }}>
                    <span style={{ fontSize:16 }}>{g.icon}</span>
                    <span style={{ color: aktiv ? "var(--text)" : "var(--muted)", fontSize:11, fontWeight: aktiv ? 700 : 400 }}>{g.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {subFehler && (
            <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
              padding:"7px 14px", marginBottom:9, fontSize:12,
              border:"1px solid var(--red)" }}>
              {subFehler}
            </div>
          )}

          <div style={{ display:"flex", gap:10 }}>
            {editSub.id && (
              <button onClick={() => { subLoeschen(editSub.id); setScreen("home"); }}
                style={{ background:"#2E1A1A", color: "var(--red)", border:`1px solid ${'var(--red)'}`,
                  borderRadius:10, padding:"12px 16px", cursor:"pointer", display:"flex" }}><Trash2 size={16} /></button>
            )}
            <button onClick={() => setScreen("home")}
              style={{ flex:1, background: "var(--border)", color: "var(--muted)", border:"none", borderRadius:10, padding:13, cursor:"pointer" }}>
              Abbrechen
            </button>
            <button disabled={!editSub.name || subSpeichert} onClick={() => subSpeichern(editSub)}
              style={{ flex:2, background: editSub.name ? "var(--yellow)" : "var(--border)",
                color: editSub.name ? "#1C2027" : "var(--muted)",
                border:"none", borderRadius:10, padding:13, fontWeight:700, cursor:"pointer", fontSize:15,
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              {subSpeichert ? <><Spinner size={14} /> Speichert…</> : "Speichern"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
