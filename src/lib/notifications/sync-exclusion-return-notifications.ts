import type { DbClient } from "@/integrations/database/client";
import {
  exclusionApplyTarget,
  planningDayISO,
  type ExclusionType,
} from "@/lib/agent-exclusions";
import { isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import { randomId } from "@/lib/random-id";
import {
  daysUntilReturn,
  exclusionReturnDateISO,
  exclusionScanWindow,
  historyCutoffISO,
  milestoneForDaysUntil,
} from "@/lib/notifications/exclusion-return-dates";
import {
  NOTIFICATION_HISTORY_DAYS,
  notificationTypeForExclusion,
  type ExclusionNotificationRecord,
  type ExclusionNotificationSubjectKind,
  type ExclusionReturnMilestone,
} from "@/lib/notifications/exclusion-return-types";

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

async function loadCandidateExclusions(
  db: DbClient,
  minEndDate: string,
  maxEndDate: string,
): Promise<ExclusionRow[]> {
  const run = async (withSoftDelete: boolean) => {
    let query = db
      .from("agent_exclusions")
      .select("id, agent_id, dog_id, exclusion_type, end_date, active")
      .gte("end_date", minEndDate)
      .lte("end_date", maxEndDate);
    if (withSoftDelete) {
      query = query.eq("is_deleted", false);
    }
    return query;
  };

  const { data, error } = await run(true);
  if (!error) return (data ?? []) as ExclusionRow[];
  if (isMissingSoftDeleteColumn(error)) {
    const legacy = await run(false);
    if (legacy.error) throw legacy.error;
    return (legacy.data ?? []) as ExclusionRow[];
  }
  throw error;
}

async function loadExistingKeys(
  db: DbClient,
): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("exclusion_notifications")
    .select("id, exclusion_id, milestone");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const key = `${row.exclusion_id}::${row.milestone}`;
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
    .lt("return_date", cutoffISO);
  if (error) throw error;
  return count ?? 0;
}

export type SyncExclusionNotificationsResult = {
  created: number;
  pruned: number;
  scanned: number;
};

/**
 * Generate milestone notifications for upcoming exclusion returns and prune
 * history older than 30 days. Idempotent — safe on every app start / dashboard open.
 */
export async function syncExclusionReturnNotifications(
  db: DbClient,
  reference: Date | string = new Date(),
): Promise<SyncExclusionNotificationsResult> {
  const todayISO = planningDayISO(reference);
  const { minEndDate, maxEndDate } = exclusionScanWindow(todayISO);
  const cutoff = historyCutoffISO(todayISO, NOTIFICATION_HISTORY_DAYS);

  const [exclusions, existing] = await Promise.all([
    loadCandidateExclusions(db, minEndDate, maxEndDate),
    loadExistingKeys(db),
  ]);

  const agentCache = new Map<string, string>();
  const dogCache = new Map<string, string>();
  const inserts: Omit<ExclusionNotificationRecord, "created_at">[] = [];

  for (const exclusion of exclusions) {
    const returnDate = exclusionReturnDateISO(exclusion.end_date);
    const daysUntil = daysUntilReturn(returnDate, todayISO);
    const milestone = milestoneForDaysUntil(daysUntil);
    if (!milestone) continue;

    const key = `${exclusion.id}::${milestone}`;
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
      end_date: exclusion.end_date.slice(0, 10),
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
  return { created: inserts.length, pruned, scanned: exclusions.length };
}

export async function fetchExclusionNotifications(
  db: DbClient,
): Promise<ExclusionNotificationRecord[]> {
  const { data, error } = await db
    .from("exclusion_notifications")
    .select(
      "id, exclusion_id, agent_id, dog_id, subject_kind, notification_type, milestone, end_date, return_date, subject_name, exclusion_type, is_read, created_at",
    )
    .order("return_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ExclusionNotificationRecord[];
}

export async function markExclusionNotificationsRead(
  db: DbClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const updatedAt = new Date().toISOString();
  const { error } = await db
    .from("exclusion_notifications")
    .update({ is_read: true })
    .in("id", ids);
  if (error) throw error;
  void updatedAt;
}

export async function markAllExclusionNotificationsRead(db: DbClient): Promise<void> {
  const { error } = await db
    .from("exclusion_notifications")
    .update({ is_read: true })
    .eq("is_read", false);
  if (error) throw error;
}
