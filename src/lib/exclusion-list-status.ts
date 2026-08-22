/**
 * Display-only status for the Exclusions page list.
 *
 * Not used by planning, rotation, or assignment. Those keep
 * `isAgentExclusionActive()` unchanged.
 */
export type ExclusionListStatus = "inForce" | "upcoming" | "expired" | "inactive";

export type ExclusionListStatusFilter = "all" | "inForce" | "upcoming" | "expired";

export const DEFAULT_EXCLUSION_LIST_STATUS_FILTER: ExclusionListStatusFilter = "inForce";

export const EXCLUSION_LIST_STATUS_FILTERS: ExclusionListStatusFilter[] = [
  "all",
  "inForce",
  "upcoming",
  "expired",
];

type ExclusionListDates = {
  start_date?: string | null;
  end_date?: string | null;
  active?: boolean | number | null;
};

function isoDay(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 10);
}

export function isExclusionRowEnabled(active: boolean | number | null | undefined): boolean {
  return active === true || active === 1;
}

/**
 * Visual status from stored dates + the enabled flag.
 * Expired is based on a real end_date in the past, even if `active` was cleared.
 */
export function exclusionListStatus(
  exclusion: ExclusionListDates,
  todayISO: string,
): ExclusionListStatus {
  const start = isoDay(exclusion.start_date);
  const end = isoDay(exclusion.end_date);
  const enabled = isExclusionRowEnabled(exclusion.active);

  if (end && end < todayISO) return "expired";
  if (enabled && start > todayISO) return "upcoming";
  if (enabled && Boolean(start) && start <= todayISO && (!end || end >= todayISO)) {
    return "inForce";
  }
  return "inactive";
}

export function matchesExclusionListStatusFilter(
  exclusion: ExclusionListDates,
  filter: ExclusionListStatusFilter,
  todayISO: string,
): boolean {
  if (filter === "all") return true;
  return exclusionListStatus(exclusion, todayISO) === filter;
}

export function isUpcomingExclusionStart(
  startDate: string | null | undefined,
  todayISO: string,
): boolean {
  const start = isoDay(startDate);
  return Boolean(start) && start > todayISO;
}
