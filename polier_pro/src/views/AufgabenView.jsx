import { useState } from "react";
import { Search, SlidersHorizontal, Plus, TriangleAlert, CircleCheck } from "lucide-react";
import { SchnellErstellung } from "./SchnellErstellung.jsx";
import { AufgabenFormular } from "./AufgabenFormular.jsx";
import { leereAufgabe } from "../lib/utils.js";
import { FilterBtn } from "../components/FilterBtn.jsx";
import { AufgabenKarte } from "../components/AufgabenKarte.jsx";
import { AUFGABEN_STATUS, AUFGABEN_TYPEN } from "../config/konstanten.js";
import { useBackButton } from "../hooks/useBackButton.js";

export function AufgabenView({ aufgaben, setAufgaben, kolonnen, sbConnected, darfBearbeiten = true, initialFilter = "alle",
  initialEditId = null, kannVorschlagen = false, onVorschlagen, onEntscheiden, darfEntscheiden = darfBearbeiten,
  zeitbuchungen = [], projekt }) {
  const projektTyp = projekt?.typ;
  const [ansicht,     setAnsicht]     = useState("liste");  // liste | kanban
  const [filter,      setFilter]      = useState(initialFilter);
  const [neuAufgabe,  setNeuAufgabe]  = useState(false);
  const [neuMangel,   setNeuMangel]   = useState(false);
  // Sprung aus dem Terminplan direkt in eine Aufgabe — initialEditId nur
  // beim ersten Rendern ausgewertet, wie initialFilter auch.
  const [editAufgabe, setEditAufgabe] = useState(() => aufgaben.find(a => a.id === initialEditId) || null);
  useBackButton(neuAufgabe, () => setNeuAufgabe(false));
  useBackButton(neuMangel,  () => setNeuMangel(false));
  useBackButton(editAufgabe, () => setEditAufgabe(null));

  const gefiltert = aufgaben.filter(a => {
    if (filter === "alle")      return true;
    if (filter === "maengel")   return a.ist_mangel;
    if (filter === "offen")     return a.status === "offen";
    if (filter === "kritisch")  return a.prioritaet === "kritisch";
    return a.typ === filter;
  });

  function handleSave(a) {
    if (editAufgabe) {
      setAufgaben(prev => prev.map(x => x.id===a.id ? a : x));
    } else {
      setAufgaben(prev => [a, ...prev]);
    }
    setNeuAufgabe(false);
    setEditAufgabe(null);
  }

  function handleSchnellSave(neueAufgaben) {
    setAufgaben(prev => [...neueAufgaben, ...prev]);
    setNeuAufgabe(false);
  }

  function handleDelete(a) {
    setAufgaben(prev => prev.filter(x => x.id !== a.id));
  }

  function handleToggleErledigt(a) {
    const neuerStatus = a.status === "abgeschlossen" ? "offen" : "abgeschlossen";
    setAufgaben(prev => prev.map(x => x.id === a.id ? { ...x, status: neuerStatus } : x));
  }

  if (neuAufgabe) {
    return (
      <SchnellErstellung
        onSave={handleSchnellSave}
        onClose={() => setNeuAufgabe(false)}
        projektTyp={projektTyp}
      />
    );
  }

  if (neuMangel) {
    return (
      <AufgabenFormular
        initial={{ ...leereAufgabe(), typ:"mangel", ist_mangel:true }}
        kolonnen={kolonnen}
        alleAufgaben={aufgaben}
        onSave={handleSave}
        onClose={() => setNeuMangel(false)}
        projektTyp={projektTyp}
      />
    );
  }

  if (editAufgabe) {
    return (
      <AufgabenFormular
        initial={editAufgabe}
        kolonnen={kolonnen}
        alleAufgaben={aufgaben}
        onSave={handleSave}
        onClose={() => setEditAufgabe(null)}
        projektTyp={projektTyp}
      />
    );
  }

  const offen         = aufgaben.filter(a => a.status !== "abgeschlossen");
  const stats = {
    gesamt:        aufgaben.length,
    offen:         aufgaben.filter(a=>a.status==="offen").length,
    maengel:       aufgaben.filter(a=>a.ist_mangel && a.status!=="abgeschlossen").length,
    abgeschlossen: aufgaben.filter(a=>a.status==="abgeschlossen").length,
  };

  // Ist-Stunden je Aufgabe: Summe der abgeschlossenen Zeitbuchungen, die
  // beim Stempeln dieser Aufgabe zugeordnet wurden — Grundlage für den
  // Soll/Ist-Produktivitätsvergleich auf der Karte.
  const istStundenProAufgabe = {};
  for (const z of zeitbuchungen) {
    if (!z.aufgabe_id || z.status !== "abgeschlossen" || !z.netto_minuten) continue;
    istStundenProAufgabe[z.aufgabe_id] = (istStundenProAufgabe[z.aufgabe_id] || 0) + z.netto_minuten / 60;
  }

  const zurPruefungListe  = gefiltert.filter(a => a.status === "zur_pruefung");
  const ueberfaelligListe = gefiltert.filter(a => a.status !== "abgeschlossen" && a.status !== "zur_pruefung" && a.faellig_am && new Date(a.faellig_am) < new Date());
  const offenListe        = gefiltert.filter(a => a.status !== "abgeschlossen" && a.status !== "zur_pruefung" && !ueberfaelligListe.includes(a));
  const erledigtListe     = gefiltert.filter(a => a.status === "abgeschlossen");

  return (
    <div style={{ position:"relative", paddingBottom:64 }}>
      {/* Segment-Reiter über den Gesamtbestand (unabhängig vom Chip-Filter darunter) */}
      <div style={{ display:"flex", gap:1, background:"var(--border)", marginBottom:10,
        marginLeft:-14, marginRight:-14, width:"calc(100% + 28px)" }}>
        {[["alle","Alle",stats.gesamt],["offen","Offen",stats.offen],["maengel","Mängel",stats.maengel],["abgeschlossen","Fertig",stats.abgeschlossen]].map(([k,l,v]) => (
          <button key={k} onClick={() => setFilter(k === "abgeschlossen" ? "alle" : k)}
            style={{ flex:1, background: filter===k ? "var(--ink)" : "var(--surface)",
              color: filter===k ? "var(--yellow)" : "var(--muted)",
              border:"none", padding:"9px 0", textAlign:"center",
              fontSize:11.5, fontWeight: filter===k ? 800 : 600, cursor:"pointer", fontFamily:"inherit" }}>
            {l} {v}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9, overflowX:"auto" }}>
        {[
          ["alle","Alle"],
          ["kritisch","Kritisch"],
          ["beton","Betonage"],
          ["schalung","Schalung"],
          ["bewehrung","Bewehrung"],
        ].map(([k,l]) => (
          <FilterBtn key={k} active={filter===k}
            onClick={() => setFilter(k)}>{l}</FilterBtn>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:6, flexShrink:0, color:"var(--muted)" }}>
          <SlidersHorizontal size={17} />
        </div>
      </div>

      {/* Kanban / Liste Toggle */}
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {[["liste","Liste"],["kanban","Kanban"]].map(([v,l]) => (
          <button key={v} onClick={() => setAnsicht(v)}
            style={{ background: ansicht===v ? "var(--ink)" : "transparent",
              color: ansicht===v ? "#fff" : "var(--muted)",
              border:`1px solid ${ansicht===v ? "var(--ink)" : "var(--border)"}`,
              padding:"5px 14px", cursor:"pointer",
              fontSize:12, fontFamily:"inherit",
              fontWeight: ansicht===v ? 700 : 500 }}>{l}</button>
        ))}
      </div>

      {/* Liste — nach Dringlichkeit gruppiert */}
      {ansicht === "liste" && (
        <div>
          {gefiltert.length === 0 && (
            <div style={{ textAlign:"center", padding:"29px 20px", color:"var(--muted)" }}>
              <CircleCheck size={40} style={{ marginBottom:8, opacity:0.5 }} />
              <div>{filter === "maengel" ? "Keine Mängel erfasst" : "Keine Aufgaben gefunden"}</div>
            </div>
          )}

          {zurPruefungListe.length > 0 && (
            <>
              <SektionsTitel label="Zur Prüfung" />
              {zurPruefungListe.map(a => (
                <AufgabenKarte key={a.id} aufgabe={a} kolonnen={kolonnen} istStunden={istStundenProAufgabe[a.id] || 0}
                  onClick={() => darfBearbeiten && setEditAufgabe(a)}
                  onDelete={darfBearbeiten ? handleDelete : undefined}
                  onEntscheiden={darfEntscheiden ? onEntscheiden : undefined} />
              ))}
            </>
          )}

          {ueberfaelligListe.length > 0 && (
            <>
              <SektionsTitel label="Überfällig" />
              {ueberfaelligListe.map(a => (
                <AufgabenKarte key={a.id} aufgabe={a} kolonnen={kolonnen} istStunden={istStundenProAufgabe[a.id] || 0}
                  onClick={() => darfBearbeiten && setEditAufgabe(a)}
                  onDelete={darfBearbeiten ? handleDelete : undefined}
                  onToggleErledigt={darfBearbeiten ? handleToggleErledigt : undefined}
                  onVorschlagen={kannVorschlagen ? onVorschlagen : undefined} />
              ))}
            </>
          )}

          {offenListe.length > 0 && (
            <>
              <SektionsTitel label="Offen" />
              {offenListe.map(a => (
                <AufgabenKarte key={a.id} aufgabe={a} kolonnen={kolonnen} istStunden={istStundenProAufgabe[a.id] || 0}
                  onClick={() => darfBearbeiten && setEditAufgabe(a)}
                  onDelete={darfBearbeiten ? handleDelete : undefined}
                  onToggleErledigt={darfBearbeiten ? handleToggleErledigt : undefined}
                  onVorschlagen={kannVorschlagen ? onVorschlagen : undefined} />
              ))}
            </>
          )}

          {erledigtListe.length > 0 && (
            <>
              <SektionsTitel label="Erledigt" />
              {erledigtListe.map(a => (
                <AufgabenKarte key={a.id} aufgabe={a} kolonnen={kolonnen} istStunden={istStundenProAufgabe[a.id] || 0}
                  onClick={() => darfBearbeiten && setEditAufgabe(a)}
                  onDelete={darfBearbeiten ? handleDelete : undefined}
                  onToggleErledigt={darfBearbeiten ? handleToggleErledigt : undefined} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Kanban */}
      {ansicht === "kanban" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {Object.entries(AUFGABEN_STATUS).map(([statusKey, statusCfg]) => {
            const spalte = gefiltert.filter(a => a.status === statusKey);
            return (
              <div key={statusKey} style={{ background:"var(--surface2)",
                padding:7, border:"1px solid var(--border)" }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:6 }}>
                  <div style={{ color:statusCfg.farbe, fontWeight:700, fontSize:12 }}>
                    {statusCfg.label}
                  </div>
                  <div style={{ background:statusCfg.bg, color:statusCfg.farbe,
                    padding:"1px 7px", fontSize:11,
                    fontWeight:700 }}>{spalte.length}</div>
                </div>
                {spalte.map(a => (
                  <div key={a.id} onClick={() => darfBearbeiten && setEditAufgabe(a)}
                    style={{ background:"var(--surface)",
                      padding:"7px 12px", marginBottom:6, cursor:"pointer",
                      borderLeft:`3px solid ${AUFGABEN_TYPEN[a.typ]?.farbe || "var(--muted)"}` }}>
                    <div style={{ color:"var(--text)", fontWeight:600, fontSize:12 }}>
                      {a.titel}
                    </div>
                    {a.zustaendig && (
                      <div style={{ color:"var(--muted)", fontSize:10, marginTop:3 }}>
                        {a.zustaendig}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      {darfBearbeiten && (
        <button onClick={() => filter === "maengel" ? setNeuMangel(true) : setNeuAufgabe(true)}
          style={{ position:"fixed", right:16, bottom:100, width:56, height:56,
            background: filter === "maengel" ? "var(--red)" : "var(--yellow)",
            color: filter === "maengel" ? "#fff" : "#0B1120", border:"none",
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", boxShadow:"0 6px 20px rgba(11,17,32,0.28)", zIndex:40 }}>
          <Plus size={26} />
        </button>
      )}
    </div>
  );
}

function SektionsTitel({ label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, margin:"16px 0 8px" }}>
      <div style={{ color:"var(--muted)", fontSize:11, fontWeight:800,
        letterSpacing:0.8, textTransform:"uppercase" }}>{label}</div>
      <div style={{ flex:1, height:1, background:"var(--border)" }} />
    </div>
  );
}
