import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import {
  NARCOTICS_STAT_DRUG_TYPES,
  quantityToKg,
} from "@/lib/operational-case-stats";
import { EXCLUSION_LEAVE_TYPES } from "@/lib/agent-career";
import { exclusionCalendarStatus } from "@/lib/agent-exclusions";
import { filterNotDeleted, isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import {
  breakdownByMonth,
  countBy,
  dogAgeBucket,
  sumByMonth,
  topN,
} from "@/lib/statistics/aggregate";
import type { StatisticsDateRange, StatisticsPayload, ExclusionType, MonthBreakdown } from "@/lib/statistics/types";
import { isDateInRange, rangesOverlap, toISODate } from "@/lib/statistics/date-range";
import { startOfMonth } from "date-fns";

type Db = DbClient;

type OperationalCaseRow = Database["public"]["Tables"]["operational_cases"]["Row"] & {
  agents: { first_name: string; last_name: string } | null;
  dogs: { name: string } | null;
  checkpoints: { name: string } | null;
};

type ExclusionRow = Database["public"]["Tables"]["agent_exclusions"]["Row"] & {
  agents: { first_name: string; last_name: string; section_id: string | null; sections: { name: string } | null } | null;
};

type PlanningRow = Database["public"]["Tables"]["planning"]["Row"] & {
  sections: { name: string } | null;
};

type AssignmentRow = {
  planning_id: string;
  checkpoint_posts: { checkpoints: { name: string } | null } | null;
};

type AgentRow = Database["public"]["Tables"]["agents"]["Row"] & {
  sections: { name: string } | null;
  dogs: { specialty: Database["public"]["Enums"]["dog_specialty"] } | null;
};

type DogRow = Database["public"]["Tables"]["dogs"]["Row"];

const EXCLUSION_REASON_GROUPS: Record<string, ExclusionType[]> = {
  sickDog: [
    "dog_sick",
    "female_dog_heat",
    "dog_injured",
    "dog_temporary_retirement",
    "dog_vet_visit",
    "dog_training",
    "dog_other",
  ],
  sickAgent: ["sickness"],
  leave: ["administrative_leave", "special_leave", "absence"],
  training: ["training"],
  vacation: ["annual_leave"],
  other: ["other", "mission"],
};

function includesType(types: readonly string[], value: string | null): boolean {
  return value != null && types.includes(value);
}

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function fetchOperationalCases(db: Db, range: StatisticsDateRange): Promise<OperationalCaseRow[]> {
  let { data, error } = await db
    .from("operational_cases")
    .select(
      "*, agents(first_name, last_name), dogs(name), checkpoints(name)",
    )
    .eq("is_deleted", false)
    .gte("case_date", range.from)
    .lte("case_date", range.to);

  if (error && isMissingSoftDeleteColumn(error)) {
    ({ data, error } = await db
      .from("operational_cases")
      .select("*, agents(first_name, last_name), dogs(name), checkpoints(name)")
      .gte("case_date", range.from)
      .lte("case_date", range.to));
  }
  if (error) throw error;
  return filterNotDeleted(
    (data ?? []).map((row: any) => {
      const r = row as OperationalCaseRow & {
        agents: unknown;
        dogs: unknown;
        checkpoints: unknown;
      };
      return {
        ...r,
        agents: unwrapOne(r.agents as OperationalCaseRow["agents"]),
        dogs: unwrapOne(r.dogs as OperationalCaseRow["dogs"]),
        checkpoints: unwrapOne(r.checkpoints as OperationalCaseRow["checkpoints"]),
      };
    }),
  ) as OperationalCaseRow[];
}

async function fetchExclusions(db: Db, range: StatisticsDateRange): Promise<ExclusionRow[]> {
  const { data, error } = await db
    .from("agent_exclusions")
    .select("*, agents(first_name, last_name, section_id, sections(name))")
    .lte("start_date", range.to)
    .gte("end_date", range.from);

  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const raw = row as ExclusionRow & { agents: unknown };
    const agentRaw = unwrapOne(
      raw.agents as
        | (ExclusionRow["agents"] & { sections?: unknown })
        | (ExclusionRow["agents"] & { sections?: unknown })[]
        | null,
    );
    const sections = agentRaw
      ? (unwrapOne(
          agentRaw.sections as { name: string } | { name: string }[] | null,
        ) as { name: string } | null)
      : null;
    return {
      ...raw,
      agents: agentRaw ? { ...agentRaw, sections } : null,
    };
  });
}

async function fetchPlanning(db: Db, range: StatisticsDateRange) {
  const { data, error } = await db
    .from("planning")
    .select("id, planning_date, section_id, sections(name)")
    .gte("planning_date", range.from)
    .lte("planning_date", range.to);
  if (error) throw error;
  return (data ?? []) as PlanningRow[];
}

async function fetchPlanningAssignments(db: Db, planningIds: string[]) {
  if (planningIds.length === 0) return [] as AssignmentRow[];
  const { data, error } = await db
    .from("planning_assignments")
    .select("planning_id, checkpoint_posts(checkpoints(name))")
    .in("planning_id", planningIds);
  if (error) throw error;
  return (data ?? []) as AssignmentRow[];
}

function computeSeizures(cases: OperationalCaseRow[]) {
  const totals = {
    cannabisKg: 0,
    hashishKg: 0,
    cocaineKg: 0,
    heroinKg: 0,
    syntheticDrugsKg: 0,
  };

  for (const row of cases) {
    if (row.specialty !== "narcotics" || !row.seizure_type || row.quantity == null || !row.unit) {
      continue;
    }
    const kg = quantityToKg(Number(row.quantity), row.unit);
    if (kg == null) continue;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.cannabisKg, row.seizure_type)) totals.cannabisKg += kg;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.hashishKg, row.seizure_type)) totals.hashishKg += kg;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.cocaineKg, row.seizure_type)) totals.cocaineKg += kg;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.heroinKg, row.seizure_type)) totals.heroinKg += kg;
    if (includesType(NARCOTICS_STAT_DRUG_TYPES.syntheticDrugsKg, row.seizure_type)) {
      totals.syntheticDrugsKg += kg;
    }
  }

  return totals;
}

function mapExclusionReason(type: ExclusionType): string {
  for (const [reason, types] of Object.entries(EXCLUSION_REASON_GROUPS)) {
    if (types.includes(type)) return reason;
  }
  return "other";
}

export async function fetchStatistics(
  db: Db,
  range: StatisticsDateRange,
  labels: {
    month: (key: string) => string;
    specialty: (key: string) => string;
    dogStatus: (key: string) => string;
    dogAge: (key: string) => string;
    gender: (key: string) => string;
    exclusionType: (key: string) => string;
    exclusionReason: (key: string) => string;
    unknown: string;
    unassigned: string;
  },
): Promise<StatisticsPayload> {
  const monthStart = toISODate(startOfMonth(new Date()));

  const [
    agentsRes,
    dogsRes,
    checkpointsRes,
    sectionsRes,
    cases,
    exclusions,
    planningRaw,
  ] = await Promise.all([
    db.from("agents").select("*, sections(name), dogs(specialty)"),
    db.from("dogs").select("*"),
    db.from("checkpoints").select("id", { count: "exact", head: true }),
    db.from("sections").select("id", { count: "exact", head: true }),
    fetchOperationalCases(db, range),
    fetchExclusions(db, range),
    fetchPlanning(db, range),
  ]);

  if (agentsRes.error) throw agentsRes.error;
  if (dogsRes.error) throw dogsRes.error;
  if (checkpointsRes.error) throw checkpointsRes.error;
  if (sectionsRes.error) throw sectionsRes.error;

  const agents = (agentsRes.data ?? []).map((row: any) => {
    const raw = row as AgentRow & { sections: unknown; dogs: unknown };
    return {
      ...(raw as AgentRow),
      sections: unwrapOne(raw.sections as AgentRow["sections"] | AgentRow["sections"][] | null),
      dogs: unwrapOne(raw.dogs as AgentRow["dogs"] | AgentRow["dogs"][] | null),
    };
  });
  const dogs = (dogsRes.data ?? []) as DogRow[];
  const planning = planningRaw.map((row: any) => {
    const raw = row as PlanningRow & { sections: unknown };
    return {
      ...raw,
      sections: unwrapOne(raw.sections as PlanningRow["sections"] | PlanningRow["sections"][] | null),
    };
  });
  const planningIds = planning.map((p: any) => p.id);
  const assignments = (await fetchPlanningAssignments(db, planningIds)).map((row: any) => {
    const posts = unwrapOne(row.checkpoint_posts as AssignmentRow["checkpoint_posts"] | AssignmentRow["checkpoint_posts"][]);
    const checkpoints = posts?.checkpoints
      ? unwrapOne(
          posts.checkpoints as { name: string } | { name: string }[] | null,
        )
      : null;
    return {
      ...row,
      checkpoint_posts: posts ? { ...posts, checkpoints } : null,
    };
  });

  const activeAgents = agents.filter((a: any) => a.active).length;
  const availableDogs = dogs.filter((d: any) => d.active && d.status === "available").length;
  const excludedDogs = dogs.filter((d: any) => !d.active || d.status !== "available").length;

  const today = toISODate(new Date());
  const activeExclusions = exclusions.filter(
    (e: any) => e.active && rangesOverlap(e.start_date, e.end_date, { from: today, to: today }),
  ).length;
  const finishedExclusions = exclusions.filter(
    (e: any) => exclusionCalendarStatus(e, today) === "expired",
  ).length;

  const leaveRows = exclusions.filter((e: any) =>
    EXCLUSION_LEAVE_TYPES.includes(e.exclusion_type),
  );

  const agentName = (a: OperationalCaseRow) =>
    a.agents ? `${a.agents.first_name} ${a.agents.last_name}` : labels.unknown;

  const casesByMonth = sumByMonth(
    cases.map((c: any) => ({ date: c.case_date })),
    labels.month,
  );

  const casesByMonthDetail: MonthBreakdown[] = breakdownByMonth(
    cases,
    (c: any) => c.case_date,
    (c: any) => c.specialty,
    labels.month,
    labels.specialty,
  );

  const planningByMonth = sumByMonth(
    planning.map((p: any) => ({ date: p.planning_date })),
    labels.month,
  );

  const planningThisMonth = planning.filter((p: any) =>
    isDateInRange(p.planning_date, { from: monthStart, to: range.to }),
  ).length;

  const checkpointByPlanning = countBy(assignments, (a: any) => {
    return a.checkpoint_posts?.checkpoints?.name ?? labels.unassigned;
  });

  const agentSpecialty = (a: AgentRow) => a.dogs?.specialty ?? null;

  return {
    range,
    kpis: {
      totalAgents: agents.length,
      activeAgents,
      inactiveAgents: agents.length - activeAgents,
      totalDogs: dogs.length,
      availableDogs,
      excludedDogs,
      totalOperationalCases: cases.length,
      totalExclusions: exclusions.length,
      totalPlanning: planning.length,
      totalCheckpoints: checkpointsRes.count ?? 0,
      totalSections: sectionsRes.count ?? 0,
    },
    operationalCases: {
      byMonth: casesByMonth,
      byMonthDetail: casesByMonthDetail,
      bySpecialty: countBy(cases, (c: any) => c.specialty, labels.specialty),
      byCheckpoint: countBy(cases, (c: any) => c.checkpoints?.name ?? labels.unknown),
      byDog: countBy(cases, (c: any) => c.dogs?.name ?? labels.unknown),
      byAgent: countBy(cases, agentName),
      seizures: computeSeizures(cases),
    },
    planning: {
      thisMonth: planningThisMonth,
      byMonth: planningByMonth,
      byMonthDetail: breakdownByMonth(
        planning,
        (p: any) => p.planning_date,
        (p: any) => p.sections?.name ?? labels.unknown,
        labels.month,
        (key) => (key === labels.unknown ? labels.unknown : key),
      ),
      bySection: countBy(planning, (p: any) => p.sections?.name ?? labels.unknown),
      byCheckpoint: checkpointByPlanning,
    },
    exclusions: {
      total: exclusions.length,
      active: activeExclusions,
      finished: finishedExclusions,
      byMonth: sumByMonth(
        exclusions.map((e: any) => ({ date: e.start_date })),
        labels.month,
      ),
      byMonthDetail: breakdownByMonth(
        exclusions,
        (e: any) => e.start_date,
        (e: any) => mapExclusionReason(e.exclusion_type),
        labels.month,
        labels.exclusionReason,
      ),
      byReason: countBy(exclusions, (e: any) => mapExclusionReason(e.exclusion_type), labels.exclusionReason),
      byType: countBy(exclusions, (e: any) => e.exclusion_type, labels.exclusionType),
    },
    leave: {
      total: leaveRows.length,
      byMonth: sumByMonth(
        leaveRows.map((e: any) => ({ date: e.start_date })),
        labels.month,
      ),
      byMonthDetail: breakdownByMonth(
        leaveRows,
        (e: any) => e.start_date,
        (e: any) => e.agents?.sections?.name ?? labels.unknown,
        labels.month,
        (key) => (key === labels.unknown ? labels.unknown : key),
      ),
      bySection: countBy(leaveRows, (e: any) => e.agents?.sections?.name ?? labels.unknown),
    },
    dogs: {
      bySpecialty: countBy(dogs, (d: any) => d.specialty, labels.specialty),
      byStatus: countBy(dogs, (d: any) => d.status, labels.dogStatus),
      byBreed: countBy(dogs, (d: any) => d.breed?.trim() || labels.unknown),
      byAge: countBy(dogs, (d: any) => dogAgeBucket(d.date_of_birth), labels.dogAge),
      assigned: dogs.filter((d: any) => agents.some((a: any) => a.dog_id === d.id)).length,
      unassigned: dogs.filter((d: any) => !agents.some((a: any) => a.dog_id === d.id)).length,
    },
    agents: {
      bySection: countBy(agents, (a: any) => a.sections?.name ?? labels.unknown),
      byGrade: countBy(agents, (a: any) => a.grade?.trim() || labels.unknown),
      byGender: countBy(agents, (a: any) => a.gender, labels.gender),
      bySpecialty: countBy(agents, (a: any) => agentSpecialty(a) ?? labels.unassigned, labels.specialty),
      withDog: agents.filter((a: any) => a.dog_id).length,
      withoutDog: agents.filter((a: any) => !a.dog_id).length,
    },
    rankings: {
      topAgents: topN(countBy(cases, agentName)),
      topDogs: topN(countBy(cases, (c: any) => c.dogs?.name ?? labels.unknown)),
      topCheckpoints: topN(countBy(cases, (c: any) => c.checkpoints?.name ?? labels.unknown)),
      topExclusionReasons: topN(
        countBy(exclusions, (e: any) => mapExclusionReason(e.exclusion_type), labels.exclusionReason),
      ),
    },
  };
}

export const STATISTICS_QUERY_KEY = "application-statistics";
