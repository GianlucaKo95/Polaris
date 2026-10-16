import { useState, useEffect } from "react";
import { ShieldCheck, FileDown, Ban } from "lucide-react";
import { sbAngebotFreigabeNachweisLaden } from "../lib/supabase.js";
import { escapeHtml } from "../lib/utils.js";
import { druckePDF } from "../lib/pdf.jsx";

// Zeigt GF/Admin den vollständigen Entscheidungs-Nachweis eines online
// über den Kunden-Link angenommenen/abgelehnten Angebots — Name, Zeitpunkt,
// IP, DOC-Hash und (bei Annahme) die tatsächlich gezeichnete Unterschrift.
// Vorher stand im Editor nur "online angenommen am ... von ...", die
// Unterschrift selbst war nirgends einsehbar.
export function AngebotNachweis({ angebot, eigeneFirma, projekt, session }) {
  const [nachweis, setNachweis] = useState(null);
  const [laden,    setLaden]    = useState(true);

  useEffect(() => {
    let aktiv = true;
    if (!angebot?.entschieden_am) { setLaden(false); return; }
    sbAngebotFreigabeNachweisLaden(angebot.id, session).then(n => {
      if (aktiv) { setNachweis(n); setLaden(false); }
    });
    return () => { aktiv = false; };
  }, [angebot?.id, angebot?.entschieden_am]);

  if (!angebot?.entschieden_am || laden) return null;
  if (!nachweis) return null;

  const angenommen = nachweis.entscheidung === "angenommen";

  function exportNachweisPDF() {
    const zeitpunkt = new Date(nachweis.entschieden_am).toLocaleString("de-DE");
    const gpOf = p => (p.menge||0) * (p.ep||0) * (1 - (p.rabatt||0)/100);
    const netto = (angebot.positionen||[]).reduce((s,p)=>s+gpOf(p),0);
    const nettoNachRabatt = netto * (1 - (angebot.rabatt||0)/100);
    const mwstBetrag = nettoNachRabatt * (angebot.mwst||19)/100;
    const bruttoGesamt = nettoNachRabatt + mwstBetrag;
    const firmaAdresszeile = [eigeneFirma?.strasse, [eigeneFirma?.plz, eigeneFirma?.ort].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");

    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:10.5pt; color:#1a1a1a; }
.page { width:210mm; padding:14mm 18mm; }
.header { display:flex; justify-content:space-between; align-items:flex-start;
  border-bottom:3px solid #F5C400; padding-bottom:12px; margin-bottom:16px; }
.firma-name { font-size:16pt; font-weight:900; letter-spacing:-0.5px; }
.firma-info { font-size:9pt; color:#666; margin-top:3px; }
.doc-title { text-align:right; max-width:55%; min-width:0; }
.doc-title h1 { font-size:16pt; font-weight:900; }
.doc-title .meta { font-size:9pt; color:#666; margin-top:3px; }
.status-banner { border-radius:10px; padding:14px 18px; margin-bottom:16px;
  background:${angenommen ? "#DCFCE7" : "#FEE2E2"}; color:${angenommen ? "#15803D" : "#B91C1C"}; }
.status-banner .big { font-size:15pt; font-weight:900; }
.status-banner .sub { font-size:10pt; margin-top:4px; }
.table { width:100%; border-collapse:collapse; margin-bottom:14px; }
.table th { background:#1a1a1a; color:#F5C400; padding:7px 9px; text-align:left; font-size:8.5pt; }
.table th:last-child, .table td:last-child { text-align:right; }
.table td { padding:7px 9px; border-bottom:1px solid #eee; font-size:9.5pt; }
.summen { margin-left:auto; width:240px; margin-bottom:16px; }
.summen-row { display:flex; justify-content:space-between; padding:4px 0; font-size:9.5pt; }
.summen-row.gesamt { border-top:2px solid #1a1a1a; margin-top:4px; padding-top:7px; font-weight:900; font-size:11pt; }
.sig-section { border:1.5px solid #ccc; border-radius:10px; padding:14px 16px; margin-top:6px; }
.sig-img { max-width:260px; max-height:80px; border-bottom:1px solid #ccc; }
.hash-badge { font-family:monospace; font-size:9.5pt; background:#f0f0f0; border-radius:6px;
  padding:6px 10px; display:inline-block; margin-top:8px; word-break:break-all; max-width:100%; }
.meta-row { font-size:9pt; color:#666; margin-top:6px; word-break:break-all; }
.footer { border-top:1px solid #ddd; margin-top:14px; padding-top:6px; font-size:7pt; color:#aaa;
  display:flex; justify-content:space-between; }
</style></head><body><div class="page">

<div class="header">
  <div>
    <div class="firma-name">${escapeHtml(eigeneFirma?.name) || "Polaris"}</div>
    ${firmaAdresszeile ? `<div class="firma-info">${escapeHtml(firmaAdresszeile)}</div>` : ""}
  </div>
  <div class="doc-title">
    <h1>Entscheidungs-Nachweis</h1>
    <div class="meta">${escapeHtml(angebot.titel)}</div>
    <div class="meta">${escapeHtml(projekt?.name) || ""}</div>
  </div>
</div>

<div class="status-banner">
  <div class="big">${angenommen ? "✅ Angebot angenommen" : "❌ Angebot abgelehnt"}</div>
  <div class="sub">Bestätigt von ${escapeHtml(nachweis.entschieden_name)} am ${zeitpunkt}</div>
</div>

<table class="table">
  <thead><tr><th>Bezeichnung</th><th>Menge</th><th>Einheit</th><th>EP (€)</th><th>GP (€)</th></tr></thead>
  <tbody>
    ${(angebot.positionen||[]).map(p => `
    <tr>
      <td>${escapeHtml(p.bez)}</td>
      <td>${(p.menge||0).toLocaleString("de-DE")}</td>
      <td>${escapeHtml(p.einheit)}</td>
      <td>${(p.ep||0).toLocaleString("de-DE",{minimumFractionDigits:2})}</td>
      <td>${gpOf(p).toLocaleString("de-DE",{minimumFractionDigits:2})}</td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="summen">
  <div class="summen-row gesamt"><span>Gesamtbetrag (brutto)</span><span>${bruttoGesamt.toLocaleString("de-DE",{minimumFractionDigits:2})} €</span></div>
</div>

<div class="sig-section">
  <div style="font-size:9pt;color:#888;text-transform:uppercase;margin-bottom:8px;">Digitale Unterschrift</div>
  ${nachweis.entschieden_signatur ? `<img class="sig-img" src="${nachweis.entschieden_signatur}" alt="Unterschrift"/>` : `<div style="color:#888;font-size:10pt;">Keine Unterschrift (Ablehnung)</div>`}
  <div class="hash-badge">DOC-${escapeHtml(nachweis.entschieden_hash || "")}</div>
  <div class="meta-row">IP-Adresse zum Zeitpunkt der Entscheidung: ${escapeHtml(nachweis.entschieden_ip || "nicht ermittelbar")}</div>
</div>

<div class="footer">
  <span>Erstellt mit Polaris · ${new Date().toLocaleString("de-DE")}</span>
  <span>${escapeHtml(eigeneFirma?.name)}</span>
</div>

</div></body></html>`;

    druckePDF(html, `Nachweis_${angebot.titel || angebot.id}.pdf`);
  }

  return (
    <div style={{ background:"var(--surface)", border:`1px solid ${angenommen ? "var(--green)" : "var(--red)"}`,
      borderRadius:12, padding:14, marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, fontWeight:700, fontSize:13, marginBottom:10,
        color: angenommen ? "var(--green)" : "var(--red)" }}>
        {angenommen ? <ShieldCheck size={15} /> : <Ban size={15} />}
        Signierter Nachweis
      </div>

      <div style={{ color:"var(--text)", fontSize:12.5, marginBottom:3 }}>
        <strong>{nachweis.entschieden_name}</strong> hat dieses Angebot {angenommen ? "angenommen" : "abgelehnt"}
      </div>
      <div style={{ color:"var(--muted)", fontSize:11.5, marginBottom:10 }}>
        {new Date(nachweis.entschieden_am).toLocaleString("de-DE")}
        {nachweis.entschieden_ip && <> · IP {nachweis.entschieden_ip}</>}
      </div>

      {nachweis.entschieden_signatur && (
        <div style={{ background:"#fff", border:"1px solid var(--border)", borderRadius:8,
          padding:8, marginBottom:10, display:"inline-block" }}>
          <img src={nachweis.entschieden_signatur} alt="Unterschrift" style={{ maxWidth:220, maxHeight:70, display:"block" }} />
        </div>
      )}

      <div style={{ fontFamily:"monospace", fontSize:11, color:"var(--muted)", background:"var(--surface2)",
        borderRadius:6, padding:"5px 9px", display:"inline-block", wordBreak:"break-all", marginBottom:10 }}>
        DOC-{nachweis.entschieden_hash}
      </div>

      <button onClick={exportNachweisPDF}
        style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, width:"100%",
          background:"var(--surface2)", color:"var(--text)", border:"1.5px solid var(--border)",
          borderRadius:8, padding:"9px 14px", cursor:"pointer", fontWeight:700, fontSize:12.5, fontFamily:"inherit" }}>
        <FileDown size={14} /> Nachweis als PDF
      </button>
    </div>
  );
}
