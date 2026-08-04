import {
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";

import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import { quantityToKg } from "@/lib/operational-case-stats";
import { filterNotDeleted, isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import { countBy, sumByMonth, topN } from "@/lib/statistics/aggregate";
import { toISODate } from "@/lib/statistics/date-range";
import type {
  CasesSeizureTotals,
  CasesStatisticsFilterOptions,
  CasesStatisticsFilters,
  CasesStatisticsPayload,
} from "@/lib/statistics/cases-statistics-types";
import type { LabelCount, StatisticsDateRange } from "@/lib/statistics/types";

export const CASES_STATISTICS_QUERY_KEY = "cases-statistics" as const;

type Db = DbClient;

type CaseRow = Database["public"]["Tables"]["operational_cases"]["Row"] & {
  agents: {
    id: string;
    first_name: string;
    last_name: string;
    section_id: string | null;
  } | null;
  dogs: { id: string; name: string } | null;
  checkpoints: { id: string; name: string } | null;
};

type AgentLookup = {
  id: string;
  first_name: string;
  last_name: string;
  section_id: string | null;
  active: boolean;
};

type DogLookup = { id: string; name: string; active: boolean };
type SectionLookup = { id: string; name: string };
type CheckpointLookup = { id: string; name: string };

export type CasesStatisticsRaw = {
  cases: CaseRow[];
  agents: AgentLookup[];
  dogs: DogLookup[];
  sections: SectionLookup[];
  checkpoints: CheckpointLookup[];
};

type AggregateLabels = {
  unknown: string;
  specialty: (key: string) => string;
  seizureType: (key: string) => string;
  objectType: (key: string) => string;
  team: (agentName: string, dogName: string | null) => string;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function agentDisplayName(agent: { first_name: string; last_name: string } | null | undefined): string {
  if (!agent) return "";
  return `${agent.first_name} ${agent.last_name}`.trim();
}

/** Map DB seizure_type → user-facing seizure buckets (kg). */
const SEIZURE_BUCKETS = {
  cannabisKg: ["cannabis"] as const,
  cocaineKg: ["cocaine"] as const,
  heroinKg: ["heroin"] as const,
  kifKg: ["hashish"] as const,
  ecstasyKg: ["exta"] as const,
  psychotropesKg: ["synthetic_drugs", "pofa"] as const,
  otherNarcoticsKg: ["other"] as const,
} as const;

function includesType(types: readonly string[], value: string | null): boolean {
  return value != null && types.includes(value);
}

export function resolveCasesStatisticsRange(filters: CasesStatisticsFilters): StatisticsDateRange {
  if (filters.dateFrom && filters.dateTo) {
    return {
      from: filters.dateFrom <= filters.dateTo ? filters.dateFrom : filters.dateTo,
      to: filters.dateFrom <= filters.dateTo ? filters.dateTo : filters.dateFrom,
    };
  }

  const year = parseInt(filters.year, 10) || new Date().getFullYear();

  if (filters.month) {
    const monthIndex = parseInt(filters.month, 10) - 1;
    const start = new Date(year, monthIndex, 1);
    return {
      from: toISODate(startOfMonth(start)),
      to: toISODate(endOfMonth(start)),
    };
  }

  if (filters.year) {
    const yearStart = new Date(year, 0, 1);
    return {
      from: toISODate(startOfYear(yearStart)),
      to: toISODate(endOfYear(yearStart)),
    };
  }

  // No year/range → wide window covering all likely case dates
  return { from: "1970-01-01", to: "2999-12-31" };
}

function isInRange(date: string, range: StatisticsDateRange): boolean {
  return date >= range.from && date <= range.to;
}

export async function fetchCasesStatisticsRaw(db: Db): Promise<CasesStatisticsRaw> {
  let { data, error } = await db
    .from("operational_cases")
    .select(
      "*, agents(id, first_name, last_name, section_id), dogs(id, name), checkpoints(id, name)",
    )
    .eq("is_deleted", false)
    .order("case_date", { ascending: false });

  if (error && isMissingSoftDeleteColumn(error)) {
    ({ data, error } = await db
      .from("operational_cases")
      .select(
        "*, agents(id, first_name, last_name, section_id), dogs(id, name), checkpoints(id, name)",
      )
      .order("case_date", { ascending: false }));
  }
  if (error) throw error;

  const cases = filterNotDeleted(
    (data ?? []).map((row: any) => {
      const r = row as CaseRow & {
        agents: unknown;
        dogs: unknown;
        checkpoints: unknown;
      };
      return {
        ...r,
        agents: unwrapOne(r.agents as CaseRow["agents"]),
        dogs: unwrapOne(r.dogs as CaseRow["dogs"]),
        checkpoints: unwrapOne(r.checkpoints as CaseRow["checkpoints"]),
      };
    }),
  ) as CaseRow[];

  const [agentsRes, dogsRes, sectionsRes, checkpointsRes] = await Promise.all([
    db.from("agents").select("id, first_name, last_name, section_id, active").order("last_name"),
    db.from("dogs").select("id, name, active").order("name"),
    db.from("sections").select("id, name").order("name"),
    db.from("checkpoints").select("id, name").order("name"),
  ]);

  if (agentsRes.error) throw agentsRes.error;
  if (dogsRes.error) throw dogsRes.error;
  if (sectionsRes.error) throw sectionsRes.error;
  if (checkpointsRes.error) throw checkpointsRes.error;

  return {
    cases,
    agents: (agentsRes.data ?? []) as AgentLookup[],
    dogs: (dogsRes.data ?? []) as DogLookup[],
    sections: (sectionsRes.data ?? []) as SectionLookup[],
    checkpoints: (checkpointsRes.data ?? []) as CheckpointLookup[],
  };
}

export function buildCasesStatisticsFilterOptions(
  raw: CasesStatisticsRaw,
  specialtyLabel: (key: string) => string,
): CasesStatisticsFilterOptions {
  const years = new Set<string>();
  for (const row of raw.cases) {
    if (row.case_date?.length >= 4) years.add(row.case_date.slice(0, 4));
  }
  years.add(String(new Date().getFullYear()));

  const specialtyKeys = new Set(raw.cases.map((row) => row.specialty));
  for (const key of ["narcotics", "explosives", "currency"] as const) {
    specialtyKeys.add(key);
  }

  return {
    years: [...years].sort((a, b) => b.localeCompare(a)),
    specialties: [...specialtyKeys]
      .sort()
      .map((value) => ({ value, label: specialtyLabel(value) })),
    sections: raw.sections.map((s) => ({ id: s.id, name: s.name })),
    checkpoints: raw.checkpoints.map((c) => ({ id: c.id, name: c.name })),
    agents: raw.agents
      .map((a) => ({
        id: a.id,
        name: agentDisplayName(a) || a.id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    dogs: raw.dogs
      .map((d) => ({ id: d.id, name: d.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function filterCases(
  cases: CaseRow[],
  filters: CasesStatisticsFilters,
  range: StatisticsDateRange,
  sectionByAgentId: Map<string, string | null>,
): CaseRow[] {
  return cases.filter((row) => {
    if (!isInRange(row.case_date, range)) return false;
    if (filters.specialty && row.specialty !== filters.specialty) return false;
    if (filters.checkpointId && row.checkpoint_id !== filters.checkpointId) return false;
    if (filters.agentId && row.agent_id !== filters.agentId) return false;
    if (filters.dogId && row.dog_id !== filters.dogId) return false;
    if (filters.sectionId) {
      const sectionId = row.agents?.section_id ?? sectionByAgentId.get(row.agent_id) ?? null;
      if (sectionId !== filters.sectionId) return false;
    }
    return true;
  });
}

function computeSeizures(cases: CaseRow[], labels: AggregateLabels): CasesSeizureTotals {
  const totals: CasesSeizureTotals = {
    cannabisKg: 0,
    cocaineKg: 0,
    heroinKg: 0,
    kifKg: 0,
    ecstasyKg: 0,
    psychotropesKg: 0,
    psychotropesPieces: 0,
    otherNarcoticsKg: 0,
    banknotesCount: 0,
    currencyAmount: 0,
    currencyByCode: [],
    explosivesObjects: 0,
    otherSeizures: [],
  };

  const otherMap = new Map<string, { label: string; value: number }>();
  const currencyMap = new Map<string, number>();

  const bumpOther = (key: string, label: string, value: number) => {
    const prev = otherMap.get(key);
    if (prev) prev.value += value;
    else otherMap.set(key, { label, value });
  };

  for (const row of cases) {
    if (row.specialty === "narcotics") {
      if (row.seizure_type && row.quantity != null && row.unit) {
        const qty = Number(row.quantity);
        const kg = quantityToKg(qty, row.unit);
        const isPieceUnit = row.unit === "units" || row.unit === "pieces";

        if (includesType(SEIZURE_BUCKETS.psychotropesKg, row.seizure_type) && isPieceUnit) {
          totals.psychotropesPieces += qty;
          continue;
        }

        if (kg != null) {
          if (includesType(SEIZURE_BUCKETS.cannabisKg, row.seizure_type)) totals.cannabisKg += kg;
          else if (includesType(SEIZURE_BUCKETS.cocaineKg, row.seizure_type)) totals.cocaineKg += kg;
          else if (includesType(SEIZURE_BUCKETS.heroinKg, row.seizure_type)) totals.heroinKg += kg;
          else if (includesType(SEIZURE_BUCKETS.kifKg, row.seizure_type)) totals.kifKg += kg;
          else if (includesType(SEIZURE_BUCKETS.ecstasyKg, row.seizure_type)) totals.ecstasyKg += kg;
          else if (includesType(SEIZURE_BUCKETS.psychotropesKg, row.seizure_type)) {
            totals.psychotropesKg += kg;
          } else if (includesType(SEIZURE_BUCKETS.otherNarcoticsKg, row.seizure_type)) {
            totals.otherNarcoticsKg += kg;
          } else {
            bumpOther(
              `drug:${row.seizure_type}`,
              labels.seizureType(row.seizure_type),
              kg,
            );
          }
        } else {
          bumpOther(
            `drug-unit:${row.seizure_type}:${row.unit}`,
            `${labels.seizureType(row.seizure_type)} (${row.unit})`,
            qty,
          );
        }
      }
      continue;
    }

    if (row.specialty === "explosives") {
      const count = row.object_count ?? 0;
      totals.explosivesObjects += count;
      if (row.object_type && count > 0) {
        bumpOther(
          `explosive:${row.object_type}`,
          labels.objectType(row.object_type),
          count,
        );
      }
      continue;
    }

    if (row.specialty === "currency") {
      totals.banknotesCount += row.banknote_count ?? 0;
      totals.currencyAmount += Number(row.total_amount ?? 0);
      if (row.currency_code && row.total_amount != null) {
        const code = row.currency_code;
        currencyMap.set(code, (currencyMap.get(code) ?? 0) + Number(row.total_amount));
      }
    }
  }

  totals.currencyByCode = [...currencyMap.entries()]
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((a, b) => b.value - a.value);

  totals.otherSeizures = [...otherMap.entries()]
    .map(([key, row]) => ({ key, label: row.label, value: row.value }))
    .sort((a, b) => b.value - a.value);

  return totals;
}

function buildWeeklyCounts(cases: CaseRow[], range: StatisticsDateRange): LabelCount[] {
  let start: Date;
  let end: Date;
  try {
    start = startOfWeek(parseISO(range.from), { weekStartsOn: 1 });
    end = endOfWeek(parseISO(range.to), { weekStartsOn: 1 });
  } catch {
    return [];
  }

  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  return weeks.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const from = toISODate(weekStart);
    const to = toISODate(weekEnd);
    const value = cases.filter((row) => row.case_date >= from && row.case_date <= to).length;
    return {
      key: from,
      label: `${format(weekStart, "dd/MM")} – ${format(weekEnd, "dd/MM")}`,
      value,
    };
  });
}

function buildYearlyCounts(cases: CaseRow[]): LabelCount[] {
  const map = new Map<string, number>();
  for (const row of cases) {
    const year = row.case_date.slice(0, 4);
    map.set(year, (map.get(year) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, label: key, value }));
}

function buildSpecialtyBreakdown(cases: CaseRow[], labels: AggregateLabels): LabelCount[] {
  const known = ["narcotics", "explosives", "currency"] as const;
  const counts = new Map<string, number>();
  for (const key of known) counts.set(key, 0);

  for (const row of cases) {
    const key = known.includes(row.specialty as (typeof known)[number])
      ? row.specialty
      : "other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, value]) => ({
      key,
      label: key === "other" ? labels.specialty("other") : labels.specialty(key),
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

export function aggregateCasesStatistics(
  raw: CasesStatisticsRaw,
  filters: CasesStatisticsFilters,
  monthLabel: (monthKey: string) => string,
  labels: AggregateLabels,
): CasesStatisticsPayload {
  const range = resolveCasesStatisticsRange(filters);
  const sectionByAgentId = new Map(raw.agents.map((a) => [a.id, a.section_id]));
  const sectionNameById = new Map(raw.sections.map((s) => [s.id, s.name]));

  const filtered = filterCases(raw.cases, filters, range, sectionByAgentId);

  const byAgent = countBy(
    filtered,
    (row) => row.agent_id,
    (id) => {
      const agent = filtered.find((r) => r.agent_id === id)?.agents
        ?? raw.agents.find((a) => a.id === id)
        ?? null;
      return agentDisplayName(agent) || labels.unknown;
    },
  );

  const byDog = countBy(
    filtered.filter((row) => row.dog_id),
    (row) => row.dog_id,
    (id) => {
      const dog =
        filtered.find((r) => r.dog_id === id)?.dogs
        ?? raw.dogs.find((d) => d.id === id)
        ?? null;
      return dog?.name || labels.unknown;
    },
  );

  const byCheckpoint = countBy(
    filtered.filter((row) => row.checkpoint_id),
    (row) => row.checkpoint_id,
    (id) => {
      const checkpoint =
        filtered.find((r) => r.checkpoint_id === id)?.checkpoints
        ?? raw.checkpoints.find((c) => c.id === id)
        ?? null;
      return checkpoint?.name || labels.unknown;
    },
  );

  const bySection = countBy(
    filtered,
    (row) => {
      const sectionId = row.agents?.section_id ?? sectionByAgentId.get(row.agent_id) ?? null;
      return sectionId;
    },
    (id) => (id === "unknown" ? labels.unknown : sectionNameById.get(id) ?? labels.unknown),
  );

  const byTeam = countBy(
    filtered,
    (row) => `${row.agent_id}::${row.dog_id ?? "none"}`,
    (key) => {
      const [agentId, dogId] = key.split("::");
      const agent =
        filtered.find((r) => r.agent_id === agentId)?.agents
        ?? raw.agents.find((a) => a.id === agentId)
        ?? null;
      const dog =
        dogId && dogId !== "none"
          ? filtered.find((r) => r.dog_id === dogId)?.dogs
            ?? raw.dogs.find((d) => d.id === dogId)
            ?? null
          : null;
      return labels.team(agentDisplayName(agent) || labels.unknown, dog?.name ?? null);
    },
  );

  const bySpecialty = buildSpecialtyBreakdown(filtered, labels);
  const byMonth = sumByMonth(
    filtered.map((row) => ({ date: row.case_date })),
    monthLabel,
  );
  const byYear = buildYearlyCounts(filtered);
  const byWeek = buildWeeklyCounts(filtered, range);

  // Yearly evolution uses all cases (ignores year filter) so the chart stays meaningful.
  const yearlyEvolution = buildYearlyCounts(
    filterCases(
      raw.cases,
      { ...filters, year: "", month: "", dateFrom: "", dateTo: "" },
      { from: "1970-01-01", to: "2999-12-31" },
      sectionByAgentId,
    ),
  );

  // Monthly evolution: selected year, else latest year present in the filtered set.
  const yearForMonthly =
    parseInt(filters.year, 10) ||
    (filtered.length > 0
      ? Math.max(...filtered.map((row) => parseInt(row.case_date.slice(0, 4), 10) || 0))
      : new Date().getFullYear());
  const monthlyEvolution = Array.from({ length: 12 }, (_, index) => {
    const monthKey = `${yearForMonthly}-${String(index + 1).padStart(2, "0")}`;
    const value = filtered.filter((row) => row.case_date.startsWith(monthKey)).length;
    return {
      month: monthKey,
      label: monthLabel(monthKey),
      value,
    };
  });

  return {
    range,
    totalCases: filtered.length,
    byYear,
    byMonth,
    byWeek,
    bySpecialty,
    byCheckpoint,
    bySection,
    byAgent,
    byDog,
    byTeam,
    seizures: computeSeizures(filtered, labels),
    rankings: {
      topAgents: topN(byAgent, 10),
      topDogs: topN(byDog, 10),
      topCheckpoints: topN(byCheckpoint, 10),
      topSections: topN(bySection, 10),
    },
    charts: {
      monthlyEvolution,
      yearlyEvolution,
    },
  };
}
