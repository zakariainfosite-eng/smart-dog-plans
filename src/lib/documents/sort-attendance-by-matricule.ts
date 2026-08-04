import type {
  FeuillePresenceData,
  FeuillePresenceTableRow,
} from "@/lib/documents/feuille-presence-types";

/**
 * Stable ascending matricule (MLE) compare for attendance documents.
 * Numeric-aware so "2" < "10"; empty values sort last.
 */
export function compareMatriculeAsc(a: string, b: string): number {
  const left = a.trim();
  const right = b.trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

/** Sort attendance table rows by MLE ascending (presentation only). */
export function sortAttendanceRowsByMatricule<T extends { mle: string; fullName: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const byMle = compareMatriculeAsc(a.mle, b.mle);
    if (byMle !== 0) return byMle;
    return a.fullName.localeCompare(b.fullName, "fr");
  });
}

/**
 * Sort planned (male) rows by matricule, then female presence-only rows by matricule.
 * Women always stay after men inside each specialty table.
 */
export function sortSpecialtyTableRows(rows: FeuillePresenceTableRow[]): FeuillePresenceTableRow[] {
  const planned = sortAttendanceRowsByMatricule(rows.filter((row) => !row.presenceOnly));
  const females = sortAttendanceRowsByMatricule(rows.filter((row) => row.presenceOnly));
  return [...planned, ...females];
}

/**
 * Ensure Feuille de présence specialty tables keep male→female blocks
 * with matricule order inside each block — independent of planning order.
 */
export function sortFeuillePresenceDataByMatricule(data: FeuillePresenceData): FeuillePresenceData {
  return {
    ...data,
    narcoticsRows: sortSpecialtyTableRows(data.narcoticsRows),
    explosivesRows: sortSpecialtyTableRows(data.explosivesRows),
  };
}
