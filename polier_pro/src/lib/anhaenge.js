// Datei → Anthropic-Content-Block (KI-Assistent und Copilot). Fotos werden auf max. 1600 px verkleinert
// und als JPEG gesendet (Handyfotos haben sonst 5–10 MB und werden in jeder
// Agenten-Runde erneut übertragen); PDFs gehen unverändert als Dokument.
const MAX_PDF_BYTES = 8 * 1024 * 1024;
function base64AusDataUrl(url) { return url.slice(url.indexOf(",") + 1); }
export async function anhangAusDatei(datei) {
  // BIM-Modell: Mengen je Bauteil auslesen (lib/ifcMengen.js) und als Text
  // an die KI geben — das Modell selbst wäre für die KI nicht lesbar.
  if (/\.ifc$/i.test(datei.name)) {
    const { ifcMengenAusDatei } = await import("./ifcLaden.js");
    const { text, gruppen } = await ifcMengenAusDatei(datei);
    if (!gruppen.length) throw new Error(`${datei.name}: keine Bauteile mit Mengen gefunden.`);
    return { name: datei.name, block: { type: "text", text } };
  }
  if (datei.type === "application/pdf") {
    if (datei.size > MAX_PDF_BYTES) throw new Error(`${datei.name} ist größer als 8 MB.`);
    const url = await new Promise((ok, fehler) => {
      const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fehler; r.readAsDataURL(datei);
    });
    const block = { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64AusDataUrl(url) } };
    // Pläne: Raumstempel (Name + m²) zusätzlich als exakten Text mitgeben,
    // damit die KI Flächen nicht aus dem Bild schätzt (lib/pdfPlan.js).
    try {
      const { pdfPlanLesen, raumstempelAlsText } = await import("./pdfPlan.js");
      const plan = await pdfPlanLesen(datei);
      if (plan.raeume.length) return { name: datei.name, bloecke: [block, { type: "text", text: raumstempelAlsText(plan.raeume, datei.name) }] };
    } catch { /* kein auswertbarer Vektorplan */ }
    return { name: datei.name, block };
  }
  if (!datei.type.startsWith("image/")) throw new Error(`${datei.name}: nur Fotos und PDFs möglich.`);
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, 1600 / Math.max(bild.width, bild.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bild.width * faktor); canvas.height = Math.round(bild.height * faktor);
  canvas.getContext("2d").drawImage(bild, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { name: datei.name, vorschau: url, block: { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64AusDataUrl(url) } } };
}

