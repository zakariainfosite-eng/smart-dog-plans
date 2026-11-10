import { addDays, format, parseISO } from "date-fns";

import type { DbClient } from "@/integrations/database/client";
import { todayISODate } from "@/lib/agent-exclusions";
import {
  patchStoredPlanningForExclusions,
  type PatchStoredPlanningExclusionResult,
} from "@/lib/planning/patch-stored-planning-for-exclusions";

export type SyncExclusionPlanningReplacementsResult = {
  datesProcessed: string[];
  patches: PatchStoredPlanningExclusionResult[];
};

/** Calendar dates from start through min(end, today) inclusive. */
export function exclusionPlanningDatesEligibleForSync(
  startDateISO: string,
  endDateISO: string | null | undefined,
  todayISO: string = todayISODate(),
): string[] {
  const start = startDateISO.trim().slice(0, 10);
  if (!start || start > todayISO) return [];

  const endCap =
    endDateISO && endDateISO.trim().slice(0, 10) < todayISO
      ? endDateISO.trim().slice(0, 10)
      : todayISO;

  const dates: string[] = [];
  let cursor = parseISO(start);
  const last = parseISO(endCap);
  while (cursor <= last) {
    dates.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export async function syncExclusionPlanningReplacementsForDate(
  client: DbClient,
  planningDateISO: string,
): Promise<SyncExclusionPlanningReplacementsResult> {
  const { data, error } = await client
    .from("planning")
    .select("id")
    .eq("planning_date", planningDateISO);

  if (error) throw error;

  const patches: PatchStoredPlanningExclusionResult[] = [];
  for (const row of data ?? []) {
    patches.push(await patchStoredPlanningForExclusions(client, String(row.id)));
  }

  return { datesProcessed: [planningDateISO], patches };
}

/**
 * Patches stored planning rows up to today when exclusions are active on the planning date.
 * Future planning dates are untouched (no conflicts until the exclusion starts).
 */
export async function syncExclusionPlanningReplacementsUpToToday(
  client: DbClient,
  todayISO: string = todayISODate(),
): Promise<SyncExclusionPlanningReplacementsResult> {
  const { data, error } = await client
    .from("planning")
    .select("id, planning_date")
    .lte("planning_date", todayISO);

  if (error) throw error;

  const patches: PatchStoredPlanningExclusionResult[] = [];
  const datesProcessed = new Set<string>();

  for (const row of data ?? []) {
    const planningDate = String(row.planning_date).slice(0, 10);
    datesProcessed.add(planningDate);
    patches.push(await patchStoredPlanningForExclusions(client, String(row.id)));
  }

  return {
    datesProcessed: [...datesProcessed].sort(),
    patches,
  };
}

export async function syncExclusionPlanningReplacementsForExclusionRange(
  client: DbClient,
  startDateISO: string,
  endDateISO: string | null | undefined,
  todayISO: string = todayISODate(),
): Promise<SyncExclusionPlanningReplacementsResult> {
  const dates = exclusionPlanningDatesEligibleForSync(startDateISO, endDateISO, todayISO);
  const patches: PatchStoredPlanningExclusionResult[] = [];

  for (const dateISO of dates) {
    const batch = await syncExclusionPlanningReplacementsForDate(client, dateISO);
    patches.push(...batch.patches);
  }

  return { datesProcessed: dates, patches };
}
