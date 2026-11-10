import {
  normalizeCheckpointPriority,
  type CheckpointPriority,
} from "@/lib/checkpoints/operational-config";

export type CriticalP1HistoryRow = {
  agent_id: string;
  checkpoint_id: string;
  planning_date?: string;
};

/**
 * Agents who held any operational P1 checkpoint on the calendar day immediately
 * before `planningDateISO` must not work any P1 checkpoint on `planningDateISO`.
 *
 * Uses rotation history rows (operational posts only — callers must exclude 653 / off-duty).
 * Checkpoint priority is read from the current checkpoint config for `checkpoint_id`.
 */
export function buildCriticalP1CooldownBlockedAgents(
  rotationHistory: readonly CriticalP1HistoryRow[],
  previousPlanningDateISO: string,
  checkpointPriorityById: ReadonlyMap<string, CheckpointPriority | number | null | undefined>,
): Set<string> {
  const prev = previousPlanningDateISO.slice(0, 10);
  const blocked = new Set<string>();

  for (const row of rotationHistory) {
    const date = (row.planning_date ?? "").slice(0, 10);
    if (date !== prev) continue;
    if (!row.agent_id || !row.checkpoint_id) continue;

    const priority = normalizeCheckpointPriority(checkpointPriorityById.get(row.checkpoint_id));
    if (priority === 1) {
      blocked.add(row.agent_id);
    }
  }

  return blocked;
}

export function checkpointPriorityMapFromInputs(
  checkpoints: readonly { id: string; priority?: number | null }[],
): Map<string, CheckpointPriority> {
  return new Map(
    checkpoints.map((cp) => [cp.id, normalizeCheckpointPriority(cp.priority)]),
  );
}

/** Hard gate: true when the agent must not be placed on a P1 checkpoint today. */
export function agentBlockedFromCriticalCheckpointAssignment(
  agentId: string,
  checkpointPriority: unknown,
  blockedAgents: ReadonlySet<string> | undefined,
): boolean {
  if (!blockedAgents?.size) return false;
  if (!blockedAgents.has(agentId)) return false;
  return normalizeCheckpointPriority(checkpointPriority) === 1;
}
