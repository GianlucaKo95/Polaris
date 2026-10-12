// Liest NUR den Text einer hochgeladenen .docx-Datei aus (read-only) — wird
// einmalig beim Hochladen einer Vorlage an die KI geschickt, damit sie
// Textbausteine vorschlagen kann. Die Datei selbst wird nie gespeichert
// oder weiterverarbeitet; nach der Analyse ist sie nicht mehr nötig, weil
// das eigentliche Dokument später sauber neu generiert wird (siehe
// erzeugeAngebotDocx/erzeugeBerichtDocx), statt diese Datei zu bearbeiten.
//
// mammoth dynamisch statt statisch importiert: ein Top-Level-Import hätte
// die Bibliothek in JEDEN Seiten-Load eingebunden, obwohl Vorlagen-Upload
// nur Admins und nur gelegentlich nutzen — sie landet so stattdessen in
// einem eigenen Chunk, der nur bei tatsächlichem Gebrauch nachgeladen wird.
export async function extrahiereDocxText(file) {
  const { default: mammoth } = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

// Wandelt ein selbst erzeugtes .docx (Angebot/Bautagebuch, siehe
// erzeugeAngebotDocx/erzeugeBerichtDocx) in HTML für die Vorschau vor dem
// Download um. convertToHtml statt extractRawText (oben) — die Vorschau
// soll nach einem Word-Dokument aussehen (Absätze, Fett/Kursiv, Tabellen),
// nicht nach Fließtext ohne Struktur. mammoth bildet dafür nur die
// tatsächlichen docx-Formatierungselemente auf HTML-Tags ab; reiner
// Nutzertext aus den Positionen/Berichten landet unverändert als
// Text-Inhalt dieser Tags — deshalb ist das Ergebnis safe für
// dangerouslySetInnerHTML, obwohl es z.B. Angebotstexte enthält, die der
// Nutzer selbst eingegeben hat.
export async function erzeugeDocxVorschauHtml(blob) {
  const { default: mammoth } = await import("mammoth");
  const arrayBuffer = await blob.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value || "";
}

// Wandelt ein per FileReader.readAsDataURL geladenes Firmenlogo (so wird es
// app-weit gespeichert, siehe OnboardingFlow/FirmenView) in die Bytes um,
// die die docx-Bibliothek für ein ImageRun braucht.
export function dataUrlZuBild(dataUrl) {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const typRoh = match[1].toLowerCase();
  const typ = typRoh === "jpeg" ? "jpg" : typRoh;
  if (!["png","jpg","gif","bmp"].includes(typ)) return null;
  const binaer = atob(match[2]);
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i++) bytes[i] = binaer.charCodeAt(i);
  return { typ, bytes };
}
