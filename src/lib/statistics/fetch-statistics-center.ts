import type { DbClient } from "@/integrations/database/client";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
} from "date-fns";
import type { Database } from "@/integrations/database/schema-types";
import { DOG_LEVEL_EXCLUSION_TYPES, exclusionCalendarStatus } from "@/lib/agent-exclusions";
import { filterNotDeleted, isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import { rangesOverlap, toISODate } from "@/lib/statistics/date-range";
import type {
  AgentStatisticsRow,
  AnnualMetricRow,
  CheckpointStatisticsRow,
  DailyActivityRow,
  DogStatisticsRow,
  MonthlySummaryRow,
  OperationalHighlights,
  OperationalIntelligencePayload,
  RankingRow,
  SectionPerformanceRow,
  StatisticsCenterFilterOptions,
  StatisticsCenterFilters,
} from "@/lib/statistics/statistics-center-types";
import type { StatisticsDateRange } from "@/lib/statistics/types";

type Db = DbClient;

type CaseRow = Database["public"]["Tables"]["operational_cases"]["Row"] & {
  agents: { section_id: string | null } | null;
};

type PlanningRow = Pick<
  Database["public"]["Tables"]["planning"]["Row"],
  "id" | "planning_date" | "section_id" | "shift"
>;

type AssignmentRow = Pick<
  Database["public"]["Tables"]["planning_assignments"]["Row"],
  | "planning_id"
  | "agent_id"
  | "dog_id"
  | "checkpoint_post_id"
  | "is_hq_reserve"
  | "is_off_duty"
>;

type ExclusionRow = Database["public"]["Tables"]["agent_exclusions"]["Row"];

type AgentRow = Pick<
  Database["public"]["Tables"]["agents"]["Row"],
  "id" | "first_name" | "last_name" | "section_id" | "dog_id" | "active"
>;

type DogRow = Pick<
  Database["public"]["Tables"]["dogs"]["Row"],
  "id" | "name" | "specialty" | "active"
>;

type SectionRow = Pick<Database["public"]["Tables"]["sections"]["Row"], "id" | "name">;

type CheckpointRow = Pick<Database["public"]["Tables"]["checkpoints"]["Row"], "id" | "name">;

type PostRow = Pick<
  Database["public"]["Tables"]["checkpoint_posts"]["Row"],
  "id" | "checkpoint_id"
>;

export type EnrichedAssignment = {
  planningId: string;
  planningDate: string;
  sectionId: string;
  shift: Database["public"]["Enums"]["shift_type"];
  agentId: string;
  dogId: string | null;
  checkpointId: string | null;
  checkpointPostId: string | null;
  isHqReserve: boolean;
  isOffDuty: boolean;
};

export type StatisticsCenterRaw = {
  year: number;
  cases: CaseRow[];
  planning: PlanningRow[];
  assignments: EnrichedAssignment[];
  exclusions: ExclusionRow[];
  agents: AgentRow[];
  dogs: DogRow[];
  sections: SectionRow[];
  checkpoints: CheckpointRow[];
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function resolveDetailRange(filters: StatisticsCenterFilters): StatisticsDateRange {
  const year = parseInt(filters.year, 10) || new Date().getFullYear();

  if (filters.dateFrom && filters.dateTo) {
    return { from: filters.dateFrom, to: filters.dateTo };
  }

  if (filters.month) {
    const monthIndex = parseInt(filters.month, 10) - 1;
    const start = new Date(year, monthIndex, 1);
    return {
      from: toISODate(startOfMonth(start)),
      to: toISODate(endOfMonth(start)),
    };
  }

  const yearStart = new Date(year, 0, 1);
  return {
    from: toISODate(startOfYear(yearStart)),
    to: toISODate(endOfYear(yearStart)),
  };
}

function isInRange(date: string, range: StatisticsDateRange): boolean {
  return date >= range.from && date <= range.to;
}

function isOperationalMission(row: EnrichedAssignment): boolean {
  return row.checkpointPostId != null && !row.isHqReserve && !row.isOffDuty;
}

function matchesEntityFilters(
  filters: StatisticsCenterFilters,
  ctx: {
    checkpointId?: string | null;
    sectionId?: string | null;
    agentId?: string | null;
    dogId?: string | null;
  },
): boolean {
  if (filters.checkpointId && ctx.checkpointId !== filters.checkpointId) return false;
  if (filters.sectionId && ctx.sectionId !== filters.sectionId) return false;
  if (filters.agentId && ctx.agentId !== filters.agentId) return false;
  if (filters.dogId && ctx.dogId !== filters.dogId) return false;
  return true;
}

function filterCases(cases: CaseRow[], filters: StatisticsCenterFilters, range: StatisticsDateRange) {
  return cases.filter((row: any) => {
    if (!isInRange(row.case_date, range)) return false;
    return matchesEntityFilters(filters, {
      checkpointId: row.checkpoint_id,
      sectionId: row.agents?.section_id ?? null,
      agentId: row.agent_id,
      dogId: row.dog_id,
    });
  });
}

function filterAssignments(
  assignments: EnrichedAssignment[],
  filters: StatisticsCenterFilters,
  range: StatisticsDateRange,
) {
  return assignments.filter((row: any) => {
    if (!isInRange(row.planningDate, range)) return false;
    return matchesEntityFilters(filters, {
      checkpointId: row.checkpointId,
      sectionId: row.sectionId,
      agentId: row.agentId,
      dogId: row.dogId,
    });
  });
}

function filterPlanning(
  planning: PlanningRow[],
  assignments: EnrichedAssignment[],
  filters: StatisticsCenterFilters,
  range: StatisticsDateRange,
) {
  let matchingPlanningIds: Set<string> | null = null;
  if (filters.checkpointId) {
    matchingPlanningIds = new Set(
      assignments
        .filter(
          (row) =>
            row.checkpointId === filters.checkpointId && isInRange(row.planningDate, range),
        )
        .map((row: any) => row.planningId),
    );
  }

  return planning.filter((row: any) => {
    if (!isInRange(row.planning_date, range)) return false;
    if (filters.sectionId && row.section_id !== filters.sectionId) return false;
    if (matchingPlanningIds && !matchingPlanningIds.has(row.id)) return false;
    return true;
  });
}

function countExclusionsInRange(
  exclusions: ExclusionRow[],
  range: StatisticsDateRange,
  filters: StatisticsCenterFilters,
  agentSectionMap: Map<string, string | null>,
): number {
  return exclusions.filter((row: any) => {
    if (!row.active) return false;
    if (!rangesOverlap(row.start_date, row.end_date, range)) return false;
    if (filters.agentId && row.agent_id !== filters.agentId) return false;
    if (filters.sectionId && agentSectionMap.get(row.agent_id) !== filters.sectionId) return false;
    return true;
  }).length;
}

function daysInRange(range: StatisticsDateRange): number {
  return differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1;
}

function countDogUnavailableDays(
  agentId: string,
  exclusions: ExclusionRow[],
  range: StatisticsDateRange,
): number {
  const days = eachDayOfInterval({
    start: parseISO(range.from),
    end: parseISO(range.to),
  });
  let unavailable = 0;
  for (const day of days) {
    const dayISO = format(day, "yyyy-MM-dd");
    const blocked = exclusions.some(
      (row) =>
        row.agent_id === agentId &&
        row.active &&
        DOG_LEVEL_EXCLUSION_TYPES.has(row.exclusion_type) &&
        exclusionCalendarStatus(row, dayISO) === "active",
    );
    if (blocked) unavailable += 1;
  }
  return unavailable;
}

function maxDate(dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => Boolean(d));
  if (valid.length === 0) return null;
  return valid.sort((a, b) => b.localeCompare(a))[0];
}

function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function buildRankings(
  items: Array<{
    id: string;
    name: string;
    detail: string;
    missions: number;
    cases: number;
    drug: number;
    explosive: number;
    currency: number;
  }>,
): RankingRow[] {
  return items
    .map((item: any) => ({
      ...item,
      detections: item.drug + item.explosive + item.currency,
      activityScore: item.missions + item.cases * 2 + item.drug + item.explosive + item.currency,
    }))
    .sort((a, b) => b.activityScore - a.activityScore || b.missions - a.missions)
    .map((item: any, index: any) => ({
      rank: index + 1,
      id: item.id,
      name: item.name,
      detail: item.detail,
      missions: item.missions,
      cases: item.cases,
      detections: item.detections,
      activityScore: item.activityScore,
    }));
}

function pickTop<T>(items: T[], score: (item: T) => number): T | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => score(b) - score(a))[0];
}

function pickHighlight<T, R>(
  items: T[],
  score: (item: T) => number,
  map: (item: T) => R,
): R | null {
  const top = pickTop(items, score);
  return top ? map(top) : null;
}

function emptyDailyRow(date: string): DailyActivityRow {
  return {
    date,
    generatedPlanning: 0,
    assignments: 0,
    operationalCases: 0,
    drugDetections: 0,
    explosiveDetections: 0,
    currencyDetections: 0,
    activeTeams: 0,
  };
}

export function aggregateOperationalIntelligence(
  raw: StatisticsCenterRaw,
  filters: StatisticsCenterFilters,
  monthLabel: (monthIndex: number) => string,
  labels: {
    unknown: string;
    specialty: (value: string) => string;
  },
): OperationalIntelligencePayload {
  const detailRange = resolveDetailRange(filters);
  const year = raw.year;

  const agentMap = new Map(raw.agents.map((a: any) => [a.id, a]));
  const dogMap = new Map(raw.dogs.map((d: any) => [d.id, d]));
  const sectionMap = new Map(raw.sections.map((s: any) => [s.id, s.name]));
  const agentSectionMap = new Map(raw.agents.map((a: any) => [a.id, a.section_id]));

  const agentName = (id: string) => {
    const agent = agentMap.get(id);
    return agent ? `${agent.first_name} ${agent.last_name}` : labels.unknown;
  };

  const dogName = (id: string | null) => {
    if (!id) return labels.unknown;
    return dogMap.get(id)?.name ?? labels.unknown;
  };

  const sectionName = (id: string | null) => {
    if (!id) return labels.unknown;
    return sectionMap.get(id) ?? labels.unknown;
  };

  const detailCases = filterCases(raw.cases, filters, detailRange);
  const detailAssignments = filterAssignments(raw.assignments, filters, detailRange);
  const detailPlanning = filterPlanning(raw.planning, raw.assignments, filters, detailRange);
  const operationalAssignments = detailAssignments.filter(isOperationalMission);

  const monthlySummary: MonthlySummaryRow[] = Array.from({ length: 12 }, (_, index) => {
    const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
    const monthRange = {
      from: `${monthKey}-01`,
      to: toISODate(endOfMonth(parseISO(`${monthKey}-01`))),
    };

    const monthCases = filterCases(raw.cases, filters, monthRange);
    const monthAssignments = filterAssignments(raw.assignments, filters, monthRange);
    const monthPlanning = filterPlanning(raw.planning, raw.assignments, filters, monthRange);
    const monthOperational = monthAssignments.filter(isOperationalMission);

    const activeTeams = new Set(monthOperational.map((row: any) => row.agentId)).size;
    const inactiveTeams = new Set(
      monthAssignments
        .filter((row: any) => row.isHqReserve || row.isOffDuty)
        .map((row: any) => row.agentId),
    ).size;

    return {
      monthKey,
      monthLabel: monthLabel(index),
      generatedPlanning: monthPlanning.length,
      operationalCases: monthCases.length,
      drugDetections: monthCases.filter((row: any) => row.specialty === "narcotics").length,
      explosiveDetections: monthCases.filter((row: any) => row.specialty === "explosives").length,
      currencyDetections: monthCases.filter((row: any) => row.specialty === "currency").length,
      exclusions: countExclusionsInRange(raw.exclusions, monthRange, filters, agentSectionMap),
      activeTeams,
      inactiveTeams,
      assignments: monthOperational.length,
      avgMissionsPerDay: Number((monthOperational.length / daysInMonth(monthKey)).toFixed(1)),
      avgCasesPerDay: Number((monthCases.length / daysInMonth(monthKey)).toFixed(1)),
    };
  });

  const monthlyActivity = monthlySummary;
  const monthlyDetailed = monthlySummary;

  const checkpoints: CheckpointStatisticsRow[] = raw.checkpoints
    .map((checkpoint: any) => {
      const checkpointAssignments = operationalAssignments.filter(
        (row) => row.checkpointId === checkpoint.id,
      );
      const checkpointCases = detailCases.filter((row: any) => row.checkpoint_id === checkpoint.id);
      const checkpointPlanningDates = detailAssignments
        .filter((row: any) => row.checkpointId === checkpoint.id)
        .map((row: any) => row.planningDate);

      return {
        id: checkpoint.id,
        name: checkpoint.name,
        missionsGenerated: checkpointAssignments.length,
        assignedTeams: new Set(checkpointAssignments.map((row: any) => row.agentId)).size,
        drugDetections: checkpointCases.filter((row: any) => row.specialty === "narcotics").length,
        explosiveDetections: checkpointCases.filter((row: any) => row.specialty === "explosives").length,
        currencyDetections: checkpointCases.filter((row: any) => row.specialty === "currency").length,
        lastActivity: maxDate([
          ...checkpointCases.map((row: any) => row.case_date),
          ...checkpointPlanningDates,
        ]),
      };
    })
    .sort((a, b) => {
      if (b.missionsGenerated !== a.missionsGenerated) {
        return b.missionsGenerated - a.missionsGenerated;
      }
      return a.name.localeCompare(b.name);
    });

  const agents: AgentStatisticsRow[] = raw.agents
    .filter((agent: any) => {
      if (filters.agentId && agent.id !== filters.agentId) return false;
      if (filters.sectionId && agent.section_id !== filters.sectionId) return false;
      if (filters.dogId && agent.dog_id !== filters.dogId) return false;
      return true;
    })
    .map((agent: any) => {
      const agentAssignments = operationalAssignments.filter((row: any) => row.agentId === agent.id);
      const agentCases = detailCases.filter((row: any) => row.agent_id === agent.id);
      const missionDates = new Set(agentAssignments.map((row: any) => row.planningDate));
      const totalDays = daysInRange(detailRange);
      const attendanceRate =
        totalDays > 0 ? Math.min(100, Math.round((missionDates.size / totalDays) * 100)) : 0;

      return {
        id: agent.id,
        name: agentName(agent.id),
        sectionName: sectionName(agent.section_id),
        dogName: dogName(agent.dog_id),
        totalMissions: agentAssignments.length,
        dayMissions: agentAssignments.filter((row: any) => row.shift === "day").length,
        nightMissions: agentAssignments.filter((row: any) => row.shift === "night").length,
        drugDetections: agentCases.filter((row: any) => row.specialty === "narcotics").length,
        explosiveDetections: agentCases.filter((row: any) => row.specialty === "explosives").length,
        currencyDetections: agentCases.filter((row: any) => row.specialty === "currency").length,
        operationalCases: agentCases.length,
        attendanceRate,
        lastMission: maxDate(agentAssignments.map((row: any) => row.planningDate)),
      };
    })
    .sort((a, b) => {
      if (b.totalMissions !== a.totalMissions) return b.totalMissions - a.totalMissions;
      return a.name.localeCompare(b.name);
    });

  const dogs: DogStatisticsRow[] = raw.dogs
    .filter((dog: any) => {
      if (filters.dogId && dog.id !== filters.dogId) return false;
      if (filters.sectionId) {
        const handler = [...agentMap.values()].find((a: any) => a.dog_id === dog.id);
        if (handler && handler.section_id !== filters.sectionId) return false;
      }
      return true;
    })
    .map((dog: any) => {
      const handler = [...agentMap.values()].find((a: any) => a.dog_id === dog.id);
      const dogAssignments = operationalAssignments.filter((row: any) => row.dogId === dog.id);
      const dogCases = detailCases.filter((row: any) => row.dog_id === dog.id);
      const unavailableDays = handler
        ? countDogUnavailableDays(handler.id, raw.exclusions, detailRange)
        : 0;
      const totalDays = daysInRange(detailRange);
      const availabilityPct =
        totalDays > 0 ? Math.max(0, Math.round(((totalDays - unavailableDays) / totalDays) * 100)) : 100;

      return {
        id: dog.id,
        name: dog.name,
        specialty: labels.specialty(dog.specialty),
        handlerName: handler ? agentName(handler.id) : labels.unknown,
        totalMissions: dogAssignments.length,
        operationalCases: dogCases.length,
        availabilityPct,
        daysUnavailable: unavailableDays,
      };
    })
    .sort((a, b) => {
      if (b.totalMissions !== a.totalMissions) return b.totalMissions - a.totalMissions;
      return a.name.localeCompare(b.name);
    });

  const sectionPerformance: SectionPerformanceRow[] = raw.sections
    .filter((section: any) => !filters.sectionId || section.id === filters.sectionId)
    .map((section: any) => {
      const sectionPlanning = detailPlanning.filter((row: any) => row.section_id === section.id);
      const sectionAssignments = operationalAssignments.filter((row: any) => row.sectionId === section.id);
      const sectionAgentIds = new Set(
        raw.agents.filter((a: any) => a.section_id === section.id).map((a: any) => a.id),
      );
      const sectionCases = detailCases.filter((row: any) => sectionAgentIds.has(row.agent_id));
      const monthsWithData = Math.max(
        1,
        new Set(sectionAssignments.map((row: any) => row.planningDate.slice(0, 7))).size,
      );

      return {
        id: section.id,
        name: section.name,
        generatedPlanning: sectionPlanning.length,
        totalMissions: sectionAssignments.length,
        operationalCases: sectionCases.length,
        drugDetections: sectionCases.filter((row: any) => row.specialty === "narcotics").length,
        explosiveDetections: sectionCases.filter((row: any) => row.specialty === "explosives").length,
        currencyDetections: sectionCases.filter((row: any) => row.specialty === "currency").length,
        activeAgents: raw.agents.filter((a: any) => a.section_id === section.id && a.active).length,
        avgMissionsPerMonth: Number((sectionAssignments.length / monthsWithData).toFixed(1)),
      };
    })
    .sort((a, b) => b.totalMissions - a.totalMissions || a.name.localeCompare(b.name));

  const dailyMap = new Map<string, DailyActivityRow>();
  for (const row of detailPlanning) {
    const existing = dailyMap.get(row.planning_date) ?? emptyDailyRow(row.planning_date);
    existing.generatedPlanning += 1;
    dailyMap.set(row.planning_date, existing);
  }
  for (const row of operationalAssignments) {
    const existing = dailyMap.get(row.planningDate) ?? emptyDailyRow(row.planningDate);
    existing.assignments += 1;
    dailyMap.set(row.planningDate, existing);
  }
  for (const row of detailCases) {
    const existing = dailyMap.get(row.case_date) ?? emptyDailyRow(row.case_date);
    existing.operationalCases += 1;
    if (row.specialty === "narcotics") existing.drugDetections += 1;
    if (row.specialty === "explosives") existing.explosiveDetections += 1;
    if (row.specialty === "currency") existing.currencyDetections += 1;
    dailyMap.set(row.case_date, existing);
  }
  for (const date of dailyMap.keys()) {
    const teams = new Set(
      operationalAssignments.filter((row: any) => row.planningDate === date).map((row: any) => row.agentId),
    ).size;
    const row = dailyMap.get(date)!;
    row.activeTeams = teams;
  }
  const dailyActivity = [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date));

  const annualTotals = {
    generatedPlanning: detailPlanning.length,
    operationalCases: detailCases.length,
    assignments: operationalAssignments.length,
    drugDetections: detailCases.filter((row: any) => row.specialty === "narcotics").length,
    explosiveDetections: detailCases.filter((row: any) => row.specialty === "explosives").length,
    currencyDetections: detailCases.filter((row: any) => row.specialty === "currency").length,
    exclusions: countExclusionsInRange(raw.exclusions, detailRange, filters, agentSectionMap),
  };

  const monthsInPeriod = Math.max(1, monthlySummary.filter((row: any) => row.assignments > 0 || row.operationalCases > 0).length || 12);

  const annualMetrics: AnnualMetricRow[] = [
    { id: "planning", annualTotal: annualTotals.generatedPlanning, monthlyAverage: Number((annualTotals.generatedPlanning / monthsInPeriod).toFixed(1)) },
    { id: "cases", annualTotal: annualTotals.operationalCases, monthlyAverage: Number((annualTotals.operationalCases / monthsInPeriod).toFixed(1)) },
    { id: "assignments", annualTotal: annualTotals.assignments, monthlyAverage: Number((annualTotals.assignments / monthsInPeriod).toFixed(1)) },
    { id: "drug", annualTotal: annualTotals.drugDetections, monthlyAverage: Number((annualTotals.drugDetections / monthsInPeriod).toFixed(1)) },
    { id: "explosive", annualTotal: annualTotals.explosiveDetections, monthlyAverage: Number((annualTotals.explosiveDetections / monthsInPeriod).toFixed(1)) },
    { id: "currency", annualTotal: annualTotals.currencyDetections, monthlyAverage: Number((annualTotals.currencyDetections / monthsInPeriod).toFixed(1)) },
    { id: "exclusions", annualTotal: annualTotals.exclusions, monthlyAverage: Number((annualTotals.exclusions / monthsInPeriod).toFixed(1)) },
  ];

  const topAgents = buildRankings(
    agents.map((row: any) => ({
      id: row.id,
      name: row.name,
      detail: row.sectionName,
      missions: row.totalMissions,
      cases: row.operationalCases,
      drug: row.drugDetections,
      explosive: row.explosiveDetections,
      currency: row.currencyDetections,
    })),
  );

  const topDogs = buildRankings(
    dogs.map((row: any) => ({
      id: row.id,
      name: row.name,
      detail: row.handlerName,
      missions: row.totalMissions,
      cases: row.operationalCases,
      drug: 0,
      explosive: 0,
      currency: 0,
    })),
  );

  const topCheckpoints = buildRankings(
    checkpoints.map((row: any) => ({
      id: row.id,
      name: row.name,
      detail: `${row.assignedTeams} teams`,
      missions: row.missionsGenerated,
      cases: row.drugDetections + row.explosiveDetections + row.currencyDetections,
      drug: row.drugDetections,
      explosive: row.explosiveDetections,
      currency: row.currencyDetections,
    })),
  );

  const highlights: OperationalHighlights = {
    mostActiveMonth: pickHighlight(monthlySummary, (row) => row.assignments + row.operationalCases, (row) => ({
      label: row.monthLabel,
      missions: row.assignments,
      cases: row.operationalCases,
    })),
    mostActiveCheckpoint: pickHighlight(checkpoints, (row) => row.missionsGenerated, (row) => ({
      name: row.name,
      missions: row.missionsGenerated,
    })),
    mostActiveDog: pickHighlight(dogs, (row) => row.totalMissions, (row) => ({
      name: row.name,
      missions: row.totalMissions,
      cases: row.operationalCases,
    })),
    mostActiveAgent: pickHighlight(agents, (row) => row.totalMissions, (row) => ({
      name: row.name,
      missions: row.totalMissions,
      cases: row.operationalCases,
    })),
    mostActiveSection: pickHighlight(sectionPerformance, (row) => row.totalMissions, (row) => ({
      name: row.name,
      missions: row.totalMissions,
      cases: row.operationalCases,
    })),
  };

  return {
    year,
    detailRange,
    annualMetrics,
    monthlyActivity,
    monthlyDetailed,
    topAgents,
    topDogs,
    topCheckpoints,
    sectionPerformance,
    dailyActivity,
    highlights,
  };
}

/** @deprecated use aggregateOperationalIntelligence */
export const aggregateStatisticsCenter = aggregateOperationalIntelligence;

async function fetchCasesInYear(db: Db, from: string, to: string) {
  let { data, error } = await db
    .from("operational_cases")
    .select("*, agents(section_id)")
    .eq("is_deleted", false)
    .gte("case_date", from)
    .lte("case_date", to);

  if (error && isMissingSoftDeleteColumn(error)) {
    ({ data, error } = await db
      .from("operational_cases")
      .select("*, agents(section_id)")
      .gte("case_date", from)
      .lte("case_date", to));
  }
  if (error) throw error;

  return filterNotDeleted(
    (data ?? []).map((row: any) => {
      const r = row as CaseRow & { agents: unknown };
      return {
        ...r,
        agents: unwrapOne(r.agents as CaseRow["agents"]),
      };
    }),
  ) as CaseRow[];
}

export async function fetchStatisticsCenterRaw(
  db: Db,
  year: number,
): Promise<StatisticsCenterRaw> {
  const yearStart = new Date(year, 0, 1);
  const from = toISODate(startOfYear(yearStart));
  const to = toISODate(endOfYear(yearStart));

  const [
    cases,
    planningRes,
    assignmentsRes,
    postsRes,
    exclusionsRes,
    agentsRes,
    dogsRes,
    sectionsRes,
    checkpointsRes,
  ] = await Promise.all([
    fetchCasesInYear(db, from, to),
    db.from("planning").select("id, planning_date, section_id, shift").gte("planning_date", from).lte("planning_date", to),
    db
      .from("planning_assignments")
      .select("planning_id, agent_id, dog_id, checkpoint_post_id, is_hq_reserve, is_off_duty"),
    db.from("checkpoint_posts").select("id, checkpoint_id"),
    db.from("agent_exclusions").select("*").lte("start_date", to).gte("end_date", from),
    db.from("agents").select("id, first_name, last_name, section_id, dog_id, active"),
    db.from("dogs").select("id, name, specialty, active"),
    db.from("sections").select("id, name"),
    db.from("checkpoints").select("id, name").order("name"),
  ]);

  if (planningRes.error) throw planningRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;
  if (postsRes.error) throw postsRes.error;
  if (exclusionsRes.error) throw exclusionsRes.error;
  if (agentsRes.error) throw agentsRes.error;
  if (dogsRes.error) throw dogsRes.error;
  if (sectionsRes.error) throw sectionsRes.error;
  if (checkpointsRes.error) throw checkpointsRes.error;

  const planning = (planningRes.data ?? []) as PlanningRow[];
  const planningMap = new Map(planning.map((row: any) => [row.id, row]));
  const postMap = new Map((postsRes.data ?? []).map((row: any) => [row.id, (row as PostRow).checkpoint_id]));

  const assignments: EnrichedAssignment[] = ((assignmentsRes.data ?? []) as AssignmentRow[])
    .map((row: any) => {
      const plan = planningMap.get(row.planning_id);
      if (!plan) return null;
      const checkpointId = row.checkpoint_post_id
        ? (postMap.get(row.checkpoint_post_id) ?? null)
        : null;
      return {
        planningId: row.planning_id,
        planningDate: plan.planning_date,
        sectionId: plan.section_id,
        shift: plan.shift,
        agentId: row.agent_id,
        dogId: row.dog_id,
        checkpointId,
        checkpointPostId: row.checkpoint_post_id,
        isHqReserve: row.is_hq_reserve,
        isOffDuty: row.is_off_duty,
      };
    })
    .filter((row): row is EnrichedAssignment => row != null);

  return {
    year,
    cases,
    planning,
    assignments,
    exclusions: (exclusionsRes.data ?? []) as ExclusionRow[],
    agents: (agentsRes.data ?? []) as AgentRow[],
    dogs: (dogsRes.data ?? []) as DogRow[],
    sections: (sectionsRes.data ?? []) as SectionRow[],
    checkpoints: (checkpointsRes.data ?? []) as CheckpointRow[],
  };
}

export function buildStatisticsCenterFilterOptions(raw: StatisticsCenterRaw): StatisticsCenterFilterOptions {
  const years = new Set<string>([String(raw.year)]);
  const currentYear = new Date().getFullYear();
  for (let year = currentYear; year >= currentYear - 10; year -= 1) {
    years.add(String(year));
  }
  for (const row of raw.cases) years.add(row.case_date.slice(0, 4));
  for (const row of raw.planning) years.add(row.planning_date.slice(0, 4));

  return {
    years: [...years].sort((a, b) => b.localeCompare(a)),
    checkpoints: raw.checkpoints.map((row: any) => ({ id: row.id, name: row.name })),
    sections: raw.sections.map((row: any) => ({ id: row.id, name: row.name })),
    agents: raw.agents
      .map((row: any) => ({
        id: row.id,
        name: `${row.first_name} ${row.last_name}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    dogs: raw.dogs.map((row: any) => ({ id: row.id, name: row.name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export const STATISTICS_CENTER_QUERY_KEY = "statistics-center";
