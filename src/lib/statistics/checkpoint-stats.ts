import type { Database } from "@/integrations/database/schema-types";
import {
  NARCOTICS_STAT_DRUG_TYPES,
  quantityToKg,
} from "@/lib/operational-case-stats";
import { countBy, sumByMonth, topN } from "@/lib/statistics/aggregate";
import type { LabelCount, MonthCount } from "@/lib/statistics/types";
import { toISODate } from "@/lib/statistics/date-range";
import { startOfMonth, startOfYear } from "date-fns";

export type OperationalCaseSpecialty = Database["public"]["Enums"]["operational_case_specialty"];
export type SeizureType = Database["public"]["Enums"]["seizure_type"];
export type ExplosiveObjectType = Database["public"]["Enums"]["explosive_object_type"];

export type CheckpointCaseRow = Database["public"]["Tables"]["operational_cases"]["Row"] & {
  agent?: {
    id: string;
    first_name: string;
    last_name: string;
    section_id: string | null;
  } | null;
  dog?: { id: string; name: string } | null;
  checkpoint?: { id: string; name: string } | null;
};

export type CheckpointPlanningAssignment = {
  id: string;
  agent_id: string;
  dog_id: string | null;
  planning: { id: string; planning_date: string; section_id: string | null } | null;
  checkpoint_posts: {
    id: string;
    checkpoint_id: string;
    specialty_required: Database["public"]["Enums"]["dog_specialty"];
    checkpoints: { id: string; name: string } | null;
  } | null;
};

export type CheckpointRow = {
  id: string;
  name: string;
  active: boolean;
};

export type CheckpointStatsFilters = {
  dateFrom: string;
  dateTo: string;
  year: string;
  month: string;
  specialty: "all" | OperationalCaseSpecialty;
  sectionId: string;
  checkpointId: string;
};

export const DEFAULT_CHECKPOINT_STATS_FILTERS: CheckpointStatsFilters = {
  dateFrom: "",
  dateTo: "",
  year: "all",
  month: "all",
  specialty: "all",
  sectionId: "all",
  checkpointId: "all",
};

export type CheckpointNarcoticsSeizures = {
  cannabisKg: number;
  hashishKg: number;
  cocaineKg: number;
  heroinKg: number;
  syntheticDrugsKg: number;
  khatKg: number;
};

export type CheckpointExplosivesSeizures = {
  firearms: number;
  bladedWeapons: number;
  grenades: number;
  detonators: number;
  explosiveMaterials: number;
  ammunition: number;
};

export type CheckpointCurrencySeizures = {
  totalAmount: number;
  banknotes: number;
  currencyTypes: string[];
};

export type CheckpointSeizureStats = {
  narcotics: CheckpointNarcoticsSeizures;
  explosives: CheckpointExplosivesSeizures;
  currency: CheckpointCurrencySeizures;
};

export type CheckpointAnalytics = {
  mostCommonSeizureType: string | null;
  mostActiveSpecialty: OperationalCaseSpecialty | null;
  mostActiveAgent: string | null;
  mostActiveDog: string | null;
  casesThisMonth: number;
  casesThisYear: number;
};

export type CheckpointStatRecord = {
  id: string;
  name: string;
  totalCases: number;
  totalPlanningAssignments: number;
  totalAgents: number;
  totalDogs: number;
  seizures: CheckpointSeizureStats;
  analytics: CheckpointAnalytics;
  cases: CheckpointCaseRow[];
  casesByMonth: MonthCount[];
  assignedAgents: { id: string; name: string }[];
  assignedDogs: { id: string; name: string }[];
};

export type CheckpointStatisticsPayload = {
  checkpoints: CheckpointStatRecord[];
  rankings: {
    byCases: LabelCount[];
    byNarcoticsKg: LabelCount[];
    byExplosiveCases: LabelCount[];
    byCurrencyCases: LabelCount[];
  };
  charts: {
    casesByCheckpoint: LabelCount[];
    seizureTypesByCheckpoint: Array<{ label: string; key: string; stacks: LabelCount[] }>;
    specialtyDistribution: LabelCount[];
  };
};

export type CheckpointStatisticsRaw = {
  checkpoints: CheckpointRow[];
  cases: CheckpointCaseRow[];
  assignments: CheckpointPlanningAssignment[];
  sectionNames: Map<string, string>;
};

function includesType(types: readonly string[], value: string | null): boolean {
  return value != null && types.includes(value);
}

function matchesDateFilters(caseDate: string, filters: CheckpointStatsFilters): boolean {
  if (filters.dateFrom && caseDate < filters.dateFrom) return false;
  if (filters.dateTo && caseDate > filters.dateTo) return false;
  if (filters.year !== "all" && !caseDate.startsWith(`${filters.year}-`)) return false;
  if (filters.month !== "all" && caseDate.slice(5, 7) !== filters.month) return false;
  return true;
}

function matchesAssignmentDate(date: string, filters: CheckpointStatsFilters): boolean {
  return matchesDateFilters(date, filters);
}

function filterCases(cases: CheckpointCaseRow[], filters: CheckpointStatsFilters): CheckpointCaseRow[] {
  return cases.filter((row) => {
    if (!matchesDateFilters(row.case_date, filters)) return false;
    if (filters.specialty !== "all" && row.specialty !== filters.specialty) return false;
    if (filters.sectionId !== "all" && row.agent?.section_id !== filters.sectionId) return false;
    if (filters.checkpointId !== "all" && row.checkpoint_id !== filters.checkpointId) return false;
    return true;
  });
}

function filterAssignments(
  assignments: CheckpointPlanningAssignment[],
  filters: CheckpointStatsFilters,
): CheckpointPlanningAssignment[] {
  return assignments.filter((row) => {
    const planningDate = row.planning?.planning_date;
    if (!planningDate || !matchesAssignmentDate(planningDate, filters)) return false;
    if (filters.sectionId !== "all" && row.planning?.section_id !== filters.sectionId) return false;
    const checkpointId = row.checkpoint_posts?.checkpoint_id;
    if (filters.checkpointId !== "all" && checkpointId !== filters.checkpointId) return false;
    if (filters.specialty === "narcotics" && row.checkpoint_posts?.specialty_required !== "narcotics") {
      return false;
    }
    if (filters.specialty === "explosives" && row.checkpoint_posts?.specialty_required !== "explosives") {
      return false;
    }
    return true;
  });
}

function computeNarcoticsSeizures(cases: CheckpointCaseRow[]): CheckpointNarcoticsSeizures {
  const totals: CheckpointNarcoticsSeizures = {
    cannabisKg: 0,
    hashishKg: 0,
    cocaineKg: 0,
    heroinKg: 0,
    syntheticDrugsKg: 0,
    khatKg: 0,
  };

  for (const row of cases) {
    if (row.specialty !== "narcotics" || !row.seizure_type || row.quantity == null || !row.unit) continue;
    const kg = quantityToKg(Number(row.quantity), row.unit);
    if (kg == null) continue;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.cannabisKg, row.seizure_type)) totals.cannabisKg += kg;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.hashishKg, row.seizure_type)) totals.hashishKg += kg;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.cocaineKg, row.seizure_type)) totals.cocaineKg += kg;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.heroinKg, row.seizure_type)) totals.heroinKg += kg;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.syntheticDrugsKg, row.seizure_type)) {
      totals.syntheticDrugsKg += kg;
    }
    if (row.seizure_type === "pofa") totals.khatKg += kg;
  }

  return totals;
}

function computeExplosivesSeizures(cases: CheckpointCaseRow[]): CheckpointExplosivesSeizures {
  const totals: CheckpointExplosivesSeizures = {
    firearms: 0,
    bladedWeapons: 0,
    grenades: 0,
    detonators: 0,
    explosiveMaterials: 0,
    ammunition: 0,
  };

  for (const row of cases) {
    if (row.specialty !== "explosives" || !row.object_type || row.object_count == null) continue;
    const count = Number(row.object_count);
    switch (row.object_type) {
      case "firearm":
        totals.firearms += count;
        break;
      case "bladed_weapon":
        totals.bladedWeapons += count;
        break;
      case "grenade":
        totals.grenades += count;
        break;
      case "detonator":
        totals.detonators += count;
        break;
      case "explosive_material":
        totals.explosiveMaterials += count;
        break;
      case "ammunition":
        totals.ammunition += count;
        break;
      default:
        break;
    }
  }

  return totals;
}

function computeCurrencySeizures(cases: CheckpointCaseRow[]): CheckpointCurrencySeizures {
  const currencySet = new Set<string>();
  let totalAmount = 0;
  let banknotes = 0;

  for (const row of cases) {
    if (row.specialty !== "currency") continue;
    if (row.total_amount != null) totalAmount += Number(row.total_amount);
    if (row.banknote_count != null) banknotes += row.banknote_count;
    if (row.currency_code) currencySet.add(row.currency_code);
  }

  return {
    totalAmount,
    banknotes,
    currencyTypes: [...currencySet],
  };
}

function seizureTypeKey(row: CheckpointCaseRow): string | null {
  if (row.specialty === "narcotics" && row.seizure_type) return row.seizure_type;
  if (row.specialty === "explosives" && row.object_type) return row.object_type;
  if (row.specialty === "currency") return "currency";
  return null;
}

function computeAnalytics(cases: CheckpointCaseRow[]): CheckpointAnalytics {
  const now = new Date();
  const monthPrefix = toISODate(startOfMonth(now)).slice(0, 7);
  const yearPrefix = toISODate(startOfYear(now)).slice(0, 4);

  const seizureCounts = countBy(
    cases.filter((c) => seizureTypeKey(c)),
    (c) => seizureTypeKey(c)!,
  );
  const specialtyCounts = countBy(cases, (c) => c.specialty);
  const agentCounts = countBy(
    cases.filter((c) => c.agent),
    (c) => `${c.agent!.first_name} ${c.agent!.last_name}`,
  );
  const dogCounts = countBy(
    cases.filter((c) => c.dog),
    (c) => c.dog!.name,
  );

  return {
    mostCommonSeizureType: seizureCounts[0]?.key ?? null,
    mostActiveSpecialty: (specialtyCounts[0]?.key as OperationalCaseSpecialty) ?? null,
    mostActiveAgent: agentCounts[0]?.label ?? null,
    mostActiveDog: dogCounts[0]?.label ?? null,
    casesThisMonth: cases.filter((c) => c.case_date.startsWith(monthPrefix)).length,
    casesThisYear: cases.filter((c) => c.case_date.startsWith(`${yearPrefix}-`)).length,
  };
}

function totalNarcoticsKg(seizures: CheckpointNarcoticsSeizures): number {
  return (
    seizures.cannabisKg +
    seizures.hashishKg +
    seizures.cocaineKg +
    seizures.heroinKg +
    seizures.syntheticDrugsKg +
    seizures.khatKg
  );
}

export function aggregateCheckpointStatistics(
  raw: CheckpointStatisticsRaw,
  filters: CheckpointStatsFilters,
  labels: {
    month: (key: string) => string;
    specialty: (key: string) => string;
    seizureType: (key: string) => string;
    unknown: string;
  },
): CheckpointStatisticsPayload {
  const filteredCases = filterCases(raw.cases, filters);
  const filteredAssignments = filterAssignments(raw.assignments, filters);

  const checkpointIds = new Set<string>();
  for (const cp of raw.checkpoints) checkpointIds.add(cp.id);
  for (const row of filteredCases) {
    if (row.checkpoint_id) checkpointIds.add(row.checkpoint_id);
  }
  for (const row of filteredAssignments) {
    const id = row.checkpoint_posts?.checkpoint_id;
    if (id) checkpointIds.add(id);
  }

  const checkpointNameById = new Map(raw.checkpoints.map((cp) => [cp.id, cp.name]));

  const records: CheckpointStatRecord[] = [...checkpointIds]
    .map((checkpointId) => {
      const name = checkpointNameById.get(checkpointId) ?? labels.unknown;
      const cases = filteredCases.filter((c) => c.checkpoint_id === checkpointId);
      const assignments = filteredAssignments.filter(
        (a) => a.checkpoint_posts?.checkpoint_id === checkpointId,
      );

      const agentIds = new Set<string>();
      const dogIds = new Set<string>();
      const agentNames = new Map<string, string>();
      const dogNames = new Map<string, string>();

      for (const assignment of assignments) {
        agentIds.add(assignment.agent_id);
        if (assignment.dog_id) dogIds.add(assignment.dog_id);
      }

      for (const caseRow of cases) {
        if (caseRow.agent) {
          agentIds.add(caseRow.agent.id);
          agentNames.set(caseRow.agent.id, `${caseRow.agent.first_name} ${caseRow.agent.last_name}`);
        }
        if (caseRow.dog) {
          dogIds.add(caseRow.dog.id);
          dogNames.set(caseRow.dog.id, caseRow.dog.name);
        }
      }

      const assignedAgents = [...agentIds].map((id) => ({
        id,
        name: agentNames.get(id) ?? id,
      }));
      const assignedDogs = [...dogIds].map((id) => ({
        id,
        name: dogNames.get(id) ?? id,
      }));

      return {
        id: checkpointId,
        name,
        totalCases: cases.length,
        totalPlanningAssignments: assignments.length,
        totalAgents: agentIds.size,
        totalDogs: dogIds.size,
        seizures: {
          narcotics: computeNarcoticsSeizures(cases),
          explosives: computeExplosivesSeizures(cases),
          currency: computeCurrencySeizures(cases),
        },
        analytics: computeAnalytics(cases),
        cases: [...cases].sort((a, b) => b.case_date.localeCompare(a.case_date)),
        casesByMonth: sumByMonth(
          cases.map((c) => ({ date: c.case_date })),
          labels.month,
        ),
        assignedAgents: assignedAgents.sort((a, b) => a.name.localeCompare(b.name)),
        assignedDogs: assignedDogs.sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .filter((record) => {
      if (filters.checkpointId !== "all") return record.id === filters.checkpointId;
      return record.totalCases > 0 || record.totalPlanningAssignments > 0;
    })
    .sort((a, b) => b.totalCases - a.totalCases || a.name.localeCompare(b.name));

  const casesByCheckpoint = records.map((r) => ({ key: r.id, label: r.name, value: r.totalCases }));

  const topForSeizureChart = records.slice(0, 6);
  const seizureTypesByCheckpoint = topForSeizureChart.map((record) => {
    const stacks = countBy(
      record.cases.filter((c) => seizureTypeKey(c)),
      (c) => seizureTypeKey(c)!,
      labels.seizureType,
    );
    return { key: record.id, label: record.name, stacks };
  });

  const specialtyDistribution = countBy(
    filteredCases,
    (c) => c.specialty,
    labels.specialty,
  );

  return {
    checkpoints: records,
    rankings: {
      byCases: topN(casesByCheckpoint, 10),
      byNarcoticsKg: topN(
        records.map((r) => ({
          key: r.id,
          label: r.name,
          value: Math.round(totalNarcoticsKg(r.seizures.narcotics) * 1000) / 1000,
        })),
        10,
      ),
      byExplosiveCases: topN(
        records.map((r) => ({
          key: r.id,
          label: r.name,
          value: r.cases.filter((c) => c.specialty === "explosives").length,
        })),
        10,
      ),
      byCurrencyCases: topN(
        records.map((r) => ({
          key: r.id,
          label: r.name,
          value: r.cases.filter((c) => c.specialty === "currency").length,
        })),
        10,
      ),
    },
    charts: {
      casesByCheckpoint: topN(casesByCheckpoint, 10),
      seizureTypesByCheckpoint,
      specialtyDistribution,
    },
  };
}