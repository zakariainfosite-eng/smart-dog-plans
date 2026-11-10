import type { DbClient } from "@/integrations/database/client";
import { isAndroidCapacitorRuntime } from "@/lib/runtime-platform";
import { fetchPlanningSettings } from "@/lib/planning-settings";
import {
  PLANNING_REMINDER_CHANNEL_ID,
  PLANNING_REMINDER_TITLE,
  PLANNING_REMINDER_TYPE,
  buildPlanningNotificationPlan,
  buildPlanningReminderCandidate,
  type PendingPlanningNotification,
  type PlanningReminderAssignment,
  type PlanningShift,
} from "@/lib/notifications/android-planning-local-notifications";

type LocalNotificationsApi = typeof import("@capacitor/local-notifications").LocalNotifications;

async function loadLocalNotifications(): Promise<LocalNotificationsApi | null> {
  if (!isAndroidCapacitorRuntime()) return null;
  try {
    const mod = await import("@capacitor/local-notifications");
    return mod.LocalNotifications;
  } catch (error) {
    console.warn("[planning-notifications] plugin unavailable", error);
    return null;
  }
}

export async function requestAndroidPlanningNotificationPermission(): Promise<boolean> {
  const plugin = await loadLocalNotifications();
  if (!plugin) return false;
  const current = await plugin.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await plugin.requestPermissions();
  return requested.display === "granted";
}

async function ensureChannel(plugin: LocalNotificationsApi): Promise<void> {
  await plugin.createChannel({
    id: PLANNING_REMINDER_CHANNEL_ID,
    name: "Planning",
    description: "Rappels 1 heure avant le planning",
    importance: 5,
    visibility: 1,
    vibration: true,
  });
}

const LAST_IDS_STORAGE_KEY = "cynoplanning.android.planningNotificationIds";

function readPreviouslyScheduledIds(): number[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_IDS_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is number => Number.isInteger(value))
      : [];
  } catch {
    return [];
  }
}

function writePreviouslyScheduledIds(ids: number[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LAST_IDS_STORAGE_KEY, JSON.stringify(ids));
}

function extraTypeOf(extra: unknown): string | undefined {
  if (!extra || typeof extra !== "object") return undefined;
  const type = (extra as { type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
}

async function loadReminderAssignments(db: DbClient): Promise<PlanningReminderAssignment[]> {
  const { data: planningRows, error: planningError } = await db
    .from("planning")
    .select("id, planning_date, shift, section_id, validated")
    .eq("validated", true);
  if (planningError) throw planningError;

  const plannings = (planningRows ?? []) as Array<{
    id: string;
    planning_date: string;
    shift: PlanningShift;
    section_id: string;
    validated: boolean;
  }>;
  if (plannings.length === 0) return [];

  const planningIds = plannings.map((row) => row.id);
  const { data: assignmentRows, error: assignmentError } = await db
    .from("planning_assignments")
    .select("id, planning_id, checkpoint_post_id, agent_id, is_hq_reserve, is_off_duty")
    .in("planning_id", planningIds);
  if (assignmentError) throw assignmentError;

  const assignments = (assignmentRows ?? []) as Array<{
    id: string;
    planning_id: string;
    checkpoint_post_id: string | null;
    agent_id: string;
    is_hq_reserve: boolean;
    is_off_duty: boolean;
  }>;
  if (assignments.length === 0) return [];

  const agentIds = [...new Set(assignments.map((row) => row.agent_id))];
  const postIds = [
    ...new Set(assignments.map((row) => row.checkpoint_post_id).filter((id): id is string => Boolean(id))),
  ];
  const sectionIds = [...new Set(plannings.map((row) => row.section_id))];

  const [agentsResult, postsResult, sectionsResult] = await Promise.all([
    db.from("agents").select("id, first_name, last_name").in("id", agentIds),
    postIds.length > 0
      ? db.from("checkpoint_posts").select("id, checkpoint_id").in("id", postIds)
      : Promise.resolve({ data: [], error: null }),
    db.from("sections").select("id, name").in("id", sectionIds),
  ]);
  if (agentsResult.error) throw agentsResult.error;
  if (postsResult.error) throw postsResult.error;
  if (sectionsResult.error) throw sectionsResult.error;

  const posts = (postsResult.data ?? []) as Array<{ id: string; checkpoint_id: string }>;
  const checkpointIds = [...new Set(posts.map((row) => row.checkpoint_id))];
  const checkpointsResult =
    checkpointIds.length > 0
      ? await db.from("checkpoints").select("id, name").in("id", checkpointIds)
      : { data: [], error: null };
  if (checkpointsResult.error) throw checkpointsResult.error;

  const planningById = new Map(plannings.map((row) => [row.id, row]));
  const agentById = new Map(
    ((agentsResult.data ?? []) as Array<{ id: string; first_name: string; last_name: string }>).map((row) => [
      row.id,
      `${row.last_name} ${row.first_name}`.trim(),
    ]),
  );
  const sectionById = new Map(
    ((sectionsResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  );
  const postById = new Map(posts.map((row) => [row.id, row.checkpoint_id]));
  const checkpointById = new Map(
    ((checkpointsResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  );

  return assignments.map((row) => {
    const planning = planningById.get(row.planning_id);
    const checkpointId = row.checkpoint_post_id ? postById.get(row.checkpoint_post_id) : undefined;
    return {
      assignmentId: row.id,
      agentName: agentById.get(row.agent_id) || "Cynotechnicien",
      pointName: (checkpointId ? checkpointById.get(checkpointId) : undefined) || "Point",
      sectionName: (planning ? sectionById.get(planning.section_id) : undefined) || "Section",
      planningDate: planning?.planning_date ?? "",
      shift: planning?.shift ?? "day",
      isHqReserve: Boolean(row.is_hq_reserve),
      isOffDuty: Boolean(row.is_off_duty),
      hasCheckpoint: Boolean(row.checkpoint_post_id),
      validated: Boolean(planning?.validated),
    };
  });
}

/**
 * Cancel previous planning reminders and schedule one Android notification
 * per confirmed operational assignment, 1 hour before the shift start.
 * No-op off Android. Never writes SQLite.
 */
export async function syncAndroidPlanningNotifications(db: DbClient): Promise<{
  scheduled: number;
  cancelled: number;
}> {
  const plugin = await loadLocalNotifications();
  if (!plugin) return { scheduled: 0, cancelled: 0 };

  const granted = await requestAndroidPlanningNotificationPermission();
  if (!granted) {
    console.warn("[planning-notifications] permission denied");
    return { scheduled: 0, cancelled: 0 };
  }

  await ensureChannel(plugin);

  const [hours, assignments, pendingResult] = await Promise.all([
    fetchPlanningSettings(db),
    loadReminderAssignments(db),
    plugin.getPending(),
  ]);

  const now = new Date();
  const candidates = assignments
    .map((row) => buildPlanningReminderCandidate(row, hours, now))
    .filter((row): row is NonNullable<typeof row> => row != null);

  const pending: PendingPlanningNotification[] = (pendingResult.notifications ?? []).map((row) => ({
    id: row.id,
    extraType: extraTypeOf((row as { extra?: unknown }).extra),
  }));

  const plan = buildPlanningNotificationPlan({
    pending,
    previouslyScheduledIds: readPreviouslyScheduledIds(),
    candidates,
  });

  if (plan.cancelIds.length > 0) {
    await plugin.cancel({
      notifications: plan.cancelIds.map((id) => ({ id })),
    });
  }

  if (plan.schedule.length > 0) {
    await plugin.schedule({
      notifications: plan.schedule.map((row) => ({
        id: row.notificationId,
        title: PLANNING_REMINDER_TITLE,
        body: row.body,
        schedule: { at: row.remindAt, allowWhileIdle: true },
        channelId: PLANNING_REMINDER_CHANNEL_ID,
        extra: {
          type: PLANNING_REMINDER_TYPE,
          assignmentId: row.assignmentId,
        },
      })),
    });
  }

  writePreviouslyScheduledIds(plan.schedule.map((row) => row.notificationId));

  console.info("[planning-notifications] synced", {
    scheduled: plan.schedule.length,
    cancelled: plan.cancelIds.length,
  });
  return { scheduled: plan.schedule.length, cancelled: plan.cancelIds.length };
}

/** Best-effort wrapper so planning persist/delete never fails because of notifications. */
export async function syncAndroidPlanningNotificationsSafe(db: DbClient): Promise<void> {
  try {
    await syncAndroidPlanningNotifications(db);
  } catch (error) {
    console.warn("[planning-notifications] sync failed", error);
  }
}
