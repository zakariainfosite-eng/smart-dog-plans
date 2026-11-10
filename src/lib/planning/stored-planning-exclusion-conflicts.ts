import {
  type AgentExclusionRecord,
  isAgentExclusionActive,
  isAgentLevelExclusionType,
  isDogLevelExclusionType,
} from "@/lib/agent-exclusions";
import type { EligibleTeam, PlanningEngineResult } from "@/lib/planning/engine";

export type StoredPlanningExclusionConflict = {
  agentId: string;
  agentName: string;
};

export type StoredPlanningSlotConflict = {
  kind: "checkpoint" | "hq_reserve";
  checkpointPostId: string | null;
  checkpointId: string | null;
  checkpointName: string;
  agentId: string;
  agentName: string;
  dogId: string | null;
};

function collectAssignedTeams(engineResult: PlanningEngineResult): EligibleTeam[] {
  const teams: EligibleTeam[] = [];

  for (const checkpoint of engineResult.checkpoints) {
    for (const slot of checkpoint.slots) {
      if (slot.team) teams.push(slot.team);
    }
  }

  for (const entry of engineResult.point653) {
    teams.push({
      agent_id: entry.agent_id,
      agent_name: entry.agent_name,
      professional_number: entry.professional_number,
      dog_id: entry.dog_id,
      dog_name: entry.dog_name,
      specialty: entry.specialty,
      gender: entry.gender,
      agent_only: entry.agent_only,
    });
  }

  return teams;
}

function isAgentExcludedOnPlanningDate(
  agentId: string,
  planningDateISO: string,
  exclusions: AgentExclusionRecord[],
): boolean {
  return exclusions.some(
    (row) =>
      row.agent_id === agentId &&
      isAgentLevelExclusionType(row.exclusion_type) &&
      isAgentExclusionActive(row, planningDateISO),
  );
}

function isDogExcludedOnPlanningDate(
  dogId: string,
  planningDateISO: string,
  exclusions: AgentExclusionRecord[],
): boolean {
  return exclusions.some(
    (row) =>
      row.dog_id === dogId &&
      isDogLevelExclusionType(row.exclusion_type) &&
      isAgentExclusionActive(row, planningDateISO),
  );
}

/**
 * Detects stored planning rows where an agent or dog is still assigned but
 * would be excluded on the planning date. Non-destructive — caller shows warnings only.
 */
export function findStoredPlanningSlotConflicts(
  planningDateISO: string,
  engineResult: PlanningEngineResult,
  exclusions: AgentExclusionRecord[],
): StoredPlanningSlotConflict[] {
  const conflicts: StoredPlanningSlotConflict[] = [];

  for (const checkpoint of engineResult.checkpoints) {
    for (const slot of checkpoint.slots) {
      const team = slot.team;
      if (!team) continue;

      const agentExcluded = isAgentExcludedOnPlanningDate(
        team.agent_id,
        planningDateISO,
        exclusions,
      );
      const dogExcluded = team.dog_id
        ? isDogExcludedOnPlanningDate(team.dog_id, planningDateISO, exclusions)
        : false;

      if (!agentExcluded && !dogExcluded) continue;

      conflicts.push({
        kind: "checkpoint",
        checkpointPostId: slot.post_id,
        checkpointId: checkpoint.checkpoint_id,
        checkpointName: checkpoint.checkpoint_name,
        agentId: team.agent_id,
        agentName: team.agent_name.trim(),
        dogId: team.dog_id,
      });
    }
  }

  for (const entry of engineResult.point653) {
    const agentExcluded = isAgentExcludedOnPlanningDate(
      entry.agent_id,
      planningDateISO,
      exclusions,
    );
    const dogExcluded = entry.dog_id
      ? isDogExcludedOnPlanningDate(entry.dog_id, planningDateISO, exclusions)
      : false;
    if (!agentExcluded && !dogExcluded) continue;

    conflicts.push({
      kind: "hq_reserve",
      checkpointPostId: null,
      checkpointId: null,
      checkpointName: "Point 653",
      agentId: entry.agent_id,
      agentName: entry.agent_name.trim(),
      dogId: entry.dog_id,
    });
  }

  return conflicts.sort((a, b) => {
    const nameCmp = a.checkpointName.localeCompare(b.checkpointName, "fr", { numeric: true });
    if (nameCmp !== 0) return nameCmp;
    return a.agentName.localeCompare(b.agentName, "fr");
  });
}

export function findStoredPlanningExclusionConflicts(
  planningDateISO: string,
  engineResult: PlanningEngineResult,
  exclusions: AgentExclusionRecord[],
): StoredPlanningExclusionConflict[] {
  const byAgentId = new Map<string, StoredPlanningExclusionConflict>();

  for (const row of findStoredPlanningSlotConflicts(planningDateISO, engineResult, exclusions)) {
    if (!row.agentName || byAgentId.has(row.agentId)) continue;
    byAgentId.set(row.agentId, {
      agentId: row.agentId,
      agentName: row.agentName,
    });
  }

  return [...byAgentId.values()].sort((a, b) => a.agentName.localeCompare(b.agentName, "fr"));
}
