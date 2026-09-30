import { useState } from "react";
import { MapPin, HardHat } from "lucide-react";
import { MitarbeiterZeilen } from "./MitarbeiterZeilen.jsx";
import { SwipeToDelete } from "./SwipeToDelete.jsx";
import { sha256Hex } from "../lib/utils.js";

export function KolonneKarte({ k, zeitdaten, vonDatum, bisDatum, zeitenGeladen, setKolonnen, darfBearbeiten = true, kannKolonneLoeschen = false }) {
  const [expanded, setExpanded] = useState(false);
  const [neuerName, setNeuerName] = useState("");
  const [neuePin,  setNeuePin]  = useState("");
  const [hinzufuegenFehler, setHinzufuegenFehler] = useState("");
  const mas = k.mitarbeiter || [];
  const totalMann = mas.length;

  function kolonneLoeschen() {
    if (!setKolonnen) return;
    setKolonnen(prev => prev.filter(kol => kol.id !== k.id));
  }

  // PIN wird nur gehasht gespeichert (Kolonnen sind für alle Firmenmitglieder
  // lesbar) — Mitarbeiter ohne eigenen Account bestätigen sich damit beim
  // Sammelstempeln selbst, statt dass der Vorarbeiter einfach für sie
  // abhaken kann.
  async function mitarbeiterHinzufuegen() {
    if (!setKolonnen) return;
    setHinzufuegenFehler("");
    if (!neuerName.trim()) { setHinzufuegenFehler("Bitte einen Namen eingeben."); return; }
    if (!/^\d{4}$/.test(neuePin)) { setHinzufuegenFehler("Bitte eine 4-stellige PIN eingeben."); return; }
    const neu = { id: Date.now(), name: neuerName.trim(), pinHash: await sha256Hex(neuePin) };
    setKolonnen(prev => prev.map(kol =>
      kol.id === k.id ? { ...kol, mitarbeiter: [...(kol.mitarbeiter||[]), neu] } : kol
    ));
    setNeuerName(""); setNeuePin("");
  }

  function mitarbeiterEntfernen(id) {
    if (!setKolonnen) return;
    setKolonnen(prev => prev.map(kol =>
      kol.id === k.id ? { ...kol, mitarbeiter: (kol.mitarbeiter||[]).filter(m => m.id !== id) } : kol
    ));
  }

  // Stunden dieser Kolonne aus Zeitdaten
  const kolonneH = zeitdaten.filter(z => {
    if (!mas.length) return false;
    return mas.some(ma => {
      if (ma.erfasstIdent) return z.person?.ident === ma.erfasstIdent;
      const vn = (z.person?.formattedName || "").toLowerCase();
      return vn.includes(ma.name.split(" ")[0].toLowerCase()) ||
             vn.includes(ma.name.split(" ").pop().toLowerCase());
    });
  }).reduce((s, z) => s + (z.hours||0) + (z.minutes||0)/60, 0);

  const anwesend = mas.filter(ma => zeitdaten.some(z => {
    if (ma.erfasstIdent) return z.person?.ident === ma.erfasstIdent;
    const vn = (z.person?.formattedName || "").toLowerCase();
    return vn.includes(ma.name.split(" ")[0].toLowerCase()) ||
           vn.includes(ma.name.split(" ").pop().toLowerCase());
  })).length;

  return (
    <div style={{ marginBottom:9 }}>
      {/* Kolonne Header — nach links wischen legt den Löschen-Button frei */}
      <SwipeToDelete onDelete={kannKolonneLoeschen && setKolonnen ? kolonneLoeschen : undefined}>
      <div style={{ background: "var(--surface)", borderRadius: expanded ? "12px 12px 0 0" : 12,
        padding:"10px 16px", border:`1px solid ${'var(--border)'}`,
        borderBottom: expanded ? "none" : undefined }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ color: "var(--text)", fontWeight:700, fontSize:15 }}>{k.name}</div>
            <div style={{ color: "var(--muted)", fontSize:12, marginTop:2,
              display:"flex", alignItems:"center", gap:4 }}><MapPin size={11} /> {k.einsatz}</div>
            {k.vorarbeiter && (
              <div style={{ color: "var(--muted)", fontSize:11, marginTop:2,
                display:"flex", alignItems:"center", gap:4 }}><HardHat size={11} /> VA: {k.vorarbeiter}</div>
            )}
          </div>
          <div style={{ textAlign:"right" }}>
            {zeitenGeladen && kolonneH > 0 ? (
              <div style={{ color: "var(--yellow)", fontWeight:800, fontSize:18 }}>{kolonneH.toFixed(1)}h</div>
            ) : (
              <div style={{ color: "var(--yellow)", fontSize:13,
                display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end" }}><HardHat size={13} /> {totalMann} Mann</div>
            )}
            {zeitenGeladen && (
              <div style={{ color: "var(--muted)", fontSize:10 }}>
                {anwesend}/{totalMann} anwesend
              </div>
            )}
          </div>
        </div>

        {/* Fortschrittsbalken Anwesenheit */}
        {zeitenGeladen && totalMann > 0 && (
          <div style={{ marginTop:10 }}>
            <div style={{ background: "var(--border)", borderRadius:4, height:5 }}>
              <div style={{ background: anwesend === totalMann ? "var(--green)" : "var(--yellow)",
                width:`${(anwesend/totalMann)*100}%`, height:"100%", borderRadius:4, transition:"width 0.4s" }} />
            </div>
          </div>
        )}

        {/* MA-Vorschau Avatare */}
        <div style={{ display:"flex", alignItems:"center", marginTop:10, gap:6 }}>
          <div style={{ display:"flex" }}>
            {mas.slice(0,5).map((ma, i) => (
              <div key={ma.id} style={{ width:26, height:26, borderRadius:13,
                background: "var(--border)", border:`2px solid ${'var(--surface)'}`,
                marginLeft: i > 0 ? -8 : 0,
                display:"flex", alignItems:"center", justifyContent:"center",
                color: "var(--muted)", fontSize:10, fontWeight:700, zIndex:5-i }}>
                {ma.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
              </div>
            ))}
            {mas.length > 5 && (
              <div style={{ width:26, height:26, borderRadius:13,
                background: "var(--border)", border:`2px solid ${'var(--surface)'}`,
                marginLeft:-8, display:"flex", alignItems:"center", justifyContent:"center",
                color: "var(--muted)", fontSize:9 }}>+{mas.length-5}</div>
            )}
          </div>
          <button onClick={() => setExpanded(e => !e)}
            style={{ marginLeft:"auto", background: "var(--border)", border:"none", color: "var(--text)",
              borderRadius:8, padding:"5px 12px", cursor:"pointer", fontSize:12 }}>
            {expanded ? "▲ Zuklappen" : "▼ Mitarbeiter"}
          </button>
        </div>
      </div>
      </SwipeToDelete>

      {/* Aufgeklappte MA-Liste */}
      {expanded && (
        <div style={{ background: "var(--surface2)", borderRadius:"0 0 12px 12px",
          border:`1px solid ${'var(--border)'}`, borderTop:"none", padding:"7px 12px" }}>
          {mas.map(ma => (
            <SwipeToDelete key={ma.id}
              onDelete={darfBearbeiten && setKolonnen ? () => mitarbeiterEntfernen(ma.id) : undefined}>
              <MitarbeiterZeilen
                ma={ma}
                zeitdaten={zeitdaten}
                vonDatum={vonDatum}
                bisDatum={bisDatum}
              />
            </SwipeToDelete>
          ))}

          {/* Mitarbeiter hinzufügen */}
          {darfBearbeiten && setKolonnen && (
            <div style={{ marginTop:10 }}>
              <div style={{ display:"flex", gap:6 }}>
                <input value={neuerName}
                  onChange={e=>{ setNeuerName(e.target.value); setHinzufuegenFehler(""); }}
                  placeholder="Name des Mitarbeiters"
                  style={{ flex:1, background:"var(--surface)", color:"var(--text)",
                    border:"1px solid var(--border)", borderRadius:8,
                    padding:"7px 10px", fontSize:12, fontFamily:"inherit" }} />
                <input value={neuePin}
                  onChange={e=>{ setNeuePin(e.target.value.replace(/\D/g,"").slice(0,4)); setHinzufuegenFehler(""); }}
                  placeholder="PIN" type="password" inputMode="numeric" maxLength={4}
                  onKeyDown={e => e.key==="Enter" && mitarbeiterHinzufuegen()}
                  style={{ width:64, background:"var(--surface)", color:"var(--text)",
                    border:"1px solid var(--border)", borderRadius:8,
                    padding:"7px 10px", fontSize:12, fontFamily:"inherit", textAlign:"center" }} />
              </div>
              <div style={{ color:"var(--muted)", fontSize:10, marginTop:4 }}>
                4-stellige PIN (Pflichtfeld), mit der sich {neuerName.trim() || "die Person"} beim Sammelstempeln selbst bestätigt.
              </div>
              {hinzufuegenFehler && (
                <div style={{ color:"var(--red)", fontSize:11, marginTop:4, fontWeight:600 }}>
                  {hinzufuegenFehler}
                </div>
              )}
              <button onClick={mitarbeiterHinzufuegen}
                style={{ width:"100%", marginTop:6,
                  background: "var(--yellow)", color:"#1a1200",
                  border:"none", borderRadius:8, padding:"7px 14px",
                  cursor:"pointer", fontSize:12,
                  fontWeight:700, fontFamily:"inherit" }}>
                + Hinzufügen
              </button>
            </div>
          )}

          {/* Kolonnen-Summe */}
          {zeitenGeladen && kolonneH > 0 && (
            <div style={{ display:"flex", justifyContent:"space-between",
              background: "var(--border)", borderRadius:8, padding:"7px 12px", marginTop:8 }}>
              <div style={{ color: "var(--muted)", fontSize:12 }}>Kolonne gesamt</div>
              <div style={{ color: "var(--yellow)", fontWeight:800, fontSize:15 }}>{kolonneH.toFixed(1)} h</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
