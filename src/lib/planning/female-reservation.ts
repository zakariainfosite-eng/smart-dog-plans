import { normalizeCheckpointPriority } from "@/lib/checkpoints/operational-config";
import { isAgentLevelExclusionType, isDogLevelExclusionType } from "@/lib/agent-exclusions";
import {
  resolveActiveFemaleAgentIds,
  type FemaleRotationTeamRef,
} from "@/lib/planning/female-rotation";
import type {
  AgentInput,
  CheckpointInput,
  CheckpointPostInput,
  EligibleTeam,
  ExclusionInput,
  Shift,
} from "@/lib/planning/engine";

function isFemaleAgent(agent: AgentInput): boolean {
  return String(agent.gender ?? "").trim().toLowerCase() === "female";
}

function buildExclusionMaps(exclusions: ExclusionInput[]): {
  byAgent: Map<string, string[]>;
  byDog: Map<string, string[]>;
} {
  const byAgent = new Map<string, string[]>();
  const byDog = new Map<string, string[]>();
  for (const entry of exclusions) {
    if (entry.agent_id) {
      const list = byAgent.get(entry.agent_id) ?? [];
      list.push(entry.exclusion_type);
      byAgent.set(entry.agent_id, list);
    }
    if (entry.dog_id && isDogLevelExclusionType(entry.exclusion_type)) {
      const list = byDog.get(entry.dog_id) ?? [];
      list.push(entry.exclusion_type);
      byDog.set(entry.dog_id, list);
    }
  }
  return { byAgent, byDog };
}

function exclusionTypesForAgent(
  agent: Pick<AgentInput, "id" | "dog_id">,
  byAgent: Map<string, string[]>,
  byDog: Map<string, string[]>,
): string[] {
  const types = [...(byAgent.get(agent.id) ?? [])];
  if (agent.dog_id) {
    types.push(...(byDog.get(agent.dog_id) ?? []));
  }
  return types;
}

/** Qualify active female cynotechniciens for reservation feasibility (day shift). */
export function qualifyFemaleReservationPool(
  agents: AgentInput[],
  exclusions: ExclusionInput[],
): EligibleTeam[] {
  const { byAgent, byDog } = buildExclusionMaps(exclusions);
  const eligible: EligibleTeam[] = [];

  for (const agent of agents) {
    if (!agent.active || !isFemaleAgent(agent)) continue;

    const name = `${agent.first_name} ${agent.last_name}`;
    const exTypes = exclusionTypesForAgent(agent, byAgent, byDog);
    if (exTypes.some(isAgentLevelExclusionType)) continue;

    const dog = Array.isArray(agent.dogs) ? agent.dogs[0] : agent.dogs;
    if (!agent.dog_id || !dog?.active) continue;
    if (exTypes.some(isDogLevelExclusionType)) continue;
    if (dog.specialty !== "narcotics" && dog.specialty !== "explosives") continue;

    eligible.push({
      agent_id: agent.id,
      agent_name: name,
      professional_number: agent.professional_number,
      dog_id: dog.id,
      dog_name: dog.name,
      specialty: dog.specialty,
      gender: "female",
      agent_only: false,
    });
  }

  return eligible;
}

export type FemaleReservationSlotContext = {
  checkpoint: CheckpointInput;
  post: CheckpointPostInput;
  specialty: "narcotics" | "explosives";
};

/**
 * Returns one female handler who could fill this slot today (rotation day + rules),
 * excluding agents already allocated to another reservation.
 */
export function findFillableFemaleForReservation(
  slot: FemaleReservationSlotContext,
  femaleTeams: readonly EligibleTeam[],
  planningDate: Date,
  alreadyReservedFemaleIds: ReadonlySet<string>,
  canFillPost: (
    team: EligibleTeam,
    post: CheckpointPostInput,
    checkpoint: CheckpointInput,
    shift: Shift,
    eligible: EligibleTeam[],
    assignedToday: Set<string>,
    allowNightFallback: boolean,
  ) => boolean,
  shift: Shift = "day",
): EligibleTeam | null {
  if (shift !== "day" || femaleTeams.length === 0) return null;

  const activeIds = resolveActiveFemaleAgentIds(
    femaleTeams as FemaleRotationTeamRef[],
    planningDate,
  );
  const emptyAssigned = new Set<string>();
  const pool = [...femaleTeams];

  const candidates = pool.filter((team) => {
    if (!activeIds.has(team.agent_id)) return false;
    if (alreadyReservedFemaleIds.has(team.agent_id)) return false;
    return canFillPost(team, slot.post, slot.checkpoint, shift, pool, emptyAssigned, false);
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) =>
    (a.professional_number || a.agent_id).localeCompare(
      b.professional_number || b.agent_id,
      undefined,
      { numeric: true },
    ),
  );
  return candidates[0] ?? null;
}

export function isCriticalPriorityWithoutFillableFemale(
  priority: unknown,
  fillable: EligibleTeam | null,
): boolean {
  return normalizeCheckpointPriority(priority) === 1 && fillable === null;
}
