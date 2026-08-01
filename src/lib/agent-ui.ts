import type { Database } from "@/integrations/database/schema-types";
import { isAgentExcludedOnDate, type AgentExclusionRecord } from "@/lib/agent-exclusions";

type Gender = Database["public"]["Enums"]["gender_type"];

export type AgentOperationalStatus = "available" | "excluded";

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
