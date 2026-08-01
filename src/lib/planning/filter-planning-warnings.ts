/**
 * UI-side filter for planning warnings.
 * Keeps the engine's full `summary.warnings` intact for persistence/history;
 * only the displayed list / toast count should use this filter.
 *
 * Staffing warnings (UNDERSTAFFED / "position left unfilled") are already
 * scoped by the engine to `unfilledCheckpointPosts` — this filter must NOT
 * re-scope them via result.checkpoints.
 */

export type PlanningWarningSectionContext = {
  /** Selected section id for this generation. */
  sectionId: string;
  /** Selected section display name (e.g. "1ère Section"). */
  sectionName: string;
  /** Other active section names that must not appear in the UI for this run. */
  otherSectionNames: string[];
  /**
   * Agent display names that participated in this section's planning pool
   * (eligible, excluded, Point 653, REST, assigned). Used to drop agent-scoped
   * INVALID lines that refer to people outside the selected section.
   */
  sectionAgentNames: ReadonlySet<string>;
};

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function warningMentionsSection(warning: string, sectionName: string): boolean {
  if (!sectionName.trim()) return false;
  const hay = normalizeForMatch(warning);
  const needle = normalizeForMatch(sectionName);
  if (!needle) return false;
  return hay.includes(needle);
}

/** Extract "First Last" from common INVALID exclusion warning shapes. */
function extractAgentNameFromWarning(warning: string): string | null {
  const patterns = [
    /Exclusion rule ignored — (.+?) (?:assigned|sent|listed)/i,
    /Exclusion ignored — (.+?) \(/i,
    /Female agent assigned to night shift \(([^)]+)\)/i,
  ];
  for (const pattern of patterns) {
    const match = warning.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function setHasNormalized(set: ReadonlySet<string>, value: string): boolean {
  const normalized = normalizeForMatch(value);
  for (const known of set) {
    if (normalizeForMatch(known) === normalized) return true;
  }
  return false;
}

/**
 * Return warnings that belong to the selected section only.
 * Staffing underfill lines are trusted from the engine (built from
 * unfilledCheckpointPosts). Warnings that name another section, or name an
 * agent outside this section's pool, are dropped.
 */
export function filterPlanningWarningsForSelectedSection(
  warnings: readonly string[],
  context: PlanningWarningSectionContext,
): string[] {
  const otherNames = context.otherSectionNames.filter(
    (name) => name.trim() && name !== context.sectionName,
  );

  return warnings.filter((warning) => {
    for (const other of otherNames) {
      if (warningMentionsSection(warning, other)) return false;
    }

    const agentName = extractAgentNameFromWarning(warning);
    if (agentName && context.sectionAgentNames.size > 0) {
      if (!setHasNormalized(context.sectionAgentNames, agentName)) return false;
    }

    return true;
  });
}

/** Collect agent display names from a planning engine result for section scoping. */
export function collectPlanningResultAgentNames(result: {
  eligible?: ReadonlyArray<{ agent_name: string }>;
  excluded?: ReadonlyArray<{ agent_name: string }>;
  agentExclusions?: ReadonlyArray<{ agent_name: string }>;
  point653?: ReadonlyArray<{ agent_name: string }>;
  offDuty?: ReadonlyArray<{ agent_name: string }>;
  unassigned?: ReadonlyArray<{ agent_name: string }>;
  checkpoints?: ReadonlyArray<{
    slots?: ReadonlyArray<{ team?: { agent_name: string } | null }>;
  }>;
}): Set<string> {
  const names = new Set<string>();
  const add = (name: string | undefined | null) => {
    if (name?.trim()) names.add(name.trim());
  };

  for (const row of result.eligible ?? []) add(row.agent_name);
  for (const row of result.excluded ?? []) add(row.agent_name);
  for (const row of result.agentExclusions ?? []) add(row.agent_name);
  for (const row of result.point653 ?? []) add(row.agent_name);
  for (const row of result.offDuty ?? []) add(row.agent_name);
  for (const row of result.unassigned ?? []) add(row.agent_name);
  for (const cp of result.checkpoints ?? []) {
    for (const slot of cp.slots ?? []) add(slot.team?.agent_name);
  }
  return names;
}
