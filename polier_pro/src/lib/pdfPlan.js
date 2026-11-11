// Mengen aus PDF-Plänen (Vektor-PDF aus CAD, kein Scan).
//
// Zwei Wege, beide ohne KI:
//  1. Raumstempel: "Wohnen  F: 23,45 m²  U: 19,60 m" → Raumflächen und
//     -umfänge direkt aus dem Text. Braucht keinen Maßstab.
//  2. Geometrie: Linien, gefüllte Flächen und Achsbeschriftungen aus den
//     Zeichenbefehlen (pdf.js-Operatorliste) → mit dem Maßstab in Meter →
//     dieselbe Achsabschnitts-Auswertung wie bei DXF (lib/achsraster.js).
//     Gefüllte Flächen werden nach Füllfarbe gruppiert (PDF kennt meist keine Layer).
//
// pdfOperatorenAuswerten() und die Textauswertung arbeiten auf einfachen
// Daten und sind ohne pdf.js testbar; pdfPlanLesen() holt sie aus der Datei.

const PT_IN_MM = 25.4 / 72;

// ── Zeichenbefehle → Linien/Flächen (PDF-Punkte) ────────────────────────
// ops: { fnArray, argsArray } aus page.getOperatorList(); OPS: pdfjs.OPS
// pdf.js ≥ 5: constructPath(args = [malOp, [pfadDaten], minMax]),
// Pfadcodes 0 moveTo, 1 lineTo, 2 curveTo, 3 quadraticCurveTo, 4 closePath.
export function pdfOperatorenAuswerten(ops, OPS) {
  const linien = [], flaechen = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stapel = [];
  let fuell = "#000000";
  const mal = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const p = (x, y) => ({ x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] });

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.save) stapel.push({ ctm, fuell });
    else if (fn === OPS.restore) { const s = stapel.pop(); if (s) ({ ctm, fuell } = s); }
    else if (fn === OPS.transform) ctm = mal(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stapel.push({ ctm, fuell }); if (Array.isArray(args?.[0]) || args?.[0]?.length === 6) ctm = mal(ctm, [...args[0]]); }
    else if (fn === OPS.paintFormXObjectEnd) { const s = stapel.pop(); if (s) ({ ctm, fuell } = s); }
    else if (fn === OPS.setFillRGBColor) fuell = String(args?.[0] || fuell).toLowerCase();
    else if (fn === OPS.constructPath) {
      const malOp = args[0];
      const daten = args[1]?.[0];
      if (!daten) continue;
      const gefuellt = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(malOp);
      const gestrichen = [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(malOp);
      // Unterpfade zerlegen
      const pfade = [];
      let akt = null;
      for (let k = 0; k < daten.length;) {
        const code = daten[k];
        if (code === 0) { akt = { punkte: [p(daten[k + 1], daten[k + 2])], zu: false }; pfade.push(akt); k += 3; }
        else if (code === 1) { akt?.punkte.push(p(daten[k + 1], daten[k + 2])); k += 3; }
        else if (code === 2) { akt?.punkte.push(p(daten[k + 5], daten[k + 6])); k += 7; } // Kurve: nur Endpunkt
        else if (code === 3) { akt?.punkte.push(p(daten[k + 3], daten[k + 4])); k += 5; }
        else if (code === 4) { if (akt) akt.zu = true; k += 1; }
        else break;
      }
      for (const pf of pfade) {
        if (pf.punkte.length < 2) continue;
        if (gefuellt && pf.punkte.length >= 3) flaechen.push({ layer: `Füllfarbe ${fuell}`, farbe: fuell, punkte: pf.punkte });
        else if (gestrichen) for (let k = 0; k + 1 < pf.punkte.length; k++) linien.push({ layer: "", p1: pf.punkte[k], p2: pf.punkte[k + 1] });
      }
    }
  }
  return { linien, flaechen };
}

// ── Texte ───────────────────────────────────────────────────────────────
// items: getTextContent().items → [{ text, x, y, h }]; nebeneinander stehende
// Stücke derselben Zeile werden zusammengefügt ("F:" "23,45" "m²").
export function texteZusammenfassen(items) {
  const roh = (items || []).filter(t => t.str !== undefined && t.str.trim())
    .map(t => ({ text: t.str, x: t.transform[4], y: t.transform[5], h: Math.hypot(t.transform[2], t.transform[3]) || 10, w: t.width || 0 }));
  const zeilen = [];
  for (const t of roh.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const z = zeilen.find(l => Math.abs(l.y - t.y) < t.h * 0.3 && t.x >= l.x && t.x - (l.x + l.w) < t.h * 1.2);
    if (z) { z.text += (t.x - (z.x + z.w) > t.h * 0.15 && !/\s$/.test(z.text) ? " " : "") + t.text; z.w = t.x + t.w - z.x; }
    else zeilen.push({ ...t });
  }
  return zeilen.map(z => ({ text: z.text.replace(/\s+/g, " ").trim(), x: z.x, y: z.y, h: z.h, w: z.w })).filter(z => z.text);
}

// "M 1:100", "Maßstab 1 : 50", "M1:200"
export function massstabFinden(texte) {
  for (const t of texte) {
    const m = String(t.text).match(/\b(?:M|Maßstab|Massstab|Mst\.?)\s*[:.]?\s*1\s*:\s*(\d{1,4})\b/i);
    if (m) return Number(m[1]);
  }
  return null;
}

const zahl = s => Number(String(s).replace(/\./g, "").replace(",", "."));
const FLAECHE_RE = /(?:^|\s)(?:(NGF|NUF|NF|BGF|F|A|Fläche|Flaeche)\s*[:=]?\s*)?(\d{1,5}(?:[.,]\d{1,3})?)\s*m(?:²|2)(?![\p{L}\p{N}])/iu;
const UMFANG_RE = /(?:^|\s)U\s*[:=]?\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*m(?![\p{L}\p{N}²])/iu;

// Raumstempel: Flächenangabe + nächster Name darüber (oder links davon).
export function raumstempelLesen(texte) {
  const raeume = [];
  const istName = t => /\p{L}{3,}/u.test(t.text) && !FLAECHE_RE.test(t.text) && !UMFANG_RE.test(t.text)
    && !/^(LH|RH|OKFF|OKRF|UKRD|FB|BRH|M\s*1)/i.test(t.text) && t.text.length <= 40;
  for (const t of texte) {
    const f = t.text.match(FLAECHE_RE);
    if (!f) continue;
    // Name in derselben Zeile vor der Flächenangabe?
    let name = t.text.slice(0, f.index).replace(/[:\-–]+$/, "").trim();
    if (!/\p{L}{3,}/u.test(name)) {
      const kand = texte.filter(n => n !== t && istName(n) && n.y > t.y - t.h * 0.3 && n.y - t.y < t.h * 4 && Math.abs(n.x - t.x) < t.h * 8)
        .sort((a, b) => (a.y - t.y) + Math.abs(a.x - t.x) * 0.3 - ((b.y - t.y) + Math.abs(b.x - t.x) * 0.3));
      name = kand[0]?.text || "";
    }
    const umfangText = texte.find(u => u !== t && UMFANG_RE.test(u.text) && Math.abs(u.x - t.x) < t.h * 6 && t.y - u.y >= -t.h * 0.3 && t.y - u.y < t.h * 3);
    const um = (t.text.match(UMFANG_RE) || umfangText?.text.match(UMFANG_RE));
    const flaeche = zahl(f[2]);
    if (!(flaeche > 0) || flaeche > 100000) continue;
    raeume.push({ raum: name || "Raum", flaeche, umfang: um ? zahl(um[1]) : null, art: (f[1] || "").toUpperCase() || null, x: t.x, y: t.y });
  }
  return raeume;
}

export function raumstempelAlsText(raeume, dateiname = "") {
  if (!raeume.length) return "";
  const z = n => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  const summe = raeume.reduce((s, r) => s + r.flaeche, 0);
  return `Raumstempel aus dem Plan ${dateiname} (Flächen aus dem Plantext, nicht nachgemessen):\n`
    + raeume.map(r => `- ${r.raum}: ${z(r.flaeche)} m²${r.umfang ? `, Umfang ${z(r.umfang)} m` : ""}`).join("\n")
    + `\nSumme: ${z(summe)} m² in ${raeume.length} Räumen`;
}

// Kollineare Linienstücke (gestrichelte Achsen, als Einzelstriche exportiert) verbinden.
export function linienVerbinden(linien, toleranz = 1) {
  const gruppen = new Map();
  for (const l of linien) {
    const dx = l.p2.x - l.p1.x, dy = l.p2.y - l.p1.y, len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let ux = dx / len, uy = dy / len;
    if (ux < -1e-9 || (Math.abs(ux) < 1e-9 && uy < 0)) { ux = -ux; uy = -uy; }
    const winkel = Math.round(Math.atan2(uy, ux) * 180 / Math.PI * 4) / 4;
    const abstand = Math.round((-uy * l.p1.x + ux * l.p1.y) / toleranz);
    const key = `${winkel}|${abstand}`;
    const t1 = ux * l.p1.x + uy * l.p1.y, t2 = ux * l.p2.x + uy * l.p2.y;
    const g = gruppen.get(key) || { ux, uy, off: -uy * l.p1.x + ux * l.p1.y, stuecke: [], layer: l.layer };
    g.stuecke.push([Math.min(t1, t2), Math.max(t1, t2)]);
    gruppen.set(key, g);
  }
  const aus = [];
  for (const g of gruppen.values()) {
    g.stuecke.sort((a, b) => a[0] - b[0]);
    const laenge = g.stuecke.reduce((s, [a, b]) => s + b - a, 0);
    let [a, b] = g.stuecke[0];
    const fertig = () => aus.push({ layer: g.layer, p1: { x: g.ux * a - g.uy * g.off, y: g.uy * a + g.ux * g.off }, p2: { x: g.ux * b - g.uy * g.off, y: g.uy * b + g.ux * g.off }, stuecke: g.stuecke.length, laenge });
    for (const [c, d] of g.stuecke.slice(1)) {
      // Lücken bis 15 % der bisherigen Länge (Strichpunkt-Muster) überbrücken
      if (c - b <= Math.max(toleranz * 5, (b - a) * 0.15)) b = Math.max(b, d);
      else { fertig(); [a, b] = [c, d]; }
    }
    fertig();
  }
  return aus;
}

// Objekte (PDF-Punkte) → Meter mit Maßstab. Ergebnis passt zu dxfRasterAuswerten().
export function pdfObjekteInMeter({ linien, flaechen, texte }, massstab) {
  const f = PT_IN_MM / 1000 * massstab;
  const m = p => ({ x: p.x * f, y: p.y * f });
  return {
    linien: linienVerbinden(linien, 0.5).map(l => ({ ...l, p1: m(l.p1), p2: m(l.p2) })),
    flaechen: flaechen.map(fl => ({ ...fl, punkte: fl.punkte.map(m) })),
    texte: texte.map(t => ({ ...t, ...m(t) })),
  };
}

// ── Browser: Datei lesen ────────────────────────────────────────────────
export async function pdfPlanLesen(datei, seite = 1) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: workerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await datei.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(Math.min(seite, doc.numPages));
    const ops = await page.getOperatorList();
    const geo = pdfOperatorenAuswerten(ops, pdfjs.OPS);
    const texte = texteZusammenfassen((await page.getTextContent()).items);
    return { ...geo, texte, seiten: doc.numPages, massstab: massstabFinden(texte), raeume: raumstempelLesen(texte) };
  } finally {
    doc.destroy();
  }
}
