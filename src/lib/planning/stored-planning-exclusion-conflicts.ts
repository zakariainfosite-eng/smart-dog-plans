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
export function findStoredPlanningExclusionConflicts(
  planningDateISO: string,
  engineResult: PlanningEngineResult,
  exclusions: AgentExclusionRecord[],
): StoredPlanningExclusionConflict[] {
  const byAgentId = new Map<string, StoredPlanningExclusionConflict>();

  for (const team of collectAssignedTeams(engineResult)) {
    const agentExcluded = isAgentExcludedOnPlanningDate(team.agent_id, planningDateISO, exclusions);
    const dogExcluded = team.dog_id
      ? isDogExcludedOnPlanningDate(team.dog_id, planningDateISO, exclusions)
      : false;

    if (!agentExcluded && !dogExcluded) continue;

    const name = team.agent_name.trim();
    if (!name || byAgentId.has(team.agent_id)) continue;

    byAgentId.set(team.agent_id, {
      agentId: team.agent_id,
      agentName: name,
    });
  }

  return [...byAgentId.values()].sort((a, b) => a.agentName.localeCompare(b.agentName, "fr"));
}
