import type { TFunction } from "i18next";
import type { OperationalCaseWithRelations } from "@/lib/operational-case-api";
import type { Database } from "@/integrations/database/schema-types";
import {
  drugTypeLabel,
  objectTypeLabel,
  caseSpecialtyLabel,
  seizureUnitLabel,
  formatSeizureDetails,
} from "@/lib/operational-cases";
import { checkpointLabel } from "@/lib/operational-case-api";
import {
  EXPLOSIVE_OBJECT_TYPES,
  NARCOTICS_DRUG_TYPES,
} from "@/lib/operational-case-form";

export type CaseHistoryAgent = OperationalCaseWithRelations["agent"] & {
  section_id?: string | null;
  sections?: { id: string; name: string } | null;
};

export type CaseHistoryRow = OperationalCaseWithRelations & {
  agent?: CaseHistoryAgent | null;
};

export type CaseHistoryFilters = {
  search: string;
  dateFrom: string;
  dateTo: string;
  year: string;
  month: string;
  agentId: string;
  dogId: string;
  specialty: string;
  status: string;
  sectionId: string;
  checkpointId: string;
  seizureType: string;
};

export const DEFAULT_CASE_HISTORY_FILTERS: CaseHistoryFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  year: "all",
  month: "all",
  agentId: "all",
  dogId: "all",
  specialty: "all",
  status: "all",
  sectionId: "all",
  checkpointId: "all",
  seizureType: "all",
};

export type CaseHistorySummary = {
  total: number;
  thisMonth: number;
  thisYear: number;
  narcotics: number;
  explosives: number;
  currency: number;
};

type SeizureFilter = (typeof NARCOTICS_DRUG_TYPES)[number] | (typeof EXPLOSIVE_OBJECT_TYPES)[number];

export function filterCaseHistoryRows(
  rows: CaseHistoryRow[],
  filters: CaseHistoryFilters,
): CaseHistoryRow[] {
  return rows.filter((row) => {
    if (filters.dateFrom && row.case_date < filters.dateFrom) return false;
    if (filters.dateTo && row.case_date > filters.dateTo) return false;

    if (filters.year !== "all" && !row.case_date.startsWith(`${filters.year}-`)) return false;

    if (filters.month !== "all") {
      const monthPart = row.case_date.slice(5, 7);
      if (monthPart !== filters.month) return false;
    }

    if (filters.agentId !== "all" && row.agent_id !== filters.agentId) return false;
    if (filters.dogId !== "all" && row.dog_id !== filters.dogId) return false;
    if (filters.specialty !== "all" && row.specialty !== filters.specialty) return false;
    if (filters.status !== "all" && row.specialty !== filters.status) return false;

    if (filters.sectionId !== "all" && row.agent?.section_id !== filters.sectionId) return false;
    if (filters.checkpointId !== "all" && row.checkpoint_id !== filters.checkpointId) return false;

    if (filters.seizureType !== "all") {
      const type = filters.seizureType as SeizureFilter;
      const narcoticsMatch = row.specialty === "narcotics" && row.seizure_type === type;
      const explosivesMatch = row.specialty === "explosives" && row.object_type === type;
      if (!narcoticsMatch && !explosivesMatch) return false;
    }

    const q = filters.search.trim().toLowerCase();
    if (q) {
      const hay = [
        row.case_number,
        row.location ?? "",
        checkpointLabel(row),
        row.agent ? `${row.agent.first_name} ${row.agent.last_name}` : "",
        row.dog?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

export function computeCaseHistorySummary(rows: CaseHistoryRow[]): CaseHistorySummary {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthPrefix = `${year}-${month}`;

  return {
    total: rows.length,
    thisMonth: rows.filter((r) => r.case_date.startsWith(monthPrefix)).length,
    thisYear: rows.filter((r) => r.case_date.startsWith(`${year}-`)).length,
    narcotics: rows.filter((r) => r.specialty === "narcotics").length,
    explosives: rows.filter((r) => r.specialty === "explosives").length,
    currency: rows.filter((r) => r.specialty === "currency").length,
  };
}

export function caseHistoryQuantity(row: CaseHistoryRow): string {
  if (row.specialty === "narcotics" && row.quantity != null) return String(row.quantity);
  if (row.specialty === "explosives" && row.object_count != null) return String(row.object_count);
  if (row.specialty === "currency" && row.total_amount != null) return String(row.total_amount);
  return "—";
}

export function caseHistoryUnit(row: CaseHistoryRow, t: TFunction): string {
  if (row.specialty === "narcotics") return seizureUnitLabel(row.unit, t);
  if (row.specialty === "explosives") return t("operationalCases.unit.pieces");
  if (row.specialty === "currency") return t("operationalCases.unit.banknotes");
  return "—";
}

export function caseHistorySeizureLabel(row: CaseHistoryRow, t: TFunction): string {
  return formatSeizureDetails(row, t);
}

export function caseHistoryStatusLabel(
  row: CaseHistoryRow,
  t: TFunction,
): string {
  return caseSpecialtyLabel(row.specialty, t);
}

export function seizureTypeOptions(t: TFunction) {
  return [
    ...NARCOTICS_DRUG_TYPES.map((type) => ({
      value: type,
      label: drugTypeLabel(type, t),
    })),
    ...EXPLOSIVE_OBJECT_TYPES.map((type) => ({
      value: type,
      label: objectTypeLabel(type, t),
    })),
  ];
}

export const STATISTICS_CASE_SELECT =
  "*, agent:agents(id, first_name, last_name, professional_number, section_id, sections(id, name)), dog:dog_id(id, name), checkpoint:checkpoint_id(id, name), attachments:operational_case_attachments(id, file_name, storage_path, file_size, mime_type, created_at)" as const;

export type OperationalCaseSpecialty = Database["public"]["Enums"]["operational_case_specialty"];

export const CASE_SPECIALTY_ORDER: OperationalCaseSpecialty[] = [
  "narcotics",
  "explosives",
  "currency",
];
