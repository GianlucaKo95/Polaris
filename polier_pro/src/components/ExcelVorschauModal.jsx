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

  const gesamtBreite = (columns || []).reduce((s, c) => s + (c.width || 10), 0) || 1;

  return (
    <VorschauModal offen={offen} titel={dateiname} Icon={FileSpreadsheet} eigeneFirma={eigeneFirma}
      onClose={onClose} letterhead downloadLabel={laedt ? "Wird erzeugt…" : "Als Excel herunterladen"}
      onDownload={herunterladen}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
        {columns?.length > 0 && (
          <colgroup>
            {columns.map((c, i) => (
              <col key={i} style={{ width: `${((c.width || 10) / gesamtBreite) * 100}%` }} />
            ))}
          </colgroup>
        )}
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
    </VorschauModal>
  );
}
