/**
 * Relative grade ranking for Personnel List PDF sorting only.
 * Lower number = higher grade. Unknown / empty grades sort last.
 *
 * Free-text grades from the form are normalized (case, accents, punctuation).
 */
function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeGradeKey(grade: string | null | undefined): string {
  if (!grade) return "";
  return stripAccents(grade)
    .toLowerCase()
    .replace(/[./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Highest → lowest. First match wins (more specific phrases listed first). */
const GRADE_RANK_PATTERNS: ReadonlyArray<{ rank: number; pattern: RegExp }> = [
  { rank: 10, pattern: /\bcontroleur\s+general\b/ },
  { rank: 20, pattern: /\bcommissaire\s+divisionnaire\s+principal\b/ },
  { rank: 30, pattern: /\bcommissaire\s+divisionnaire\b/ },
  { rank: 40, pattern: /\bcommissaire\s+principal\b/ },
  { rank: 50, pattern: /\bcommissaire\b/ },
  { rank: 60, pattern: /\b(officier\s+de\s+police|inspecteur)\s+principal\b/ },
  { rank: 70, pattern: /\b(officier\s+de\s+police|inspecteur)\b/ },
  { rank: 80, pattern: /\b(brigadier\s+major|major)\b/ },
  { rank: 90, pattern: /\bbrigadier\s+chef\s+principal\b/ },
  { rank: 100, pattern: /\bbrigadier\s+chef\b/ },
  { rank: 110, pattern: /\bbrigadier\s+principal\b/ },
  { rank: 120, pattern: /\bbrigadier\b/ },
  { rank: 130, pattern: /\b(gardien\s+principal|sous[-\s]?brigadier|sous[-\s]?officier)\b/ },
  { rank: 140, pattern: /\b(gardien\s+de\s+la\s+paix|gardien)\b/ },
];

const UNKNOWN_GRADE_RANK = 900;

/** Sort key for PDF: lower = higher grade (appears first). */
export function personnelGradeSortRank(grade: string | null | undefined): number {
  const key = normalizeGradeKey(grade);
  if (!key || key === "-") return UNKNOWN_GRADE_RANK + 50;
  for (const { rank, pattern } of GRADE_RANK_PATTERNS) {
    if (pattern.test(key)) return rank;
  }
  return UNKNOWN_GRADE_RANK;
}
