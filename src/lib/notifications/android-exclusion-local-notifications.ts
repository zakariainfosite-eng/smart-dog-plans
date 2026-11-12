import { addDays, format, parseISO } from "date-fns";

import { isOpenEndedExclusionType, isValidPlanningDayISO } from "@/lib/agent-exclusions";
import {
  DEFAULT_EXCLUSION_SETTINGS,
  type ExclusionSettings,
  normalizeExclusionNativeTimes,
} from "@/lib/exclusion-settings";
import type { ExclusionLifecycleRow } from "@/lib/notifications/exclusion-lifecycle-events";
import { isExclusionRowEnabled } from "@/lib/notifications/exclusion-reminder-candidates";
import { combineLocalDateTime } from "@/lib/notifications/android-planning-local-notifications";
import { exclusionReturnDateISO } from "@/lib/notifications/exclusion-return-dates";
import { buildAndroidLifecycleNativeTitleBody } from "@/lib/notifications/android-exclusion-lifecycle-native-messages";
import { pendingScheduleMatchesFireAt } from "@/lib/notifications/android-exclusion-pending-schedule";
import {
  filterProtectedAndroidNotificationCancelIds,
  isReservedAndroidExclusionNotificationId,
} from "@/lib/notifications/android-exclusion-reserved-ids";

export const EXCLUSION_NATIVE_EXTRA_TYPE = "exclusion-lifecycle";
export const EXCLUSION_NATIVE_CHANNEL_ID = "exclusion-lifecycle";
export const EXCLUSION_NATIVE_TITLE = "CynoPlanning";

export type NativeLifecycleMilestoneKind = "start" | "d2" | "ended";
export type NativeScheduleTimeSlot = "t1" | "t2";

/** Clé stable : `start@t1`, `d2@t2`, `ended@t1`, … */
export type ExclusionNativeMilestoneKey = string;

export type ExclusionNativeReminderCandidate = {
  exclusionId: string;
  milestone: ExclusionNativeMilestoneKey;
  kind: NativeLifecycleMilestoneKind;
  timeSlot: NativeScheduleTimeSlot;
  notificationId: number;
  title: string;
  body: string;
  fireAt: Date;
};

export type PendingExclusionNativeNotification = {
  id: number;
  extraType?: string;
  exclusionId?: string;
  milestone?: string;
  /** Raw Capacitor schedule from getPending() — used for reconciliation only. */
  schedule?: unknown;
};

export type PlannedNativeExclusionNotification = {
  milestone: ExclusionNativeMilestoneKey;
  kind: NativeLifecycleMilestoneKind;
  timeSlot: NativeScheduleTimeSlot;
  fireDayISO: string;
  hhmm: string;
};

function isoDay(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 10);
}

/**
 * Stable Android notification id from exclusion UUID + milestone key (incl. time slot).
 */
export function notificationIdForExclusionMilestone(
  exclusionId: string,
  milestone: ExclusionNativeMilestoneKey,
): number {
  const key = `${exclusionId}:${milestone}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let id = (hash >>> 0) % 700_000_000 + 300_000;
  while (isReservedAndroidExclusionNotificationId(id)) {
    id += 1;
  }
  return id;
}

export function notificationIdsForExclusionPlan(
  exclusionId: string,
  planned: PlannedNativeExclusionNotification[],
): number[] {
  return planned.map((row) => notificationIdForExclusionMilestone(exclusionId, row.milestone));
}

function expandMilestoneToBothTimes(
  kind: NativeLifecycleMilestoneKind,
  fireDayISO: string,
  times: { time1: string; time2: string },
): PlannedNativeExclusionNotification[] {
  return [
    {
      milestone: `${kind}@t1`,
      kind,
      timeSlot: "t1",
      fireDayISO,
      hhmm: times.time1,
    },
    {
      milestone: `${kind}@t2`,
      kind,
      timeSlot: "t2",
      fireDayISO,
      hhmm: times.time2,
    },
  ];
}

/**
 * Planifie les 3 jalons lifecycle futurs (× 2 horaires) :
 * - start → start_date
 * - d2 → end_date − 2 jours (inclus)
 * - ended → premier jour après end_date (retour)
 */
export function planFutureExclusionLifecycleNativeSchedules(
  row: ExclusionLifecycleRow,
  settings: ExclusionSettings = DEFAULT_EXCLUSION_SETTINGS,
): PlannedNativeExclusionNotification[] {
  if (!isExclusionRowEnabled(row.active)) return [];

  const times = normalizeExclusionNativeTimes(settings.androidNotificationTimes);
  const start = isoDay(row.start_date);
  if (!start || !isValidPlanningDayISO(start)) return [];

  const planned: PlannedNativeExclusionNotification[] = [];
  planned.push(...expandMilestoneToBothTimes("start", start, times));

  if (isOpenEndedExclusionType(row.exclusion_type)) {
    return planned;
  }

  const end = isoDay(row.end_date);
  if (!end || !isValidPlanningDayISO(end)) return planned;

  const d2Day = format(addDays(parseISO(end), -2), "yyyy-MM-dd");
  planned.push(...expandMilestoneToBothTimes("d2", d2Day, times));

  const returnDate = exclusionReturnDateISO(end);
  if (returnDate && isValidPlanningDayISO(returnDate)) {
    planned.push(...expandMilestoneToBothTimes("ended", returnDate, times));
  }

  return planned;
}

/** @deprecated — alias tests / appels existants */
export function planSmartExclusionNativeSchedules(
  row: ExclusionLifecycleRow,
  settings?: ExclusionSettings,
): PlannedNativeExclusionNotification[] {
  return planFutureExclusionLifecycleNativeSchedules(row, settings);
}

export function fireDayIsoForNativeMilestone(
  row: Pick<ExclusionLifecycleRow, "start_date" | "end_date" | "exclusion_type">,
  milestone: string,
): string | null {
  const base = milestone.split("@")[0] ?? milestone;
  if (base === "start") return isoDay(row.start_date);
  if (base === "ended") {
    const end = isoDay(row.end_date);
    return end ? exclusionReturnDateISO(end) : null;
  }
  if (base === "d2") {
    const end = isoDay(row.end_date);
    return end ? format(addDays(parseISO(end), -2), "yyyy-MM-dd") : null;
  }
  return null;
}

export function buildExclusionNativeReminderCandidate(
  row: ExclusionLifecycleRow,
  planned: PlannedNativeExclusionNotification,
  subjectName: string,
  now: Date,
): ExclusionNativeReminderCandidate | null {
  const fireAt = combineLocalDateTime(planned.fireDayISO, planned.hhmm);
  if (fireAt.getTime() <= now.getTime()) return null;

  const { title, body } = buildAndroidLifecycleNativeTitleBody(row, planned.kind, subjectName);

  return {
    exclusionId: row.id,
    milestone: planned.milestone,
    kind: planned.kind,
    timeSlot: planned.timeSlot,
    notificationId: notificationIdForExclusionMilestone(row.id, planned.milestone),
    title,
    body,
    fireAt,
  };
}

/**
 * Reconcile expected future lifecycle alarms with Android getPending() state.
 * - Schedule only missing or outdated (e.g. time1/time2 changed) notifications.
 * - Cancel only lifecycle pendings that are obsolete (not in the expected set).
 */
export function buildExclusionNativeNotificationPlan(input: {
  pending: PendingExclusionNativeNotification[];
  candidates: ExclusionNativeReminderCandidate[];
}): { cancelIds: number[]; schedule: ExclusionNativeReminderCandidate[] } {
  const lifecyclePending = input.pending.filter((row) => row.extraType === EXCLUSION_NATIVE_EXTRA_TYPE);
  const expectedById = new Map(
    input.candidates.map((candidate) => [candidate.notificationId, candidate] as const),
  );
  const expectedIds = new Set(expectedById.keys());
  const pendingById = new Map(lifecyclePending.map((row) => [row.id, row] as const));

  const cancelIds = new Set<number>();
  const schedule: ExclusionNativeReminderCandidate[] = [];

  for (const row of lifecyclePending) {
    if (!expectedIds.has(row.id)) {
      cancelIds.add(row.id);
    }
  }

  for (const candidate of input.candidates) {
    const existing = pendingById.get(candidate.notificationId);
    if (!existing) {
      schedule.push(candidate);
      continue;
    }
    if (!pendingScheduleMatchesFireAt(existing.schedule, candidate.fireAt)) {
      cancelIds.add(candidate.notificationId);
      schedule.push(candidate);
    }
  }

  return {
    cancelIds: filterProtectedAndroidNotificationCancelIds([...cancelIds]),
    schedule,
  };
}

/** Expected future native alarms for a dated exclusion (e.g. 6 = 3 milestones × 2 times). */
export function countFutureLifecycleCandidatesForExclusion(
  row: ExclusionLifecycleRow,
  settings: ExclusionSettings,
  now: Date,
  subjectName = "Test",
): number {
  const planned = planFutureExclusionLifecycleNativeSchedules(row, settings);
  return planned.filter((p) => {
    const candidate = buildExclusionNativeReminderCandidate(row, p, subjectName, now);
    return candidate !== null;
  }).length;
}
