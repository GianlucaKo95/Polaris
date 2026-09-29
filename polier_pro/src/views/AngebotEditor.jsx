import { useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, X, CircleCheckBig, ChevronLeft, ChartColumn, FileText, Settings, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { AUFGABEN_TYPEN } from "../config/konstanten.js";
import { inputStyle, Label } from "../components/Label.jsx";
import { escapeHtml } from "../lib/utils.js";
import { druckePDF } from "../lib/pdf.jsx";
import { DiktierFeld } from "../components/DiktierFeld.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { kiAngebotErstellen } from "../lib/ai.js";
import { erzeugeAngebotDocx } from "../lib/angebotVorlage.js";

export function AngebotEditor({ angebot, onSave, onClose, aufgaben, einheitspreise, lvVorlagen, angebotVorlage, projekt, eigeneFirma, session }) {
  const [a,         setA]         = useState(angebot);
  const [ansicht,   setAnsicht]   = useState("positionen"); // positionen | einstellungen
  const [vonVorlage,setVonVorlage]= useState(false);
  const [vonAufgabe,setVonAufgabe]= useState(false);
  const [vonKI,     setVonKI]     = useState(false);
  const [kiDiktat,  setKiDiktat]  = useState("");
  const [kiLaedt,   setKiLaedt]   = useState(false);
  const [kiFehler,  setKiFehler]  = useState("");
  const [speichertLaedt, setSpeichertLaedt] = useState(false);
  const [wordLaedt, setWordLaedt] = useState(false);

  // Positions-Rabatt (pro Zeile) wirkt VOR dem Gesamt-Rabatt im
  // Einstellungen-Tab — beide sind unabhängig kombinierbar, ohne dass
  // eine Zeile den Überblick verliert: gpOf() ist die einzige Stelle, die
  // beide Zahlenwerte (Position + PDF/CSV/Summen-Banner) berechnet.
  const gpOf = p => (p.menge||0) * (p.ep||0) * (1 - (p.rabatt||0)/100);
  const netto   = a.positionen.reduce((s,p)=>s+gpOf(p),0);
  const rabattBetrag = netto * (a.rabatt||0)/100;
  const nettoNachRabatt = netto - rabattBetrag;
  const mwstBetrag = nettoNachRabatt * (a.mwst||19)/100;
  const bruttoGesamt = nettoNachRabatt + mwstBetrag;

  function addPosition(pos) {
    setA(x => ({ ...x, positionen:[...x.positionen, { rabatt:0, ...pos, id:Date.now() }] }));
  }

  function updatePos(id, key, val) {
    setA(x => ({ ...x, positionen:x.positionen.map(p =>
      p.id===id ? { ...p, [key]:key==="menge"||key==="ep"||key==="rabatt" ? Number(val) : val } : p) }));
  }

  function removePos(id) {
    setA(x => ({ ...x, positionen:x.positionen.filter(p=>p.id!==id) }));
  }

  function vorlageLaden(vorlage) {
    const neuPos = vorlage.positionen.map(p => {
      const ep = einheitspreise.find(e=>e.id===p.ep_id);
      return { id:Date.now()+Math.random(), bez:p.bez,
        einheit:p.einheit, menge:0, ep:ep?.preis||0 };
    });
    setA(x => ({ ...x, positionen:[...x.positionen, ...neuPos] }));
    setVonVorlage(false);
  }

  function aufgabeImportieren(aufgabe) {
    const typ   = aufgabe.typ;
    const ep    = einheitspreise.find(e =>
      e.gewerk.toLowerCase().includes(typ) || typ.includes(e.gewerk.toLowerCase())
    );
    addPosition({
      bez:      aufgabe.titel,
      einheit:  aufgabe.m2 ? "m²" : "h",
      menge:    aufgabe.m2 || 0,
      ep:       ep?.preis || 0,
    });
    setVonAufgabe(false);
  }

  async function kiPositionenUebernehmen() {
    if (!kiDiktat.trim() || kiLaedt) return;
    setKiLaedt(true);
    setKiFehler("");
    try {
      const ergebnis = await kiAngebotErstellen(kiDiktat, einheitspreise, projekt, session);
      if (!ergebnis || ergebnis.positionen.length === 0) {
        setKiFehler("Konnte aus dem Diktat keine Positionen erkennen.");
        return;
      }
      const neuPos = ergebnis.positionen.map(p => {
        const ep = einheitspreise.find(e => e.id === p.ep_id);
        return { id:Date.now()+Math.random(), bez:p.bez, einheit:p.einheit,
          menge:p.menge, ep:ep?.preis || 0, rabatt:p.rabatt || 0 };
      });
      setA(x => ({
        ...x,
        positionen: [...x.positionen, ...neuPos],
        titel: x.titel.startsWith("Angebot ") && ergebnis.titel ? ergebnis.titel : x.titel,
        empfaenger: x.empfaenger || ergebnis.empfaenger,
      }));
      setKiDiktat("");
      setVonKI(false);
    } catch (e) {
      setKiFehler(e.message || "KI-Anfrage fehlgeschlagen.");
    } finally {
      setKiLaedt(false);
    }
  }

  async function speichernKlick() {
    setSpeichertLaedt(true);
    try {
      await onSave(a);
    } finally {
      setSpeichertLaedt(false);
    }
  }

  function exportPDF() {
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:10.5pt; color:#1a1a1a; }
.page { width:210mm; padding:14mm 18mm; }
.header { display:flex; justify-content:space-between; align-items:flex-start;
  border-bottom:3px solid #F5C400; padding-bottom:12px; margin-bottom:16px; }
.logo-img { width:56px; height:56px; object-fit:contain; flex-shrink:0; }
.logo-mark { width:56px; height:56px; background:#F5C400; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:24px;
  color:#1a1a1a; flex-shrink:0; }
.firma-name { font-size:16pt; font-weight:900; letter-spacing:-0.5px; }
.firma-info { font-size:9pt; color:#666; margin-top:3px; line-height:1.5; }
.angebot-title { text-align:right; }
.angebot-title h1 { font-size:16pt; font-weight:900; }
.angebot-title .meta { font-size:9pt; color:#666; margin-top:3px; }
.empfaenger { background:#f8f8f8; border-radius:6px; padding:12px 14px; margin-bottom:16px; }
.empfaenger-label { font-size:8pt; color:#888; margin-bottom:4px; }
.table { width:100%; border-collapse:collapse; margin-bottom:16px; }
.table th { background:#1a1a1a; color:#F5C400; padding:8px 10px;
  text-align:left; font-size:9pt; }
.table th:last-child, .table td:last-child { text-align:right; }
.table td { padding:8px 10px; border-bottom:1px solid #eee; font-size:10pt; }
.table tr:nth-child(even) td { background:#f8f8f8; }
.summen { margin-left:auto; width:260px; }
.summen-row { display:flex; justify-content:space-between;
  padding:5px 0; font-size:10pt; }
.summen-row.gesamt { border-top:2px solid #1a1a1a; margin-top:4px;
  padding-top:8px; font-weight:900; font-size:12pt; }
.summen-row.gesamt span:last-child { color:#F5C400; }
.footer-text { background:#f8f8f8; border-radius:6px; padding:10px 14px;
  font-size:9pt; color:#666; margin-top:16px; line-height:1.6; }
.footer { border-top:1px solid #ddd; margin-top:14px; padding-top:6px;
  font-size:7pt; color:#aaa; display:flex; justify-content:space-between; }
</style></head><body><div class="page">

<div class="header">
  <div style="display:flex;gap:14px;align-items:center;">
    ${eigeneFirma?.logo
      ? `<img class="logo-img" src="${eigeneFirma.logo}" alt="Logo"/>`
      : `<div class="logo-mark">★</div>`}
    <div>
      <div class="firma-name">${escapeHtml(eigeneFirma?.name)||"Polaris"}</div>
      <div class="firma-info">
        ${escapeHtml(eigeneFirma?.strasse)} · ${escapeHtml(eigeneFirma?.plz)} ${escapeHtml(eigeneFirma?.ort)}<br>
        Tel: ${escapeHtml(eigeneFirma?.telefon)} · ${escapeHtml(eigeneFirma?.email)}<br>
        ${eigeneFirma?.steuernummer ? "St-Nr: "+escapeHtml(eigeneFirma.steuernummer) : ""}
      </div>
    </div>
  </div>
  <div class="angebot-title">
    <h1>Angebot</h1>
    <div class="meta">Datum: ${new Date(a.datum).toLocaleDateString("de-DE")}</div>
    <div class="meta">Gültig bis: ${new Date(a.gueltig_bis).toLocaleDateString("de-DE")}</div>
    <div class="meta" style="font-weight:bold">Projekt: ${escapeHtml(projekt?.name)}</div>
    <div class="meta">${escapeHtml(projekt?.projektnummer)}</div>
  </div>
</div>

<div class="empfaenger">
  <div class="empfaenger-label">ANGEBOT FÜR</div>
  <strong>${escapeHtml(a.empfaenger)||"—"}</strong>
</div>

<table class="table">
  <thead>
    <tr>
      <th style="width:5%">Pos.</th>
      <th style="width:38%">Bezeichnung</th>
      <th style="width:9%">Menge</th>
      <th style="width:9%">Einheit</th>
      <th style="width:13%">EP (€)</th>
      <th style="width:11%">Rabatt</th>
      <th style="width:15%">GP (€)</th>
    </tr>
  </thead>
  <tbody>
    ${a.positionen.map((p,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${escapeHtml(p.bez)}</td>
      <td>${(p.menge||0).toLocaleString("de-DE")}</td>
      <td>${escapeHtml(p.einheit)}</td>
      <td>${(p.ep||0).toLocaleString("de-DE",{minimumFractionDigits:2})}</td>
      <td>${p.rabatt > 0 ? p.rabatt+"%" : "–"}</td>
      <td><strong>${gpOf(p).toLocaleString("de-DE",{minimumFractionDigits:2})}</strong></td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="summen">
  <div class="summen-row"><span>Nettobetrag</span><span>${netto.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span></div>
  ${a.rabatt > 0 ? `<div class="summen-row"><span>Rabatt ${a.rabatt}%</span><span>- ${rabattBetrag.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span></div>` : ""}
  <div class="summen-row"><span>Netto nach Rabatt</span><span>${nettoNachRabatt.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span></div>
  <div class="summen-row"><span>MwSt. ${a.mwst}%</span><span>${mwstBetrag.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span></div>
  <div class="summen-row gesamt"><span>Gesamtbetrag</span><span>${bruttoGesamt.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span></div>
</div>

<div class="footer-text">
  Dieses Angebot ist gültig bis ${new Date(a.gueltig_bis).toLocaleDateString("de-DE")}.
  Alle Preise verstehen sich zzgl. ${a.mwst}% MwSt.
  Zahlungsbedingungen: 14 Tage netto.
</div>

<div class="footer">
  <span>Erstellt mit Polaris · ${new Date().toLocaleString("de-DE")}</span>
  <span>${escapeHtml(eigeneFirma?.name)}</span>
</div>

</div></body></html>`;

    druckePDF(html, `Angebot_${a.titel || a.id}.pdf`);
  }

  function exportCSV() {
    const rows = [
      ["Pos.","Bezeichnung","Menge","Einheit","EP (€)","Rabatt (%)","GP (€)"],
      ...a.positionen.map((p,i) => [
        i+1, p.bez, p.menge||0, p.einheit,
        (p.ep||0).toFixed(2), p.rabatt||0, gpOf(p).toFixed(2)
      ]),
      ["","","","","","Netto:", netto.toFixed(2)],
      ["","","","","","MwSt "+a.mwst+"%:", mwstBetrag.toFixed(2)],
      ["","","","","","GESAMT:", bruttoGesamt.toFixed(2)],
    ];
    const csv = rows.map(r => r.map(v => '"'+v+'"').join(";")).join("\n");
    const blob = new Blob(["﻿"+csv], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = ("Angebot_"+a.titel.replace(/ /g,"_")+".csv");
    link.click(); URL.revokeObjectURL(url);
  }

  async function exportWord() {
    if (wordLaedt) return;
    setWordLaedt(true);
    try {
      const blob = await erzeugeAngebotDocx({ angebot: a, projekt, eigeneFirma, angebotVorlage });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = ("Angebot_"+a.titel.replace(/ /g,"_")+".docx");
      link.click(); URL.revokeObjectURL(url);
    } finally {
      setWordLaedt(false);
    }
  }

  // ── KI-Angebotserstellung als eigener Screen ──
  if (vonKI) {
    return createPortal(
      <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
        background:"var(--bg)", zIndex:700, overflowY:"auto",
        WebkitOverflowScrolling:"touch" }}>
        <div style={{ background:"var(--surface)", padding:"10px 18px",
          paddingTop:"calc(14px + env(safe-area-inset-top))",
          borderBottom:"3px solid var(--yellow)", position:"sticky", top:0,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:16,
            display:"flex", alignItems:"center", gap:8 }}>
            <Sparkles size={15} /> Per KI erstellen
          </div>
          <button onClick={() => { setVonKI(false); setKiFehler(""); }}
            style={{ background:"var(--surface2)", border:"1px solid var(--border)",
              color:"var(--text)", borderRadius:8, padding:"6px 14px",
              cursor:"pointer", fontFamily:"inherit", display:"flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding:"14px 16px" }}>
          <div style={{ color:"var(--muted)", fontSize:12, marginBottom:10, lineHeight:1.5 }}>
            Beschreibe die Leistung — die KI wählt passende Positionen aus euren
            hinterlegten Einheitspreisen und schätzt die Mengen. Preise kommen
            immer aus dem Katalog, nie von der KI selbst. Rabatt auf eine
            einzelne Position kannst du mitdiktieren, z.B. "10% Rabatt auf die
            Bodenplatte" — Rabatt lässt sich pro Position auch jederzeit von
            Hand eintragen oder ändern.
          </div>
          <DiktierFeld label="Leistungsbeschreibung" value={kiDiktat} onChange={setKiDiktat} rows={4} />
          {kiFehler && (
            <div style={{ color:"var(--red)", fontSize:12, marginTop:8,
              display:"flex", alignItems:"center", gap:5 }}>
              <TriangleAlert size={13} /> {kiFehler}
            </div>
          )}
          <button onClick={kiPositionenUebernehmen} disabled={!kiDiktat.trim() || kiLaedt}
            style={{ width:"100%", marginTop:12,
              background: kiDiktat.trim() && !kiLaedt ? "var(--yellow)" : "var(--surface2)",
              color: kiDiktat.trim() && !kiLaedt ? "#1a1200" : "var(--muted)",
              border:"none", borderRadius:10, padding:14, fontWeight:800,
              cursor: kiDiktat.trim() && !kiLaedt ? "pointer" : "default", fontSize:14,
              fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            {kiLaedt ? <><Spinner size={14} /> Erstelle Positionen…</> : "Positionen übernehmen"}
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // ── LV-Vorlage Auswahl als eigener Screen ──
  // Als Portal gerendert — verschachtelt im normalen Baum bricht die
  // iOS-Standalone-PWA sonst denselben nested-position:fixed-Bug wie
  // beim Aufgabenformular.
  if (vonVorlage) {
    return createPortal(
      <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
        background:"var(--bg)", zIndex:700, overflowY:"auto",
        WebkitOverflowScrolling:"touch" }}>
        <div style={{ background:"var(--surface)", padding:"10px 18px",
          paddingTop:"calc(14px + env(safe-area-inset-top))",
          borderBottom:"3px solid var(--yellow)", position:"sticky", top:0,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ color:"var(--yellow)", fontWeight:700, fontSize:16,
            display:"flex", alignItems:"center", gap:8 }}>
            <ClipboardList size={15} /> LV-Vorlage laden
          </div>
          <button onClick={() => setVonVorlage(false)}
            style={{ background:"var(--surface2)", border:"1px solid var(--border)",
              color:"var(--text)", borderRadius:8, padding:"6px 14px",
              cursor:"pointer", fontFamily:"inherit", display:"flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding:"14px 16px" }}>
          {lvVorlagen.length === 0 && (
            <div style={{ color:"var(--muted)", textAlign:"center", padding:17 }}>
              Keine Vorlagen vorhanden · Administrator anlegen lassen
            </div>
          )}
          {lvVorlagen.map(v => (
            <div key={v.id} onClick={() => vorlageLaden(v)}
              style={{ background:"var(--surface)", borderRadius:12,
                padding:"9px 14px", marginBottom:6, cursor:"pointer",
                border:"1.5px solid var(--border)" }}>
              <div style={{ color:"var(--text)", fontWeight:700 }}>{v.name}</div>
              <div style={{ color:"var(--muted)", fontSize:12, marginTop:3 }}>
                {v.positionen.length} Positionen · {v.gewerk}
              </div>
            </div>
          ))}
        </div>
      </div>,
      document.body
    );
  }

  // ── Aufgaben-Import als eigener Screen ──
  if (vonAufgabe) {
    return createPortal(
      <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0,
        background:"var(--bg)", zIndex:700, overflowY:"auto",
        WebkitOverflowScrolling:"touch" }}>
        <div style={{ background:"var(--surface)", padding:"10px 18px",
          paddingTop:"calc(14px + env(safe-area-inset-top))",
          borderBottom:"3px solid var(--green)", position:"sticky", top:0,
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ color:"var(--green)", fontWeight:700, fontSize:16,
            display:"flex", alignItems:"center", gap:8 }}>
            <CircleCheckBig size={15} /> Aus Aufgaben importieren
          </div>
          <button onClick={() => setVonAufgabe(false)}
            style={{ background:"var(--surface2)", border:"1px solid var(--border)",
              color:"var(--text)", borderRadius:8, padding:"6px 14px",
              cursor:"pointer", fontFamily:"inherit", display:"flex" }}><X size={15} /></button>
        </div>
        <div style={{ padding:"14px 16px" }}>
          {aufgaben.length === 0 && (
            <div style={{ color:"var(--muted)", textAlign:"center", padding:17 }}>
              Keine Aufgaben vorhanden
            </div>
          )}
          {aufgaben.map(aufg => (
            <div key={aufg.id} onClick={() => aufgabeImportieren(aufg)}
              style={{ background:"var(--surface)", borderRadius:12,
                padding:"9px 14px", marginBottom:6, cursor:"pointer",
                border:"1.5px solid var(--border)",
                borderLeftWidth:4,
                borderLeftColor:AUFGABEN_TYPEN[aufg.typ]?.farbe||"var(--muted)" }}>
              <div style={{ color:"var(--text)", fontWeight:700 }}>
                {AUFGABEN_TYPEN[aufg.typ]?.icon} {aufg.titel}
              </div>
              <div style={{ color:"var(--muted)", fontSize:12, marginTop:3 }}>
                {aufg.m2 ? aufg.m2+" m²" : ""} · {AUFGABEN_TYPEN[aufg.typ]?.label}
              </div>
            </div>
          ))}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ background:"var(--surface)", padding:"10px 16px",
        paddingTop:"calc(14px + env(safe-area-inset-top))",
        borderBottom:"1px solid var(--border)", position:"sticky", top:0,
        zIndex:10, display:"flex", justifyContent:"space-between",
        alignItems:"center" }}>
        <button onClick={onClose}
          style={{ background:"var(--surface2)", border:"1.5px solid var(--border)",
            color:"var(--text)", borderRadius:10, padding:"7px 14px",
            cursor:"pointer", fontFamily:"inherit", display:"flex" }}><ChevronLeft size={16} /></button>
        <div style={{ color:"var(--text)", fontWeight:700, fontSize:14,
          flex:1, textAlign:"center", margin:"0 10px" }}>{a.titel}</div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={exportCSV}
            style={{ background:"var(--surface2)", color:"var(--text)",
              border:"1.5px solid var(--border)", borderRadius:8,
              padding:"6px 10px", cursor:"pointer", fontSize:12,
              fontFamily:"inherit", display:"flex", alignItems:"center", gap:5 }}><ChartColumn size={12} /> CSV</button>
          <button onClick={exportWord} disabled={wordLaedt}
            style={{ background:"var(--surface2)", color:"var(--text)",
              border:"1.5px solid var(--border)", borderRadius:8,
              padding:"6px 10px", cursor: wordLaedt ? "default" : "pointer", fontSize:12,
              fontFamily:"inherit", display:"flex", alignItems:"center", gap:5 }}>
            {wordLaedt ? <Spinner size={12} /> : <FileText size={12} />} Word
          </button>
          <button onClick={exportPDF}
            style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
              borderRadius:8, padding:"6px 12px", fontWeight:700,
              cursor:"pointer", fontSize:12, fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:5 }}><FileText size={12} /> PDF</button>
        </div>
      </div>

      <div style={{ padding:"16px 14px 100px" }}>
        {/* Summen-Banner */}
        <div style={{ background:"#1a1a1a", borderRadius:14, padding:"10px 18px",
          marginBottom:12, display:"flex", justifyContent:"space-between",
          alignItems:"center" }}>
          <div>
            <div style={{ color:"#888", fontSize:11 }}>Angebotssumme (brutto)</div>
            <div style={{ color:"#F5C400", fontWeight:900, fontSize:26, marginTop:2 }}>
              {bruttoGesamt.toLocaleString("de-DE",{minimumFractionDigits:2})} €
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ color:"#888", fontSize:11 }}>Netto</div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>
              {netto.toLocaleString("de-DE",{minimumFractionDigits:2})} €
            </div>
            <div style={{ color:"#888", fontSize:11, marginTop:2 }}>
              MwSt. {mwstBetrag.toLocaleString("de-DE",{minimumFractionDigits:2})} €
            </div>
          </div>
        </div>

        {/* Tab-Toggle */}
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          {[["positionen",ClipboardList,"Positionen"],["einstellungen",Settings,"Einstellungen"]].map(([k,Icon,l]) => (
            <button key={k} onClick={() => setAnsicht(k)}
              style={{ flex:1, background: ansicht===k ? "var(--yellow)" : "var(--surface2)",
                color: ansicht===k ? "#1a1200" : "var(--muted)",
                border:`1.5px solid ${ansicht===k ? "var(--yellow)" : "var(--border)"}`,
                borderRadius:10, padding:9, fontWeight: ansicht===k ? 700 : 400,
                cursor:"pointer", fontSize:12, fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><Icon size={13} /> {l}</button>
          ))}
        </div>

        {/* POSITIONEN */}
        {ansicht === "positionen" && (
          <div>
            {/* Import-Buttons */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:9 }}>
              <button onClick={() => setVonKI(true)}
                style={{ background:"var(--ybg)", color:"var(--ydark)",
                  border:"1.5px solid var(--yellow)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontWeight:700,
                  fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}><Sparkles size={12} /> Per KI</button>
              <button onClick={() => setVonVorlage(true)}
                style={{ background:"var(--bbg)", color:"var(--blue)",
                  border:"1.5px solid var(--blue)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontWeight:700,
                  fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}><ClipboardList size={12} /> Aus Vorlage</button>
              <button onClick={() => setVonAufgabe(true)}
                style={{ background:"var(--gbg)", color:"var(--green)",
                  border:"1.5px solid var(--green)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontWeight:700,
                  fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}><CircleCheckBig size={12} /> Aus Aufgaben</button>
              <button onClick={() => addPosition({ bez:"", einheit:"m²", menge:0, ep:0 })}
                style={{ background:"var(--surface2)", color:"var(--text)",
                  border:"1.5px solid var(--border)", borderRadius:10, padding:"9px 0",
                  cursor:"pointer", fontSize:12, fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}><Plus size={12} /> Manuell</button>
            </div>

            {/* Positionen */}
            {a.positionen.length === 0 && (
              <div style={{ textAlign:"center", padding:"23px 20px", color:"var(--muted)",
                fontSize:13 }}>
                Noch keine Positionen · Aus Vorlage oder Aufgaben importieren
              </div>
            )}
            {a.positionen.map((pos, i) => (
              <div key={pos.id} style={{ background:"var(--surface)", borderRadius:12,
                padding:"9px 14px", marginBottom:6,
                border:"1.5px solid var(--border)" }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", marginBottom:6 }}>
                  <div style={{ color:"var(--muted)", fontSize:11,
                    fontWeight:700 }}>Pos. {i+1}</div>
                  <button onClick={() => removePos(pos.id)}
                    style={{ background:"var(--rbg)", color:"var(--red)",
                      border:"none", borderRadius:6, padding:"2px 8px",
                      cursor:"pointer", fontSize:11, fontFamily:"inherit", display:"flex" }}><X size={12} /></button>
                </div>
                <input value={pos.bez}
                  onChange={e=>updatePos(pos.id,"bez",e.target.value)}
                  placeholder="Bezeichnung"
                  style={{ ...inputStyle(), marginBottom:8, fontSize:13 }} />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                  <div>
                    <div style={{ color:"var(--muted)", fontSize:10,
                      marginBottom:3 }}>Menge</div>
                    <input type="number" value={pos.menge||""}
                      onChange={e=>updatePos(pos.id,"menge",e.target.value)}
                      style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
                  </div>
                  <div>
                    <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Einheit</div>
                    <select value={pos.einheit}
                      onChange={e=>updatePos(pos.id,"einheit",e.target.value)}
                      style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }}>
                      {["m²","m³","m","t","h","Stk","pau"].map(u=><option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>
                      EP (€/{pos.einheit})
                    </div>
                    <input type="number" value={pos.ep||""}
                      onChange={e=>updatePos(pos.id,"ep",e.target.value)}
                      style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
                  </div>
                </div>
                <div style={{ marginTop:6, width:"33%", minWidth:90 }}>
                  <div style={{ color:"var(--muted)", fontSize:10, marginBottom:3 }}>Rabatt (%)</div>
                  <input type="number" value={pos.rabatt||""}
                    onChange={e=>updatePos(pos.id,"rabatt",e.target.value)}
                    placeholder="0" min="0" max="100"
                    style={{ ...inputStyle(), padding:"8px 10px", fontSize:12 }} />
                </div>
                <div style={{ textAlign:"right", marginTop:6,
                  color:"var(--yellow)", fontWeight:800, fontSize:14 }}>
                  {pos.rabatt > 0 && (
                    <span style={{ color:"var(--muted)", fontWeight:600, fontSize:12, marginRight:7,
                      textDecoration:"line-through" }}>
                      {((pos.menge||0)*(pos.ep||0)).toLocaleString("de-DE",{minimumFractionDigits:2})} €
                    </span>
                  )}
                  {gpOf(pos).toLocaleString("de-DE", {minimumFractionDigits:2})} €
                </div>
              </div>
            ))}
          </div>
        )}

        {/* EINSTELLUNGEN */}
        {ansicht === "einstellungen" && (
          <div>
            {[
              ["Titel","titel","Angebot Bodenplatte"],
              ["Empfänger","empfaenger","Auftraggeber GmbH"],
            ].map(([l,k,ph]) => (
              <div key={k} style={{ marginBottom:9 }}>
                <Label>{l}</Label>
                <input value={a[k]||""} onChange={e=>setA(x=>({...x,[k]:e.target.value}))}
                  placeholder={ph} style={inputStyle()} />
              </div>
            ))}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:9 }}>
              <div>
                <Label>Angebotsdatum</Label>
                <input type="date" value={a.datum}
                  onChange={e=>setA(x=>({...x,datum:e.target.value}))}
                  style={inputStyle()} />
              </div>
              <div>
                <Label>Gültig bis</Label>
                <input type="date" value={a.gueltig_bis}
                  onChange={e=>setA(x=>({...x,gueltig_bis:e.target.value}))}
                  style={inputStyle()} />
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:9 }}>
              <div>
                <Label>Rabatt (%)</Label>
                <input type="number" value={a.rabatt||0}
                  onChange={e=>setA(x=>({...x,rabatt:Number(e.target.value)}))}
                  style={inputStyle()} min="0" max="100" />
              </div>
              <div>
                <Label>MwSt (%)</Label>
                <select value={a.mwst||19}
                  onChange={e=>setA(x=>({...x,mwst:Number(e.target.value)}))}
                  style={{ ...inputStyle(), padding:"11px 12px" }}>
                  <option value={19}>19% (Standard)</option>
                  <option value={7}>7% (ermäßigt)</option>
                  <option value={0}>0% (steuerbefreit)</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom:9 }}>
              <Label>Status</Label>
              <select value={a.status}
                onChange={e=>setA(x=>({...x,status:e.target.value}))}
                style={{ ...inputStyle(), padding:"11px 12px" }}>
                {[["entwurf","📝 Entwurf"],["versendet","📤 Versendet"],
                  ["angenommen","✅ Angenommen"],["abgelehnt","❌ Abgelehnt"]
                ].map(([k,l])=><option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <button onClick={speichernKlick} disabled={speichertLaedt}
              style={{ width:"100%", background:"var(--yellow)", color:"#1a1200",
                border:"none", borderRadius:12, padding:14, fontWeight:800,
                cursor: speichertLaedt ? "default" : "pointer", fontSize:14, fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              {speichertLaedt ? <><Spinner size={14} /> Speichert…</> : "Angebot speichern"}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
