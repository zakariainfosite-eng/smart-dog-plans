import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import type { CaseHistoryRow } from "@/lib/statistics/operational-cases-history";
import type { TFunction } from "i18next";
import {
  caseHistoryQuantity,
  caseHistorySeizureLabel,
  caseHistoryStatusLabel,
  caseHistoryUnit,
} from "@/lib/statistics/operational-cases-history";
import { checkpointLabel } from "@/lib/operational-case-api";

function rowToExportRecord(row: CaseHistoryRow, t: TFunction) {
  return {
    [t("operationalCases.table.date")]: row.case_date,
    [t("operationalCases.table.caseNumber")]: row.case_number,
    [t("operationalCases.table.agent")]: row.agent ? `${row.agent.first_name} ${row.agent.last_name}` : "—",
    [t("operationalCases.table.dog")]: row.dog?.name ?? "—",
    [t("operationalCases.table.specialty")]: caseHistoryStatusLabel(row, t),
    [t("operationalCases.table.checkpoint")]: checkpointLabel(row),
    [t("operationalCases.table.location")]: row.location ?? "—",
    [t("statistics.casesHistory.table.seizureObject")]: caseHistorySeizureLabel(row, t),
    [t("operationalCases.table.quantity")]: caseHistoryQuantity(row),
    [t("operationalCases.field.unit")]: caseHistoryUnit(row, t),
    [t("common.status")]: caseHistoryStatusLabel(row, t),
  };
}

export function exportCaseHistoryExcel(
  rows: CaseHistoryRow[],
  t: TFunction,
  filename = "historique-affaires.xlsx",
) {
  const data = rows.map((row) => rowToExportRecord(row, t));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Affaires");
  XLSX.writeFile(wb, filename);
}

export function exportCaseHistoryPdf(
  rows: CaseHistoryRow[],
  t: TFunction,
  title: string,
  filename = "historique-affaires.pdf",
) {
  const doc = new jsPDF({ orientation: rows.length > 0 ? "landscape" : "portrait" });
  let y = 14;
  doc.setFontSize(14);
  doc.text(title, 14, y);
  y += 8;
  doc.setFontSize(9);
  doc.text(`${t("statistics.casesHistory.export.count")}: ${rows.length}`, 14, y);
  y += 10;

  for (const row of rows.slice(0, 40)) {
    if (y > 190) {
      doc.addPage();
      y = 14;
    }
    const line = `${row.case_date} · ${row.case_number} · ${row.agent ? `${row.agent.first_name} ${row.agent.last_name}` : "—"} · ${checkpointLabel(row)}`;
    doc.text(line.slice(0, 120), 14, y);
    y += 6;
  }

  if (rows.length > 40) {
    y += 4;
    doc.text(`… +${rows.length - 40} ${t("statistics.casesHistory.export.more")}`, 14, y);
  }

  doc.save(filename);
}
