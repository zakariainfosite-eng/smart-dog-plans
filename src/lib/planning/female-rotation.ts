/**
 * Female Rotation — independent of male Smart Rotation and of Sections A/B/C.
 *
 * Rules:
 * - Females never belong to a male section and never enter Point 653 / reserve.
 * - Females never enter the male Smart Rotation pool.
 * - Females only work the day shift (09:00–21:00); night is out of scope.
 * - Eligible females are split into two equal groups (A/B) that alternate each planning day.
 * - Active group → daytime checkpoint assignments (generated before male planning).
 * - Inactive group → REST only (no section, checkpoint, reserve, or night).
 * - Checkpoint fairness uses the shared rotation_history (prefer unvisited / least recent).
 *
 * Groups scale to any even headcount (4→2/2, 6→3/3, 8→4/4). Odd counts are
 * split with Math.ceil so Group A is one larger; empty groups simply rest.
 */
import { differenceInCalendarDays } from "date-fns";

/** Fixed local epoch so day parity is stable across runs. */
const FEMALE_ROTATION_EPOCH = new Date(2020, 0, 1);

export type FemaleRotationTeamRef = {
  agent_id: string;
  professional_number?: string;
};

export type FemaleRotationGroups<T extends FemaleRotationTeamRef> = {
  groupA: T[];
  groupB: T[];
};

export type FemaleHistoryRow = {
  agent_id: string;
  checkpoint_id: string;
  planning_date?: string;
};

export type FemaleAssignmentHistoryMaps = {
  /** Most recent checkpoint before today (skips rest days automatically). */
  lastWorkingCheckpointByAgent: Map<string, string>;
  /** Latest prior assignment date per agent:checkpoint (ISO yyyy-MM-dd). */
  lastAssignedDateByPair: Map<string, string>;
};

/** Stable ordering so A/B membership does not shuffle between days. */
export function sortFemaleTeamsStable<T extends FemaleRotationTeamRef>(teams: T[]): T[] {
  return [...teams].sort((a, b) => {
    const byNumber = (a.professional_number ?? "").localeCompare(
      b.professional_number ?? "",
      undefined,
      { numeric: true },
    );
    if (byNumber !== 0) return byNumber;
    return a.agent_id.localeCompare(b.agent_id);
  });
}

/**
 * Split females into Group A and Group B.
 * Even n → equal halves. Odd n → Group A gets Math.ceil(n/2).
 */
export function splitFemaleRotationGroups<T extends FemaleRotationTeamRef>(
  femaleTeams: T[],
): FemaleRotationGroups<T> {
  const sorted = sortFemaleTeamsStable(femaleTeams);
  const mid = Math.ceil(sorted.length / 2);
  return {
    groupA: sorted.slice(0, mid),
    groupB: sorted.slice(mid),
  };
}

/** True when Group A works this planning day (Group B rests). */
export function isFemaleGroupAActive(planningDate: Date): boolean {
  const days = differenceInCalendarDays(planningDate, FEMALE_ROTATION_EPOCH);
  return ((days % 2) + 2) % 2 === 0;
}

/** Agent ids from the group that works on `planningDate`. */
export function resolveActiveFemaleAgentIds(
  femaleTeams: FemaleRotationTeamRef[],
  planningDate: Date,
): Set<string> {
  const { groupA, groupB } = splitFemaleRotationGroups(femaleTeams);
  const active = isFemaleGroupAActive(planningDate) ? groupA : groupB;
  return new Set(active.map((team) => team.agent_id));
}

/**
 * Agent ids from the inactive (resting) female group on `planningDate`.
 * These handlers must receive REST only — never section, checkpoint, reserve, or night.
 */
export function resolveRestingFemaleAgentIds(
  femaleTeams: FemaleRotationTeamRef[],
  planningDate: Date,
): Set<string> {
  const activeIds = resolveActiveFemaleAgentIds(femaleTeams, planningDate);
  return new Set(
    femaleTeams.map((team) => team.agent_id).filter((id) => !activeIds.has(id)),
  );
}

/**
 * Build the candidate filter for the Female Rotation phase (day shift only).
 * Returns null when the phase should be skipped (night, or no females).
 */
export function buildFemaleRotationCandidatePredicate(
  femaleTeams: FemaleRotationTeamRef[],
  planningDate: Date,
  shift: "day" | "night",
): ((agentId: string) => boolean) | null {
  if (shift !== "day") return null;
  if (femaleTeams.length === 0) return null;

  const activeIds = resolveActiveFemaleAgentIds(femaleTeams, planningDate);
  return (agentId: string) => activeIds.has(agentId);
}

/**
 * Derive fairness maps from shared rotation_history (same table as male planning).
 * Only rows strictly before `planningDateISO` count as prior history.
 */
export function buildFemaleAssignmentHistoryMaps(
  history: FemaleHistoryRow[],
  planningDateISO: string,
): FemaleAssignmentHistoryMaps {
  const lastWorkingCheckpointByAgent = new Map<string, string>();
  const lastWorkingDateByAgent = new Map<string, string>();
  const lastAssignedDateByPair = new Map<string, string>();

  for (const row of history) {
    if (!row.planning_date || row.planning_date >= planningDateISO) continue;

    const pairKey = `${row.agent_id}:${row.checkpoint_id}`;
    const prevPairDate = lastAssignedDateByPair.get(pairKey);
    if (!prevPairDate || row.planning_date > prevPairDate) {
      lastAssignedDateByPair.set(pairKey, row.planning_date);
    }

    const prevAgentDate = lastWorkingDateByAgent.get(row.agent_id);
    if (!prevAgentDate || row.planning_date > prevAgentDate) {
      lastWorkingDateByAgent.set(row.agent_id, row.planning_date);
      lastWorkingCheckpointByAgent.set(row.agent_id, row.checkpoint_id);
    }
  }

  return { lastWorkingCheckpointByAgent, lastAssignedDateByPair };
}

export type FemaleCandidateScore = {
  /** 1 when this checkpoint was the agent's last working-day assignment. */
  consecutiveWorkingPenalty: number;
  /** ISO date of last assignment to this checkpoint, or "" if never. */
  lastAssignedDate: string;
  /** Visit count from shared fairness map (lower is fairer). */
  fairness: number;
};

/** Score one agent→checkpoint pair for Female Rotation fairness. */
export function scoreFemaleCheckpointCandidate(
  agentId: string,
  checkpointId: string,
  history: FemaleAssignmentHistoryMaps,
  fairnessCounts: Map<string, number>,
): FemaleCandidateScore {
  const consecutiveWorkingPenalty =
    history.lastWorkingCheckpointByAgent.get(agentId) === checkpointId ? 1 : 0;
  const lastAssignedDate =
    history.lastAssignedDateByPair.get(`${agentId}:${checkpointId}`) ?? "";
  const fairness = fairnessCounts.get(`${agentId}:${checkpointId}`) ?? 0;
  return { consecutiveWorkingPenalty, lastAssignedDate, fairness };
}

/**
 * Compare two female candidates for a checkpoint (lower/earlier is better).
 * Order: avoid consecutive working-day repeat → least recently assigned → fairness.
 */
export function compareFemaleCheckpointScores(
  a: FemaleCandidateScore,
  b: FemaleCandidateScore,
): number {
  if (a.consecutiveWorkingPenalty !== b.consecutiveWorkingPenalty) {
    return a.consecutiveWorkingPenalty - b.consecutiveWorkingPenalty;
  }
  // "" (never) sorts before any ISO date → prefer never / oldest.
  if (a.lastAssignedDate !== b.lastAssignedDate) {
    return a.lastAssignedDate < b.lastAssignedDate ? -1 : 1;
  }
  return a.fairness - b.fairness;
}
