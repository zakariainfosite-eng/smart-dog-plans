import { addDays, differenceInCalendarDays, format, isValid, parseISO, startOfDay } from "date-fns";
import {
  EXCLUSION_END_MILESTONES,
  type ExclusionEndMilestoneDays,
  milestoneFromDays,
} from "@/lib/notifications/exclusion-return-types";
import { isValidPlanningDayISO, planningDayISO } from "@/lib/agent-exclusions";

/**
 * First calendar day the subject is available again in planning.
 * Exclusions are inclusive of `end_date`, so return = end_date + 1 day.
 */
export function exclusionReturnDateISO(endDateISO: string): string | null {
  if (!isValidPlanningDayISO(endDateISO)) return null;
  const endDay = startOfDay(parseISO(endDateISO.slice(0, 10)));
  if (!isValid(endDay)) return null;
  return format(addDays(endDay, 1), "yyyy-MM-dd");
}

export function daysUntilReturn(returnDateISO: string, reference: Date | string = new Date()): number {
  if (!isValidPlanningDayISO(returnDateISO)) return Number.NaN;
  const today = startOfDay(
    typeof reference === "string" ? parseISO(planningDayISO(reference)) : reference,
  );
  const returnDay = startOfDay(parseISO(returnDateISO.slice(0, 10)));
  if (!isValid(today) || !isValid(returnDay)) return Number.NaN;
  return differenceInCalendarDays(returnDay, today);
}

/** Days until inclusive exclusion end_date (0 = ends today). */
export function daysUntilEnd(endDateISO: string, reference: Date | string = new Date()): number {
  if (!isValidPlanningDayISO(endDateISO)) return Number.NaN;
  const today = startOfDay(
    typeof reference === "string" ? parseISO(planningDayISO(reference)) : reference,
  );
  const endDay = startOfDay(parseISO(endDateISO.slice(0, 10)));
  if (!isValid(today) || !isValid(endDay)) return Number.NaN;
  return differenceInCalendarDays(endDay, today);
}

export function isEndMilestoneDay(daysUntil: number): daysUntil is ExclusionEndMilestoneDays {
  return (EXCLUSION_END_MILESTONES as readonly number[]).includes(daysUntil);
}

export function milestoneForDaysUntilEnd(daysUntil: number) {
  if (!Number.isFinite(daysUntil)) return null;
  if (!isEndMilestoneDay(daysUntil)) return null;
  return milestoneFromDays(daysUntil);
}

export function isReturnMilestoneDay(
  daysUntil: number,
): daysUntil is ExclusionEndMilestoneDays {
  return isEndMilestoneDay(daysUntil);
}

/** @deprecated Use milestoneForDaysUntilEnd */
export function milestoneForDaysUntil(daysUntil: number) {
  return milestoneForDaysUntilEnd(daysUntil);
}

/** Scan active exclusions whose end_date falls within the reminder window. */
export function exclusionScanWindow(reference: Date | string = new Date()): {
  minEndDate: string;
  maxEndDate: string;
} {
  const today = planningDayISO(reference);
  return {
    minEndDate: today,
    maxEndDate: format(addDays(parseISO(today), 2), "yyyy-MM-dd"),
  };
}

export function historyCutoffISO(reference: Date | string = new Date(), historyDays = 30): string {
  const today = planningDayISO(reference);
  return format(addDays(parseISO(today), -historyDays), "yyyy-MM-dd");
}
