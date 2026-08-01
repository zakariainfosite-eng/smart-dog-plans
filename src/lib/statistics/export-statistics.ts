import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import type { TFunction } from "i18next";
import type { StatisticsPayload } from "@/lib/statistics/types";
import { formatKg } from "@/lib/operational-case-stats";

function sheetFromLabelCounts(title: string, rows: { label: string; value: number }[]) {
  return {
    name: title.slice(0, 31),
    data: [["Label", "Value"], ...rows.map((r) => [r.label, r.value])],
  };
}

export function exportStatisticsExcel(
  data: StatisticsPayload,
  filename = "statistiques.xlsx",
  t?: TFunction,
) {
  const label = (key: string, fallback: string) => (t ? t(key) : fallback);
  const sheets = [
    sheetFromLabelCounts("KPIs", [
      { label: label("statistics.kpi.totalAgents", "Total Cynotechniciens"), value: data.kpis.totalAgents },
      { label: label("statistics.kpi.activeAgents", "Active Cynotechniciens"), value: data.kpis.activeAgents },
      { label: label("statistics.kpi.inactiveAgents", "Inactive Cynotechniciens"), value: data.kpis.inactiveAgents },
      { label: "Total Dogs", value: data.kpis.totalDogs },
      { label: "Available Dogs", value: data.kpis.availableDogs },
      { label: "Excluded Dogs", value: data.kpis.excludedDogs },
      { label: "Operational Cases", value: data.kpis.totalOperationalCases },
      { label: "Exclusions", value: data.kpis.totalExclusions },
      { label: "Planning", value: data.kpis.totalPlanning },
      { label: "Checkpoints", value: data.kpis.totalCheckpoints },
      { label: "Sections", value: data.kpis.totalSections },
    ]),
    sheetFromLabelCounts("Cases by Month", data.operationalCases.byMonth.map((m) => ({ label: m.label, value: m.value }))),
    sheetFromLabelCounts("Cases by Specialty", data.operationalCases.bySpecialty),
    sheetFromLabelCounts("Seizures kg", [
      { label: "Cannabis", value: data.operationalCases.seizures.cannabisKg },
      { label: "Hashish", value: data.operationalCases.seizures.hashishKg },
      { label: "Cocaine", value: data.operationalCases.seizures.cocaineKg },
      { label: "Heroin", value: data.operationalCases.seizures.heroinKg },
      { label: "Synthetic", value: data.operationalCases.seizures.syntheticDrugsKg },
    ]),
    sheetFromLabelCounts("Planning by Month", data.planning.byMonth.map((m) => ({ label: m.label, value: m.value }))),
    sheetFromLabelCounts("Exclusions by Reason", data.exclusions.byReason),
    sheetFromLabelCounts(
      label("statistics.rankings.topAgents", "Top Cynotechniciens"),
      data.rankings.topAgents,
    ),
    sheetFromLabelCounts("Top Dogs", data.rankings.topDogs),
  ];

  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }
  XLSX.writeFile(workbook, filename);
}

export function exportStatisticsPdf(
  data: StatisticsPayload,
  title: string,
  filename = "statistiques.pdf",
  t?: TFunction,
) {
  const label = (key: string, fallback: string) => (t ? t(key) : fallback);
  const doc = new jsPDF();
  let y = 14;
  const line = (text: string, size = 10) => {
    if (y > 280) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(size);
    doc.text(text, 14, y);
    y += size === 14 ? 8 : 6;
  };

  line(title, 14);
  line(`Period: ${data.range.from} → ${data.range.to}`, 9);
  y += 4;

  line("Global KPIs", 12);
  line(
    `${label("statistics.kpi.totalAgents", "Total Cynotechniciens")}: ${data.kpis.totalAgents} (${data.kpis.activeAgents})`,
  );
  line(`Dogs: ${data.kpis.totalDogs} (${data.kpis.availableDogs} available)`);
  line(`Operational cases: ${data.kpis.totalOperationalCases}`);
  line(`Exclusions: ${data.kpis.totalExclusions}`);
  line(`Planning: ${data.kpis.totalPlanning}`);
  y += 4;

  line("Seizures (kg)", 12);
  line(`Cannabis: ${formatKg(data.operationalCases.seizures.cannabisKg)} kg`);
  line(`Hashish: ${formatKg(data.operationalCases.seizures.hashishKg)} kg`);
  line(`Cocaine: ${formatKg(data.operationalCases.seizures.cocaineKg)} kg`);
  line(`Heroin: ${formatKg(data.operationalCases.seizures.heroinKg)} kg`);
  line(`Synthetic: ${formatKg(data.operationalCases.seizures.syntheticDrugsKg)} kg`);
  y += 4;

  line(label("statistics.rankings.topAgents", "Top Cynotechniciens"), 12);
  for (const row of data.rankings.topAgents.slice(0, 10)) {
    line(`${row.label}: ${row.value}`);
  }

  doc.save(filename);
}
