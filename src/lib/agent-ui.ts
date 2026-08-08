import type { Database } from "@/integrations/database/schema-types";
import {
  getActiveExclusionsForAgent,
  isAgentExcludedOnDate,
  isAgentLevelExclusionType,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import {
  getActiveExclusionsForDog,
  pickHighestPriorityDogExclusionTypeName,
} from "@/lib/dog-operational-status";

type Gender = Database["public"]["Enums"]["gender_type"];

export type AgentOperationalStatus = "available" | "excluded";

/** Dynamic availability for the Fonctionnaires table — never persisted. */
export type AgentAvailability =
  | { status: "available" }
  | { status: "excluded"; exclusionType: string };

export type AgentListRow = {
  id: string;
  active: boolean;
  gender: Gender;
  dog_id?: string | null;
  dogs: { specialty: string; status: string } | null;
};

/**
 * Agent-level exclusion priority when several are active the same day.
 * Lower number = higher priority (aligned with operational severity).
 */
export const AGENT_EXCLUSION_STATUS_PRIORITY: Record<string, number> = {
  suspension: 0,
  sickness: 1,
  administrative_leave: 2,
  annual_leave: 3,
  special_leave: 4,
  absence: 5,
  mission: 6,
  training: 7,
  other: 8,
};

export function agentExclusionStatusPriority(type: string): number {
  return AGENT_EXCLUSION_STATUS_PRIORITY[type] ?? 100;
}

/**
 * Highest-priority exclusion type among agent + dog exclusions.
 * Agent-level reasons win over dog-level (existing personnel status rule);
 * within each group, use the typed priority maps.
 */
export function pickHighestPriorityPersonnelExclusionType(
  types: string[],
): string | null {
  if (types.length === 0) return null;

  const agentTypes = types.filter((type) => isAgentLevelExclusionType(type));
  if (agentTypes.length > 0) {
    return (
      [...agentTypes].sort(
        (a, b) => agentExclusionStatusPriority(a) - agentExclusionStatusPriority(b),
      )[0] ?? null
    );
  }

  return pickHighestPriorityDogExclusionTypeName(types);
}

/** Active exclusions affecting a fonctionnaire: own agent rows + assigned dog rows. */
export function getActiveExclusionsAffectingAgent(
  agentId: string,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
  dogId?: string | null,
): AgentExclusionRecord[] {
  const byAgent = getActiveExclusionsForAgent(exclusions, agentId, reference);
  if (!dogId) return byAgent;

  const byDog = getActiveExclusionsForDog(exclusions, dogId, reference);
  const merged = [...byAgent];
  for (const row of byDog) {
    const already = merged.some(
      (existing) =>
        existing.exclusion_type === row.exclusion_type &&
        existing.start_date === row.start_date &&
        existing.end_date === row.end_date &&
        existing.dog_id === row.dog_id &&
        existing.agent_id === row.agent_id,
    );
    if (!already) merged.push(row);
  }
  return merged;
}

/**
 * Operational status: any agent-level exclusion → excluded; otherwise available.
 * (Stats / night-eligibility — dog exclusions do not mark the agent personally excluded.)
 */
export function deriveAgentOperationalStatus(
  agent: AgentListRow,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): AgentOperationalStatus {
  if (isAgentExcludedOnDate(agent.id, exclusions, reference)) {
    return "excluded";
  }
  return "available";
}

/**
 * Current Statut for the Fonctionnaires table / PDF.
 * Agent exclusion OR assigned-dog exclusion → that reason; else Disponible.
 * One reason only — highest priority per the existing exclusion rules.
 */
export function deriveAgentAvailability(
  agentId: string,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
  dogId?: string | null,
): AgentAvailability {
  const active = getActiveExclusionsAffectingAgent(
    agentId,
    exclusions,
    reference,
    dogId,
  );
  const exclusionType = pickHighestPriorityPersonnelExclusionType(
    active.map((row) => row.exclusion_type),
  );
  if (!exclusionType) {
    return { status: "available" };
  }
  return { status: "excluded", exclusionType };
}

/** Resolve assigned dog id from dog_id or nested dogs relation. */
export function resolveAgentDogId(
  agent: Pick<AgentListRow, "dog_id"> & { dogs?: { id?: string } | null },
): string | null {
  if (agent.dog_id) return agent.dog_id;
  const nestedId = agent.dogs && "id" in agent.dogs ? agent.dogs.id : undefined;
  return nestedId ?? null;
}

/** Convenience when the caller has a full agent row. */
export function deriveAgentAvailabilityForAgent(
  agent: Pick<AgentListRow, "id" | "dog_id"> & { dogs?: { id?: string } | null },
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): AgentAvailability {
  return deriveAgentAvailability(
    agent.id,
    exclusions,
    reference,
    resolveAgentDogId(agent),
  );
}

/** Badge tone for Statut — green available, typed colors for exclusions. */
export function availabilityBadgeTone(
  availability: AgentAvailability,
): "success" | "warning" | "danger" | "neutral" | "primary" | "info" | "purple" {
  if (availability.status === "available") return "success";

  switch (availability.exclusionType) {
    case "sickness":
    case "dog_sick":
    case "dog_injured":
      return "danger";
    case "mission":
    case "absence":
    case "female_dog_heat":
    case "dog_vet_visit":
      return "warning";
    case "training":
    case "dog_training":
      return "info";
    case "annual_leave":
    case "special_leave":
    case "dog_temporary_retirement":
      return "purple";
    case "administrative_leave":
    case "suspension":
      return "primary";
    default:
      return "neutral";
  }
}

export function isNightEligible(
  agent: Pick<AgentListRow, "id" | "active" | "gender">,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): boolean {
  return (
    agent.active &&
    agent.gender === "male" &&
    !isAgentExcludedOnDate(agent.id, exclusions, reference)
  );
}

export function agentSpecialty(agent: {
  dogs: { specialty: string } | null | undefined;
}): "narcotics" | "explosives" | null {
  const s = agent.dogs?.specialty;
  if (s === "narcotics" || s === "explosives") return s;
  return null;
}
