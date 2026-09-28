import { useState, useRef } from "react";
import { Star, Building2, Wrench, HardHat, PartyPopper, ClipboardList, CloudSun, FileText, Info, Check, ArrowLeft, ArrowRight, Rocket, Sparkles, Search, TriangleAlert, ExternalLink } from "lucide-react";
import { ONBOARDING_KEY, ALLE_GEWERKE } from "../config/konstanten.js";
import { Label, inputStyle } from "../components/Label.jsx";
import { kiFirmenRecherche } from "../lib/ai.js";

export function OnboardingFlow({ onComplete, session }) {
  const [schritt, setSchritt] = useState(0);
  const [firma, setFirma] = useState({
    name:"", strasse:"", plz:"", ort:"", telefon:"", email:"",
    geschaeftsfuehrer:"", steuernummer:"", gewerke:[], logo:null,
  });
  const [ersterPolier, setErsterPolier] = useState({ name:"", telefon:"", email:"" });
  const logoRef = useRef(null);

  // KI-Firmenrecherche: füllt die Felder unten vor, ersetzt sie aber nicht
  // unwidersprochen — kiFelder merkt sich, welche Werte von der KI stammen
  // (Badge zur Kennzeichnung), kiHinweis/kiQuellen zeigen offen, was die KI
  // NICHT sicher finden konnte bzw. woher ein Fund stammt, statt es einfach
  // zu verschweigen. Der Admin sieht danach ganz normal das bestehende
  // Formular und kann jedes Feld vor dem Speichern noch korrigieren
  // (Human-in-the-Loop) — es wird nichts automatisch übernommen.
  const [kiOrt,     setKiOrt]     = useState("");
  const [kiLaedt,   setKiLaedt]   = useState(false);
  const [kiFehler,  setKiFehler]  = useState("");
  const [kiHinweis, setKiHinweis] = useState("");
  const [kiQuellen, setKiQuellen] = useState([]);
  const [kiFelder,  setKiFelder]  = useState(new Set());
  const [kiGelaufen,setKiGelaufen]= useState(false);

  async function kiRecherche() {
    if (!firma.name.trim() || kiLaedt) return;
    setKiLaedt(true); setKiFehler(""); setKiHinweis(""); setKiQuellen([]);
    try {
      const { firma: gefunden, quellen, hinweis } = await kiFirmenRecherche(firma.name.trim(), kiOrt.trim(), session);
      const neueFelder = new Set();
      setFirma(p => {
        const next = { ...p };
        if (gefunden.name?.trim())              { next.name = gefunden.name.trim(); }
        if (gefunden.adresse)                    { next.strasse = gefunden.adresse; neueFelder.add("strasse"); }
        if (gefunden.plz)                        { next.plz = gefunden.plz; neueFelder.add("plz"); }
        if (gefunden.ort)                        { next.ort = gefunden.ort; neueFelder.add("ort"); }
        if (gefunden.telefon)                    { next.telefon = gefunden.telefon; neueFelder.add("telefon"); }
        if (gefunden.email)                      { next.email = gefunden.email; neueFelder.add("email"); }
        if (gefunden.geschaeftsfuehrer)          { next.geschaeftsfuehrer = gefunden.geschaeftsfuehrer; neueFelder.add("geschaeftsfuehrer"); }
        if (Array.isArray(gefunden.gewerke) && gefunden.gewerke.length) { next.gewerke = gefunden.gewerke; }
        // steuernummer bewusst NIE von der KI übernehmen, auch falls
        // irgendwann doch etwas zurückkäme — öffentlich praktisch nie
        // verlässlich auffindbar, das bleibt Handeingabe.
        return next;
      });
      setKiFelder(neueFelder);
      setKiHinweis(hinweis || "");
      setKiQuellen(quellen || []);
      setKiGelaufen(true);
    } catch (e) {
      setKiFehler(e.message || "Recherche fehlgeschlagen.");
    }
    setKiLaedt(false);
  }

  const SCHRITTE = [
    { label:"Willkommen", icon:Star },
    { label:"Firma",      icon:Building2 },
    { label:"Gewerke",    icon:Wrench },
    { label:"Team",       icon:HardHat },
    { label:"Fertig",     icon:PartyPopper },
  ];

  function handleLogoWahl(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setFirma(p => ({ ...p, logo: ev.target.result }));
    reader.readAsDataURL(file);
  }

  function toggleGewerk(key) {
    setFirma(p => ({
      ...p,
      gewerke: p.gewerke.includes(key)
        ? p.gewerke.filter(x => x !== key)
        : [...p.gewerke, key],
    }));
  }

  function abschliessen() {
    localStorage.setItem(ONBOARDING_KEY, "1");
    onComplete(firma, ersterPolier);
  }

  const weiterOk = [
    true,
    firma.name.trim().length > 0,
    firma.gewerke.length > 0,
    true,
    true,
  ][schritt];

  const pct = Math.round(((schritt + 1) / SCHRITTE.length) * 100);

  return (
    <div style={{ background:"var(--bg)", minHeight:"100dvh",
      display:"flex", flexDirection:"column" }}>

      {/* Header */}
      <div style={{ background:"var(--surface)", padding:"16px 20px 14px",
        paddingTop:"calc(16px + env(safe-area-inset-top))",
        borderBottom:"3px solid var(--yellow)",
        boxShadow:"0 2px 8px rgba(0,0,0,0.08)", flexShrink:0 }}>
        {/* Logo + Schritt */}
        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:10 }}>
          <div>
            <div style={{ fontWeight:900, fontSize:20, letterSpacing:-1,
              color:"var(--text)", lineHeight:1 }}>
              <span style={{ color:"var(--yellow)" }}>★</span> POLARIS
            </div>
            <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600,
              letterSpacing:2, textTransform:"uppercase", marginTop:2 }}>
              Einrichtung
            </div>
          </div>
          <div style={{ color:"var(--muted)", fontSize:12, fontWeight:600 }}>
            {schritt + 1} / {SCHRITTE.length}
          </div>
        </div>

        {/* Fortschrittsbalken */}
        <div style={{ background:"var(--surface2)", borderRadius:6, height:6,
          overflow:"hidden", marginBottom:7,
          border:"1px solid var(--border)" }}>
          <div style={{ height:"100%", background:"var(--yellow)", borderRadius:6,
            width:`${pct}%`, transition:"width 0.4s ease" }} />
        </div>

        {/* Schritt-Indikatoren */}
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          {SCHRITTE.map((s, i) => (
            <div key={i} style={{ display:"flex", flexDirection:"column",
              alignItems:"center", gap:3 }}>
              <div style={{ width:28, height:28, borderRadius:14,
                background: i < schritt ? "var(--green)"
                  : i === schritt ? "var(--yellow)" : "var(--surface2)",
                border: i === schritt ? "2px solid var(--yellow)"
                  : i < schritt ? "2px solid var(--green)" : "2px solid var(--border)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12, fontWeight:700,
                color: i <= schritt ? (i < schritt ? "#fff" : "#1a1200") : "var(--muted)",
                transition:"all 0.3s" }}>
                {i < schritt ? <Check size={13} /> : <s.icon size={13} />}
              </div>
              <div style={{ fontSize:9, fontWeight: i === schritt ? 700 : 400,
                color: i === schritt ? "var(--text)" : "var(--muted)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:"auto", padding:"28px 20px 120px" }}>

        {/* ── Schritt 0: Willkommen ── */}
        {schritt === 0 && (
          <div style={{ textAlign:"center", paddingTop:24 }}>
            <div style={{ fontSize:80, marginBottom:6, lineHeight:1 }}>★</div>
            <div style={{ fontWeight:900, fontSize:32, letterSpacing:-2,
              color:"var(--text)", marginBottom:4 }}>
              <span style={{ color:"var(--yellow)" }}>★</span> POLARIS
            </div>
            <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600,
              letterSpacing:3, textTransform:"uppercase", marginBottom:17 }}>
              Baustellenmanagement
            </div>
            <div style={{ color:"var(--text2)", fontSize:15, lineHeight:1.7,
              maxWidth:320, margin:"0 auto 32px" }}>
              Die App für Poliere im Hoch- und Tiefbau.
              Wir richten alles in 4 Schritten für dich ein.
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10,
              maxWidth:320, margin:"0 auto" }}>
              {[
                [Building2, "Betonfelder & Rasterplanung"],
                [HardHat, "Kolonnen & GPS-Zeiterfassung"],
                [ClipboardList, "Bautagebuch mit Fotos & KI"],
                [CloudSun, "Wetterbasierter Betoncheck"],
                [FileText, "PDF-Export VOB-konform"],
              ].map(([Icon, text]) => (
                <div key={text} style={{ display:"flex", alignItems:"center",
                  gap:14, background:"var(--surface)", borderRadius:14,
                  padding:"10px 18px", border:"1.5px solid var(--border)",
                  textAlign:"left" }}>
                  <span style={{ flexShrink:0, color:"var(--yellow)", display:"flex" }}><Icon size={22} /></span>
                  <span style={{ color:"var(--text2)", fontSize:14,
                    fontWeight:500 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Schritt 1: Firma ── */}
        {schritt === 1 && (
          <div>
            <div style={{ fontWeight:800, fontSize:22, color:"var(--text)",
              marginBottom:4, display:"flex", alignItems:"center", gap:9 }}><Building2 size={20} /> Dein Unternehmen</div>
            <div style={{ color:"var(--muted)", fontSize:13, marginBottom:14,
              lineHeight:1.5 }}>
              Diese Daten erscheinen auf PDFs und im Bautagebuch.
            </div>

            {/* KI-Firmenrecherche — optional, füllt die Felder unten vor */}
            <div style={{ background:"var(--surface)", borderRadius:14,
              padding:14, marginBottom:17, border:"1.5px solid var(--yellow)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7,
                color:"var(--text)", fontWeight:700, fontSize:13.5, marginBottom:8 }}>
                <Sparkles size={15} style={{ color:"var(--yellow)" }} /> Mit KI ausfüllen
              </div>
              <div style={{ color:"var(--muted)", fontSize:12, lineHeight:1.5, marginBottom:10 }}>
                Name eingeben, optional den Ort — die KI durchsucht das Web nach euren
                öffentlichen Firmendaten. Nichts wird erfunden: was sie nicht sicher
                findet, bleibt leer, damit du es selbst einträgst.
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:kiFehler||kiGelaufen ? 10 : 0 }}>
                <input value={kiOrt} onChange={e=>setKiOrt(e.target.value)}
                  placeholder="Ort (optional)" style={{ ...inputStyle(), marginTop:0, flex:1 }} />
                <button onClick={kiRecherche} disabled={!firma.name.trim() || kiLaedt}
                  style={{ background: firma.name.trim() ? "var(--yellow)" : "var(--surface2)",
                    color: firma.name.trim() ? "#1a1200" : "var(--muted)",
                    border:"none", borderRadius:10, padding:"0 16px",
                    fontWeight:700, fontSize:13, cursor: firma.name.trim() ? "pointer" : "default",
                    fontFamily:"inherit", display:"flex", alignItems:"center", gap:6,
                    whiteSpace:"nowrap" }}>
                  <Search size={14} /> {kiLaedt ? "Suche…" : "Recherchieren"}
                </button>
              </div>
              {!firma.name.trim() && (
                <div style={{ color:"var(--muted)", fontSize:11, marginTop:6 }}>
                  Erst den Firmennamen unten eintragen.
                </div>
              )}
              {kiFehler && (
                <div style={{ display:"flex", gap:6, alignItems:"flex-start",
                  color:"var(--red)", fontSize:12, lineHeight:1.5 }}>
                  <TriangleAlert size={13} style={{ flexShrink:0, marginTop:2 }} /> {kiFehler}
                </div>
              )}
              {kiGelaufen && !kiFehler && (
                <div>
                  {kiHinweis && (
                    <div style={{ display:"flex", gap:6, alignItems:"flex-start",
                      background:"var(--ybg)", border:"1px solid var(--yellow)", borderRadius:10,
                      padding:"8px 10px", color:"var(--ydark)", fontSize:12, lineHeight:1.5 }}>
                      <Info size={13} style={{ flexShrink:0, marginTop:2 }} /> {kiHinweis}
                    </div>
                  )}
                  {kiQuellen.length > 0 && (
                    <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:4 }}>
                      <div style={{ color:"var(--muted)", fontSize:10, fontWeight:700,
                        textTransform:"uppercase", letterSpacing:0.6 }}>Quellen</div>
                      {kiQuellen.map((q,i) => (
                        <a key={i} href={q} target="_blank" rel="noopener noreferrer"
                          style={{ color:"var(--blue)", fontSize:11.5, display:"flex",
                            alignItems:"center", gap:4, textDecoration:"none",
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          <ExternalLink size={10} style={{ flexShrink:0 }} /> {q}
                        </a>
                      ))}
                    </div>
                  )}
                  {kiFelder.size === 0 && !kiHinweis && (
                    <div style={{ color:"var(--muted)", fontSize:12 }}>
                      Keine öffentlichen Daten sicher gefunden — bitte alles manuell eintragen.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Logo */}
            <div style={{ marginBottom:17, textAlign:"center" }}>
              <input ref={logoRef} type="file" accept="image/*"
                style={{ display:"none" }} onChange={handleLogoWahl} />
              <div onClick={() => logoRef.current.click()}
                style={{ width:96, height:96, borderRadius:48,
                  margin:"0 auto 10px",
                  background: firma.logo ? "transparent" : "var(--ybg)",
                  border:`2px dashed var(--yellow)`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  cursor:"pointer", overflow:"hidden", transition:"all 0.2s" }}>
                {firma.logo
                  ? <img src={firma.logo} alt="Logo"
                      style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : <Building2 size={32} style={{ color:"var(--ydark)" }} />}
              </div>
              <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600 }}>
                Logo tippen zum Hochladen
              </div>
            </div>

            {[
              ["Firmenname *",    "name",              "Bauunternehmen GmbH"],
              ["Geschäftsführer", "geschaeftsfuehrer", "Max Mustermann"],
              ["Straße + Nr.",   "strasse",            "Musterstraße 12"],
              ["PLZ",            "plz",                "80331"],
              ["Ort",            "ort",                "München"],
              ["Telefon",        "telefon",            "+49 89 123456"],
              ["E-Mail",         "email",              "info@firma.de"],
              ["Steuernummer",   "steuernummer",       "123/456/78900"],
            ].map(([label, key, ph]) => {
              const vonKi = kiFelder.has(key);
              const nichtGefunden = kiGelaufen && !firma[key] && key !== "steuernummer";
              return (
                <div key={key} style={{ marginBottom:10 }}>
                  <Label>
                    {label}
                    {vonKi && (
                      <span style={{ marginLeft:6, color:"var(--yellow)", fontWeight:700,
                        display:"inline-flex", alignItems:"center", gap:2 }}>
                        <Sparkles size={10} /> KI
                      </span>
                    )}
                  </Label>
                  <input value={firma[key]||""}
                    onChange={e => setFirma(p=>({...p,[key]:e.target.value}))}
                    placeholder={ph} style={{ ...inputStyle(),
                      border: nichtGefunden ? "1.5px solid var(--muted)" : inputStyle().border }} />
                  {nichtGefunden && (
                    <div style={{ color:"var(--muted)", fontSize:11, marginTop:3 }}>
                      Von der KI nicht gefunden — bitte prüfen.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Schritt 2: Gewerke ── */}
        {schritt === 2 && (
          <div>
            <div style={{ fontWeight:800, fontSize:22, color:"var(--text)",
              marginBottom:4, display:"flex", alignItems:"center", gap:9 }}><Wrench size={20} /> Eure Gewerke</div>
            <div style={{ color:"var(--muted)", fontSize:13, marginBottom:14,
              lineHeight:1.5 }}>
              Welche Gewerke führt dein Unternehmen aus?
              Das bestimmt die verfügbaren Felder und Checklisten.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {ALLE_GEWERKE.map(g => {
                const aktiv = firma.gewerke.includes(g.key);
                return (
                  <div key={g.key} onClick={() => toggleGewerk(g.key)}
                    style={{ background: aktiv ? "var(--ybg)" : "var(--surface)",
                      border:`2px solid ${aktiv ? "var(--yellow)" : "var(--border)"}`,
                      borderRadius:14, padding:"9px 12px", cursor:"pointer",
                      display:"flex", alignItems:"center", gap:10,
                      transition:"all 0.15s" }}>
                    <span style={{ fontSize:20 }}>{g.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ color: aktiv ? "var(--text)" : "var(--text2)",
                        fontSize:11, fontWeight: aktiv ? 700 : 400,
                        lineHeight:1.3 }}>{g.label}</div>
                    </div>
                    {aktiv && (
                      <div style={{ width:20, height:20, borderRadius:10,
                        background:"var(--yellow)", display:"flex",
                        alignItems:"center", justifyContent:"center",
                        color:"#1a1200",
                        flexShrink:0 }}><Check size={12} /></div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign:"center", marginTop:14,
              color:"var(--muted)", fontSize:12 }}>
              {firma.gewerke.length} Gewerk{firma.gewerke.length !== 1 ? "e" : ""} ausgewählt
            </div>
          </div>
        )}

        {/* ── Schritt 3: Erster Polier ── */}
        {schritt === 3 && (
          <div>
            <div style={{ fontWeight:800, fontSize:22, color:"var(--text)",
              marginBottom:4, display:"flex", alignItems:"center", gap:9 }}><HardHat size={20} /> Erster Polier</div>
            <div style={{ color:"var(--muted)", fontSize:13, marginBottom:17,
              lineHeight:1.5 }}>
              Wer nutzt die App als erstes? Weitere Nutzer kannst du
              später im Unternehmen-Bereich hinzufügen.
            </div>
            <div style={{ background:"var(--surface)", borderRadius:16,
              padding:14, marginBottom:12,
              border:"1.5px solid var(--border)" }}>
              {[
                ["Name *",  "name",    "Thomas Huber"],
                ["Telefon", "telefon", "+49 89 123456"],
                ["E-Mail",  "email",   "huber@firma.de"],
              ].map(([label, key, ph]) => (
                <div key={key} style={{ marginBottom:10 }}>
                  <Label>{label}</Label>
                  <input value={ersterPolier[key]||""}
                    onChange={e => setErsterPolier(p=>({...p,[key]:e.target.value}))}
                    placeholder={ph} style={inputStyle()} />
                </div>
              ))}
            </div>
            <div style={{ background:"var(--bbg)", borderRadius:12,
              padding:"9px 16px", display:"flex", gap:12, alignItems:"flex-start",
              border:"1px solid var(--blue)" }}>
              <span style={{ flexShrink:0, color:"var(--blue)", display:"flex" }}><Info size={17} /></span>
              <span style={{ color:"var(--blue)", fontSize:12, lineHeight:1.5 }}>
                Dieser Schritt ist optional. Du kannst Nutzer auch direkt
                über Supabase Auth anlegen und die Rolle in der App zuweisen.
              </span>
            </div>
          </div>
        )}

        {/* ── Schritt 4: Fertig ── */}
        {schritt === 4 && (
          <div style={{ textAlign:"center", paddingTop:24 }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color:"var(--yellow)" }}><PartyPopper size={60} /></div>
            <div style={{ fontWeight:900, fontSize:28, color:"var(--green)",
              marginBottom:6 }}>Alles bereit!</div>
            <div style={{ color:"var(--text2)", fontSize:14, lineHeight:1.7,
              maxWidth:300, margin:"0 auto 28px" }}>
              Polaris ist eingerichtet. Du kannst jetzt deine
              erste Baustelle anlegen.
            </div>

            {/* Zusammenfassung */}
            <div style={{ background:"var(--surface)", borderRadius:16,
              padding:14, textAlign:"left", marginBottom:14,
              border:"1.5px solid var(--border)" }}>
              <div style={{ color:"var(--muted)", fontSize:11, fontWeight:700,
                textTransform:"uppercase", letterSpacing:1, marginBottom:9 }}>
                Deine Einstellungen
              </div>
              <div style={{ display:"flex", gap:14, alignItems:"center",
                marginBottom:10 }}>
                {firma.logo
                  ? <img src={firma.logo} style={{ width:48, height:48,
                      borderRadius:24, objectFit:"cover",
                      border:"2px solid var(--yellow)" }} />
                  : <div style={{ width:48, height:48, borderRadius:24,
                      background:"var(--ybg)", border:"2px solid var(--yellow)",
                      display:"flex", alignItems:"center",
                      justifyContent:"center", flexShrink:0 }}><Building2 size={20} style={{ color:"var(--ydark)" }} /></div>}
                <div>
                  <div style={{ color:"var(--text)", fontWeight:800,
                    fontSize:15 }}>{firma.name || "—"}</div>
                  <div style={{ color:"var(--muted)", fontSize:12 }}>
                    {[firma.plz, firma.ort].filter(Boolean).join(" ")}
                  </div>
                </div>
              </div>
              {firma.gewerke.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {firma.gewerke.map(k => {
                    const g = ALLE_GEWERKE.find(x=>x.key===k);
                    return g ? (
                      <div key={k} style={{ background:"var(--surface2)",
                        borderRadius:20, padding:"4px 10px", fontSize:11,
                        color:"var(--text2)", fontWeight:600,
                        border:"1px solid var(--border)" }}>
                        {g.icon} {g.label}
                      </div>
                    ) : null;
                  })}
                </div>
              )}
              {ersterPolier.name && (
                <div style={{ marginTop:12, padding:"7px 14px",
                  background:"var(--surface2)", borderRadius:10,
                  color:"var(--text2)", fontSize:12,
                  display:"flex", alignItems:"center", gap:5 }}>
                  <HardHat size={12} /> {ersterPolier.name}
                  {ersterPolier.telefon && ` · ${ersterPolier.telefon}`}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0,
        background:"var(--surface)", padding:"10px 20px",
        borderTop:"1px solid var(--border)",
        boxShadow:"0 -4px 16px rgba(0,0,0,0.08)",
        display:"flex", gap:10,
        paddingBottom:"calc(14px + env(safe-area-inset-bottom))" }}>
        {schritt > 0 && schritt < 4 && (
          <button onClick={() => setSchritt(s => s-1)}
            style={{ flex:1, background:"var(--surface2)",
              color:"var(--text2)",
              border:"1.5px solid var(--border)", borderRadius:12,
              padding:14, cursor:"pointer", fontSize:14,
              fontWeight:600, fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <ArrowLeft size={14} /> Zurück
          </button>
        )}
        {schritt === 3 && (
          <button onClick={() => setSchritt(4)}
            style={{ flex:1, background:"var(--surface2)",
              color:"var(--muted)",
              border:"1.5px solid var(--border)", borderRadius:12,
              padding:14, cursor:"pointer", fontSize:13,
              fontFamily:"inherit" }}>
            Überspringen
          </button>
        )}
        {schritt < 4 ? (
          <button onClick={() => setSchritt(s => s+1)}
            disabled={!weiterOk}
            style={{ flex:2, background: weiterOk ? "var(--yellow)" : "var(--surface2)",
              color: weiterOk ? "#1a1200" : "var(--muted)",
              border:"none", borderRadius:12, padding:16,
              fontWeight:800, cursor: weiterOk ? "pointer" : "default",
              fontSize:16, fontFamily:"inherit",
              transition:"all 0.2s",
              display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            {schritt === 0 ? "Los geht's" : "Weiter"} <ArrowRight size={16} />
          </button>
        ) : (
          <button onClick={abschliessen}
            style={{ flex:1, background:"var(--green)", color:"#fff",
              border:"none", borderRadius:12, padding:16, fontWeight:800,
              cursor:"pointer", fontSize:16, fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            <Rocket size={16} /> Erste Baustelle anlegen
          </button>
        )}
      </div>
    </div>
  );
}
