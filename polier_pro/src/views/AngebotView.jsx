import { useState } from "react";
import { FileText, Plus, Link2 } from "lucide-react";
import { AngebotEditor } from "./AngebotEditor.jsx";
import { useBackButton } from "../hooks/useBackButton.js";

export function AngebotView({ projekt, aufgaben, einheitspreise, lvVorlagen, angebotVorlage, eigeneFirma, angebote = [], onAngebotSpeichern, firmaId, profil, session }) {
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
      firmaId={firmaId}
      profil={profil}
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
        const STATUS  = {
          entwurf:    { label:"📝 Entwurf",    farbe:"var(--muted)", bg:"var(--surface2)" },
          versendet:  { label:"📤 Versendet",  farbe:"var(--blue)",  bg:"var(--bbg)" },
          angenommen: { label:"✅ Angenommen", farbe:"var(--green)", bg:"var(--gbg)" },
          abgelehnt:  { label:"❌ Abgelehnt",  farbe:"var(--red)",   bg:"var(--rbg)" },
        };
        const statusInfo = STATUS[a.status] || { label:a.status, farbe:"var(--muted)", bg:"var(--surface2)" };
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
                <div style={{ display:"inline-block", background:statusInfo.bg, color:statusInfo.farbe,
                  fontWeight:700, fontSize:11, borderRadius:20, padding:"3px 9px", marginTop:4 }}>
                  {statusInfo.label}
                </div>
              </div>
            </div>
            <div style={{ color:"var(--muted)", fontSize:12, marginTop:6 }}>
              {a.positionen.length} Position{a.positionen.length!==1?"en":""}
              · Gültig bis {new Date(a.gueltig_bis).toLocaleDateString("de-DE")}
            </div>
            {/* entschieden_am wird nur von der angebot_freigabe_entscheiden-RPC
                gesetzt (nie vom internen Status-Dropdown) — zeigt also
                zuverlässig "Kunde hat online über den Link entschieden" an. */}
            {a.entschieden_am && (
              <div style={{ color:statusInfo.farbe, fontSize:11.5, marginTop:4,
                display:"flex", alignItems:"center", gap:4 }}>
                <Link2 size={11} />
                Online {a.status === "angenommen" ? "angenommen" : "abgelehnt"} am{" "}
                {new Date(a.entschieden_am).toLocaleDateString("de-DE")} von {a.entschieden_von}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
