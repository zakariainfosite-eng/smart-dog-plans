import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import {
  EXCLUSION_RETURN_MILESTONES,
  type ExclusionReturnMilestoneDays,
  milestoneFromDays,
} from "@/lib/notifications/exclusion-return-types";
import { planningDayISO } from "@/lib/agent-exclusions";

/**
 * First calendar day the subject is available again in planning.
 * Exclusions are inclusive of `end_date`, so return = end_date + 1 day.
 */
export function exclusionReturnDateISO(endDateISO: string): string {
  return format(addDays(startOfDay(parseISO(endDateISO.slice(0, 10))), 1), "yyyy-MM-dd");
}

export function daysUntilReturn(returnDateISO: string, reference: Date | string = new Date()): number {
  const today = startOfDay(
    typeof reference === "string" ? parseISO(planningDayISO(reference)) : reference,
  );
  const returnDay = startOfDay(parseISO(returnDateISO.slice(0, 10)));
  return differenceInCalendarDays(returnDay, today);
}

export function isReturnMilestoneDay(
  daysUntil: number,
): daysUntil is ExclusionReturnMilestoneDays {
  return (EXCLUSION_RETURN_MILESTONES as readonly number[]).includes(daysUntil);
}

export function milestoneForDaysUntil(daysUntil: number) {
  if (!isReturnMilestoneDay(daysUntil)) return null;
  return milestoneFromDays(daysUntil);
}

/** Inclusive window used when scanning exclusions for new alerts. */
export function exclusionScanWindow(reference: Date | string = new Date()): {
  minEndDate: string;
  maxEndDate: string;
} {
  const today = planningDayISO(reference);
  // d0 → end was yesterday; d7 → end is today+6
  return {
    minEndDate: format(addDays(parseISO(today), -1), "yyyy-MM-dd"),
    maxEndDate: format(addDays(parseISO(today), 6), "yyyy-MM-dd"),
  };
}

export function historyCutoffISO(reference: Date | string = new Date(), historyDays = 30): string {
  const today = planningDayISO(reference);
  return format(addDays(parseISO(today), -historyDays), "yyyy-MM-dd");
}
