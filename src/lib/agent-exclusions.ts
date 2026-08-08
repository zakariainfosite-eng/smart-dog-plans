import type { DbClient } from "@/integrations/database/client";
import { format, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import type { Database } from "@/integrations/database/schema-types";
import { isMissingSoftDeleteColumn } from "@/lib/soft-delete";

export type ExclusionType = Database["public"]["Enums"]["exclusion_type"];

export type AgentExclusionRecord = Pick<
  Database["public"]["Tables"]["agent_exclusions"]["Row"],
  "agent_id" | "dog_id" | "exclusion_type" | "start_date" | "end_date" | "active"
>;

export type ExclusionCalendarStatus = "active" | "upcoming" | "expired";

export type ExclusionApplyTarget = "agent" | "dog";

/** Agent unavailability — removed from planning entirely (not Point 653). */
export const AGENT_LEVEL_EXCLUSION_TYPES = new Set<string>([
  "absence",
  "sickness",
  "annual_leave",
  "special_leave",
  "administrative_leave",
  "mission",
  "training",
  "suspension",
  "other",
]);

/** Dog unavailability — handler stays available for Point 653 only. */
export const DOG_LEVEL_EXCLUSION_TYPES = new Set<string>([
  "dog_sick",
  "female_dog_heat",
  "dog_injured",
  "dog_temporary_retirement",
  "dog_vet_visit",
  "dog_training",
  "dog_other",
]);

/** Types offered when creating a personnel exclusion. */
export const PERSONNEL_EXCLUSION_FORM_TYPES: ExclusionType[] = [
  "sickness",
  "annual_leave",
  "mission",
  "training",
  "suspension",
  "other",
];

/** Types offered when creating a dog exclusion. */
export const DOG_EXCLUSION_FORM_TYPES: ExclusionType[] = [
  "female_dog_heat",
  "dog_sick",
  "dog_injured",
  "dog_temporary_retirement",
  "dog_vet_visit",
  "dog_training",
  "dog_other",
];

/** All known types for filters / history (includes legacy leave variants). */
export const ALL_EXCLUSION_TYPES: ExclusionType[] = [
  "sickness",
  "annual_leave",
  "administrative_leave",
  "special_leave",
  "absence",
  "mission",
  "training",
  "suspension",
  "dog_sick",
  "female_dog_heat",
  "dog_injured",
  "dog_temporary_retirement",
  "dog_vet_visit",
  "dog_training",
  "dog_other",
  "other",
];

export function isAgentLevelExclusionType(type: string): boolean {
  return AGENT_LEVEL_EXCLUSION_TYPES.has(type);
}

export function isDogLevelExclusionType(type: string): boolean {
  return DOG_LEVEL_EXCLUSION_TYPES.has(type);
}

export function exclusionApplyTarget(type: string, dogId?: string | null): ExclusionApplyTarget {
  if (dogId || isDogLevelExclusionType(type)) return "dog";
  return "agent";
}

export function planningDayISO(reference: Date | string): string {
  if (typeof reference === "string") return reference.slice(0, 10);
  return format(reference, "yyyy-MM-dd");
}

/** Shared React Query key — invalidate after exclusion CRUD so Agents page updates immediately. */
export const ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY = ["active-exclusions-today"] as const;

/**
 * Local calendar “today” as `yyyy-MM-dd`.
 * Must match exclusion forms and `isAgentExclusionActive(…, new Date())` —
 * never use UTC (`toISOString`) or Morocco/Europe evenings drift a day early.
 */
export function todayISODate(): string {
  return planningDayISO(new Date());
}

export function exclusionReferenceDay(reference: Date | string = new Date()): Date {
  if (typeof reference === "string") {
    return startOfDay(parseISO(reference));
  }
  return startOfDay(reference);
}

/** True when reference day falls within [start_date, end_date] inclusive. */
export function isExclusionInDateRange(
  exclusion: Pick<AgentExclusionRecord, "start_date" | "end_date">,
  reference: Date | string = new Date(),
): boolean {
  const dayISO = planningDayISO(reference);
  return exclusion.start_date <= dayISO && dayISO <= exclusion.end_date;
}

export function exclusionCalendarStatus(
  exclusion: Pick<AgentExclusionRecord, "start_date" | "end_date">,
  reference: Date | string = new Date(),
): ExclusionCalendarStatus {
  const day = exclusionReferenceDay(reference);
  const start = startOfDay(parseISO(exclusion.start_date));
  const end = startOfDay(parseISO(exclusion.end_date));
  if (isAfter(start, day)) return "upcoming";
  if (isBefore(end, day)) return "expired";
  return "active";
}

/**
 * Active exclusion = enabled (active=true) AND reference day within the date range.
 * Single source of truth for planning, agents page, dashboard, and exclusions UI.
 */
export function isAgentExclusionActive(
  exclusion: AgentExclusionRecord,
  reference: Date | string = new Date(),
): boolean {
  return exclusion.active && isExclusionInDateRange(exclusion, reference);
}

/**
 * True when the exclusion end date is strictly before the reference day
 * (`today > date_fin`). Inclusive end dates remain active on their last day.
 */
export function isExclusionPastEndDate(
  exclusion: Pick<AgentExclusionRecord, "end_date">,
  reference: Date | string = new Date(),
): boolean {
  return exclusion.end_date < planningDayISO(reference);
}

/**
 * Persist automatic expiration against a calendar reference day (normally today).
 * Sets active=false when end_date < reference.
 *
 * Call only from Dashboard, Exclusions page, and app startup — always with today's
 * date. Never pass a future planning date here: that would deactivate exclusions
 * that are still in force for current operations.
 *
 * Planning generation and PDF exports must NOT persist via this function; they
 * evaluate effectiveness with {@link fetchActiveExclusionsForDate} / 
 * {@link isAgentExclusionActive} against the planning date instead.
 */
export async function expirePastExclusions(
  db: DbClient,
  reference: Date | string = new Date(),
): Promise<number> {
  const referenceISO = planningDayISO(reference);
  const updatedAt = new Date().toISOString();

  const run = async (withSoftDelete: boolean) => {
    let query = db
      .from("agent_exclusions")
      .update({ active: false, updated_at: updatedAt })
      .eq("active", true)
      .lt("end_date", referenceISO);
    if (withSoftDelete) {
      query = query.eq("is_deleted", false);
    }
    return query;
  };

  const { error, count } = await run(true);
  if (!error) return count ?? 0;

  if (isMissingSoftDeleteColumn(error)) {
    const legacy = await run(false);
    if (legacy.error) throw legacy.error;
    return legacy.count ?? 0;
  }

  throw error;
}

export function filterActiveExclusions<T extends AgentExclusionRecord>(
  exclusions: T[],
  reference: Date | string = new Date(),
): T[] {
  return exclusions.filter((e) => isAgentExclusionActive(e, reference));
}

export function buildActiveExclusionAgentIds(
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): Set<string> {
  return new Set(
    filterActiveExclusions(exclusions, reference)
      .map((e) => e.agent_id)
      .filter((id): id is string => Boolean(id)),
  );
}

export function getActiveExclusionsForAgent(
  exclusions: AgentExclusionRecord[],
  agentId: string,
  reference: Date | string = new Date(),
): AgentExclusionRecord[] {
  return filterActiveExclusions(exclusions, reference).filter((e) => e.agent_id === agentId);
}

export function isAgentExcludedOnDate(
  agentId: string,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): boolean {
  return getActiveExclusionsForAgent(exclusions, agentId, reference).some((e) =>
    isAgentLevelExclusionType(e.exclusion_type),
  );
}

/**
 * Load exclusions that affect operations on `referenceISO`.
 *
 * Effectiveness is always relative to that reference day (not wall-clock today):
 * - Daily Planning → planning form date
 * - PDF / feuille de présence → planning date of the export
 * - Dashboard / Agents / Dogs → typically today
 *
 * Does not persist expiration. Call {@link expirePastExclusions} separately with
 * today's date from Dashboard / Exclusions / startup only.
 */
export async function fetchActiveExclusionsForDate(
  db: DbClient,
  referenceISO: string,
  agentIds?: string[],
): Promise<AgentExclusionRecord[]> {
  const dayISO = planningDayISO(referenceISO);

  const run = async (withSoftDelete: boolean) => {
    let query = db
      .from("agent_exclusions")
      .select("agent_id, dog_id, exclusion_type, start_date, end_date, active")
      .eq("active", true)
      .lte("start_date", dayISO)
      .gte("end_date", dayISO);

    if (withSoftDelete) {
      query = query.eq("is_deleted", false);
    }
    if (agentIds && agentIds.length > 0) {
      query = query.in("agent_id", agentIds);
    }
    return query;
  };

  const { data, error } = await run(true);
  if (!error) return (data ?? []) as AgentExclusionRecord[];

  if (isMissingSoftDeleteColumn(error)) {
    const legacy = await run(false);
    if (legacy.error) throw legacy.error;
    return (legacy.data ?? []) as AgentExclusionRecord[];
  }

  throw error;
}

export type PlanningExclusionInput = {
  agent_id: string | null;
  dog_id: string | null;
  exclusion_type: string;
};

export type PlanningExclusionDebugEntry = {
  agent_id: string | null;
  dog_id: string | null;
  exclusion_type: string;
  status:
    | "applied_agent"
    | "applied_dog"
    | "ignored_inactive"
    | "ignored_out_of_range"
    | "ignored_agent_not_in_section"
    | "ignored_unknown_type";
  reason: string;
};

export type PlanningExclusionDebugReport = {
  planningDate: string;
  loadedCount: number;
  sectionAgentCount: number;
  agentExclusions: PlanningExclusionDebugEntry[];
  dogExclusions: PlanningExclusionDebugEntry[];
  ignored: PlanningExclusionDebugEntry[];
  inputs: PlanningExclusionInput[];
};

/** Client-side safety filter — keeps only rows matching the shared active rule. */
export function toPlanningExclusionInputs(
  exclusions: AgentExclusionRecord[],
  dateISO: string,
): PlanningExclusionInput[] {
  return filterActiveExclusions(exclusions, dateISO).map((e) => ({
    agent_id: e.agent_id,
    dog_id: e.dog_id ?? null,
    exclusion_type: e.exclusion_type,
  }));
}

/**
 * Resolve active exclusions for a planning section and produce a debug audit trail.
 * Active = active=true AND planning_date within [start_date, end_date].
 */
export function buildPlanningExclusionReport(
  records: AgentExclusionRecord[],
  planningDateISO: string,
  sectionAgentIds: Set<string>,
  sectionDogIds: Set<string> = new Set(),
  dogToAgentId: Map<string, string> = new Map(),
): PlanningExclusionDebugReport {
  const agentExclusions: PlanningExclusionDebugEntry[] = [];
  const dogExclusions: PlanningExclusionDebugEntry[] = [];
  const ignored: PlanningExclusionDebugEntry[] = [];
  const inputs: PlanningExclusionInput[] = [];

  for (const record of records) {
    const entry = {
      agent_id: record.agent_id,
      dog_id: record.dog_id ?? null,
      exclusion_type: record.exclusion_type,
    };

    if (!record.active) {
      ignored.push({
        ...entry,
        status: "ignored_inactive",
        reason: "exclusion.active is false",
      });
      continue;
    }

    if (!isExclusionInDateRange(record, planningDateISO)) {
      ignored.push({
        ...entry,
        status: "ignored_out_of_range",
        reason: `planning date ${planningDateISO} outside [${record.start_date}, ${record.end_date}]`,
      });
      continue;
    }

    const resolvedAgentId =
      record.agent_id ??
      (record.dog_id ? dogToAgentId.get(record.dog_id) ?? null : null);

    const inSection =
      (resolvedAgentId != null && sectionAgentIds.has(resolvedAgentId)) ||
      (record.dog_id != null && sectionDogIds.has(record.dog_id));

    if (!inSection) {
      ignored.push({
        ...entry,
        status: "ignored_agent_not_in_section",
        reason: "target not in selected planning section",
      });
      continue;
    }

    const input: PlanningExclusionInput = {
      agent_id: resolvedAgentId,
      dog_id: record.dog_id ?? null,
      exclusion_type: record.exclusion_type,
    };
    inputs.push(input);

    if (isAgentLevelExclusionType(record.exclusion_type)) {
      agentExclusions.push({
        ...entry,
        agent_id: resolvedAgentId,
        status: "applied_agent",
        reason: "removed from planning — Excluded Personnel",
      });
      continue;
    }

    if (isDogLevelExclusionType(record.exclusion_type)) {
      dogExclusions.push({
        ...entry,
        agent_id: resolvedAgentId,
        status: "applied_dog",
        reason: "dog unavailable — handler not assigned that dog operationally (Point 653)",
      });
      continue;
    }

    ignored.push({
      ...entry,
      status: "ignored_unknown_type",
      reason: `unsupported exclusion type: ${record.exclusion_type}`,
    });
  }

  return {
    planningDate: planningDateISO,
    loadedCount: records.length,
    sectionAgentCount: sectionAgentIds.size,
    agentExclusions,
    dogExclusions,
    ignored,
    inputs,
  };
}

export function logPlanningExclusionDebug(report: PlanningExclusionDebugReport): void {
  console.group("[Daily Planning] Exclusion pipeline");
  console.log("Planning date:", report.planningDate);
  console.log("Active exclusions loaded:", report.loadedCount);
  console.log("Section agents:", report.sectionAgentCount);
  console.log("Agent exclusions (removed from planning):", report.agentExclusions);
  console.log("Dog exclusions (Point 653):", report.dogExclusions);
  console.log("Exclusions ignored:", report.ignored);
  console.log("Exclusion inputs passed to engine:", report.inputs);
  console.groupEnd();
}

/** Permanently delete an exclusion row. */
export async function deleteAgentExclusion(
  db: DbClient,
  id: string,
): Promise<void> {
  const { error } = await db.from("agent_exclusions").delete().eq("id", id);
  if (error) throw error;
}

/** List exclusions for one agent. */
export async function fetchAgentExclusionHistory(
  db: DbClient,
  agentId: string,
): Promise<Database["public"]["Tables"]["agent_exclusions"]["Row"][]> {
  const { data, error } = await db
    .from("agent_exclusions")
    .select("*")
    .eq("agent_id", agentId)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
