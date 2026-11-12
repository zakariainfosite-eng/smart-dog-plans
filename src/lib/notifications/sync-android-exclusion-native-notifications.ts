import type { DbClient } from "@/integrations/database/client";
import { exclusionApplyTarget } from "@/lib/agent-exclusions";
import { isAndroidCapacitorRuntime } from "@/lib/runtime-platform";
import {
  EXCLUSION_NATIVE_CHANNEL_ID,
  EXCLUSION_NATIVE_EXTRA_TYPE,
  buildExclusionNativeNotificationPlan,
  buildExclusionNativeReminderCandidate,
  planFutureExclusionLifecycleNativeSchedules,
  type PendingExclusionNativeNotification,
} from "@/lib/notifications/android-exclusion-local-notifications";
import { fetchExclusionSettingsOrDefault } from "@/lib/exclusion-settings";
import {
  auditAndroidExactAlarmSetting,
  buildCapacitorAndroidExactSchedule,
  coerceFutureCapacitorScheduleAt,
  describeDeviceLocalScheduleAt,
} from "@/lib/notifications/android-capacitor-exclusion-schedule";
import { combineLocalDateTime } from "@/lib/notifications/android-planning-local-notifications";
import type { ExclusionLifecycleRow } from "@/lib/notifications/exclusion-lifecycle-events";
import { isExclusionRowEnabled } from "@/lib/notifications/exclusion-reminder-candidates";
import { isMissingSoftDeleteColumn } from "@/lib/soft-delete";

type LocalNotificationsApi = typeof import("@capacitor/local-notifications").LocalNotifications;

const LAST_IDS_STORAGE_KEY = "cynoplanning.android.exclusionNativeNotificationIds";

type PendingLocalNotificationRow = {
  id: number;
  title?: string;
  body?: string;
  schedule?: { at?: Date | number | string };
  extra?: unknown;
};

function formatPendingScheduleAt(schedule: PendingLocalNotificationRow["schedule"]): string {
  const at = schedule?.at;
  if (at instanceof Date) return at.toISOString();
  if (typeof at === "number") return new Date(at).toISOString();
  if (typeof at === "string" && at.trim()) return at;
  return "—";
}

function isExclusionDiagnosticPending(row: PendingLocalNotificationRow): boolean {
  const extra = extraFields(row.extra);
  return extra.type === EXCLUSION_NATIVE_EXTRA_TYPE;
}

type PermissionAudit = {
  granted: boolean;
  checkDisplay: string;
  requestDisplay?: string;
};

async function auditAndroidExclusionNotificationPermission(
  plugin: LocalNotificationsApi,
): Promise<PermissionAudit> {
  const check = await plugin.checkPermissions();
  const checkDisplay = String(check.display ?? "unknown");
  if (checkDisplay === "granted") {
    return { granted: true, checkDisplay };
  }
  const requested = await plugin.requestPermissions();
  const requestDisplay = String(requested.display ?? "unknown");
  return { granted: requestDisplay === "granted", checkDisplay, requestDisplay };
}

async function logExclusionNativeNotificationsDiagnostic(
  plugin: LocalNotificationsApi,
  meta: {
    permission: PermissionAudit;
    candidatesScheduled: number;
    cancelled: number;
    now: Date;
    channelCreated: boolean;
    scheduleInvoked: boolean;
  },
): Promise<{ pendingCount: number; pendingAll: PendingLocalNotificationRow[] }> {
  const pendingResult = await plugin.getPending();
  const rows = (pendingResult.notifications ?? []) as PendingLocalNotificationRow[];
  const filtered = rows.filter(isExclusionDiagnosticPending);

  console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC]");
  console.info(`[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Heure actuelle (device): ${meta.now.toISOString()}`);
  console.info(`[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Nombre de notifications pending : ${filtered.length}`);
  console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Permission checkPermissions:", meta.permission.checkDisplay);
  if (meta.permission.requestDisplay) {
    console.info(
      "[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Permission requestPermissions:",
      meta.permission.requestDisplay,
    );
  }
  console.info(
    "[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Permission finale:",
    meta.permission.granted ? "granted" : "denied",
  );
  console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Canal:", {
    id: EXCLUSION_NATIVE_CHANNEL_ID,
    createdBeforeSchedule: meta.channelCreated,
    importance: 5,
    vibration: true,
    usedInSchedule: true,
  });
  console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] LocalNotifications.schedule invoqué:", meta.scheduleInvoked);
  console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Dernier sync natif:", {
    scheduled: meta.candidatesScheduled,
    cancelled: meta.cancelled,
  });
  console.info(
    "[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Verdict pending:",
    filtered.length > 0
      ? "CAS A — Android a des alarmes CynoPlanning exclusions en file"
      : "CAS B — getPending() vide pour les exclusions (aucune alarme enregistrée)",
  );

  for (const row of filtered) {
    const extra = extraFields(row.extra);
    console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] —", {
      id: row.id,
      title: row.title ?? "—",
      body: row.body ?? "—",
      scheduleAt: formatPendingScheduleAt(row.schedule),
      extra,
    });
  }

  return { pendingCount: filtered.length, pendingAll: filtered };
}

async function loadLocalNotifications(): Promise<LocalNotificationsApi | null> {
  if (!isAndroidCapacitorRuntime()) return null;
  try {
    const mod = await import("@capacitor/local-notifications");
    return mod.LocalNotifications;
  } catch (error) {
    console.warn("[exclusion-notifications] plugin unavailable", error);
    return null;
  }
}

export async function requestAndroidExclusionNotificationPermission(): Promise<boolean> {
  const plugin = await loadLocalNotifications();
  if (!plugin) return false;
  const audit = await auditAndroidExclusionNotificationPermission(plugin);
  return audit.granted;
}

async function ensureChannel(plugin: LocalNotificationsApi): Promise<void> {
  try {
    await plugin.deleteChannel({ id: EXCLUSION_NATIVE_CHANNEL_ID });
  } catch {
    /* channel may not exist yet */
  }
  await plugin.createChannel({
    id: EXCLUSION_NATIVE_CHANNEL_ID,
    name: "Exclusions",
    description: "Début, fin et disponibilité des exclusions",
    importance: 5,
    visibility: 1,
    vibration: true,
  });
}

async function scheduleExclusionLifecycleRows(
  plugin: LocalNotificationsApi,
  candidates: import("@/lib/notifications/android-exclusion-local-notifications").ExclusionNativeReminderCandidate[],
  now: Date,
): Promise<{ scheduled: number; scheduleInvoked: boolean }> {
  const payloads: Array<{
    id: number;
    title: string;
    body: string;
    fireAt: Date;
    exclusionId: string;
    milestone: string;
    kind: string;
    timeSlot: string;
  }> = [];

  for (const row of candidates) {
    const fireAt = coerceFutureCapacitorScheduleAt(row.fireAt, now);
    if (!fireAt) {
      console.warn("[EXCLUSION-NATIVE-TRACE] skip schedule (not in future)", {
        id: row.notificationId,
        exclusionId: row.exclusionId,
        milestone: row.milestone,
        requested: describeDeviceLocalScheduleAt(row.fireAt),
        now: describeDeviceLocalScheduleAt(now),
      });
      continue;
    }
    payloads.push({
      id: row.notificationId,
      title: row.title,
      body: row.body,
      fireAt,
      exclusionId: row.exclusionId,
      milestone: row.milestone,
      kind: row.kind,
      timeSlot: row.timeSlot,
    });
  }

  if (payloads.length === 0) {
    return { scheduled: 0, scheduleInvoked: false };
  }

  console.info("[EXCLUSION-NATIVE-TRACE] LocalNotifications.schedule →", {
    count: payloads.length,
    samples: payloads.slice(0, 3).map((row) => ({
      id: row.id,
      exclusionId: row.exclusionId,
      milestone: row.milestone,
      fireAt: describeDeviceLocalScheduleAt(row.fireAt),
      channelId: EXCLUSION_NATIVE_CHANNEL_ID,
    })),
  });

  const scheduleResult = await plugin.schedule({
    notifications: payloads.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      schedule: buildCapacitorAndroidExactSchedule(row.fireAt),
      channelId: EXCLUSION_NATIVE_CHANNEL_ID,
      smallIcon: "ic_stat_cyno",
      extra: {
        type: EXCLUSION_NATIVE_EXTRA_TYPE,
        exclusionId: row.exclusionId,
        milestone: row.milestone,
        kind: row.kind,
        timeSlot: row.timeSlot,
      },
    })),
  });
  console.info("[EXCLUSION-NATIVE-TRACE] LocalNotifications.schedule → résultat", scheduleResult);

  const pendingAfter = await plugin.getPending();
  const pendingRows = (pendingAfter.notifications ?? []) as PendingLocalNotificationRow[];
  const lifecyclePending = pendingRows.filter(isExclusionDiagnosticPending);

  console.info("[EXCLUSION-NATIVE-TRACE] getPending (immédiatement après schedule)", {
    pendingTotal: pendingRows.length,
    pendingExclusionCount: lifecyclePending.length,
    notifications: lifecyclePending.map((row) => ({
      id: row.id,
      title: row.title,
      scheduleAt: formatPendingScheduleAt(row.schedule),
      extra: extraFields(row.extra),
    })),
  });

  return { scheduled: payloads.length, scheduleInvoked: true };
}

function writePreviouslyScheduledIds(ids: number[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LAST_IDS_STORAGE_KEY, JSON.stringify(ids));
}

function extraFields(extra: unknown): { type?: string; exclusionId?: string; milestone?: string } {
  if (!extra || typeof extra !== "object") return {};
  const source = extra as Record<string, unknown>;
  return {
    type: typeof source.type === "string" ? source.type : undefined,
    exclusionId: typeof source.exclusionId === "string" ? source.exclusionId : undefined,
    milestone: typeof source.milestone === "string" ? source.milestone : undefined,
  };
}

async function loadAllActiveExclusions(db: DbClient): Promise<ExclusionLifecycleRow[]> {
  const run = async (withSoftDelete: boolean) => {
    let query = db
      .from("agent_exclusions")
      .select("id, agent_id, dog_id, exclusion_type, start_date, end_date, active")
      .eq("active", true);
    if (withSoftDelete) {
      query = query.eq("is_deleted", false);
    }
    return query;
  };

  const { data, error } = await run(true);
  if (!error) {
    return ((data ?? []) as ExclusionLifecycleRow[]).filter((row) => isExclusionRowEnabled(row.active));
  }
  if (isMissingSoftDeleteColumn(error)) {
    const legacy = await run(false);
    if (legacy.error) throw legacy.error;
    return ((legacy.data ?? []) as ExclusionLifecycleRow[]).filter((row) =>
      isExclusionRowEnabled(row.active),
    );
  }
  throw error;
}

type AgentNameRow = { id: string; first_name: string; last_name: string };
type DogNameRow = { id: string; name: string };

function formatAgentName(agent: AgentNameRow): string {
  return `${agent.first_name} ${agent.last_name}`.trim();
}

async function resolveSubjectName(
  db: DbClient,
  row: ExclusionLifecycleRow,
  agentCache: Map<string, string>,
  dogCache: Map<string, string>,
): Promise<string> {
  const subjectKind = exclusionApplyTarget(row.exclusion_type, row.dog_id);
  if (subjectKind === "dog" && row.dog_id) {
    const cached = dogCache.get(row.dog_id);
    if (cached) return cached;
    const { data, error } = await db.from("dogs").select("id, name").eq("id", row.dog_id).maybeSingle();
    if (error) throw error;
    const name = (data as DogNameRow | null)?.name?.trim() || "—";
    dogCache.set(row.dog_id, name);
    return name;
  }
  if (row.agent_id) {
    const cached = agentCache.get(row.agent_id);
    if (cached) return cached;
    const { data, error } = await db
      .from("agents")
      .select("id, first_name, last_name")
      .eq("id", row.agent_id)
      .maybeSingle();
    if (error) throw error;
    const name = data ? formatAgentName(data as AgentNameRow) : "—";
    agentCache.set(row.agent_id, name);
    return name;
  }
  return "—";
}

/**
 * Cancel and reschedule all future exclusion lifecycle notifications on Android.
 * Android owns delivery — JS does not need to run at fire time.
 */
export async function syncAndroidExclusionNativeNotifications(db: DbClient): Promise<{
  scheduled: number;
  cancelled: number;
}> {
  console.info("[EXCLUSION-NATIVE-TRACE] syncAndroidExclusionNativeNotifications → entrée", {
    isAndroidCapacitorRuntime: isAndroidCapacitorRuntime(),
  });

  const plugin = await loadLocalNotifications();
  if (!plugin) {
    console.info(
      "[EXCLUSION-NATIVE-TRACE] syncAndroidExclusionNativeNotifications → abandon (plugin null / pas Android)",
    );
    return { scheduled: 0, cancelled: 0 };
  }

  const permission = await auditAndroidExclusionNotificationPermission(plugin);
  if (!permission.granted) {
    console.warn("[exclusion-notifications] permission denied", permission);
    console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC]");
    console.info(`[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Heure actuelle (device): ${new Date().toISOString()}`);
    console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Nombre de notifications pending : 0");
    console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Permission checkPermissions:", permission.checkDisplay);
    if (permission.requestDisplay) {
      console.info(
        "[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Permission requestPermissions:",
        permission.requestDisplay,
      );
    }
    console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Permission finale: denied");
    console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Canal:", EXCLUSION_NATIVE_CHANNEL_ID, "(non créé — permission refusée)");
    console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Verdict pending: CAS B — permission refusée");
    return { scheduled: 0, cancelled: 0 };
  }

  await ensureChannel(plugin);
  console.info("[EXCLUSION-NATIVE-TRACE] createChannel OK", { channelId: EXCLUSION_NATIVE_CHANNEL_ID });

  const exactAlarm = await auditAndroidExactAlarmSetting(plugin);
  console.info("[EXCLUSION-NATIVE-TRACE] exact alarm", exactAlarm);
  if (exactAlarm.supported && !exactAlarm.granted) {
    console.warn(
      "[EXCLUSION-NATIVE-TRACE] exact alarms désactivées — ouvrir Réglages → Alarmes et rappels pour CynoPlanning",
    );
  }

  const [exclusions, pendingResult, exclusionSettings] = await Promise.all([
    loadAllActiveExclusions(db),
    plugin.getPending(),
    fetchExclusionSettingsOrDefault(db),
  ]);

  const now = new Date();
  const agentCache = new Map<string, string>();
  const dogCache = new Map<string, string>();
  const candidates = [];

  for (const exclusion of exclusions) {
    const subjectName = await resolveSubjectName(db, exclusion, agentCache, dogCache);
    const milestones = planFutureExclusionLifecycleNativeSchedules(exclusion, exclusionSettings);
    const milestoneAudit = milestones.map((planned) => {
      const fireAt = combineLocalDateTime(planned.fireDayISO, planned.hhmm);
      return {
        milestone: planned.milestone,
        fireDayISO: planned.fireDayISO,
        hhmm: planned.hhmm,
        fireAtIso: fireAt.toISOString(),
        fireAtInFuture: fireAt.getTime() > now.getTime(),
      };
    });
    console.info("[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Exclusion", {
      exclusionId: exclusion.id,
      start_date: exclusion.start_date,
      end_date: exclusion.end_date,
      exclusion_type: exclusion.exclusion_type,
      milestones: milestoneAudit,
    });

    for (const planned of milestones) {
      const candidate = buildExclusionNativeReminderCandidate(exclusion, planned, subjectName, now);
      if (candidate) candidates.push(candidate);
    }
  }

  const pending: PendingExclusionNativeNotification[] = (pendingResult.notifications ?? []).map((row) => {
    const extra = extraFields((row as { extra?: unknown }).extra);
    return {
      id: row.id,
      extraType: extra.type,
      exclusionId: extra.exclusionId,
      milestone: extra.milestone,
      schedule: (row as PendingLocalNotificationRow).schedule,
    };
  });

  const plan = buildExclusionNativeNotificationPlan({
    pending,
    candidates,
  });

  console.info("[EXCLUSION-NATIVE-TRACE] reconcile", {
    expectedFuture: candidates.length,
    lifecyclePending: pending.filter((row) => row.extraType === EXCLUSION_NATIVE_EXTRA_TYPE).length,
    toSchedule: plan.schedule.length,
    toCancel: plan.cancelIds.length,
  });

  if (plan.cancelIds.length > 0) {
    console.info("[EXCLUSION-NATIVE-TRACE] cancelIds", plan.cancelIds);
    await plugin.cancel({
      notifications: plan.cancelIds.map((id) => ({ id })),
    });
  }

  const { scheduled: scheduledCount, scheduleInvoked } = await scheduleExclusionLifecycleRows(
    plugin,
    plan.schedule,
    now,
  );
  if (!scheduleInvoked) {
    console.info("[EXCLUSION-NATIVE-TRACE] LocalNotifications.schedule → non appelé (0 candidat futur)");
  }

  writePreviouslyScheduledIds(candidates.map((row) => row.notificationId));

  console.info("[exclusion-notifications] native sync", {
    scheduled: scheduledCount,
    cancelled: plan.cancelIds.length,
    exclusions: exclusions.length,
  });
  console.info(
    "[EXCLUSION-NOTIFICATIONS-DIAGNOSTIC] Nombre de notifications exclusions programmées :",
    scheduledCount,
  );

  await logExclusionNativeNotificationsDiagnostic(plugin, {
    permission,
    candidatesScheduled: scheduledCount,
    cancelled: plan.cancelIds.length,
    now,
    channelCreated: true,
    scheduleInvoked,
  });

  return { scheduled: scheduledCount, cancelled: plan.cancelIds.length };
}

/** Cancel every native notification for one exclusion (after delete). */
export async function cancelAndroidExclusionNativeNotificationsForExclusion(
  exclusionId: string,
): Promise<void> {
  const plugin = await loadLocalNotifications();
  if (!plugin) return;
  const pending = await plugin.getPending();
  const ids = (pending.notifications ?? [])
    .filter((row) => {
      const extra = extraFields((row as { extra?: unknown }).extra);
      return extra.exclusionId === exclusionId && extra.type === EXCLUSION_NATIVE_EXTRA_TYPE;
    })
    .map((row) => row.id);
  if (ids.length === 0) return;
  await plugin.cancel({ notifications: ids.map((id) => ({ id })) });
}

export async function syncAndroidExclusionNativeNotificationsSafe(db: DbClient): Promise<void> {
  console.info("[EXCLUSION-NATIVE-TRACE] syncAndroidExclusionNativeNotificationsSafe → entrée");
  try {
    const result = await syncAndroidExclusionNativeNotifications(db);
    console.info("[EXCLUSION-NATIVE-TRACE] syncAndroidExclusionNativeNotificationsSafe → OK", result);
  } catch (error) {
    console.warn("[exclusion-notifications] native sync failed", error);
    console.info("[EXCLUSION-NATIVE-TRACE] syncAndroidExclusionNativeNotificationsSafe → ERREUR", error);
  }
}
