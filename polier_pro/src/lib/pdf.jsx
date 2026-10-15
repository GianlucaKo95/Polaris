import { escapeHtml } from "./utils.js";

export function buildBerichtHTML(bericht, projekt, eigeneFirma, wetter) {
  const datum = escapeHtml(bericht.datum || new Date().toLocaleDateString("de-DE"));
  const fotos = bericht.bilder || [];
  const logo  = eigeneFirma?.logo || null;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
  .page { width:210mm; min-height:297mm; padding:15mm 18mm; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid #F5C400; padding-bottom:10px; margin-bottom:16px; }
  .logo { width:60px; height:60px; object-fit:contain; }
  .logo-placeholder { width:60px; height:60px; background:#F5C400; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px; }
  .firma-name { font-size:16pt; font-weight:bold; color:#1C2027; }
  .firma-sub { font-size:9pt; color:#666; margin-top:2px; }
  .doc-title { text-align:right; }
  .doc-title h1 { font-size:14pt; font-weight:bold; color:#1C2027; }
  .doc-title .datum { font-size:10pt; color:#666; margin-top:4px; }
  .section { margin-bottom:16px; }
  .section-title { font-size:10pt; font-weight:bold; color:#F5C400; text-transform:uppercase; letter-spacing:0.5px; border-left:3px solid #F5C400; padding-left:8px; margin-bottom:8px; }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
  .field { background:#f8f8f8; border-radius:6px; padding:8px 10px; }
  .field-label { font-size:8pt; color:#888; text-transform:uppercase; letter-spacing:0.3px; }
  .field-value { font-size:11pt; font-weight:bold; margin-top:2px; }
  .wetter-ok { color:#2EAF6A; }
  .wetter-warn { color:#D94040; }
  .text-block { background:#f8f8f8; border-radius:6px; padding:10px 12px; font-size:11pt; line-height:1.6; min-height:40px; }
  .foto-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-top:8px; }
  .foto-item img { width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:6px; }
  .foto-caption { font-size:8pt; color:#888; margin-top:3px; text-align:center; }
  .kolonne-row { display:flex; justify-content:space-between; padding:6px 10px; background:#f8f8f8; border-radius:5px; margin-bottom:4px; }
  .sig-box { border:1.5px solid #ccc; border-radius:6px; height:60px; margin-top:6px; position:relative; }
  .sig-label { position:absolute; bottom:6px; left:10px; font-size:8pt; color:#888; }
  .sig-date { position:absolute; bottom:6px; right:10px; font-size:8pt; color:#888; }
  .footer { border-top:1px solid #ddd; margin-top:20px; padding-top:8px; font-size:8pt; color:#aaa; display:flex; justify-content:space-between; }
  @media print { .page { padding:10mm 14mm; } }
</style>
</head>
<body>
<div class="page">

  <!-- KOPFZEILE -->
  <div class="header">
    <div style="display:flex;gap:14px;align-items:center;">
      ${logo
        ? `<img class="logo" src="${logo}" alt="Logo"/>`
        : `<div class="logo-placeholder">⚒</div>`}
      <div>
        <div class="firma-name">${escapeHtml(eigeneFirma?.name) || "Polaris"}</div>
        <div class="firma-sub">${escapeHtml(eigeneFirma?.strasse)} · ${escapeHtml(eigeneFirma?.plz)} ${escapeHtml(eigeneFirma?.ort)}</div>
        <div class="firma-sub">${escapeHtml(eigeneFirma?.telefon)} · ${escapeHtml(eigeneFirma?.email)}</div>
      </div>
    </div>
    <div class="doc-title">
      <h1>Bautagebuch</h1>
      <div class="datum">${datum}</div>
      <div class="datum" style="margin-top:2px;font-weight:bold;">${escapeHtml(projekt?.name)}</div>
      <div class="datum">${escapeHtml(projekt?.projektnummer)}</div>
    </div>
  </div>

  <!-- STAMMDATEN -->
  <div class="section">
    <div class="section-title">Baustellendaten</div>
    <div class="grid-3">
      <div class="field"><div class="field-label">Baustelle</div><div class="field-value">${escapeHtml(projekt?.name) || "—"}</div></div>
      <div class="field"><div class="field-label">Bauleiter</div><div class="field-value">${escapeHtml(projekt?.bauleiter) || "—"}</div></div>
      <div class="field"><div class="field-label">Auftraggeber</div><div class="field-value">${escapeHtml(projekt?.auftraggeber) || "—"}</div></div>
    </div>
  </div>

  <!-- WETTER -->
  ${wetter ? `
  <div class="section">
    <div class="section-title">Witterungsverhältnisse</div>
    <div class="grid-3">
      <div class="field"><div class="field-label">Temperatur</div><div class="field-value">${wetter.temp}°C</div></div>
      <div class="field"><div class="field-label">Wind</div><div class="field-value">${wetter.wind} km/h</div></div>
      <div class="field"><div class="field-label">Niederschlag</div><div class="field-value">${wetter.rain} mm</div></div>
      <div class="field"><div class="field-label">Luftfeuchte</div><div class="field-value">${wetter.humidity}%</div></div>
      <div class="field"><div class="field-label">Betonierbarkeit</div>
        <div class="field-value ${wetter.temp >= 5 && wetter.wind <= 40 && wetter.rain <= 5 ? "wetter-ok" : "wetter-warn"}">
          ${wetter.temp >= 5 && wetter.wind <= 40 && wetter.rain <= 5 ? "✓ Möglich" : "⚠ Eingeschränkt"}
        </div>
      </div>
    </div>
  </div>` : ""}

  <!-- TÄTIGKEITEN -->
  <div class="section">
    <div class="section-title">Tätigkeiten</div>
    <div class="text-block">${escapeHtml(bericht.taetigkeit) || "—"}</div>
  </div>

  ${bericht.besonderheiten ? `
  <div class="section">
    <div class="section-title">Besonderheiten / Mängel</div>
    <div class="text-block">${escapeHtml(bericht.besonderheiten)}</div>
  </div>` : ""}

  ${bericht.material ? `
  <div class="section">
    <div class="section-title">Materiallieferungen</div>
    <div class="text-block">${escapeHtml(bericht.material)}</div>
  </div>` : ""}

  <!-- KOLONNEN & STUNDEN -->
  ${bericht.kolonnen && bericht.kolonnen.length > 0 ? `
  <div class="section">
    <div class="section-title">Personal &amp; Stunden</div>
    ${bericht.kolonnen.map(k => `
      <div class="kolonne-row">
        <span style="font-weight:bold;">${escapeHtml(k.name)}</span>
        <span>${k.mitarbeiter?.length || 0} Personen</span>
        <span style="font-weight:bold;">${k.stunden ? k.stunden.toFixed(1) + " h" : "—"}</span>
      </div>`).join("")}
    <div class="kolonne-row" style="background:#F5C400;margin-top:4px;">
      <span style="font-weight:bold;">Gesamt</span>
      <span>${bericht.arbeiter || 0} Personen</span>
      <span style="font-weight:bold;">${bericht.kolonnen.reduce((s,k) => s + (k.stunden || 0), 0).toFixed(1)} h</span>
    </div>
  </div>` : `
  <div class="section">
    <div class="section-title">Personal</div>
    <div class="grid-2">
      <div class="field"><div class="field-label">Arbeiter gesamt</div><div class="field-value">${bericht.arbeiter || 0}</div></div>
      <div class="field"><div class="field-label">Mängel</div><div class="field-value ${bericht.maengel > 0 ? "wetter-warn" : ""}">${bericht.maengel || 0}</div></div>
    </div>
  </div>`}

  <!-- FOTOS -->
  ${fotos.length > 0 ? `
  <div class="section">
    <div class="section-title">Fotodokumentation (${fotos.length} Fotos)</div>
    <div class="foto-grid">
      ${fotos.slice(0, 9).map((url, i) => `
        <div class="foto-item">
          <img src="${url}" alt="Foto ${i+1}"/>
          <div class="foto-caption">Foto ${i+1} · ${datum}</div>
        </div>`).join("")}
    </div>
  </div>` : ""}

  <!-- UNTERSCHRIFTEN -->
  <div class="section" style="margin-top:auto;page-break-inside:avoid;">
    <div class="section-title">Unterschriften</div>
    <div class="grid-2">
      <div>
        <div style="font-size:9pt;color:#666;margin-bottom:4px;">Polier</div>
        <div class="sig-box"><div class="sig-label">${escapeHtml(eigeneFirma?.geschaeftsfuehrer) || "Polier"}</div><div class="sig-date">${datum}</div></div>
      </div>
      <div>
        <div style="font-size:9pt;color:#666;margin-bottom:4px;">Bauleiter</div>
        <div class="sig-box"><div class="sig-label">${escapeHtml(projekt?.bauleiter) || "Bauleiter"}</div><div class="sig-date">${datum}</div></div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>Erstellt mit Polaris · ${new Date().toLocaleString("de-DE")}</span>
    <span>${escapeHtml(eigeneFirma?.name)} · ${escapeHtml(projekt?.projektnummer)}</span>
  </div>
</div>
</body></html>`;
}

export function buildBetonprotokollHTML(feld, projekt, eigeneFirma, wetter) {
  const heute = escapeHtml(new Date().toLocaleDateString("de-DE"));
  const logo  = eigeneFirma?.logo || null;
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:11pt; color:#1a1a1a; }
  .page { width:210mm; min-height:297mm; padding:15mm 18mm; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid #F5C400; padding-bottom:10px; margin-bottom:16px; }
  .logo { width:55px; height:55px; object-fit:contain; }
  .logo-placeholder { width:55px; height:55px; background:#F5C400; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:22px; }
  .firma-name { font-size:14pt; font-weight:bold; }
  .section-title { font-size:10pt; font-weight:bold; color:#F5C400; text-transform:uppercase; letter-spacing:0.5px; border-left:3px solid #F5C400; padding-left:8px; margin:14px 0 8px; }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
  .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:8px; }
  .field { background:#f8f8f8; border-radius:5px; padding:8px 10px; }
  .field-label { font-size:8pt; color:#888; text-transform:uppercase; }
  .field-value { font-size:12pt; font-weight:bold; margin-top:2px; }
  .timeline { border-left:3px solid #F5C400; padding-left:14px; margin:8px 0; }
  .timeline-item { margin-bottom:10px; }
  .timeline-time { font-size:9pt; color:#666; }
  .timeline-text { font-size:11pt; }
  .check-row { display:flex; align-items:center; gap:8px; padding:6px 10px; border-bottom:1px solid #f0f0f0; }
  .check-box { width:16px; height:16px; border:1.5px solid #ccc; border-radius:3px; flex-shrink:0; }
  .sig-box { border:1.5px solid #ccc; border-radius:6px; height:55px; position:relative; margin-top:6px; }
  .sig-label { position:absolute; bottom:5px; left:8px; font-size:8pt; color:#888; }
  .ok { color:#2EAF6A; font-weight:bold; }
  .warn { color:#D94040; font-weight:bold; }
  .footer { border-top:1px solid #ddd; margin-top:16px; padding-top:6px; font-size:8pt; color:#aaa; display:flex; justify-content:space-between; }
  @media print { .page { padding:10mm 14mm; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div style="display:flex;gap:12px;align-items:center;">
      ${logo ? `<img class="logo" src="${logo}" alt="Logo"/>` : `<div class="logo-placeholder">⚒</div>`}
      <div>
        <div class="firma-name">${escapeHtml(eigeneFirma?.name) || "Polaris"}</div>
        <div style="font-size:9pt;color:#666;">${escapeHtml(eigeneFirma?.strasse)} · ${escapeHtml(eigeneFirma?.ort)}</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:14pt;font-weight:bold;">Betonierprotokoll</div>
      <div style="font-size:9pt;color:#666;margin-top:3px;">${heute}</div>
      <div style="font-size:9pt;font-weight:bold;">${escapeHtml(projekt?.name)}</div>
    </div>
  </div>

  <div class="section-title">Betonfeld</div>
  <div class="grid-3">
    <div class="field"><div class="field-label">Feldbezeichnung</div><div class="field-value">${escapeHtml(feld.name)}</div></div>
    <div class="field"><div class="field-label">Fläche</div><div class="field-value">${feld.m2} m²</div></div>
    <div class="field"><div class="field-label">Status</div><div class="field-value">${escapeHtml(feld.status)}</div></div>
    <div class="field"><div class="field-label">Betonsorte</div><div class="field-value">${escapeHtml(feld.betonsorte) || "—"}</div></div>
    <div class="field"><div class="field-label">Bewehrung</div><div class="field-value" style="font-size:10pt;">${escapeHtml(feld.bewehrung) || "—"}</div></div>
    <div class="field"><div class="field-label">Festigkeit</div><div class="field-value ${(feld.festigkeit || 0) >= 95 ? "ok" : ""}">${feld.festigkeit ? feld.festigkeit + "%" : "Ausstehend"}</div></div>
  </div>

  ${wetter ? `
  <div class="section-title">Witterung bei Betonage</div>
  <div class="grid-3">
    <div class="field"><div class="field-label">Temperatur</div><div class="field-value">${wetter.temp}°C</div></div>
    <div class="field"><div class="field-label">Wind</div><div class="field-value">${wetter.wind} km/h</div></div>
    <div class="field"><div class="field-label">Niederschlag</div><div class="field-value">${wetter.rain} mm</div></div>
  </div>` : ""}

  <div class="section-title">Betonierablauf</div>
  <div class="timeline">
    ${["Beginn Betonage", "Lieferschein-Nr.", "Einbautemperatur", "Verdichtung", "Nachbehandlung begonnen", "Ende Betonage"].map(item => `
    <div class="timeline-item">
      <div class="timeline-time">___:___ Uhr</div>
      <div class="timeline-text">${item}: ___________________________</div>
    </div>`).join("")}
  </div>

  <div class="section-title">Freigabe-Checkliste</div>
  ${["Bewehrungsabnahme erfolgt", "Schalung geprüft und freigegeben", "Betonierplan genehmigt", "Wetterbedingungen geprüft", "Lieferschein vorhanden", "Verdichtungsprotokoll erstellt"].map(item => `
  <div class="check-row"><div class="check-box"></div><span>${item}</span></div>`).join("")}

  <div class="section-title">Unterschriften</div>
  <div class="grid-2">
    <div><div style="font-size:9pt;color:#666;margin-bottom:4px;">Polier / Verantwortlich</div>
    <div class="sig-box"><div class="sig-label">${escapeHtml(eigeneFirma?.geschaeftsfuehrer) || "Polier"} · ${heute}</div></div></div>
    <div><div style="font-size:9pt;color:#666;margin-bottom:4px;">Bauleiter / Freigabe</div>
    <div class="sig-box"><div class="sig-label">${escapeHtml(projekt?.bauleiter) || "Bauleiter"} · ${heute}</div></div></div>
  </div>

  <div class="footer">
    <span>Betonierprotokoll · Polaris · ${new Date().toLocaleString("de-DE")}</span>
    <span>${escapeHtml(projekt?.projektnummer)}</span>
  </div>
</div>
</body></html>`;
}

// Rendert den HTML-String in ein unsichtbares iframe (statt eines echten
// window.open()-Popups) und exportiert ihn als echte, herunterladbare
// PDF-Datei. Vorher öffnete druckePDF() nur den Browser-Druckdialog —
// funktional, aber kein automatischer Download und abhängig vom
// Popup-Blocker. Das iframe bleibt unsichtbar (kein Fenster, das der
// Nutzer schließen müsste).
//
// Screenshot + manuelle Seitenaufteilung statt jsPDF.html(): jsPDF.html()
// rastert mit autoPaging:"text" NUR den reinen Text (fett/kursiv bleibt,
// aber Farben, Hintergründe, text-transform, border-left — die ganze
// optische Gliederung der Vorlagen — fallen komplett weg, ein ★-Zeichen
// im Logo wurde sogar zu "&"). autoPaging:"slice"/"true" sollte laut
// jsPDF-Doku stattdessen per html2canvas rastern, hat in der Praxis aber
// nur kaputt herangezoomt (4 Seiten statt 1, trotzdem ohne Farben) — ein
// bekanntermaßen unzuverlässiger Teil von jsPDF.html(). Zuverlässig ist
// nur das manuelle Vorgehen: html2canvas rastert die komplette Vorlage
// als ein hohes Bild, das wir selbst in exakt A4-hohe Streifen schneiden
// und seitenweise einfügen — das behält jede CSS-Farbe/-Hervorhebung bei
// und skaliert nichts kaputt. JPEG statt PNG: ein PNG-Streifen einer
// Textseite wog unkomprimiert mehrere MB (PNG kommt mit den vielen
// Schriftkanten schlecht klar), als JPEG (q=0.92) nur noch ein Bruchteil
// davon, ohne sichtbaren Qualitätsverlust bei Lesegröße.
export async function druckePDF(htmlContent, dateiname) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-10000px;left:-10000px;width:794px;height:1123px;border:none;";
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument;
    idoc.open();
    idoc.write(htmlContent);
    idoc.close();

    // Ohne dieses Warten rastert html2canvas oft leere Kästen statt Fotos/
    // Logo/Unterschriften, weil deren <img>-Tags beim Rastern noch laden.
    await new Promise(resolve => {
      const imgs = Array.from(idoc.images || []);
      if (imgs.length === 0) { resolve(); return; }
      let ausstehend = imgs.length;
      const fertig = () => { if (--ausstehend <= 0) resolve(); };
      imgs.forEach(img => img.complete ? fertig() : (img.onload = img.onerror = fertig));
    });

    const quelle = idoc.querySelector(".page") || idoc.body;
    const canvas = await html2canvas(quelle, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });

    // canvas.width entspricht der festen Vorlagenbreite von 210mm (A4) —
    // daraus ergibt sich der Umrechnungsfaktor Pixel->mm für die Höhe,
    // und wie viele Pixel exakt eine A4-Seitenhöhe (297mm) ausmachen.
    const SEITE_BREITE_MM = 210, SEITE_HOEHE_MM = 297;
    const pxZuMm = SEITE_BREITE_MM / canvas.width;
    const seitenHoehePx = Math.floor(SEITE_HOEHE_MM / pxZuMm);

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    let offsetPx = 0;
    let seite = 0;
    while (offsetPx < canvas.height) {
      const streifenHoehePx = Math.min(seitenHoehePx, canvas.height - offsetPx);
      const streifen = document.createElement("canvas");
      streifen.width = canvas.width;
      streifen.height = streifenHoehePx;
      streifen.getContext("2d").drawImage(
        canvas, 0, offsetPx, canvas.width, streifenHoehePx, 0, 0, canvas.width, streifenHoehePx
      );
      if (seite > 0) doc.addPage();
      doc.addImage(
        streifen.toDataURL("image/jpeg", 0.92), "JPEG",
        0, 0, SEITE_BREITE_MM, streifenHoehePx * pxZuMm
      );
      offsetPx += streifenHoehePx;
      seite++;
    }
    doc.save(dateiname);
  } catch (e) {
    alert("PDF-Export fehlgeschlagen: " + (e?.message || e));
  } finally {
    document.body.removeChild(iframe);
  }
}
