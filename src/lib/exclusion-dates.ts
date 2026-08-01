import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";

export const MIN_EXCLUSION_DURATION_DAYS = 1;

/** Inclusive calendar-day count (same start/end = 1 day). */
export function exclusionDurationDays(startISO: string, endISO: string): number {
  if (!startISO || !endISO || endISO < startISO) return MIN_EXCLUSION_DURATION_DAYS;
  return differenceInCalendarDays(parseISO(endISO), parseISO(startISO)) + 1;
}

/** End date from start + inclusive duration (1 day → same calendar day). */
export function exclusionEndFromDuration(startISO: string, durationDays: number): string {
  const days = Math.max(
    MIN_EXCLUSION_DURATION_DAYS,
    Number.isFinite(durationDays) ? Math.floor(durationDays) : MIN_EXCLUSION_DURATION_DAYS,
  );
  return format(addDays(parseISO(startISO), days - 1), "yyyy-MM-dd");
}

export function formatExclusionSummaryDate(iso: string, language: string): string {
  const locale = language === "ar" ? ar : language === "fr" ? fr : enUS;
  return format(parseISO(iso), "d MMM yyyy", { locale });
}
