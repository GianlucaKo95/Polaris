import { useState, useEffect } from "react";
import { Building2, FileText, CircleCheckBig, Ban, PenLine, X, Check, TriangleAlert } from "lucide-react";
import { sbAngebotFreigabeDaten, sbAngebotEntscheiden } from "../lib/supabase.js";
import { UnterschriftPad } from "../components/UnterschriftPad.jsx";

// Öffentliche, loginfreie Seite für den Kunden — erreicht über
// ?angebot=<token> (siehe App.jsx), analog KundenportalScreen.jsx. Lädt
// ausschließlich über die kuratierte angebot_freigabe_daten-RPC und schreibt
// die Entscheidung über angebot_freigabe_entscheiden — beides ohne
// Session, kein Zugriff auf interne App-Daten.
export function AngebotAkzeptierenScreen({ token }) {
  const [daten,   setDaten]   = useState(null);
  const [laden,   setLaden]   = useState(true);
  const [fehler,  setFehler]  = useState(false);
  const [formular,setFormular]= useState(null); // null | "annehmen" | "ablehnen"
  const [name,     setName]     = useState("");
  const [signatur, setSignatur] = useState(null);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [sendet,   setSendet]   = useState(false);
  const [sendeFehler, setSendeFehler] = useState("");
  const [ergebnis, setErgebnis] = useState(null); // { entscheidung, hash }

  useEffect(() => {
    let aktiv = true;
    sbAngebotFreigabeDaten(token).then(d => {
      if (!aktiv) return;
      if (!d) setFehler(true); else setDaten(d);
      setLaden(false);
    });
    return () => { aktiv = false; };
  }, [token]);

  if (laden) {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center",
        background:"var(--bg)", color:"var(--muted)", fontFamily:"inherit" }}>
        Lädt…
      </div>
    );
  }

  if (fehler || !daten) {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", background:"var(--bg)", color:"var(--text)", padding:24, textAlign:"center" }}>
        <Building2 size={40} style={{ opacity:0.4, marginBottom:12 }} />
        <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>Link nicht gültig</div>
        <div style={{ color:"var(--muted)", fontSize:13.5 }}>
          Dieser Angebots-Link ist abgelaufen oder wurde deaktiviert.
          Bitte beim Ersteller einen neuen Link anfordern.
        </div>
      </div>
    );
  }

  const netto   = (daten.positionen||[]).reduce((s,p)=>s+(p.menge||0)*(p.ep||0)*(1-(p.rabatt||0)/100),0);
  const nettoNachRabatt = netto * (1 - (daten.rabatt||0)/100);
  const mwstBetrag = nettoNachRabatt * (daten.mwst ?? 19)/100;
  const bruttoGesamt = nettoNachRabatt + mwstBetrag;
  const abgelaufen = daten.gueltig_bis && new Date(daten.gueltig_bis) < new Date(new Date().toDateString());
  const bereitsEntschieden = ergebnis?.entscheidung || daten.entscheidung;

  async function absenden(entscheidung) {
    setSendeFehler("");
    if (!name.trim()) { setSendeFehler("Bitte einen Namen angeben."); return; }
    if (entscheidung === "angenommen" && !signatur) { setSendeFehler("Bitte zum Annehmen unterschreiben."); return; }
    if (entscheidung === "angenommen" && !bestaetigt) { setSendeFehler("Bitte die verbindliche Annahme bestätigen."); return; }
    setSendet(true);
    const { ok, hash, fehler: err } = await sbAngebotEntscheiden(token, { entscheidung, name, signatur });
    setSendet(false);
    if (!ok) { setSendeFehler(err || "Senden fehlgeschlagen."); return; }
    setErgebnis({ entscheidung, hash });
  }

  // ── Erfolgs-/Abschluss-Ansicht (eigene Entscheidung gerade abgeschickt
  //    ODER beim erneuten Öffnen des Links bereits vorher entschieden) ──
  if (bereitsEntschieden) {
    const angenommen = bereitsEntschieden === "angenommen";
    const label = angenommen ? "angenommen" : "abgelehnt";
    const anzeigeName = ergebnis?.hash ? name : daten.entschieden_name;
    const anzeigeDatum = ergebnis ? new Date() : (daten.entschieden_am ? new Date(daten.entschieden_am) : null);
    return (
      <div style={{ minHeight:"100dvh", background:"var(--bg)", color:"var(--text)", fontFamily:"inherit",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, textAlign:"center" }}>
        {angenommen
          ? <CircleCheckBig size={44} color="var(--green)" style={{ marginBottom:14 }} />
          : <Ban size={44} color="var(--red)" style={{ marginBottom:14 }} />}
        <div style={{ fontWeight:800, fontSize:18, marginBottom:8 }}>
          Angebot {label}
        </div>
        <div style={{ color:"var(--muted)", fontSize:13.5, lineHeight:1.5, maxWidth:320 }}>
          {anzeigeName && <>Bestätigt von <strong style={{ color:"var(--text)" }}>{anzeigeName}</strong><br /></>}
          {anzeigeDatum && anzeigeDatum.toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })}
        </div>
        {ergebnis?.hash && (
          <div style={{ marginTop:18, background:"var(--surface)", border:"1px solid var(--border)",
            borderRadius:10, padding:"10px 16px", maxWidth:320, wordBreak:"break-all" }}>
            <div style={{ color:"var(--muted)", fontSize:10, textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>
              Dokumenten-ID (Beleg)
            </div>
            <div style={{ fontFamily:"monospace", fontSize:12, color:"var(--text)" }}>DOC-{ergebnis.hash}</div>
          </div>
        )}
        <div style={{ marginTop:24, color:"var(--muted)", fontSize:11 }}>Bereitgestellt über Polaris</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100dvh", background:"var(--bg)", color:"var(--text)", fontFamily:"inherit" }}>
      <div style={{ background:"var(--ink)", color:"#fff", padding:"20px 18px",
        paddingTop:"calc(20px + env(safe-area-inset-top))" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          {daten.firma_logo_url
            ? <img src={daten.firma_logo_url} alt="" style={{ width:34, height:34, borderRadius:8, objectFit:"cover" }} />
            : <div style={{ width:34, height:34, borderRadius:8, background:"rgba(255,255,255,.1)",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Building2 size={18} />
              </div>}
          <div style={{ fontSize:13, fontWeight:700, color:"var(--yellow)" }}>{daten.firma_name}</div>
        </div>
        <div style={{ fontSize:22, fontWeight:800, letterSpacing:-0.5, lineHeight:1.2,
          display:"flex", alignItems:"center", gap:8 }}><FileText size={20} /> {daten.titel}</div>
        {daten.projekt_name && (
          <div style={{ color:"var(--ink-text2)", fontSize:12.5, marginTop:6 }}>{daten.projekt_name}</div>
        )}
      </div>

      <div style={{ padding:"18px 16px 40px" }}>
        {abgelaufen && (
          <div style={{ background:"var(--obg)", color:"var(--orange)", borderRadius:10,
            padding:"10px 14px", marginBottom:14, fontSize:12.5, display:"flex", alignItems:"center", gap:8 }}>
            <TriangleAlert size={15} style={{ flexShrink:0 }} />
            Dieses Angebot war nur bis {new Date(daten.gueltig_bis).toLocaleDateString("de-DE")} gültig und kann nicht mehr angenommen werden.
          </div>
        )}

        {/* Positionen */}
        <div style={{ color:"var(--muted)", fontSize:12, marginBottom:8 }}>
          {daten.empfaenger} · {new Date(daten.datum).toLocaleDateString("de-DE")}
          {daten.gueltig_bis && <> · gültig bis {new Date(daten.gueltig_bis).toLocaleDateString("de-DE")}</>}
        </div>
        {(daten.positionen||[]).map((p,i) => (
          <div key={i} style={{ background:"var(--surface)", border:"1px solid var(--border)",
            borderRadius:10, padding:"9px 14px", marginBottom:6 }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
              <div style={{ fontSize:13, color:"var(--text)" }}>{p.bez}</div>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--text)", flexShrink:0 }}>
                {((p.menge||0)*(p.ep||0)*(1-(p.rabatt||0)/100)).toLocaleString("de-DE",{minimumFractionDigits:2})} €
              </div>
            </div>
            <div style={{ color:"var(--muted)", fontSize:11.5, marginTop:2 }}>
              {(p.menge||0).toLocaleString("de-DE")} {p.einheit} × {(p.ep||0).toLocaleString("de-DE")} €
              {p.rabatt > 0 && <> · {p.rabatt}% Rabatt</>}
            </div>
          </div>
        ))}

        {/* Summen */}
        <div style={{ background:"#1a1a1a", borderRadius:14, padding:"12px 18px", marginTop:12, marginBottom:18 }}>
          <div style={{ display:"flex", justifyContent:"space-between", color:"#888", fontSize:12.5, marginBottom:4 }}>
            <span>Netto</span><span>{nettoNachRabatt.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", color:"#888", fontSize:12.5, marginBottom:8 }}>
            <span>MwSt. {daten.mwst ?? 19}%</span><span>{mwstBetrag.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
            <span style={{ color:"#fff", fontWeight:700, fontSize:13 }}>Gesamt (brutto)</span>
            <span style={{ color:"var(--yellow)", fontWeight:900, fontSize:22 }}>
              {bruttoGesamt.toLocaleString("de-DE",{minimumFractionDigits:2})} €
            </span>
          </div>
        </div>

        {/* Formular oder Entscheidungs-Buttons */}
        {formular === null && (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => { setFormular("ablehnen"); setSendeFehler(""); }}
              style={{ flex:1, background:"var(--rbg)", color:"var(--red)", border:"1.5px solid var(--red)",
                borderRadius:12, padding:13, fontWeight:700, cursor:"pointer", fontSize:13.5, fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              <Ban size={15} /> Ablehnen
            </button>
            <button onClick={() => { setFormular("annehmen"); setSendeFehler(""); }} disabled={abgelaufen}
              style={{ flex:1, background: abgelaufen ? "var(--surface2)" : "var(--green)",
                color: abgelaufen ? "var(--muted)" : "#fff", border:"none",
                borderRadius:12, padding:13, fontWeight:700, cursor: abgelaufen ? "default" : "pointer",
                fontSize:13.5, fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              <CircleCheckBig size={15} /> Annehmen
            </button>
          </div>
        )}

        {formular === "ablehnen" && (
          <div style={{ background:"var(--surface)", border:"1.5px solid var(--red)", borderRadius:14, padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:14, color:"var(--red)",
                display:"flex", alignItems:"center", gap:7 }}><Ban size={15} /> Angebot ablehnen</div>
              <button onClick={() => setFormular(null)}
                style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", display:"flex" }}><X size={16} /></button>
            </div>
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600, marginBottom:6 }}>Ihr Name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname"
              style={{ width:"100%", background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border2)",
                borderRadius:8, padding:"11px 12px", fontSize:14, boxSizing:"border-box", marginBottom:12, fontFamily:"inherit" }} />
            {sendeFehler && <div style={{ color:"var(--red)", fontSize:12, marginBottom:10 }}>{sendeFehler}</div>}
            <button onClick={() => absenden("abgelehnt")} disabled={sendet}
              style={{ width:"100%", background:"var(--red)", color:"#fff", border:"none", borderRadius:10,
                padding:12, fontWeight:700, cursor: sendet ? "default" : "pointer", fontSize:13.5, fontFamily:"inherit" }}>
              {sendet ? "Wird gesendet…" : "Ablehnung bestätigen"}
            </button>
          </div>
        )}

        {formular === "annehmen" && (
          <div style={{ background:"var(--surface)", border:"1.5px solid var(--green)", borderRadius:14, padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:14, color:"var(--green)",
                display:"flex", alignItems:"center", gap:7 }}><PenLine size={15} /> Angebot annehmen</div>
              <button onClick={() => setFormular(null)}
                style={{ background:"none", border:"none", color:"var(--muted)", cursor:"pointer", display:"flex" }}><X size={16} /></button>
            </div>
            <div style={{ color:"var(--muted)", fontSize:11, fontWeight:600, marginBottom:6 }}>Ihr Name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Vor- und Nachname"
              style={{ width:"100%", background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border2)",
                borderRadius:8, padding:"11px 12px", fontSize:14, boxSizing:"border-box", marginBottom:12, fontFamily:"inherit" }} />
            <UnterschriftPad label="Unterschrift" onSave={setSignatur} />
            {signatur && <div style={{ color:"var(--green)", fontSize:11.5, marginTop:-6, marginBottom:10,
              display:"flex", alignItems:"center", gap:5 }}><Check size={12} /> Unterschrift übernommen</div>}
            <label style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:12, cursor:"pointer" }}>
              <input type="checkbox" checked={bestaetigt} onChange={e=>setBestaetigt(e.target.checked)}
                style={{ marginTop:2, flexShrink:0 }} />
              <span style={{ color:"var(--text2)", fontSize:12, lineHeight:1.4 }}>
                Mit Klick auf „Verbindlich annehmen" bestätige ich die Annahme dieses Angebots
                zu den genannten Positionen und Preisen.
              </span>
            </label>
            {sendeFehler && <div style={{ color:"var(--red)", fontSize:12, marginBottom:10 }}>{sendeFehler}</div>}
            <button onClick={() => absenden("angenommen")} disabled={sendet}
              style={{ width:"100%", background:"var(--green)", color:"#fff", border:"none", borderRadius:10,
                padding:12, fontWeight:700, cursor: sendet ? "default" : "pointer", fontSize:13.5, fontFamily:"inherit" }}>
              {sendet ? "Wird gesendet…" : "Verbindlich annehmen"}
            </button>
          </div>
        )}

        <div style={{ textAlign:"center", color:"var(--muted)", fontSize:11, marginTop:24 }}>
          Bereitgestellt über Polaris
        </div>
      </div>
    </div>
  );
}
