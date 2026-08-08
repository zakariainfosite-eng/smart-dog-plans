import type { DbClient } from "@/integrations/database/client";
import {
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  endOfYear,
} from "date-fns";
import type { Database } from "@/integrations/database/schema-types";
import { exclusionCalendarStatus, expirePastExclusions } from "@/lib/agent-exclusions";
import { filterNotDeleted, isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import { countBy, topN } from "@/lib/statistics/aggregate";
import { rangesOverlap, toISODate } from "@/lib/statistics/date-range";
import type { LabelCount } from "@/lib/statistics/types";

type Db = DbClient;

type CaseRow = Database["public"]["Tables"]["operational_cases"]["Row"] & {
  agents: { first_name: string; last_name: string } | null;
  dogs: { name: string } | null;
  checkpoints: { name: string } | null;
};

type ExclusionRow = Database["public"]["Tables"]["agent_exclusions"]["Row"];

type PlanningRow = Pick<
  Database["public"]["Tables"]["planning"]["Row"],
  "id" | "planning_date"
>;

type AssignmentRow = {
  planning_id: string;
  checkpoint_post_id: string | null;
  is_hq_reserve: boolean;
  agent_id: string;
};

export type OperationalStatisticsPayload = {
  year: number;
  yearTotals: {
    operationalCases: number;
    planningGenerated: number;
    controlsPerformed: number;
    narcoticsDetections: number;
    explosivesDetections: number;
    currencyDetections: number;
  };
  monthly: Array<{ monthKey: string; label: string; value: number }>;
  weekly: Array<{ label: string; value: number }>;
  today: {
    planning: number;
    operationalCases: number;
    exclusions: number;
    activeTeams: number;
  };
  topAgents: LabelCount[];
  topCheckpoints: LabelCount[];
  topDogs: LabelCount[];
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function fetchCasesInRange(db: Db, from: string, to: string) {
  let { data, error } = await db
    .from("operational_cases")
    .select("*, agents(first_name, last_name), dogs(name), checkpoints(name)")
    .eq("is_deleted", false)
    .gte("case_date", from)
    .lte("case_date", to);

  if (error && isMissingSoftDeleteColumn(error)) {
    ({ data, error } = await db
      .from("operational_cases")
      .select("*, agents(first_name, last_name), dogs(name), checkpoints(name)")
      .gte("case_date", from)
      .lte("case_date", to));
  }
  if (error) throw error;

  return filterNotDeleted(
    (data ?? []).map((row: any) => {
      const r = row as CaseRow & { agents: unknown; dogs: unknown; checkpoints: unknown };
      return {
        ...r,
        agents: unwrapOne(r.agents as CaseRow["agents"]),
        dogs: unwrapOne(r.dogs as CaseRow["dogs"]),
        checkpoints: unwrapOne(r.checkpoints as CaseRow["checkpoints"]),
      };
    }),
  ) as CaseRow[];
}

async function fetchExclusionsOverlapping(db: Db, from: string, to: string) {
  const { data, error } = await db
    .from("agent_exclusions")
    .select("*")
    .lte("start_date", to)
    .gte("end_date", from);
  if (error) throw error;
  return (data ?? []) as ExclusionRow[];
}

async function fetchPlanningInRange(db: Db, from: string, to: string) {
  const { data, error } = await db
    .from("planning")
    .select("id, planning_date")
    .gte("planning_date", from)
    .lte("planning_date", to);
  if (error) throw error;
  return (data ?? []) as PlanningRow[];
}

async function fetchAssignmentsForPlanning(db: Db, planningIds: string[]) {
  if (planningIds.length === 0) return [] as AssignmentRow[];
  const { data, error } = await db
    .from("planning_assignments")
    .select("planning_id, checkpoint_post_id, is_hq_reserve, agent_id")
    .in("planning_id", planningIds);
  if (error) throw error;
  return (data ?? []) as AssignmentRow[];
}

function countControls(assignments: AssignmentRow[]) {
  return assignments.filter(
    (row) => row.checkpoint_post_id != null && !row.is_hq_reserve,
  ).length;
}

function countActiveTeams(assignments: AssignmentRow[]) {
  return new Set(
    assignments
      .filter((row: any) => row.checkpoint_post_id != null && !row.is_hq_reserve)
      .map((row: any) => row.agent_id),
  ).size;
}

function buildMonthlyCounts(
  cases: CaseRow[],
  year: number,
  monthLabel: (monthIndex: number) => string,
) {
  return Array.from({ length: 12 }, (_, index) => {
    const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
    const value = cases.filter((row: any) => row.case_date.startsWith(monthKey)).length;
    return {
      monthKey,
      label: monthLabel(index),
      value,
    };
  });
}

function buildWeeklyCounts(cases: CaseRow[], reference: Date) {
  const monthStart = startOfMonth(reference);
  const monthEnd = endOfMonth(reference);
  const weeks = eachWeekOfInterval(
    { start: monthStart, end: monthEnd },
    { weekStartsOn: 1 },
  );

  return weeks.map((weekStart: any, index: any) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const rangeFrom = toISODate(weekStart < monthStart ? monthStart : weekStart);
    const rangeTo = toISODate(weekEnd > monthEnd ? monthEnd : weekEnd);
    const value = cases.filter(
      (row) => row.case_date >= rangeFrom && row.case_date <= rangeTo,
    ).length;
    return {
      label: `Week ${index + 1}`,
      value,
    };
  });
}

export const OPERATIONAL_STATISTICS_QUERY_KEY = "operational-statistics";

export async function fetchOperationalStatistics(
  db: Db,
  labels: {
    month: (monthIndex: number) => string;
    week: (weekNumber: number) => string;
    unknown: string;
  },
): Promise<OperationalStatisticsPayload> {
  await expirePastExclusions(db);
  const now = new Date();
  const year = now.getFullYear();
  const yearFrom = toISODate(startOfYear(now));
  const yearTo = toISODate(endOfYear(now));
  const today = toISODate(now);
  const monthFrom = toISODate(startOfMonth(now));
  const monthTo = toISODate(endOfMonth(now));

  const [yearCases, monthCases, todayCases, exclusions, yearPlanning, todayPlanning] =
    await Promise.all([
      fetchCasesInRange(db, yearFrom, yearTo),
      fetchCasesInRange(db, monthFrom, monthTo),
      fetchCasesInRange(db, today, today),
      fetchExclusionsOverlapping(db, yearFrom, yearTo),
      fetchPlanningInRange(db, yearFrom, yearTo),
      fetchPlanningInRange(db, today, today),
    ]);

  const yearPlanningIds = yearPlanning.map((row: any) => row.id);
  const todayPlanningIds = todayPlanning.map((row: any) => row.id);

  const [yearAssignments, todayAssignments] = await Promise.all([
    fetchAssignmentsForPlanning(db, yearPlanningIds),
    fetchAssignmentsForPlanning(db, todayPlanningIds),
  ]);

  const agentName = (row: CaseRow) =>
    row.agents ? `${row.agents.first_name} ${row.agents.last_name}` : labels.unknown;

  const todayExclusions = exclusions.filter(
    (row) =>
      row.active &&
      rangesOverlap(row.start_date, row.end_date, { from: today, to: today }) &&
      exclusionCalendarStatus(row, today) === "active",
  ).length;

  const monthly = buildMonthlyCounts(yearCases, year, labels.month);
  const weeklyRaw = buildWeeklyCounts(monthCases, now);
  const weekly = weeklyRaw.map((row: any, index: any) => ({
    label: labels.week(index + 1),
    value: row.value,
  }));

  return {
    year,
    yearTotals: {
      operationalCases: yearCases.length,
      planningGenerated: yearPlanning.length,
      controlsPerformed: countControls(yearAssignments),
      narcoticsDetections: yearCases.filter((row: any) => row.specialty === "narcotics").length,
      explosivesDetections: yearCases.filter((row: any) => row.specialty === "explosives").length,
      currencyDetections: yearCases.filter((row: any) => row.specialty === "currency").length,
    },
    monthly,
    weekly,
    today: {
      planning: todayPlanning.length,
      operationalCases: todayCases.length,
      exclusions: todayExclusions,
      activeTeams: countActiveTeams(todayAssignments),
    },
    topAgents: topN(countBy(yearCases, agentName), 10),
    topCheckpoints: topN(
      countBy(yearCases, (row) => row.checkpoints?.name ?? labels.unknown),
      10,
    ),
    topDogs: topN(
      countBy(yearCases, (row) => row.dogs?.name ?? labels.unknown),
      10,
    ),
  };
}
