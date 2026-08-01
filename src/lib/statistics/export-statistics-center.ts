import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import type { TFunction } from "i18next";
import type { OperationalIntelligencePayload } from "@/lib/statistics/statistics-center-types";

type SheetDef = { name: string; data: (string | number)[][] };

function sheetFromRows(name: string, headers: string[], rows: (string | number)[][]): SheetDef {
  return { name: name.slice(0, 31), data: [headers, ...rows] };
}

/** @deprecated Per-table export is preferred via export-table.ts */
export function exportStatisticsCenterExcel(
  data: OperationalIntelligencePayload,
  t: TFunction,
  filename = "statistiques-operationnelles.xlsx",
) {
  const sheets: SheetDef[] = [
    sheetFromRows(
      t("statistics.intelligence.sections.annualSummary"),
      [t("statistics.intelligence.columns.metric"), t("statistics.intelligence.columns.annualTotal"), t("statistics.intelligence.columns.monthlyAverage")],
      data.annualMetrics.map((row) => [row.id, row.annualTotal, row.monthlyAverage]),
    ),
    sheetFromRows(
      t("statistics.intelligence.sections.monthlyActivity"),
      [
        t("statistics.intelligence.columns.month"),
        t("statistics.intelligence.columns.planning"),
        t("statistics.intelligence.columns.assignments"),
        t("statistics.intelligence.columns.cases"),
      ],
      data.monthlyActivity.map((row) => [row.monthLabel, row.generatedPlanning, row.assignments, row.operationalCases]),
    ),
    sheetFromRows(
      t("statistics.intelligence.sections.topAgents"),
      [t("statistics.intelligence.columns.rank"), t("statistics.intelligence.columns.name"), t("statistics.intelligence.columns.missions")],
      data.topAgents.map((row) => [row.rank, row.name, row.missions]),
    ),
  ];

  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }
  XLSX.writeFile(workbook, filename);
}

/** @deprecated Per-table export is preferred via export-table.ts */
export function exportStatisticsCenterPdf(
  data: OperationalIntelligencePayload,
  t: TFunction,
  title: string,
  filename = "statistiques-operationnelles.pdf",
) {
  const doc = new jsPDF({ orientation: "landscape" });
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
  line(`${data.year} — ${data.detailRange.from} → ${data.detailRange.to}`, 8);
  line(t("statistics.intelligence.sections.annualSummary"), 11);
  for (const row of data.annualMetrics) {
    line(`${row.id}: ${row.annualTotal} (avg ${row.monthlyAverage})`, 8);
  }
  doc.save(filename);
}
