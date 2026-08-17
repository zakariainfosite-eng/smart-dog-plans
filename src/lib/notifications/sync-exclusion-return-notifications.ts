import type { DbClient } from "@/integrations/database/client";
import {
  exclusionApplyTarget,
  planningDayISO,
  type ExclusionType,
} from "@/lib/agent-exclusions";
import { isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import { randomId } from "@/lib/random-id";
import {
  daysUntilEnd,
  exclusionReturnDateISO,
  historyCutoffISO,
  milestoneForDaysUntilEnd,
  exclusionScanWindow,
} from "@/lib/notifications/exclusion-return-dates";
import { fetchExclusionSettingsOrDefault, isConfiguredReminderMilestone } from "@/lib/exclusion-settings";
import {
  loadActiveExclusionsInReminderWindow,
  isExclusionRowEnabled,
} from "@/lib/notifications/exclusion-reminder-candidates";
import {
  exclusionNotificationDedupeKey,
  isActiveEndMilestone,
  NOTIFICATION_HISTORY_DAYS,
  notificationTypeForExclusion,
  type ExclusionNotificationRecord,
  type ExclusionNotificationSubjectKind,
  type ExclusionReturnMilestone,
} from "@/lib/notifications/exclusion-return-types";

const DEBUG = import.meta.env.DEV;

type ExclusionRow = {
  id: string;
  agent_id: string | null;
  dog_id: string | null;
  exclusion_type: ExclusionType | string;
  end_date: string;
  active: boolean;
};

type AgentNameRow = { id: string; first_name: string; last_name: string };
type DogNameRow = { id: string; name: string };

async function loadExistingKeys(
  db: DbClient,
): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("exclusion_notifications")
    .select("id, exclusion_id, milestone");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const key = exclusionNotificationDedupeKey(row.exclusion_id as string, row.milestone as string);
    map.set(key, row.id as string);
  }
  return map;
}

function formatAgentName(agent: AgentNameRow): string {
  return `${agent.first_name} ${agent.last_name}`.trim();
}

async function resolveSubjectName(
  db: DbClient,
  exclusion: ExclusionRow,
  subjectKind: ExclusionNotificationSubjectKind,
  agentCache: Map<string, string>,
  dogCache: Map<string, string>,
): Promise<string> {
  if (subjectKind === "dog" && exclusion.dog_id) {
    const cached = dogCache.get(exclusion.dog_id);
    if (cached) return cached;
    const { data, error } = await db
      .from("dogs")
      .select("id, name")
      .eq("id", exclusion.dog_id)
      .maybeSingle();
    if (error) throw error;
    const name = (data as DogNameRow | null)?.name?.trim() || "—";
    dogCache.set(exclusion.dog_id, name);
    return name;
  }

  if (exclusion.agent_id) {
    const cached = agentCache.get(exclusion.agent_id);
    if (cached) return cached;
    const { data, error } = await db
      .from("agents")
      .select("id, first_name, last_name")
      .eq("id", exclusion.agent_id)
      .maybeSingle();
    if (error) throw error;
    const name = data ? formatAgentName(data as AgentNameRow) : "—";
    agentCache.set(exclusion.agent_id, name);
    return name;
  }

  return "—";
}

async function pruneOldNotifications(db: DbClient, cutoffISO: string): Promise<number> {
  const { error, count } = await db
    .from("exclusion_notifications")
    .delete()
    .lt("end_date", cutoffISO);
  if (error) throw error;
  return count ?? 0;
}

async function reconcileStaleNotifications(
  db: DbClient,
  todayISO: string,
): Promise<number> {
  const { data, error } = await db
    .from("exclusion_notifications")
    .select("id, exclusion_id, end_date, milestone");
  if (error) throw error;
  if (!data?.length) return 0;

  const exclusionIds = [...new Set(data.map((row) => row.exclusion_id as string))];
  const { data: exclusions, error: exclusionsError } = await db
    .from("agent_exclusions")
    .select("id, end_date, active")
    .in("id", exclusionIds);
  if (exclusionsError) throw exclusionsError;

  const exclusionById = new Map(
    (exclusions ?? []).map((row) => [row.id as string, row as Pick<ExclusionRow, "id" | "end_date" | "active">]),
  );

  const staleIds: string[] = [];
  for (const row of data) {
    const exclusion = exclusionById.get(row.exclusion_id as string);
    const endDate = String(row.end_date ?? "").slice(0, 10);
    const milestone = row.milestone as ExclusionReturnMilestone;
    const exclusionEnd = String(exclusion?.end_date ?? "").slice(0, 10);
    const shouldDelete =
      !exclusion ||
      !isExclusionRowEnabled(exclusion.active) ||
      !endDate ||
      endDate !== exclusionEnd ||
      endDate < todayISO ||
      (isActiveEndMilestone(milestone) && !milestoneForDaysUntilEnd(daysUntilEnd(endDate, todayISO)));
    if (shouldDelete) staleIds.push(row.id as string);
  }

  if (staleIds.length === 0) return 0;
  const { error: deleteError, count } = await db
    .from("exclusion_notifications")
    .delete()
    .in("id", staleIds);
  if (deleteError) throw deleteError;
  return count ?? staleIds.length;
}

export type SyncExclusionNotificationsResult = {
  created: number;
  pruned: number;
  reconciled: number;
  scanned: number;
};

/**
 * Generate milestone notifications (2 days, 1 day, end day before exclusion end)
 * and prune stale/history rows. Idempotent — safe on every app start / dashboard open.
 */
export async function syncExclusionReturnNotifications(
  db: DbClient,
  reference: Date | string = new Date(),
): Promise<SyncExclusionNotificationsResult> {
  const todayISO = planningDayISO(reference);
  const { minEndDate, maxEndDate } = exclusionScanWindow(todayISO);
  const cutoff = historyCutoffISO(todayISO, NOTIFICATION_HISTORY_DAYS);

  const exclusions = await loadActiveExclusionsInReminderWindow(db, reference);
  const reminderSettings = await fetchExclusionSettingsOrDefault(db);
  const reconciled = await reconcileStaleNotifications(db, todayISO);
  const existing = await loadExistingKeys(db);

  if (DEBUG) {
    console.log("[notifications] scan", {
      todayISO,
      window: { minEndDate, maxEndDate },
      activeExclusionsInWindow: exclusions.length,
      exclusions: exclusions.map((row) => ({
        id: row.id,
        type: row.exclusion_type,
        endDate: row.end_date?.slice?.(0, 10) ?? null,
        daysUntilEnd: row.end_date ? daysUntilEnd(row.end_date, todayISO) : null,
      })),
    });
  }

  const agentCache = new Map<string, string>();
  const dogCache = new Map<string, string>();
  const inserts: Omit<ExclusionNotificationRecord, "created_at">[] = [];

  for (const exclusion of exclusions) {
    const endDate = exclusion.end_date?.slice?.(0, 10) ?? "";
    if (!endDate) continue;
    const daysUntil = daysUntilEnd(endDate, todayISO);
    const milestone = milestoneForDaysUntilEnd(daysUntil);
    if (!milestone || !isConfiguredReminderMilestone(milestone, reminderSettings)) continue;

    const returnDate = exclusionReturnDateISO(endDate);
    if (!returnDate) continue;

    const key = exclusionNotificationDedupeKey(exclusion.id, milestone);
    if (existing.has(key)) continue;

    const subjectKind: ExclusionNotificationSubjectKind =
      exclusionApplyTarget(exclusion.exclusion_type, exclusion.dog_id) === "dog"
        ? "dog"
        : "personnel";

    const subjectName = await resolveSubjectName(
      db,
      exclusion,
      subjectKind,
      agentCache,
      dogCache,
    );

    inserts.push({
      id: randomId(),
      exclusion_id: exclusion.id,
      agent_id: exclusion.agent_id,
      dog_id: exclusion.dog_id,
      subject_kind: subjectKind,
      notification_type: notificationTypeForExclusion(exclusion.exclusion_type, subjectKind),
      milestone: milestone as ExclusionReturnMilestone,
      end_date: endDate,
      return_date: returnDate,
      subject_name: subjectName,
      exclusion_type: exclusion.exclusion_type,
      is_read: false,
    });
  }

  if (inserts.length > 0) {
    const { error } = await db.from("exclusion_notifications").insert(inserts);
    if (error) throw error;
  }

  const pruned = await pruneOldNotifications(db, cutoff);
  return { created: inserts.length, pruned, reconciled, scanned: exclusions.length };
}

export async function fetchExclusionNotifications(
  db: DbClient,
): Promise<ExclusionNotificationRecord[]> {
  console.info("[notifications] fetchExclusionNotifications", {
    table: "exclusion_notifications",
    sql: "SELECT ... FROM exclusion_notifications ORDER BY end_date ASC, created_at DESC",
  });
  const { data, error } = await db
    .from("exclusion_notifications")
    .select(
      "id, exclusion_id, agent_id, dog_id, subject_kind, notification_type, milestone, end_date, return_date, subject_name, exclusion_type, is_read, created_at",
    )
    .order("end_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[notifications] fetchExclusionNotifications failed", {
      table: "exclusion_notifications",
      error,
    });
    throw error;
  }
  console.info("[notifications] fetchExclusionNotifications rows", {
    table: "exclusion_notifications",
    count: (data ?? []).length,
  });
  return (data ?? []) as ExclusionNotificationRecord[];
}

export async function markExclusionNotificationsRead(
  db: DbClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db
    .from("exclusion_notifications")
    .update({ is_read: true })
    .in("id", ids);
  if (error) throw error;
}

export async function markAllExclusionNotificationsRead(db: DbClient): Promise<void> {
  const { error } = await db
    .from("exclusion_notifications")
    .update({ is_read: true })
    .eq("is_read", false);
  if (error) throw error;
}
