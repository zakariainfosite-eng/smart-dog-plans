/**
 * Historique administratif du fonctionnaire — informational only.
 *
 * Rows in `agent_administrative_history` are manual (or future CSV/Excel import)
 * entries describing events that may predate CynoPlanning. They never feed the
 * planning engine, Smart Rotation, exclusions or dog logic: events created by the
 * existing modules stay in their own tables and are merged at read time
 * (see `@/lib/agent-history-timeline`), so nothing is recorded twice.
 */
import { format, parseISO } from "date-fns";

import type { DbClient } from "@/integrations/database/client";
import type { AuthRole } from "@/integrations/auth";
import type { Database } from "@/integrations/database/schema-types";

type Db = DbClient;

export type AgentHistoryEventType = Database["public"]["Enums"]["agent_history_event_type"];
export type AgentHistorySourceType = Database["public"]["Enums"]["agent_history_source_type"];
export type AgentAdministrativeHistoryRow =
  Database["public"]["Tables"]["agent_administrative_history"]["Row"];

export const AGENT_HISTORY_TABLE = "agent_administrative_history";

/** Display order in the form selector and in the filters. */
export const AGENT_HISTORY_EVENT_TYPES: AgentHistoryEventType[] = [
  "conge",
  "permission",
  "arret_maladie",
  "formation",
  "exclusion_formation",
  "autre",
];

export function agentHistoryEventTypeI18nKey(type: string): string {
  return `agentDetails.adminHistory.type.${type}`;
}

/** `dd/MM/yyyy`, tolerant to malformed or timestamped stored values. */
export function formatHistoryDate(value: string | null | undefined): string {
  if (!value) return "—";
  const day = value.slice(0, 10);
  try {
    return format(parseISO(day), "dd/MM/yyyy");
  } catch {
    return day;
  }
}

/** Mutating an administrative history entry follows the same rule as other admin-only settings. */
export function canManageAgentHistory(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}

export type AgentHistoryFormValues = {
  event_type: AgentHistoryEventType;
  start_date: string;
  end_date: string;
  reason: string;
  observation: string;
  reference: string;
};

export function createEmptyAgentHistoryForm(): AgentHistoryFormValues {
  return {
    event_type: "conge",
    start_date: "",
    end_date: "",
    reason: "",
    observation: "",
    reference: "",
  };
}

export function toAgentHistoryForm(row: AgentAdministrativeHistoryRow): AgentHistoryFormValues {
  return {
    event_type: row.event_type,
    start_date: row.start_date,
    end_date: row.end_date ?? "",
    reason: row.reason ?? "",
    observation: row.observation ?? "",
    reference: row.reference ?? "",
  };
}

export type AgentHistoryFormErrors = Partial<Record<keyof AgentHistoryFormValues, string>>;

/**
 * Manual entries describe the past: no operational rule (overlap, active exclusion,
 * planning availability) is applied here — only structural validity is enforced.
 */
export function validateAgentHistoryForm(
  values: AgentHistoryFormValues,
  t: (key: string) => string,
): AgentHistoryFormErrors {
  const errors: AgentHistoryFormErrors = {};
  if (
    values.start_date.trim() &&
    values.end_date.trim() &&
    values.end_date.trim() < values.start_date.trim()
  ) {
    errors.end_date = t("agentDetails.adminHistory.validation.endBeforeStart");
  }
  return errors;
}

function nullableText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

export async function fetchAgentAdministrativeHistory(
  db: Db,
  agentId: string,
): Promise<{ data: AgentAdministrativeHistoryRow[]; error: unknown | null }> {
  const { data, error } = await db
    .from(AGENT_HISTORY_TABLE)
    .select("*")
    .eq("agent_id", agentId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };
  return { data: (data ?? []) as AgentAdministrativeHistoryRow[], error: null };
}

export type AgentHistoryEntryInput = AgentHistoryFormValues & {
  agent_id: string;
  source_type?: AgentHistorySourceType;
  source_id?: string | null;
  created_by?: string | null;
};

function toRowPayload(input: AgentHistoryEntryInput) {
  return {
    agent_id: input.agent_id,
    event_type: input.event_type,
    start_date: input.start_date.trim(),
    end_date: nullableText(input.end_date),
    reason: nullableText(input.reason),
    observation: nullableText(input.observation),
    reference: nullableText(input.reference),
    source_type: input.source_type ?? ("manual" as AgentHistorySourceType),
    source_id: nullableText(input.source_id ?? null),
  };
}

export async function createAgentHistoryEntry(
  db: Db,
  input: AgentHistoryEntryInput,
): Promise<void> {
  const { error } = await db.from(AGENT_HISTORY_TABLE).insert({
    ...toRowPayload(input),
    created_by: nullableText(input.created_by ?? null),
  });
  if (error) throw error;
}

export async function updateAgentHistoryEntry(
  db: Db,
  id: string,
  input: AgentHistoryEntryInput,
): Promise<void> {
  const { error } = await db
    .from(AGENT_HISTORY_TABLE)
    .update({ ...toRowPayload(input), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAgentHistoryEntry(db: Db, id: string): Promise<void> {
  const { error } = await db.from(AGENT_HISTORY_TABLE).delete().eq("id", id);
  if (error) throw error;
}

/**
 * Entry point reserved for the future "Importer un historique" (CSV/Excel) action:
 * the parsed rows only need `source_type: "import"` to stay distinguishable.
 */
export async function importAgentHistoryEntries(
  db: Db,
  entries: AgentHistoryEntryInput[],
): Promise<void> {
  if (entries.length === 0) return;
  const { error } = await db.from(AGENT_HISTORY_TABLE).insert(
    entries.map((entry) => ({
      ...toRowPayload(entry),
      source_type: entry.source_type ?? ("import" as AgentHistorySourceType),
      created_by: nullableText(entry.created_by ?? null),
    })),
  );
  if (error) throw error;
}
