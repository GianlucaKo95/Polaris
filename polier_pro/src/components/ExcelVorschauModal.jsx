import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { VorschauModal } from "./VorschauModal.jsx";

// Vorschau für eine selbst erzeugte .xlsx (Stunden-Export) vor dem Download
// — analog zu DocxVorschauModal, nur dass hier nichts geparst werden muss:
// rows kommt bereits exakt in der Struktur rein, die auch an writeXlsxFile
// übergeben wird (Array von Zeilen aus {value,type,fontWeight,columnSpan}
// oder null für von einem columnSpan "verdeckte" Spalten), die Vorschau-
// Tabelle liest also 1:1, was später in der Datei steht.
export function ExcelVorschauModal({ rows, columns, dateiname, eigeneFirma, onClose }) {
  const offen = !!rows;
  const [laedt, setLaedt] = useState(false);

  async function herunterladen() {
    if (laedt) return;
    setLaedt(true);
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      await writeXlsxFile(rows, { columns }).toFile(dateiname);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <VorschauModal offen={offen} titel={dateiname} Icon={FileSpreadsheet} eigeneFirma={eigeneFirma}
      onClose={onClose} letterhead downloadLabel={laedt ? "Wird erzeugt…" : "Als Excel herunterladen"}
      onDownload={herunterladen}>
      {/* Die Tabelle hat 10 Spalten mit teils langem Freitext (Projekt,
          Adresse, Notiz) — auf Handybreite passt das nie nebeneinander.
          Eigener Scroll-Container statt feste %-Spaltenbreiten: table-layout
          bleibt "auto", also bestimmt ohnehin der Inhalt (whiteSpace:nowrap)
          die tatsächliche Breite, %-Breiten auf <col> würden dagegen nur bei
          table-layout:fixed greifen und hier nichts bewirken. So bleibt die
          Tabelle vollständig sichtbar, nur eben seitlich scrollbar statt
          rechts einfach abgeschnitten. */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", maxWidth: "100%" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
          <tbody>
            {(rows || []).map((zeile, i) => {
              const zellen = zeile.filter(Boolean);
              if (zellen.length === 0) {
                return <tr key={i}><td style={{ padding: "6px 0" }}>&nbsp;</td></tr>;
              }
              return (
                <tr key={i}>
                  {zellen.map((z, j) => (
                    <td key={j} colSpan={z.columnSpan || 1}
                      style={{
                        border: "1px solid #ddd", padding: "5px 8px",
                        fontWeight: z.fontWeight === "bold" ? 700 : 400,
                        textAlign: z.type === Number ? "right" : "left",
                        whiteSpace: "nowrap",
                      }}>
                      {z.type === Number && typeof z.value === "number" ? z.value.toLocaleString("de-DE") : String(z.value ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </VorschauModal>
  );
}
