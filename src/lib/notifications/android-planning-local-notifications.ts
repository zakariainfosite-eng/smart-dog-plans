import type { PlanningShiftHours } from "@/lib/planning-settings";

export const PLANNING_REMINDER_TYPE = "planning-reminder";
export const PLANNING_REMINDER_TITLE = "Planning dans 1 heure";
export const PLANNING_REMINDER_CHANNEL_ID = "planning-reminders";
export const PLANNING_REMINDER_LEAD_MS = 60 * 60 * 1000;

export type PlanningShift = "day" | "night";

export type PlanningReminderAssignment = {
  assignmentId: string;
  agentName: string;
  pointName: string;
  sectionName: string;
  planningDate: string;
  shift: PlanningShift;
  isHqReserve: boolean;
  isOffDuty: boolean;
  hasCheckpoint: boolean;
  validated: boolean;
};

export type PlanningReminderCandidate = {
  assignmentId: string;
  notificationId: number;
  title: string;
  body: string;
  plannedAt: Date;
  remindAt: Date;
};

export type PendingPlanningNotification = {
  id: number;
  extraType?: string;
};

/**
 * Stable Android notification id (positive 32-bit) derived from the assignment UUID.
 * Same assignment always maps to the same id so resync never creates duplicates.
 */
export function notificationIdForAssignment(assignmentId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < assignmentId.length; i += 1) {
    hash ^= assignmentId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 900_000_000 + 100_000;
}

export function planningShiftStartHhmm(shift: PlanningShift, hours: PlanningShiftHours): string {
  return shift === "night" ? hours.nightStart : hours.dayStart;
}

/** Local calendar datetime (device timezone) for a planning date + HH:mm. */
export function combineLocalDateTime(dateIso: string, hhmm: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, 0, 0);
}

export function planningReminderAt(plannedAt: Date): Date {
  return new Date(plannedAt.getTime() - PLANNING_REMINDER_LEAD_MS);
}

export function isFutureReminder(remindAt: Date, now: Date): boolean {
  return remindAt.getTime() > now.getTime();
}

export function isOperationalPlanningAssignment(row: {
  validated: boolean;
  isHqReserve: boolean;
  isOffDuty: boolean;
  hasCheckpoint: boolean;
}): boolean {
  return row.validated && !row.isHqReserve && !row.isOffDuty && row.hasCheckpoint;
}

export function formatPlanningDateTime(plannedAt: Date): string {
  const dd = String(plannedAt.getDate()).padStart(2, "0");
  const mm = String(plannedAt.getMonth() + 1).padStart(2, "0");
  const yyyy = plannedAt.getFullYear();
  const hh = String(plannedAt.getHours()).padStart(2, "0");
  const min = String(plannedAt.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function formatPlanningReminderBody(input: {
  agentName: string;
  pointName: string;
  sectionName: string;
  plannedAt: Date;
}): string {
  return `${input.agentName} — ${input.pointName} — ${input.sectionName} — ${formatPlanningDateTime(input.plannedAt)}`;
}

export function buildPlanningReminderCandidate(
  row: PlanningReminderAssignment,
  hours: PlanningShiftHours,
  now: Date,
): PlanningReminderCandidate | null {
  if (!isOperationalPlanningAssignment(row)) return null;
  const plannedAt = combineLocalDateTime(row.planningDate, planningShiftStartHhmm(row.shift, hours));
  const remindAt = planningReminderAt(plannedAt);
  if (!isFutureReminder(remindAt, now)) return null;
  return {
    assignmentId: row.assignmentId,
    notificationId: notificationIdForAssignment(row.assignmentId),
    title: PLANNING_REMINDER_TITLE,
    body: formatPlanningReminderBody({
      agentName: row.agentName,
      pointName: row.pointName,
      sectionName: row.sectionName,
      plannedAt,
    }),
    plannedAt,
    remindAt,
  };
}

export function buildPlanningNotificationPlan(input: {
  pending: PendingPlanningNotification[];
  previouslyScheduledIds?: number[];
  candidates: PlanningReminderCandidate[];
}): { cancelIds: number[]; schedule: PlanningReminderCandidate[] } {
  const ours = input.pending.filter((row) => row.extraType === PLANNING_REMINDER_TYPE);
  const cancelIds = [
    ...new Set([
      ...ours.map((row) => row.id),
      ...(input.previouslyScheduledIds ?? []),
      ...input.candidates.map((row) => row.notificationId),
    ]),
  ];
  return { cancelIds, schedule: input.candidates };
}
