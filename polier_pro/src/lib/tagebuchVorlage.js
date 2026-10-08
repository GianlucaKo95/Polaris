import { dataUrlZuBild } from "./docxUtils.js";

const GELB = "F5C400";
const GRAU = "666666";

// Generiert das Bautagebuch komplett neu aus sauberen Bausteinen (Firmen-
// daten, Berichtsdaten, KI/Admin-bestätigte Vorlagen-Textbausteine) über die
// docx-Bibliothek — bearbeitet NIE eine hochgeladene Originaldatei. Gleiches
// Prinzip wie erzeugeAngebotDocx: das Ergebnis ist unabhängig vom Original
// immer eine frisch gebaute, valide .docx.
//
// docx dynamisch statt statisch importiert (siehe erzeugeAngebotDocx für
// die Begründung) — deshalb stehen abschnittsTitel/zeile hier als Closures
// statt als Modul-Top-Level-Funktionen, da sie Paragraph/TextRun aus dem
// dynamischen Import brauchen.
export async function erzeugeBerichtDocx({ bericht: b, projekt, eigeneFirma, wetter, tagebuchVorlage }) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun } = await import("docx");

  function abschnittsTitel(text) {
    return new Paragraph({
      children: [new TextRun({ text: text.toUpperCase(), bold:true, color:GELB, size:20 })],
      spacing: { before:200, after:80 },
    });
  }

  function zeile(text, opts = {}) {
    return new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 80 } });
  }

  const v = tagebuchVorlage || {};
  const labels = {
    taetigkeit:     v.label_taetigkeit || "Tätigkeiten",
    besonderheiten: v.label_besonderheiten || "Besonderheiten / Mängel",
    material:       v.label_material || "Materiallieferungen",
    personal:       v.label_personal || "Personal & Stunden",
  };

  const bild = dataUrlZuBild(eigeneFirma?.logo);
  const headerZeile = [];
  if (bild) {
    headerZeile.push(new ImageRun({
      type: bild.typ, data: bild.bytes,
      transformation: { width: 55, height: 55 },
    }));
  }

  const kinder = [
    new Paragraph({
      children: [...headerZeile, new TextRun({ text: "  " + (eigeneFirma?.name || "Polaris"), bold:true, size:32 })],
    }),
    new Paragraph({
      children: [new TextRun({
        text: [eigeneFirma?.strasse, [eigeneFirma?.plz, eigeneFirma?.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
        color: GRAU, size:18,
      })],
      spacing: { after: 300 },
    }),

    new Paragraph({ children: [new TextRun({ text:"Bautagebuch", bold:true, size:36 })] }),
    new Paragraph({ children: [new TextRun({ text:`Datum: ${b.datum || new Date().toLocaleDateString("de-DE")}`, color:GRAU, size:18 })] }),
    new Paragraph({ children: [new TextRun({ text:`Projekt: ${projekt?.name || "—"}`, color:GRAU, size:18 })] }),
    new Paragraph({ children: [new TextRun({ text:`Bauleiter: ${projekt?.bauleiter || "—"} · Auftraggeber: ${projekt?.auftraggeber || "—"}`, color:GRAU, size:18 })], spacing:{ after:150 } }),
  ];

  if (v.intro_text) {
    kinder.push(...v.intro_text.split("\n").map(z => zeile(z, { size:18, color:GRAU })));
  }

  if (wetter) {
    kinder.push(abschnittsTitel("Witterungsverhältnisse"));
    kinder.push(zeile(`Temperatur: ${wetter.temp}°C · Wind: ${wetter.wind} km/h · Niederschlag: ${wetter.rain} mm`));
  }

  kinder.push(abschnittsTitel(labels.taetigkeit));
  kinder.push(zeile(b.taetigkeit || "—"));

  if (b.besonderheiten) {
    kinder.push(abschnittsTitel(labels.besonderheiten));
    kinder.push(zeile(b.besonderheiten));
  }

  if (b.material) {
    kinder.push(abschnittsTitel(labels.material));
    kinder.push(zeile(b.material));
  }

  kinder.push(abschnittsTitel(labels.personal));
  if (b.kolonnen?.length > 0) {
    b.kolonnen.forEach(k => {
      kinder.push(zeile(`${k.name}: ${k.mitarbeiter?.length || 0} Personen · ${k.stunden ? k.stunden.toFixed(1) + " h" : "—"}`));
    });
    const gesamtStunden = b.kolonnen.reduce((s,k) => s + (k.stunden || 0), 0);
    kinder.push(zeile(`Gesamt: ${b.arbeiter || 0} Personen · ${gesamtStunden.toFixed(1)} h`, { bold:true }));
  } else {
    kinder.push(zeile(`Arbeiter gesamt: ${b.arbeiter || 0} · Mängel: ${b.maengel || 0}`));
  }

  const fotos = (b.bilder || []).slice(0, 6).map(dataUrlZuBild).filter(Boolean);
  if (fotos.length > 0) {
    kinder.push(abschnittsTitel(`Fotodokumentation (${fotos.length} Fotos)`));
    fotos.forEach(f => {
      kinder.push(new Paragraph({
        children: [new ImageRun({ type: f.typ, data: f.bytes, transformation: { width: 200, height: 150 } })],
        spacing: { after: 100 },
      }));
    });
  }

  if (v.footer_text) {
    kinder.push(new Paragraph({ text:"", spacing:{ before:200 } }));
    kinder.push(...v.footer_text.split("\n").map(z => zeile(z, { size:18, color:GRAU })));
  }

  kinder.push(new Paragraph({ text:"", spacing:{ before:300 } }));
  kinder.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [new TextRun({ text: `Polier: ${eigeneFirma?.geschaeftsfuehrer || "____________________"}     Bauleiter: ${projekt?.bauleiter || "____________________"}`, size:18 })],
  }));

  const doc = new Document({ sections: [{ children: kinder }] });
  return Packer.toBlob(doc);
}
