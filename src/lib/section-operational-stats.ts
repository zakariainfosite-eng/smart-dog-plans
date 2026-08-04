import {
  filterActiveExclusions,
  getActiveExclusionsForAgent,
  isAgentExcludedOnDate,
  isAgentLevelExclusionType,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";

export type SectionMemberInput = {
  id: string;
  section_id: string | null;
  active?: boolean;
};

export type SectionOperationalStats = {
  /** Agents currently assigned to the section. */
  assigned: number;
  /** Assigned agents with no active agent-level exclusion. */
  available: number;
  /** Assigned agents with at least one active agent-level exclusion. */
  unavailable: number;
  /** Active agent-level exclusion records affecting assigned personnel. */
  activeExclusions: number;
};

/**
 * Operational statistics for a section card — computed from SQLite-backed
 * agents + active exclusions (never hardcoded / never persisted).
 */
export function computeSectionOperationalStats(
  sectionId: string,
  agents: SectionMemberInput[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): SectionOperationalStats {
  const members = agents.filter((agent) => agent.section_id === sectionId);
  const memberIds = new Set(members.map((agent) => agent.id));

  let available = 0;
  let unavailable = 0;
  for (const agent of members) {
    if (isAgentExcludedOnDate(agent.id, exclusions, reference)) {
      unavailable += 1;
    } else {
      available += 1;
    }
  }

  const activeExclusions = filterActiveExclusions(exclusions, reference).filter(
    (row) =>
      !!row.agent_id &&
      memberIds.has(row.agent_id) &&
      isAgentLevelExclusionType(row.exclusion_type),
  ).length;

  return {
    assigned: members.length,
    available,
    unavailable,
    activeExclusions,
  };
}

/** Active agent-level exclusions for personnel currently assigned to a section. */
export function getActiveExclusionsForSection(
  sectionId: string,
  agents: SectionMemberInput[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): AgentExclusionRecord[] {
  const memberIds = new Set(
    agents.filter((agent) => agent.section_id === sectionId).map((agent) => agent.id),
  );

  return filterActiveExclusions(exclusions, reference).filter(
    (row) =>
      !!row.agent_id &&
      memberIds.has(row.agent_id) &&
      isAgentLevelExclusionType(row.exclusion_type),
  );
}

/** Active exclusions for one assigned agent (helper for section exclusion lists). */
export function getActiveAgentLevelExclusionsForAgent(
  agentId: string,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): AgentExclusionRecord[] {
  return getActiveExclusionsForAgent(exclusions, agentId, reference).filter((row) =>
    isAgentLevelExclusionType(row.exclusion_type),
  );
}
