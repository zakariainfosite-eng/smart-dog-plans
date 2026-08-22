/**
 * "Historique complet" — read-only aggregation of everything already recorded for
 * an agent. Automatic events are derived from their original tables (exclusions,
 * operational cases, rotations) instead of being copied into
 * `agent_administrative_history`, which keeps a single source of truth and avoids
 * duplicated entries. Nothing here writes to the database.
 */
import { exclusionTypeI18nKey } from "@/lib/agent-exclusions";
import {
  agentHistoryEventTypeI18nKey,
  type AgentAdministrativeHistoryRow,
} from "@/lib/agent-history";
import type {
  AgentExclusionHistoryItem,
  AgentOperationalCase,
  AgentRotationHistoryItem,
} from "@/lib/agent-details";

export type AgentTimelineCategory =
  "administrative" | "exclusion_agent" | "exclusion_dog" | "operational_case" | "rotation";

/**
 * Rotations are by far the noisiest source (one row per planning day), so the
 * timeline keeps only the most recent ones. Display-only: `rotation_history`
 * itself is never touched. Other categories stay unlimited.
 */
export const AGENT_TIMELINE_ROTATION_LIMIT = 5;

export const AGENT_TIMELINE_CATEGORIES: AgentTimelineCategory[] = [
  "administrative",
  "exclusion_agent",
  "exclusion_dog",
  "operational_case",
  "rotation",
];

export type AgentTimelineEvent = {
  /** Unique across categories (source table row ids can collide otherwise). */
  key: string;
  category: AgentTimelineCategory;
  /** `yyyy-MM-dd`, used for sorting and year grouping. */
  startDate: string;
  endDate: string | null;
  /** i18n key of the event label; falls back to `labelFallback` when missing. */
  labelKey: string;
  labelFallback: string;
  reason: string | null;
  observation: string | null;
  reference: string | null;
  createdAt: string | null;
  createdBy: string | null;
  /** Present only for manual/imported rows, which are the editable ones. */
  administrativeRow: AgentAdministrativeHistoryRow | null;
};

function isoDay(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

function nullableText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

export function administrativeEventToTimeline(
  row: AgentAdministrativeHistoryRow,
): AgentTimelineEvent {
  return {
    key: `admin:${row.id}`,
    category: "administrative",
    startDate: isoDay(row.start_date),
    endDate: row.end_date ? isoDay(row.end_date) : null,
    labelKey: agentHistoryEventTypeI18nKey(row.event_type),
    labelFallback: row.event_type,
    reason: nullableText(row.reason),
    observation: nullableText(row.observation),
    reference: nullableText(row.reference),
    createdAt: row.created_at,
    createdBy: nullableText(row.created_by),
    administrativeRow: row,
  };
}

function exclusionToTimeline(
  row: AgentExclusionHistoryItem,
  category: Extract<AgentTimelineCategory, "exclusion_agent" | "exclusion_dog">,
): AgentTimelineEvent {
  return {
    key: `exclusion:${row.id}`,
    category,
    startDate: isoDay(row.start_date),
    endDate: row.end_date ? isoDay(row.end_date) : null,
    labelKey: exclusionTypeI18nKey(row.exclusion_type),
    labelFallback: row.exclusion_type,
    reason: null,
    observation: nullableText(row.notes),
    reference: null,
    createdAt: row.created_at,
    createdBy: null,
    administrativeRow: null,
  };
}

function operationalCaseToTimeline(row: AgentOperationalCase): AgentTimelineEvent {
  return {
    key: `case:${row.id}`,
    category: "operational_case",
    startDate: isoDay(row.case_date),
    endDate: null,
    labelKey: `specialty.${row.specialty}`,
    labelFallback: row.specialty,
    reason: nullableText(row.checkpoint?.name ?? row.location),
    observation: nullableText(row.observations),
    reference: nullableText(row.case_number),
    createdAt: row.created_at,
    createdBy: null,
    administrativeRow: null,
  };
}

function rotationToTimeline(
  row: AgentRotationHistoryItem,
  hqReserveLabel: string,
): AgentTimelineEvent {
  return {
    key: `rotation:${row.id}`,
    category: "rotation",
    startDate: isoDay(row.planningDate),
    endDate: null,
    labelKey: "agentDetails.completeHistory.category.rotation",
    labelFallback: "Rotation",
    reason: row.isHqReserve ? hqReserveLabel : nullableText(row.checkpointName),
    observation: null,
    reference: null,
    createdAt: null,
    createdBy: null,
    administrativeRow: null,
  };
}

export type BuildAgentCompleteHistoryInput = {
  administrativeEvents: AgentAdministrativeHistoryRow[];
  /** Exclusions already linked to the agent (same rows as "Historique des exclusions"). */
  agentExclusions: AgentExclusionHistoryItem[];
  /** Exclusions targeting the agent's dog; ids shared with `agentExclusions` are kept once. */
  dogExclusions: AgentExclusionHistoryItem[];
  operationalCases: AgentOperationalCase[];
  /** Only the `AGENT_TIMELINE_ROTATION_LIMIT` most recent ones reach the timeline. */
  rotations: AgentRotationHistoryItem[];
  hqReserveLabel: string;
};

/** Newest first, then capped — callers may pass rotations in any order. */
function mostRecentRotations(rotations: AgentRotationHistoryItem[]): AgentRotationHistoryItem[] {
  return [...rotations]
    .sort((a, b) => {
      const byDate = isoDay(b.planningDate).localeCompare(isoDay(a.planningDate));
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    })
    .slice(0, AGENT_TIMELINE_ROTATION_LIMIT);
}

/** Most recent first; ties broken by creation timestamp then key for a stable order. */
export function buildAgentCompleteHistory(
  input: BuildAgentCompleteHistoryInput,
): AgentTimelineEvent[] {
  const events: AgentTimelineEvent[] = [];
  const seenKeys = new Set<string>();

  const push = (event: AgentTimelineEvent) => {
    if (seenKeys.has(event.key)) return;
    seenKeys.add(event.key);
    events.push(event);
  };

  for (const row of input.administrativeEvents) push(administrativeEventToTimeline(row));
  for (const row of input.agentExclusions) {
    push(exclusionToTimeline(row, row.dog_id ? "exclusion_dog" : "exclusion_agent"));
  }
  for (const row of input.dogExclusions) push(exclusionToTimeline(row, "exclusion_dog"));
  for (const row of input.operationalCases) push(operationalCaseToTimeline(row));
  for (const row of mostRecentRotations(input.rotations)) {
    push(rotationToTimeline(row, input.hqReserveLabel));
  }

  return events.sort((a, b) => {
    const byDate = b.startDate.localeCompare(a.startDate);
    if (byDate !== 0) return byDate;
    const byCreated = (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    if (byCreated !== 0) return byCreated;
    return a.key.localeCompare(b.key);
  });
}

export type AgentTimelineYearGroup = {
  year: string;
  events: AgentTimelineEvent[];
};

export function groupAgentTimelineByYear(events: AgentTimelineEvent[]): AgentTimelineYearGroup[] {
  const groups: AgentTimelineYearGroup[] = [];
  for (const event of events) {
    const year = event.startDate.slice(0, 4) || "—";
    const current = groups[groups.length - 1];
    if (current && current.year === year) {
      current.events.push(event);
    } else {
      groups.push({ year, events: [event] });
    }
  }
  return groups;
}
