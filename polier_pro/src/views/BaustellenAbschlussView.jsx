import { useState, useEffect } from "react";
import { Archive, Sparkles, CircleCheckBig, TriangleAlert, FileText, RotateCcw, Calendar } from "lucide-react";
import { Spinner } from "../components/Spinner.jsx";
import { escapeHtml, sha256Hex } from "../lib/utils.js";
import { druckePDF } from "../lib/pdf.jsx";
import { kiBaustellenabschluss } from "../lib/ai.js";
import { sbAlleProjektKommentare, sbProjektAbschliessen, sbAbschlussDokumentHashSpeichern } from "../lib/supabase.js";

// Stellt aus den Tagesberichten eine chronologische Historie zusammen —
// bewusst NICHT von der KI erzeugt (die Rohdaten sind schon exakt da) und
// bewusst NICHT in abschluss_akte gespeichert, sondern bei jeder Anzeige
// live kompiliert.
function chronologieAus(tagesberichte) {
  return [...(tagesberichte || [])]
    .sort((a, b) => new Date(a.datum) - new Date(b.datum))
    .map(b => ({ datum: b.datum, taetigkeit: b.taetigkeit, besonderheiten: b.besonderheiten }));
}

// Offene Restpunkte — anders als die Chronologie IST das ein Schnappschuss:
// einmal beim Abschluss berechnet und in abschluss_akte gespeichert, damit
// die Akte auch dann noch zeigt was bei Abschluss offen war, wenn jemand
// danach noch Aufgaben bearbeitet.
function offeneRestpunkteAus(aufgaben) {
  return (aufgaben || [])
    .filter(a => a.status !== "abgeschlossen")
    .map(a => ({ titel: a.titel, status: a.status, ist_mangel: !!a.ist_mangel, zustaendig: a.zustaendig || "" }));
}

function erstelleAbschlussHtml({ projekt, eigeneFirma, akte, chronologie, hash }) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:11pt; color:#1a1a1a; }
.page { width:210mm; padding:14mm 18mm; }
.header { display:flex; justify-content:space-between; align-items:flex-start;
  border-bottom:3px solid #F5C400; padding-bottom:10px; margin-bottom:14px; }
.logo { font-size:22pt; font-weight:900; letter-spacing:-1px; flex-shrink:0; }
.logo span { color:#F5C400; }
.firma { font-size:9pt; color:#666; margin-top:3px; }
.doc-title { text-align:right; max-width:55%; min-width:0; }
.doc-title h1 { font-size:14pt; font-weight:bold; }
.doc-title .meta { font-size:9pt; color:#666; margin-top:3px; }
.hash-badge { background:#1a1a1a; color:#F5C400; padding:4px 10px;
  border-radius:4px; font-size:9pt; font-family:monospace; margin-top:4px; display:inline-block;
  max-width:100%; word-break:break-all; }
.section { margin-bottom:14px; }
.section-title { font-size:10pt; font-weight:bold; color:#F5C400;
  border-left:3px solid #F5C400; padding-left:8px; margin-bottom:8px;
  text-transform:uppercase; letter-spacing:0.5px; }
.text-block { background:#f8f8f8; border-radius:5px; padding:10px 12px;
  font-size:11pt; line-height:1.6; min-height:40px; }
.chron-row { padding:6px 0; border-bottom:1px solid #eee; font-size:10.5pt; }
.chron-datum { font-weight:bold; font-size:9.5pt; color:#666; }
.liste li { font-size:10.5pt; line-height:1.6; margin-left:16px; }
.restpunkt { background:#fff8e1; border-left:3px solid #F5C400;
  padding:6px 12px; margin-bottom:6px; border-radius:0 5px 5px 0; font-size:10.5pt; }
.footer { border-top:1px solid #ddd; margin-top:16px; padding-top:8px;
  font-size:7.5pt; color:#aaa; display:flex; justify-content:space-between; font-family:monospace; }
.footer span { word-break:break-all; min-width:0; }
.footer span:first-child { flex-shrink:2; margin-right:12px; }
</style></head><body><div class="page">

<div class="header">
  <div>
    <div class="logo"><span>★</span> POLARIS</div>
    <div class="firma">${escapeHtml(eigeneFirma?.name)}  ·  ${escapeHtml(eigeneFirma?.strasse)}, ${escapeHtml(eigeneFirma?.plz)} ${escapeHtml(eigeneFirma?.ort)}</div>
  </div>
  <div class="doc-title">
    <h1>Baustellenabschlussakte</h1>
    <div class="meta" style="font-weight:bold">${escapeHtml(projekt?.name)}</div>
    <div class="meta">${escapeHtml(projekt?.projektnummer)}</div>
    <div class="meta">Abgeschlossen am ${projekt?.abschluss_datum ? new Date(projekt.abschluss_datum).toLocaleDateString("de-DE") : "—"}</div>
    <div class="hash-badge">DOC-${hash}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Zusammenfassung</div>
  <div class="text-block">${escapeHtml(akte?.zusammenfassung) || "—"}</div>
</div>

${akte?.entscheidungen?.length ? `<div class="section">
  <div class="section-title">Wichtige Entscheidungen</div>
  <ul class="liste">${akte.entscheidungen.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
</div>` : ""}

${akte?.offene_restpunkte?.length ? `<div class="section">
  <div class="section-title">Offene Restpunkte bei Abschluss (${akte.offene_restpunkte.length})</div>
  ${akte.offene_restpunkte.map(p => `<div class="restpunkt">
    <strong>${escapeHtml(p.titel)}</strong>${p.ist_mangel ? " · Mangel" : ""}
    ${p.zustaendig ? ` · ${escapeHtml(p.zustaendig)}` : ""}
  </div>`).join("")}
</div>` : `<div class="section"><div class="section-title">Offene Restpunkte bei Abschluss</div><div class="text-block">Keine — alle Aufgaben waren bei Abschluss erledigt.</div></div>`}

<div class="section">
  <div class="section-title">Chronologische Historie (${chronologie.length} Tagesberichte)</div>
  ${chronologie.map(c => `<div class="chron-row">
    <span class="chron-datum">${new Date(c.datum).toLocaleDateString("de-DE")}</span> — ${escapeHtml(c.taetigkeit) || "—"}
    ${c.besonderheiten ? `<br><em>${escapeHtml(c.besonderheiten)}</em>` : ""}
  </div>`).join("") || "<div class=\"text-block\">Keine Tagesberichte erfasst</div>"}
</div>

<div class="footer">
  <span>Erstellt mit Polaris · ${new Date().toLocaleString("de-DE")} · Revisionssicher</span>
  <span>DOC-${hash}</span>
</div>

</div></body></html>`;
}

export function BaustellenAbschlussView({ projekt, aufgaben = [], tagesberichte = [], eigeneFirma, session, onAbgeschlossen }) {
  const istArchiviert = !!projekt?.archiviert;

  const [schritt,   setSchritt]   = useState("start"); // start | generiert | fertig
  const [laden,     setLaden]    = useState(false);
  const [fehler,    setFehler]   = useState("");
  const [entwurf,   setEntwurf]  = useState(null); // { zusammenfassung, entscheidungen }
  const [speichert, setSpeichert] = useState(false);
  const [hash,      setHash]     = useState("");

  const chronologie = chronologieAus(tagesberichte);

  // Für die bereits archivierte Akte: Hash war beim Abschluss schon
  // berechnet und in abschluss_dokument_id gespeichert — nie neu berechnen,
  // sonst würde jeder PDF-Re-Export eine andere DOC-ID zeigen.
  useEffect(() => {
    if (istArchiviert && projekt?.abschluss_dokument_id) {
      setHash(projekt.abschluss_dokument_id);
    }
  }, [istArchiviert, projekt?.abschluss_dokument_id]);

  async function generieren() {
    setLaden(true); setFehler("");
    try {
      const kommentare = await sbAlleProjektKommentare(projekt.id, session);
      const result = await kiBaustellenabschluss(projekt, tagesberichte, kommentare, session);
      if (!result) { setFehler("KI-Antwort konnte nicht ausgewertet werden."); return; }
      setEntwurf(result);
      setSchritt("generiert");
    } catch (e) {
      setFehler(e.message || "KI ist gerade nicht verfügbar. Bitte später erneut versuchen.");
    } finally {
      setLaden(false);
    }
  }

  async function abschliessen() {
    setSpeichert(true); setFehler("");
    const akte = {
      zusammenfassung: entwurf.zusammenfassung,
      entscheidungen: entwurf.entscheidungen,
      offene_restpunkte: offeneRestpunkteAus(aufgaben),
    };
    const inhalt = JSON.stringify({ projekt_id: projekt.id, akte, chronologieAnzahl: chronologie.length });
    const neuerHash = (await sha256Hex(inhalt)).slice(0, 16).toUpperCase();

    const { ok, fehler: f } = await sbProjektAbschliessen(projekt.id, { akte, dokumentId: neuerHash }, session);
    setSpeichert(false);
    if (!ok) { setFehler(f); return; }

    await sbAbschlussDokumentHashSpeichern({
      firmaId: projekt.firma_id, profilId: session?.user?.id, hash: neuerHash, projektId: projekt.id,
    }, session);

    setHash(neuerHash);
    setSchritt("fertig");
    onAbgeschlossen?.({ ...projekt, archiviert: true, abschluss_akte: akte, abschluss_dokument_id: neuerHash, abschluss_datum: new Date().toISOString() });
  }

  async function exportPDF(akte) {
    const html = erstelleAbschlussHtml({ projekt, eigeneFirma, akte, chronologie, hash });
    await druckePDF(html, `Baustellenabschluss_${projekt?.name || "export"}.pdf`);
  }

  // ── Bereits abgeschlossen: nur noch Lese-Ansicht + PDF-Export ──────────
  if (istArchiviert) {
    const akte = projekt.abschluss_akte || {};
    return (
      <div>
        <div style={{ background:"var(--surface)", borderRadius:16, padding:16,
          border:"1.5px solid var(--border)", marginBottom:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <Archive size={16} color="var(--muted)" />
            <div style={{ color:"var(--text)", fontWeight:800, fontSize:15 }}>Baustelle abgeschlossen</div>
          </div>
          <div style={{ color:"var(--muted)", fontSize:12.5, display:"flex", alignItems:"center", gap:5 }}>
            <Calendar size={12} />
            {projekt.abschluss_datum ? new Date(projekt.abschluss_datum).toLocaleDateString("de-DE") : "—"}
            {hash && <span style={{ fontFamily:"monospace", marginLeft:6 }}>· DOC-{hash}</span>}
          </div>
        </div>

        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, marginBottom:10 }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:6 }}>Zusammenfassung</div>
          <div style={{ color:"var(--text2)", fontSize:13, lineHeight:1.6 }}>{akte.zusammenfassung || "—"}</div>
        </div>

        {akte.entscheidungen?.length > 0 && (
          <div style={{ background:"var(--surface)", borderRadius:14, padding:14, marginBottom:10 }}>
            <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:6 }}>Wichtige Entscheidungen</div>
            {akte.entscheidungen.map((e, i) => (
              <div key={i} style={{ color:"var(--text2)", fontSize:12.5, marginBottom:5, paddingLeft:12,
                borderLeft:"2px solid var(--yellow)" }}>{e}</div>
            ))}
          </div>
        )}

        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, marginBottom:10 }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:6 }}>
            Offene Restpunkte bei Abschluss ({akte.offene_restpunkte?.length || 0})
          </div>
          {akte.offene_restpunkte?.length > 0 ? akte.offene_restpunkte.map((p, i) => (
            <div key={i} style={{ background:"var(--ybg)", borderRadius:8, padding:"6px 10px",
              marginBottom:5, fontSize:12.5, color:"var(--text)" }}>
              {p.titel}{p.ist_mangel ? " · Mangel" : ""}{p.zustaendig ? ` · ${p.zustaendig}` : ""}
            </div>
          )) : <div style={{ color:"var(--muted)", fontSize:12.5 }}>Keine — alle Aufgaben waren erledigt.</div>}
        </div>

        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, marginBottom:14 }}>
          <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:8 }}>
            Chronologische Historie ({chronologie.length} Tagesberichte)
          </div>
          {chronologie.map((c, i) => (
            <div key={i} style={{ borderBottom:"1px solid var(--border)", padding:"7px 0", fontSize:12.5 }}>
              <div style={{ color:"var(--muted)", fontWeight:700, fontSize:11 }}>{new Date(c.datum).toLocaleDateString("de-DE")}</div>
              <div style={{ color:"var(--text2)" }}>{c.taetigkeit}</div>
            </div>
          ))}
        </div>

        <button onClick={() => exportPDF(akte)}
          style={{ width:"100%", background:"var(--yellow)", color:"#1a1200", border:"none",
            borderRadius:12, padding:14, fontWeight:800, fontSize:14, cursor:"pointer",
            fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
          <FileText size={15} /> Abschlussakte als PDF exportieren
        </button>
      </div>
    );
  }

  // ── Noch aktiv: Abschluss-Flow ──────────────────────────────────────────
  return (
    <div>
      {fehler && (
        <div style={{ background:"var(--rbg)", color:"var(--red)", borderRadius:10,
          padding:"9px 14px", marginBottom:12, fontSize:12.5,
          border:"1px solid var(--red)", display:"flex", alignItems:"center", gap:6 }}>
          <TriangleAlert size={13} /> {fehler}
        </div>
      )}

      {schritt === "start" && (
        <div style={{ background:"var(--surface)", borderRadius:16, padding:16,
          border:"1.5px solid var(--border)" }}>
          <div style={{ color:"var(--text)", fontWeight:800, fontSize:15, marginBottom:6 }}>
            Baustelle abschließen
          </div>
          <div style={{ color:"var(--text2)", fontSize:13, lineHeight:1.6, marginBottom:14 }}>
            Die KI erstellt aus allen Tagesberichten und Aufgaben-Kommentaren eine
            digitale Abschlussakte: Zusammenfassung, wichtige Entscheidungen, offene
            Restpunkte und die chronologische Historie. Die Baustelle wird danach
            archiviert.
          </div>
          <button onClick={generieren} disabled={laden}
            style={{ width:"100%", background: laden ? "var(--surface2)" : "var(--yellow)",
              color: laden ? "var(--muted)" : "#1a1200", border:"none",
              borderRadius:12, padding:14, fontWeight:800, fontSize:14,
              cursor: laden ? "default" : "pointer", fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            {laden ? <><Spinner size={14} /> KI erstellt Abschlussakte…</> : <><Sparkles size={15} /> Abschlussakte erstellen</>}
          </button>
        </div>
      )}

      {schritt === "generiert" && entwurf && (
        <div>
          <div style={{ background:"var(--surface)", borderRadius:14, padding:14, marginBottom:10 }}>
            <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:6 }}>Zusammenfassung</div>
            <div style={{ color:"var(--text2)", fontSize:13, lineHeight:1.6 }}>{entwurf.zusammenfassung}</div>
          </div>

          {entwurf.entscheidungen?.length > 0 && (
            <div style={{ background:"var(--surface)", borderRadius:14, padding:14, marginBottom:10 }}>
              <div style={{ color:"var(--text)", fontWeight:700, fontSize:13, marginBottom:6 }}>Wichtige Entscheidungen</div>
              {entwurf.entscheidungen.map((e, i) => (
                <div key={i} style={{ color:"var(--text2)", fontSize:12.5, marginBottom:5, paddingLeft:12,
                  borderLeft:"2px solid var(--yellow)" }}>{e}</div>
              ))}
            </div>
          )}

          <div style={{ background:"var(--ybg)", borderRadius:14, padding:14, marginBottom:14,
            border:"1px solid var(--yellow)" }}>
            <div style={{ color:"var(--ydark)", fontWeight:700, fontSize:13, marginBottom:4 }}>
              {offeneRestpunkteAus(aufgaben).length} offene Restpunkte bei Abschluss
            </div>
            <div style={{ color:"var(--text2)", fontSize:12, lineHeight:1.5 }}>
              Diese werden als Schnappschuss mit in der Akte gespeichert.
            </div>
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => { setEntwurf(null); setSchritt("start"); }} disabled={speichert}
              style={{ flex:1, background:"var(--surface2)", color:"var(--muted)",
                border:"1.5px solid var(--border)", borderRadius:12, padding:13,
                cursor:"pointer", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <RotateCcw size={14} /> Neu generieren
            </button>
            <button onClick={abschliessen} disabled={speichert}
              style={{ flex:2, background:"var(--red)", color:"#fff", border:"none",
                borderRadius:12, padding:13, fontWeight:800, cursor:"pointer", fontSize:14,
                fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              {speichert ? <Spinner size={14} /> : <><Archive size={15} /> Baustelle endgültig abschließen</>}
            </button>
          </div>
        </div>
      )}

      {schritt === "fertig" && entwurf && (
        <div style={{ textAlign:"center", padding:"20px 0" }}>
          <CircleCheckBig size={40} color="var(--green)" style={{ marginBottom:10 }} />
          <div style={{ color:"var(--text)", fontWeight:800, fontSize:15, marginBottom:4 }}>
            Baustelle abgeschlossen
          </div>
          <div style={{ color:"var(--muted)", fontSize:12.5, marginBottom:16, fontFamily:"monospace" }}>
            DOC-{hash}
          </div>
          <button onClick={() => exportPDF({ ...entwurf, offene_restpunkte: offeneRestpunkteAus(aufgaben) })}
            style={{ background:"var(--yellow)", color:"#1a1200", border:"none",
              borderRadius:12, padding:"13px 22px", fontWeight:800, fontSize:14, cursor:"pointer",
              fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:7 }}>
            <FileText size={15} /> Abschlussakte als PDF exportieren
          </button>
        </div>
      )}
    </div>
  );
}
