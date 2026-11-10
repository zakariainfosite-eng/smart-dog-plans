import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import {
  isAgentExclusionActive,
  isOpenEndedExclusionType,
  planningDayISO,
} from "@/lib/agent-exclusions";
import {
  exclusionReturnDateISO,
  daysUntilEnd,
  milestoneForDaysUntilEnd,
} from "@/lib/notifications/exclusion-return-dates";
import { isExclusionRowEnabled } from "@/lib/notifications/exclusion-reminder-candidates";
import {
  isConfiguredReminderMilestone,
  type ExclusionSettings,
} from "@/lib/exclusion-settings";
import type {
  ExclusionLifecycleNotificationType,
  ExclusionReturnMilestone,
} from "@/lib/notifications/exclusion-return-types";

export const LIFECYCLE_START_CATCHUP_DAYS = 3;
export const LIFECYCLE_ENDED_CATCHUP_DAYS = 3;

export type ExclusionLifecycleRow = {
  id: string;
  agent_id: string | null;
  dog_id: string | null;
  exclusion_type: string;
  start_date: string;
  end_date: string | null;
  active: boolean | number;
};

export type PlannedExclusionLifecycleNotification = {
  milestone: ExclusionReturnMilestone | "start" | "ended";
  notificationType: ExclusionLifecycleNotificationType;
  eventDateISO: string;
};

function isoDay(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 10);
}

export function shouldPlanExclusionStartNotification(
  row: Pick<ExclusionLifecycleRow, "start_date" | "end_date" | "exclusion_type" | "active">,
  todayISO: string,
): boolean {
  const start = isoDay(row.start_date);
  if (!start || !isExclusionRowEnabled(row.active)) return false;
  if (todayISO < start) return false;

  if (todayISO === start) {
    return true;
  }

  const daysSinceStart = differenceInCalendarDays(parseISO(todayISO), parseISO(start));
  if (daysSinceStart > LIFECYCLE_START_CATCHUP_DAYS) return false;

  return isAgentExclusionActive(
  {
    agent_id: null,
    dog_id: null,
    exclusion_type: row.exclusion_type,
    start_date: row.start_date,
    end_date: row.end_date,
    active: true,
  },
    todayISO,
  );
}

export function shouldPlanExclusionEndedNotification(
  row: Pick<ExclusionLifecycleRow, "end_date" | "exclusion_type" | "active">,
  todayISO: string,
): boolean {
  if (isOpenEndedExclusionType(row.exclusion_type)) return false;
  const end = isoDay(row.end_date);
  if (!end) return false;

  const returnDate = exclusionReturnDateISO(end);
  if (!returnDate || todayISO < returnDate) return false;

  if (todayISO === returnDate) {
    return true;
  }

  const daysLate = differenceInCalendarDays(parseISO(todayISO), parseISO(returnDate));
  return daysLate > 0 && daysLate <= LIFECYCLE_ENDED_CATCHUP_DAYS;
}

export function planExclusionLifecycleNotifications(
  row: ExclusionLifecycleRow,
  todayISO: string,
  reminderSettings: ExclusionSettings,
): PlannedExclusionLifecycleNotification[] {
  const planned: PlannedExclusionLifecycleNotification[] = [];
  const start = isoDay(row.start_date);

  if (shouldPlanExclusionStartNotification(row, todayISO)) {
    planned.push({
      milestone: "start",
      notificationType: "exclusion_started",
      eventDateISO: start,
    });
  }

  const end = isoDay(row.end_date);
  if (end && !isOpenEndedExclusionType(row.exclusion_type) && isExclusionRowEnabled(row.active)) {
    const daysUntil = daysUntilEnd(end, todayISO);
    const milestone = milestoneForDaysUntilEnd(daysUntil);
    if (milestone && isConfiguredReminderMilestone(milestone, reminderSettings)) {
      const notificationType: ExclusionLifecycleNotificationType =
        milestone === "d2" ? "exclusion_ending_soon" : "exclusion_ending_soon";
      planned.push({
        milestone,
        notificationType,
        eventDateISO: todayISO,
      });
    }
  }

  if (shouldPlanExclusionEndedNotification(row, todayISO)) {
    const returnDate = exclusionReturnDateISO(end!)!;
    planned.push({
      milestone: "ended",
      notificationType: "exclusion_ended",
      eventDateISO: returnDate,
    });
  }

  return planned;
}

/** Load window: exclusions that might need start, end reminder, or return notifications. */
export function lifecycleScanMaxEndDate(todayISO: string): string {
  return format(addDays(parseISO(todayISO), 2), "yyyy-MM-dd");
}

export function lifecycleScanMinEndHistory(todayISO: string, historyDays: number): string {
  return format(addDays(parseISO(todayISO), -historyDays), "yyyy-MM-dd");
}

export function isExclusionRelevantForLifecycleScan(
  row: Pick<ExclusionLifecycleRow, "start_date" | "end_date" | "exclusion_type" | "active">,
  todayISO: string,
  historyDays: number,
): boolean {
  if (!isExclusionRowEnabled(row.active)) return false;
  const start = isoDay(row.start_date);
  const today = planningDayISO(todayISO);
  if (!start || start > lifecycleScanMaxEndDate(today)) return false;

  if (isOpenEndedExclusionType(row.exclusion_type)) {
    return start <= today;
  }

  const end = isoDay(row.end_date);
  if (!end) return start <= today;

  const minHistory = lifecycleScanMinEndHistory(today, historyDays);
  if (end < minHistory) return false;

  return true;
}
