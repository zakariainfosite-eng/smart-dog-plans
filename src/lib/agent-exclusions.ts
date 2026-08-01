import type { DbClient } from "@/integrations/database/client";
import { format, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import type { Database } from "@/integrations/database/schema-types";
import { isMissingSoftDeleteColumn } from "@/lib/soft-delete";

export type AgentExclusionRecord = Pick<
  Database["public"]["Tables"]["agent_exclusions"]["Row"],
  "agent_id" | "exclusion_type" | "start_date" | "end_date" | "active"
>;

export type ExclusionCalendarStatus = "active" | "upcoming" | "expired";

/** Agent unavailability — removed from planning entirely (not Point 653). */
export const AGENT_LEVEL_EXCLUSION_TYPES = new Set([
  "absence",
  "sickness",
  "annual_leave",
  "special_leave",
  "administrative_leave",
  "mission",
  "training",
  "other",
]);

/** Dog unavailability — on duty at Point 653, not operational checkpoints. */
export const DOG_LEVEL_EXCLUSION_TYPES = new Set(["dog_sick", "female_dog_heat"]);

export function isAgentLevelExclusionType(type: string): boolean {
  return AGENT_LEVEL_EXCLUSION_TYPES.has(type);
}

export function isDogLevelExclusionType(type: string): boolean {
  return DOG_LEVEL_EXCLUSION_TYPES.has(type);
}

export function planningDayISO(reference: Date | string): string {
  if (typeof reference === "string") return reference.slice(0, 10);
  return format(reference, "yyyy-MM-dd");
}

/** Shared React Query key — invalidate after exclusion CRUD so Agents page updates immediately. */
export const ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY = ["active-exclusions-today"] as const;

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
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
  return new Set(filterActiveExclusions(exclusions, reference).map((e) => e.agent_id));
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
  return getActiveExclusionsForAgent(exclusions, agentId, reference).length > 0;
}

/** Shared database select for planning / dashboard / agents operational status. */
export async function fetchActiveExclusionsForDate(
  db: DbClient,
  dateISO: string,
  agentIds?: string[],
): Promise<AgentExclusionRecord[]> {
  const run = async (withSoftDelete: boolean) => {
    let query = db
      .from("agent_exclusions")
      .select("agent_id, exclusion_type, start_date, end_date, active")
      .eq("active", true)
      .lte("start_date", dateISO)
      .gte("end_date", dateISO);

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
  agent_id: string;
  exclusion_type: string;
};

export type PlanningExclusionDebugEntry = {
  agent_id: string;
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
): PlanningExclusionDebugReport {
  const agentExclusions: PlanningExclusionDebugEntry[] = [];
  const dogExclusions: PlanningExclusionDebugEntry[] = [];
  const ignored: PlanningExclusionDebugEntry[] = [];
  const inputs: PlanningExclusionInput[] = [];

  for (const record of records) {
    const entry = { agent_id: record.agent_id, exclusion_type: record.exclusion_type };

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

    if (!sectionAgentIds.has(record.agent_id)) {
      ignored.push({
        ...entry,
        status: "ignored_agent_not_in_section",
        reason: "agent not in selected planning section",
      });
      continue;
    }

    inputs.push(entry);

    if (isAgentLevelExclusionType(record.exclusion_type)) {
      agentExclusions.push({
        ...entry,
        status: "applied_agent",
        reason: "removed from planning — Excluded Personnel",
      });
      continue;
    }

    if (isDogLevelExclusionType(record.exclusion_type)) {
      dogExclusions.push({
        ...entry,
        status: "applied_dog",
        reason: "on duty at Point 653 — not counted as excluded",
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
