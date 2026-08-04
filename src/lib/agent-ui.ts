import type { Database } from "@/integrations/database/schema-types";
import {
  getActiveExclusionsForAgent,
  isAgentExcludedOnDate,
  isAgentLevelExclusionType,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";

type Gender = Database["public"]["Enums"]["gender_type"];

export type AgentOperationalStatus = "available" | "excluded";

/** Dynamic availability for the Personnel table — never persisted. */
export type AgentAvailability =
  | { status: "available" }
  | { status: "excluded"; exclusionType: string };

export type AgentListRow = {
  id: string;
  active: boolean;
  gender: Gender;
  dogs: { specialty: string; status: string } | null;
};

/**
 * Operational status driven solely by active agent exclusions on the reference date.
 * Active exclusion → excluded ("Hors service"); otherwise → available ("Disponible").
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
 * Current availability for the Personnel "Disponibilité" column.
 * Computed from active exclusions covering the reference day (default: today).
 */
export function deriveAgentAvailability(
  agentId: string,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): AgentAvailability {
  const active = getActiveExclusionsForAgent(exclusions, agentId, reference);
  if (active.length === 0) {
    return { status: "available" };
  }

  // Prefer agent-level exclusions when dog-level ones overlap the same day.
  const preferred =
    active.find((row) => isAgentLevelExclusionType(row.exclusion_type)) ?? active[0]!;

  return { status: "excluded", exclusionType: preferred.exclusion_type };
}

/** Badge tone for Disponibilité — green available, typed colors for exclusions. */
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
