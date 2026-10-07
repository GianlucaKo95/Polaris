import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { PenLine, X, Check, FileText, CircleCheckBig } from "lucide-react";
import { UnterschriftPad } from "../components/UnterschriftPad.jsx";
import { escapeHtml, sha256Hex } from "../lib/utils.js";
import { druckePDF } from "../lib/pdf.jsx";
import { sbDokumentHashSpeichern } from "../lib/supabase.js";
import { useBackButton } from "../hooks/useBackButton.js";

export function RevisionssichererExport({ bericht, projekt, eigeneFirma, wetter,
  aufgaben, maengel, datum, session }) {

  const [offen,        setOffen]        = useState(false);
  useBackButton(offen, () => setOffen(false));
  const [sigPolier,    setSigPolier]    = useState(null);
  const [sigBauleiter, setSigBauleiter] = useState(null);
  const [exportiert,   setExportiert]   = useState(false);
  const [hash,         setHash]         = useState("");
  const [hashGespeichert, setHashGespeichert] = useState(false);

  // Echter Inhalts-Hash statt Base64 von ein paar IDs + Timestamp: der
  // Hash ändert sich, sobald sich Bericht-Inhalt oder Unterschriften ändern,
  // und ist damit tatsächlich geeignet, nachträgliche Manipulation am
  // Dokument zu erkennen.
  useEffect(() => {
    const inhalt = JSON.stringify({
      datum, projekt_id: projekt?.id, bericht_id: bericht?.id,
      taetigkeit: bericht?.taetigkeit, besonderheiten: bericht?.besonderheiten,
      maengel: (maengel||[]).map(m => ({ id:m.id, titel:m.titel, status:m.status })),
      sigPolier, sigBauleiter,
    });
    let aktiv = true;
    sha256Hex(inhalt).then(h => { if (aktiv) setHash(h.slice(0,16).toUpperCase()); });
    return () => { aktiv = false; };
  }, [datum, projekt?.id, bericht?.id, bericht?.taetigkeit, bericht?.besonderheiten, maengel, sigPolier, sigBauleiter]);

  async function exportPDF() {
    if (!hash) return;
    const offeneMaengel = (maengel||[]).filter(m=>m.status!=="abgeschlossen");
    const fotos = bericht?.bilder || [];
    // Max. 6 Kacheln (3×2) sichtbar — bei mehr Fotos zeigt die letzte Kachel
    // "+N weitere" statt das Dokument beliebig in die Länge zu ziehen.
    const fotosSichtbar = fotos.length > 6 ? fotos.slice(0, 5) : fotos;
    const fotosRest = fotos.length > 6 ? fotos.length - 5 : 0;
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:11pt; color:#1a1a1a; }
.page { width:210mm; padding:14mm 18mm; }
.header { display:flex; justify-content:space-between; align-items:flex-start;
  border-bottom:3px solid #F5C400; padding-bottom:10px; margin-bottom:14px; }
.logo { font-size:22pt; font-weight:900; letter-spacing:-1px; }
.logo span { color:#F5C400; }
.firma { font-size:9pt; color:#666; margin-top:3px; }
.doc-title { text-align:right; }
.doc-title h1 { font-size:14pt; font-weight:bold; }
.doc-title .meta { font-size:9pt; color:#666; margin-top:3px; }
.hash-badge { background:#1a1a1a; color:#F5C400; padding:4px 10px;
  border-radius:4px; font-size:9pt; font-family:monospace; margin-top:4px; display:inline-block; }
.kennzahlen { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:16px; }
.kz { background:#f8f8f8; border-radius:6px; padding:9px 10px 8px; position:relative; overflow:hidden; }
.kz::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:#F5C400; }
.kz.warn::before { background:#DC2626; }
.kz-val { font-size:19pt; font-weight:900; line-height:1; }
.kz.warn .kz-val { color:#DC2626; }
.kz-label { font-size:7.5pt; color:#888; text-transform:uppercase; letter-spacing:0.3px; margin-top:4px; font-weight:bold; }
.section { margin-bottom:14px; }
.section-title { font-size:10pt; font-weight:bold; color:#F5C400;
  border-left:3px solid #F5C400; padding-left:8px; margin-bottom:8px;
  text-transform:uppercase; letter-spacing:0.5px; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
.field { background:#f8f8f8; border-radius:5px; padding:8px 10px; }
.field-label { font-size:8pt; color:#888; text-transform:uppercase; }
.field-value { font-size:11pt; font-weight:bold; margin-top:2px; }
.text-block { background:#f8f8f8; border-radius:5px; padding:10px 12px;
  font-size:11pt; line-height:1.6; min-height:40px; }
.mangel-row { background:#fff0f0; border-left:3px solid #DC2626;
  padding:8px 12px; margin-bottom:6px; border-radius:0 5px 5px 0; font-size:10.5pt; }
.mangel-row strong { font-size:11pt; }
.mangel-meta { color:#888; font-size:9pt; margin-top:2px; }
.foto-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.foto-item img { width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:6px; display:block; }
.foto-caption { font-size:8pt; color:#888; margin-top:3px; text-align:center; }
.foto-mehr { display:flex; align-items:center; justify-content:center; aspect-ratio:4/3;
  background:#f8f8f8; border-radius:6px; color:#888; font-size:10pt; font-weight:bold; }
.sig-area { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:10px; }
.sig-box { }
.sig-label { font-size:9pt; color:#666; margin-bottom:4px; }
.sig-img { border:1px solid #ccc; border-radius:5px; height:70px;
  display:flex; align-items:center; justify-content:center; }
.sig-img img { max-height:66px; max-width:100%; }
.sig-name { font-size:8pt; color:#888; margin-top:4px; text-align:center; }
.footer { border-top:1px solid #ddd; margin-top:16px; padding-top:8px;
  font-size:7.5pt; color:#aaa; display:flex; justify-content:space-between; font-family:monospace; }
</style></head><body><div class="page">

<div class="header">
  <div>
    <div class="logo"><span>★</span> POLARIS</div>
    <div class="firma">${escapeHtml(eigeneFirma?.name)}  ·  ${escapeHtml(eigeneFirma?.strasse)}, ${escapeHtml(eigeneFirma?.plz)} ${escapeHtml(eigeneFirma?.ort)}</div>
    <div class="firma">${escapeHtml(eigeneFirma?.telefon)}  ·  ${escapeHtml(eigeneFirma?.email)}</div>
  </div>
  <div class="doc-title">
    <h1>Tagesbericht</h1>
    <div class="meta">${escapeHtml(datum||new Date().toLocaleDateString("de-DE"))}</div>
    <div class="meta" style="font-weight:bold">${escapeHtml(projekt?.name)}</div>
    <div class="meta">${escapeHtml(projekt?.projektnummer)}</div>
    <div class="hash-badge">DOC-${hash}</div>
  </div>
</div>

<!-- Kennzahlen auf einen Blick — die wichtigsten Zahlen des Tages sofort
     sichtbar, statt sie erst aus den Abschnitten weiter unten zusammen-
     suchen zu müssen. -->
<div class="kennzahlen">
  <div class="kz"><div class="kz-val">${bericht?.arbeiter ?? 0}</div><div class="kz-label">Arbeiter</div></div>
  <div class="kz"><div class="kz-val">${wetter ? wetter.temp+"°C" : "—"}</div><div class="kz-label">Temperatur</div></div>
  <div class="kz${offeneMaengel.length>0?" warn":""}"><div class="kz-val">${offeneMaengel.length}</div><div class="kz-label">Offene Mängel</div></div>
  <div class="kz"><div class="kz-val">${fotos.length}</div><div class="kz-label">Fotos</div></div>
</div>

<div class="section">
  <div class="section-title">Baustellendaten</div>
  <div class="grid2">
    <div class="field"><div class="field-label">Bauleiter</div><div class="field-value">${escapeHtml(projekt?.bauleiter)||"—"}</div></div>
    <div class="field"><div class="field-label">Auftraggeber</div><div class="field-value">${escapeHtml(projekt?.auftraggeber)||"—"}</div></div>
  </div>
</div>

${wetter ? `<div class="section">
  <div class="section-title">Witterung</div>
  <div class="grid3">
    <div class="field"><div class="field-label">Temperatur</div><div class="field-value">${wetter.temp}°C</div></div>
    <div class="field"><div class="field-label">Wind</div><div class="field-value">${wetter.wind} km/h</div></div>
    <div class="field"><div class="field-label">Niederschlag</div><div class="field-value">${wetter.rain} mm</div></div>
  </div>
</div>` : ""}

<div class="section">
  <div class="section-title">Tätigkeiten</div>
  <div class="text-block">${escapeHtml(bericht?.taetigkeit)||"—"}</div>
</div>

${bericht?.material ? `<div class="section">
  <div class="section-title">Materiallieferungen</div>
  <div class="text-block">${escapeHtml(bericht.material)}</div>
</div>` : ""}

${bericht?.besonderheiten ? `<div class="section">
  <div class="section-title">Besonderheiten</div>
  <div class="text-block">${escapeHtml(bericht.besonderheiten)}</div>
</div>` : ""}

${offeneMaengel.length > 0 ? `<div class="section">
  <div class="section-title">Offene Mängel (${offeneMaengel.length})</div>
  ${offeneMaengel.map(m=>`<div class="mangel-row">
    <strong>${escapeHtml(m.titel)}</strong>
    <div class="mangel-meta">${m.mangel_verursacher ? `Verursacher: ${escapeHtml(m.mangel_verursacher)} · ` : ""}Status: ${escapeHtml(m.status)}</div>
  </div>`).join("")}
</div>` : ""}

${fotos.length > 0 ? `<div class="section">
  <div class="section-title">Fotodokumentation (${fotos.length})</div>
  <div class="foto-grid">
    ${fotosSichtbar.map((url,i)=>`<div class="foto-item">
      <img src="${url}" alt="Foto ${i+1}" />
      <div class="foto-caption">Foto ${i+1} · ${escapeHtml(datum||new Date().toLocaleDateString("de-DE"))}</div>
    </div>`).join("")}
    ${fotosRest > 0 ? `<div class="foto-mehr">+${fotosRest} weitere</div>` : ""}
  </div>
</div>` : ""}

<div class="section">
  <div class="section-title">Unterschriften</div>
  <div class="sig-area">
    <div class="sig-box">
      <div class="sig-label">Polier</div>
      <div class="sig-img">
        ${sigPolier ? `<img src="${sigPolier}" />` : "<span style='color:#ccc'>Nicht unterschrieben</span>"}
      </div>
      <div class="sig-name">${escapeHtml(eigeneFirma?.geschaeftsfuehrer)||"Polier"} · ${escapeHtml(datum||new Date().toLocaleDateString("de-DE"))}</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Bauleiter</div>
      <div class="sig-img">
        ${sigBauleiter ? `<img src="${sigBauleiter}" />` : "<span style='color:#ccc'>Nicht unterschrieben</span>"}
      </div>
      <div class="sig-name">${escapeHtml(projekt?.bauleiter)||"Bauleiter"} · ${escapeHtml(datum||new Date().toLocaleDateString("de-DE"))}</div>
    </div>
  </div>
</div>

<div class="footer">
  <span>Erstellt mit Polaris · ${new Date().toLocaleString("de-DE")} · Revisionssicher</span>
  <span>DOC-${hash}</span>
</div>

</div></body></html>`;

    await druckePDF(html, `Tagesbericht_${datum || bericht?.datum || "export"}.pdf`);
    setExportiert(true);

    // Hash serverseitig im audit_log hinterlegen — erst dadurch ist die
    // Dokument-ID später tatsächlich nachprüfbar (vorher stand sie nur auf
    // dem PDF selbst, ohne gespeicherte Referenz zum Abgleich).
    const gespeichert = await sbDokumentHashSpeichern({
      firmaId: projekt?.firma_id, profilId: session?.user?.id,
      hash, berichtId: bericht?.id, datum,
    }, session);
    setHashGespeichert(gespeichert);
  }

  return (
    <>
      <button onClick={() => setOffen(true)}
        style={{ background:"var(--surface2)", color:"var(--text)",
          border:"1.5px solid var(--border)", borderRadius:10,
          padding:"8px 14px", fontWeight:700, cursor:"pointer",
          fontSize:13, fontFamily:"inherit",
          display:"flex", alignItems:"center", gap:6 }}>
        <PenLine size={14} /> Unterschreiben & Export
      </button>

      {/* Als Portal gerendert — wird u.a. innerhalb der Bautagebuch-
          Detailansicht verwendet, die selbst schon position:fixed ist;
          ohne Portal verschachtelt sich hier derselbe nested-fixed-Bug
          wie beim Aufgabenformular. */}
      {offen && createPortal(
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"var(--bg)", zIndex:600, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0",
            padding:16,
            width:"100%", maxWidth:520,
            boxShadow:"0 -4px 30px rgba(0,0,0,0.2)" }}>

            {/* position:sticky pinnt diesen Header beim Scrollen an den echten
               oberen Bildschirmrand (nicht an den Anfang des gepolsterten
               Panels) — deshalb braucht er sein eigenes safe-area-Padding,
               statt sich auf das einmalige Padding des Panels zu verlassen. */}
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:12,
              paddingTop:"calc(6px + env(safe-area-inset-top))",
              position:"sticky", top:0, background:"var(--surface)", zIndex:5 }}>
              <div style={{ fontWeight:800, fontSize:17, color:"var(--text)",
                display:"flex", alignItems:"center", gap:8 }}>
                <PenLine size={16} /> Digitale Unterschrift
              </div>
              <button onClick={() => setOffen(false)}
                style={{ background:"none", border:"none", color:"var(--muted)",
                  cursor:"pointer", display:"flex" }}><X size={22} /></button>
            </div>

            {/* Revisions-Hash */}
            <div style={{ background:"#1a1a1a", borderRadius:10, padding:"7px 14px",
              marginBottom:12, display:"flex", justifyContent:"space-between",
              alignItems:"center" }}>
              <div>
                <div style={{ color:"#F5C400", fontWeight:700, fontSize:12 }}>
                  Revisionssicheres Dokument
                </div>
                <div style={{ color:"#888", fontSize:11, marginTop:2 }}>
                  Eindeutige Dokument-ID
                </div>
              </div>
              <div style={{ color:"#F5C400", fontFamily:"monospace",
                fontSize:14, fontWeight:800 }}>{hash ? `DOC-${hash}` : "…berechne…"}</div>
            </div>

            <UnterschriftPad label="Unterschrift Polier" onSave={setSigPolier} />
            {sigPolier && (
              <div style={{ marginBottom:9 }}>
                <div style={{ color:"var(--green)", fontSize:12, fontWeight:600,
                  marginBottom:4, display:"flex", alignItems:"center", gap:4 }}><Check size={12} /> Polier unterschrieben</div>
                <img src={sigPolier} alt="Unterschrift Polier"
                  style={{ height:50, border:"1px solid var(--border)",
                    borderRadius:8, background:"#fff" }} />
              </div>
            )}

            <UnterschriftPad label="Unterschrift Bauleiter" onSave={setSigBauleiter} />
            {sigBauleiter && (
              <div style={{ marginBottom:12 }}>
                <div style={{ color:"var(--green)", fontSize:12, fontWeight:600,
                  marginBottom:4, display:"flex", alignItems:"center", gap:4 }}><Check size={12} /> Bauleiter unterschrieben</div>
                <img src={sigBauleiter} alt="Unterschrift Bauleiter"
                  style={{ height:50, border:"1px solid var(--border)",
                    borderRadius:8, background:"#fff" }} />
              </div>
            )}

            <button onClick={exportPDF} disabled={!hash}
              style={{ width:"100%", background: hash ? "var(--yellow)" : "var(--surface2)",
                color: hash ? "#1a1200" : "var(--muted)",
                border:"none", borderRadius:12, padding:15, fontWeight:800,
                fontSize:15, cursor: hash ? "pointer" : "default", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              <FileText size={15} /> Revisionssicheres PDF exportieren
            </button>

            {exportiert && (
              <div style={{ background:"var(--gbg)", borderRadius:10, padding:7,
                marginTop:10, color:"var(--green)", fontSize:12, fontWeight:600,
                textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <CircleCheckBig size={13} /> PDF erstellt · DOC-{hash} · {new Date().toLocaleString("de-DE")}
                {!hashGespeichert && " · Prüfreferenz konnte nicht gespeichert werden"}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
