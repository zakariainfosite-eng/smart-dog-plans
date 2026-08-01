import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";

export function exportTableExcel(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
) {
  const workbook = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(workbook, ws, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename);
}

export function exportTablePdf(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
) {
  const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? "landscape" : "portrait" });
  let y = 14;
  const line = (text: string, size = 9) => {
    if (y > 190) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(size);
    doc.text(text, 14, y);
    y += size >= 12 ? 8 : 5;
  };

  line(title, 14);
  line(headers.join("  |  "), 8);
  for (const row of rows) {
    line(row.map(String).join("  |  "), 8);
  }
  doc.save(filename);
}
