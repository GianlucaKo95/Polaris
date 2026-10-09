import { useState } from "react";
import { Calendar, CalendarX, User, Ruler, Camera, TriangleAlert } from "lucide-react";
import { AUFGABEN_TYPEN, AUFGABEN_STATUS, AUFGABEN_PRIO } from "../config/konstanten.js";
import { SwipeToDelete } from "./SwipeToDelete.jsx";
import { MangelBehebenDialog } from "./MangelBehebenDialog.jsx";

export function AufgabenKarte({ aufgabe, onClick, kolonnen, onDelete, onToggleErledigt, onVorschlagen, onEntscheiden, istStunden = 0 }) {
  const [zeigeMangelDialog, setZeigeMangelDialog] = useState(false);
  const typ    = AUFGABEN_TYPEN[aufgabe.typ]    || AUFGABEN_TYPEN.allgemein;
  const status = AUFGABEN_STATUS[aufgabe.status] || AUFGABEN_STATUS.offen;
  const prio   = AUFGABEN_PRIO[aufgabe.prioritaet] || AUFGABEN_PRIO.mittel;
  const erledigt = aufgabe.status === "abgeschlossen";
  const wartetAufBestaetigung = aufgabe.status === "zur_pruefung";

  // Produktivität: Ist-Stunden aus zugeordneten Zeitbuchungen gegen die an
  // der Aufgabe hinterlegten Soll-Stunden. >15% drüber gilt als kritisch,
  // >0% als Vorwarnung — willkürliche, aber nachvollziehbare Schwellen.
  const sollStunden = aufgabe.soll_stunden;
  const abweichungProzent = sollStunden > 0 ? Math.round(((istStunden - sollStunden) / sollStunden) * 100) : null;
  const produktivitaet = abweichungProzent === null ? null
    : abweichungProzent > 15 ? { icon:"🔴", farbe:"var(--red)", label:`${abweichungProzent}% über Plan` }
    : abweichungProzent > 0  ? { icon:"🟠", farbe:"var(--yellow)", label:`${abweichungProzent}% über Plan` }
    : { icon:"🟢", farbe:"var(--green)", label:"im Plan" };
  const ueberfaellig = aufgabe.faellig_am &&
    new Date(aufgabe.faellig_am) < new Date() &&
    !erledigt && !wartetAufBestaetigung;

  // Facharbeiter dürfen eine offene Aufgabe nur zur Bestätigung vorschlagen
  // (kein direktes "erledigt"); wer voll bearbeiten darf, schaltet wie bisher direkt um.
  const istVorschlagenFlow = !onToggleErledigt && onVorschlagen && !erledigt && !wartetAufBestaetigung;
  // Bei einem Mangel erzwingt der Vorschlagen-Weg zusätzlich ein Nachweis-
  // Foto über den Dialog, statt wie bisher mit einem einzigen Tap komplett
  // ohne Beleg "erledigt" zu melden — der direkte Weg (onToggleErledigt,
  // für Rollen mit vollem Bearbeitungsrecht) bleibt bewusst unverändert,
  // da diese Rollen das Nachweisfoto alternativ im vollen Formular pflegen können.
  const checkboxKlick = onToggleErledigt
    ? () => onToggleErledigt(aufgabe)
    : istVorschlagenFlow
      ? (aufgabe.ist_mangel ? () => setZeigeMangelDialog(true) : () => onVorschlagen(aufgabe))
      : undefined;

  return (
    <>
    <SwipeToDelete style={{ marginBottom:6 }}
      onDelete={onDelete ? () => onDelete(aufgabe) : undefined}
      onClick={onClick}>
      <div style={{ background:"var(--surface)", padding:"10px 16px",
        cursor:"pointer", display:"flex", gap:12,
        border:"1px solid var(--border)",
        borderLeft:`4px solid ${ueberfaellig ? "var(--red)" : typ.farbe}`,
        opacity: erledigt ? 0.62 : 1 }}>
      {wartetAufBestaetigung && onEntscheiden ? (
        <div onClick={e => e.stopPropagation()}
          style={{ flex:"none", display:"flex", flexDirection:"column", gap:4 }}>
          <button onClick={() => onEntscheiden(aufgabe, true)} title="Bestätigen"
            style={{ width:26, height:26, border:"none", borderRadius:6, background:"var(--green)",
              color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              fontWeight:900, fontSize:13, fontFamily:"inherit" }}>✓</button>
          <button onClick={() => onEntscheiden(aufgabe, false)} title="Ablehnen, zurück auf Offen"
            style={{ width:26, height:26, border:"none", borderRadius:6, background:"var(--red)",
              color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              fontWeight:900, fontSize:13, fontFamily:"inherit" }}>✕</button>
        </div>
      ) : (
        <div onClick={checkboxKlick ? (e) => { e.stopPropagation(); checkboxKlick(); } : undefined}
          title={!onToggleErledigt && onVorschlagen && !erledigt && !wartetAufBestaetigung ? "Als erledigt vorschlagen" : undefined}
          style={{ flex:"none", margin:-8, padding:8,
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor: checkboxKlick ? "pointer" : "default" }}>
          <div style={{ width:22, height:22, marginTop:1,
            border:`2px solid ${erledigt ? "var(--green)" : wartetAufBestaetigung ? "var(--blue)" : "rgba(0,0,0,.18)"}`,
            background: erledigt ? "var(--green)" : wartetAufBestaetigung ? "var(--blue)" : "transparent",
            display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>
            {erledigt && <span style={{ fontSize:13, fontWeight:900 }}>✓</span>}
            {wartetAufBestaetigung && !onEntscheiden && <span style={{ fontSize:12, fontWeight:900 }}>?</span>}
          </div>
        </div>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:14.5, lineHeight:1.25,
            textDecoration: erledigt ? "line-through" : "none" }}>
            {aufgabe.titel || "Unbenannte Aufgabe"}
          </div>
          <div style={{ background:status.bg, color:status.farbe,
            padding:"2px 8px", fontSize:10, fontWeight:800, whiteSpace:"nowrap", flexShrink:0 }}>
            {status.label}
          </div>
        </div>
        {produktivitaet && (
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4,
            fontSize:11.5, fontWeight:700, color:produktivitaet.farbe }}>
            <span>{produktivitaet.icon} {istStunden.toFixed(1)}h / {sollStunden}h Soll — {produktivitaet.label}</span>
          </div>
        )}
        {aufgabe.beschreibung && !erledigt && (
          <div style={{ color:"var(--muted)", fontSize:12, lineHeight:1.4, marginTop:4,
            overflow:"hidden", display:"-webkit-box",
            WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
            {aufgabe.beschreibung}
          </div>
        )}
        {!erledigt && (
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center", marginTop:8,
            color:"var(--muted)", fontSize:11.5, fontWeight:600 }}>
            {aufgabe.faellig_am && (
              <span style={{ display:"flex", alignItems:"center", gap:4,
                color: ueberfaellig ? "var(--red)" : "var(--muted)", fontWeight: ueberfaellig ? 700 : 600 }}>
                {ueberfaellig ? <CalendarX size={13} /> : <Calendar size={13} />}
                {new Date(aufgabe.faellig_am).toLocaleDateString("de-DE")}
              </span>
            )}
            {aufgabe.zustaendig && (
              <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                <User size={13} />{aufgabe.zustaendig}
              </span>
            )}
            {aufgabe.m2 > 0 && (
              <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                <Ruler size={13} />{aufgabe.m2} m²
              </span>
            )}
            {aufgabe.fotos?.length > 0 && (
              <span style={{ display:"flex", alignItems:"center", gap:4, color:"var(--blue)" }}>
                <Camera size={13} />{aufgabe.fotos.length}
              </span>
            )}
            {aufgabe.ist_mangel && (
              <span style={{ background:"var(--rbg)", color:"var(--red)",
                padding:"2px 8px", fontWeight:800, display:"inline-flex", alignItems:"center", gap:4 }}>
                <TriangleAlert size={11} />MANGEL
              </span>
            )}
            {aufgabe.gemeldet_von_kunde && (
              <span title={aufgabe.gemeldet_kontakt ? `Kontakt: ${aufgabe.gemeldet_kontakt}` : undefined}
                style={{ background:"var(--bbg)", color:"var(--blue)",
                  padding:"2px 8px", fontWeight:800, display:"inline-flex", alignItems:"center", gap:4 }}>
                <User size={11} />VOM KUNDEN
              </span>
            )}
            {aufgabe.prioritaet === "kritisch" && (
              <span style={{ color:prio.farbe, fontWeight:800 }}>‼ Kritisch</span>
            )}
          </div>
        )}
      </div>
      </div>
    </SwipeToDelete>
    {zeigeMangelDialog && (
      <MangelBehebenDialog
        onAbbrechen={() => setZeigeMangelDialog(false)}
        onBestaetigen={fotos => { setZeigeMangelDialog(false); onVorschlagen(aufgabe, fotos); }}
      />
    )}
    </>
  );
}
