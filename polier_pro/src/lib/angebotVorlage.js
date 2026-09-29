import mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ImageRun, BorderStyle } from "docx";

// Liest NUR den Text einer hochgeladenen .docx-Datei aus (read-only) — wird
// einmalig beim Hochladen einer Vorlage an die KI geschickt, damit sie
// Textbausteine vorschlagen kann. Die Datei selbst wird nie gespeichert
// oder weiterverarbeitet; nach der Analyse ist sie nicht mehr nötig, weil
// das eigentliche Angebots-Dokument später sauber neu generiert wird
// (siehe erzeugeAngebotDocx unten), statt diese Datei zu bearbeiten.
export async function extrahiereDocxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

function dataUrlZuBild(dataUrl) {
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

const GELB = "F5C400";
const DUNKEL = "1A1A1A";
const GRAU = "666666";

// Generiert das Angebots-Dokument komplett neu aus sauberen Bausteinen
// (Firmendaten, Angebotsdaten, KI/Admin-bestätigte Vorlagen-Textbausteine)
// über die docx-Bibliothek — bearbeitet NIE eine hochgeladene Originaldatei.
// So kann ein beliebiger Vorlagen-Upload nie ein defektes/unöffenbares
// Angebot erzeugen, weil das Ergebnis unabhängig vom Original immer eine
// frisch gebaute, valide .docx ist.
export async function erzeugeAngebotDocx({ angebot: a, projekt, eigeneFirma, angebotVorlage }) {
  const gpOf = p => (p.menge||0) * (p.ep||0) * (1 - (p.rabatt||0)/100);
  const netto = a.positionen.reduce((s,p)=>s+gpOf(p),0);
  const rabattBetrag = netto * (a.rabatt||0)/100;
  const nettoNachRabatt = netto - rabattBetrag;
  const mwstBetrag = nettoNachRabatt * (a.mwst||19)/100;
  const bruttoGesamt = nettoNachRabatt + mwstBetrag;

  const v = angebotVorlage || {};
  const spalten = {
    bez:     v.spalte_bez || "Bezeichnung",
    menge:   v.spalte_menge || "Menge",
    einheit: v.spalte_einheit || "Einheit",
    ep:      v.spalte_ep || "EP (€)",
    gp:      v.spalte_gp || "GP (€)",
  };

  const bild = dataUrlZuBild(eigeneFirma?.logo);

  const headerZeile = [];
  if (bild) {
    headerZeile.push(new ImageRun({
      type: bild.typ, data: bild.bytes,
      transformation: { width: 60, height: 60 },
    }));
  }

  function zelle(text, { bold, farbe, hintergrund, ausrichtung } = {}) {
    return new TableCell({
      width: { size: 20, type: WidthType.PERCENTAGE },
      shading: hintergrund ? { fill: hintergrund } : undefined,
      children: [new Paragraph({
        alignment: ausrichtung || AlignmentType.LEFT,
        children: [new TextRun({ text: String(text ?? ""), bold, color: farbe })],
      })],
    });
  }

  const tabelle = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          zelle(spalten.bez, { bold:true, farbe:GELB, hintergrund:DUNKEL }),
          zelle(spalten.menge, { bold:true, farbe:GELB, hintergrund:DUNKEL }),
          zelle(spalten.einheit, { bold:true, farbe:GELB, hintergrund:DUNKEL }),
          zelle(spalten.ep, { bold:true, farbe:GELB, hintergrund:DUNKEL }),
          zelle(spalten.gp, { bold:true, farbe:GELB, hintergrund:DUNKEL }),
        ],
      }),
      ...a.positionen.map(p => new TableRow({
        children: [
          zelle(p.bez),
          zelle((p.menge||0).toLocaleString("de-DE")),
          zelle(p.einheit),
          zelle((p.ep||0).toLocaleString("de-DE",{minimumFractionDigits:2})),
          zelle(gpOf(p).toLocaleString("de-DE",{minimumFractionDigits:2}), { bold:true }),
        ],
      })),
    ],
  });

  const introText = v.intro_text || "Sehr geehrte Damen und Herren,\n\nhiermit unterbreiten wir Ihnen folgendes Angebot:";
  const footerText = v.footer_text
    || `Dieses Angebot ist gültig bis ${new Date(a.gueltig_bis).toLocaleDateString("de-DE")}. Alle Preise verstehen sich zzgl. ${a.mwst}% MwSt. Zahlungsbedingungen: 14 Tage netto.`;

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [
            ...headerZeile,
            new TextRun({ text: "  " + (eigeneFirma?.name || "Polaris"), bold:true, size:32 }),
          ],
        }),
        new Paragraph({
          children: [new TextRun({
            text: [eigeneFirma?.strasse, [eigeneFirma?.plz, eigeneFirma?.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
            color: GRAU, size:18,
          })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: [eigeneFirma?.telefon && `Tel: ${eigeneFirma.telefon}`, eigeneFirma?.email].filter(Boolean).join(" · "),
            color: GRAU, size:18,
          })],
          spacing: { after: 300 },
        }),

        new Paragraph({ children: [new TextRun({ text:"Angebot", bold:true, size:36 })] }),
        new Paragraph({ children: [new TextRun({ text:`Datum: ${new Date(a.datum).toLocaleDateString("de-DE")}`, color:GRAU, size:18 })] }),
        new Paragraph({ children: [new TextRun({ text:`Gültig bis: ${new Date(a.gueltig_bis).toLocaleDateString("de-DE")}`, color:GRAU, size:18 })] }),
        new Paragraph({ children: [new TextRun({ text:`Projekt: ${projekt?.name || ""}`, color:GRAU, size:18 })], spacing: { after: 200 } }),

        new Paragraph({ children: [new TextRun({ text:`Angebot für: ${a.empfaenger || "—"}`, bold:true })], spacing: { after: 200 } }),

        ...introText.split("\n").map(z => new Paragraph({ children:[new TextRun(z)], spacing:{ after:100 } })),

        new Paragraph({ text:"", spacing:{ after:150 } }),
        tabelle,
        new Paragraph({ text:"", spacing:{ before:200, after:100 } }),

        new Paragraph({ alignment:AlignmentType.RIGHT, children:[new TextRun(`Nettobetrag: ${netto.toLocaleString("de-DE",{minimumFractionDigits:2})} €`)] }),
        ...(a.rabatt > 0 ? [new Paragraph({ alignment:AlignmentType.RIGHT, children:[new TextRun(`Rabatt ${a.rabatt}%: - ${rabattBetrag.toLocaleString("de-DE",{minimumFractionDigits:2})} €`)] })] : []),
        new Paragraph({ alignment:AlignmentType.RIGHT, children:[new TextRun(`MwSt. ${a.mwst}%: ${mwstBetrag.toLocaleString("de-DE",{minimumFractionDigits:2})} €`)] }),
        new Paragraph({ alignment:AlignmentType.RIGHT, children:[new TextRun({ text:`Gesamtbetrag: ${bruttoGesamt.toLocaleString("de-DE",{minimumFractionDigits:2})} €`, bold:true, size:26 })], spacing:{ after:300 } }),

        ...footerText.split("\n").map(z => new Paragraph({ children:[new TextRun({ text:z, color:GRAU, size:18 })], spacing:{ after:80 } })),
      ],
    }],
  });

  return Packer.toBlob(doc);
}
