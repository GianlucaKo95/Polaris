import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { AngebotEditor } from "./AngebotEditor.jsx";
import { useBackButton } from "../hooks/useBackButton.js";

export function AngebotView({ projekt, aufgaben, einheitspreise, lvVorlagen, angebotVorlage, eigeneFirma, angebote = [], onAngebotSpeichern, session }) {
  const [aktAngebot,  setAktAngebot]  = useState(null);
  const [fehler,      setFehler]      = useState("");
  useBackButton(aktAngebot, () => setAktAngebot(null));

  async function neuesAngebot() {
    setFehler("");
    const a = {
      titel:        `Angebot ${new Date().toLocaleDateString("de-DE")}`,
      empfaenger:   projekt?.auftraggeber || "",
      datum:        new Date().toISOString().slice(0,10),
      gueltig_bis:  new Date(Date.now()+30*864e5).toISOString().slice(0,10),
      positionen:   [],
      rabatt:       0,
      mwst:         19,
      status:       "entwurf",
    };
    const gespeichert = await onAngebotSpeichern?.(a, true);
    if (!gespeichert) { setFehler("Angebot konnte nicht angelegt werden."); return; }
    setAktAngebot(gespeichert);
  }

  if (aktAngebot) {
    return <AngebotEditor
      angebot={aktAngebot}
      onSave={async a => {
        const gespeichert = await onAngebotSpeichern?.(a, false);
        setAktAngebot(gespeichert || a);
      }}
      onClose={() => setAktAngebot(null)}
      aufgaben={aufgaben}
      einheitspreise={einheitspreise}
      lvVorlagen={lvVorlagen}
      angebotVorlage={angebotVorlage}
      projekt={projekt}
      eigeneFirma={eigeneFirma}
      session={session}
    />;
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:10 }}>
        <div style={{ color:"var(--text)", fontWeight:700, fontSize:15,
          display:"flex", alignItems:"center", gap:7 }}>
          <FileText size={16} /> Angebote
        </div>
        <button onClick={neuesAngebot}
          style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
            borderRadius:10, padding:"8px 16px", fontWeight:700,
            cursor:"pointer", fontSize:13, fontFamily:"inherit",
            display:"flex", alignItems:"center", gap:5 }}>
          <Plus size={14} /> Angebot
        </button>
      </div>

      {fehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
          padding:"9px 14px", marginBottom:10, fontSize:12,
          border:"1px solid var(--red)" }}>
          {fehler}
        </div>
      )}

      {angebote.length === 0 && (
        <div style={{ textAlign:"center", padding:"35px 20px", color:"var(--muted)" }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:9, color:"var(--muted)" }}><FileText size={40} /></div>
          <div style={{ fontWeight:700, color:"var(--text)", marginBottom:6 }}>
            Noch keine Angebote
          </div>
          <div style={{ fontSize:13 }}>
            Erstelle ein Angebot aus Aufgaben oder LV-Vorlagen.
          </div>
        </div>
      )}

      {angebote.map(a => {
        const netto   = a.positionen.reduce((s,p)=>s+(p.menge||0)*(p.ep||0),0);
        const gesamt  = netto * (1 - (a.rabatt||0)/100) * (1 + (a.mwst||19)/100);
        const STATUS  = { entwurf:"📝 Entwurf", versendet:"📤 Versendet",
          angenommen:"✅ Angenommen", abgelehnt:"❌ Abgelehnt" };
        return (
          <div key={a.id} onClick={() => setAktAngebot(a)}
            style={{ background:"var(--surface)", borderRadius:14,
              padding:"12px 18px", marginBottom:7, cursor:"pointer",
              border:"1.5px solid var(--border)",
              boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"flex-start" }}>
              <div>
                <div style={{ color:"var(--text)", fontWeight:700, fontSize:14 }}>
                  {a.titel}
                </div>
                <div style={{ color:"var(--muted)", fontSize:12, marginTop:2 }}>
                  {a.empfaenger} · {new Date(a.datum).toLocaleDateString("de-DE")}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color:"var(--yellow)", fontWeight:800, fontSize:16 }}>
                  {gesamt.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} €
                </div>
                <div style={{ color:"var(--muted)", fontSize:11, marginTop:2 }}>
                  {STATUS[a.status] || a.status}
                </div>
              </div>
            </div>
            <div style={{ color:"var(--muted)", fontSize:12, marginTop:6 }}>
              {a.positionen.length} Position{a.positionen.length!==1?"en":""}
              · Gültig bis {new Date(a.gueltig_bis).toLocaleDateString("de-DE")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
