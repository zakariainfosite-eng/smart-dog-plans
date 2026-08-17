import type { DbClient } from "@/integrations/database/client";
import { planningDayISO, isOpenEndedExclusionType, type ExclusionType } from "@/lib/agent-exclusions";
import { isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import { exclusionScanWindow } from "@/lib/notifications/exclusion-return-dates";

export type ExclusionReminderCandidate = {
  id: string;
  agent_id: string | null;
  dog_id: string | null;
  exclusion_type: ExclusionType | string;
  start_date: string;
  end_date: string;
  active: boolean | number;
};

/** Same enabled check as the Exclusions page (`active` flag or SQLite 1). */
export function isExclusionRowEnabled(active: boolean | number | null | undefined): boolean {
  return active === true || active === 1;
}

/**
 * Row is in force today — mirrors {@link isCurrentlyActiveExclusionRow} on the Exclusions page.
 * Does not mutate exclusion data; read-only calendar + enabled flag.
 */
export function isCurrentlyActiveExclusionForNotifications(
  row: Pick<ExclusionReminderCandidate, "start_date" | "end_date" | "active">,
  reference: Date | string = new Date(),
): boolean {
  if (!isExclusionRowEnabled(row.active)) return false;
  const start = row.start_date?.trim().slice(0, 10);
  const end = row.end_date?.trim().slice(0, 10);
  if (!start || !end) return false;
  const today = planningDayISO(reference);
  return start <= today && today <= end;
}

/**
 * Load every exclusion whose end_date falls in the 2-day reminder window, then keep
 * only rows that are currently active (enabled + calendar range). Works for legacy
 * and newly created records — not tied to exclusion creation events.
 */
export async function loadActiveExclusionsInReminderWindow(
  db: DbClient,
  reference: Date | string = new Date(),
): Promise<ExclusionReminderCandidate[]> {
  const todayISO = planningDayISO(reference);
  const { minEndDate, maxEndDate } = exclusionScanWindow(todayISO);

  const run = async (withSoftDelete: boolean) => {
    let query = db
      .from("agent_exclusions")
      .select("id, agent_id, dog_id, exclusion_type, start_date, end_date, active")
      .gte("end_date", minEndDate)
      .lte("end_date", maxEndDate);
    if (withSoftDelete) {
      query = query.eq("is_deleted", false);
    }
    return query;
  };

  const { data, error } = await run(true);
  let rows: ExclusionReminderCandidate[];
  if (!error) {
    rows = (data ?? []) as ExclusionReminderCandidate[];
  } else if (isMissingSoftDeleteColumn(error)) {
    const legacy = await run(false);
    if (legacy.error) throw legacy.error;
    rows = (legacy.data ?? []) as ExclusionReminderCandidate[];
  } else {
    throw error;
  }

  return rows.filter(
    (row) =>
      !isOpenEndedExclusionType(row.exclusion_type) &&
      isCurrentlyActiveExclusionForNotifications(row, reference),
  );
}
