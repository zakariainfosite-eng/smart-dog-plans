import { isCynotechnicienFonction, usesOperationalPersonnelColumns } from "@/lib/personnel-fonction";
import { cynotechnicienSpecialty, deriveAgentAvailabilityForAgent } from "@/lib/agent-ui";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";

export type SpecialtyPairStats = {
  narcotics: number;
  explosives: number;
};

export function emptySpecialtyPair(): SpecialtyPairStats {
  return { narcotics: 0, explosives: 0 };
}

export type CynotechnicienSpecialtyAgentInput = {
  fonction: string | null | undefined;
  dogs?: { specialty?: string | null } | null;
};

/**
 * Specialty counts for cynotechniciens only.
 * Administrative personnel are never included.
 */
export function countCynotechnicienSpecialties(
  agents: ReadonlyArray<CynotechnicienSpecialtyAgentInput>,
): SpecialtyPairStats {
  const counts = emptySpecialtyPair();
  for (const agent of agents) {
    if (!isCynotechnicienFonction(agent.fonction)) continue;
    const specialty = cynotechnicienSpecialty(agent);
    if (specialty) counts[specialty] += 1;
  }
  return counts;
}

export type PersonnelCategoryStats = {
  cynotechniciens: number;
  administrative: number;
};

export type ActivePersonnelCategoryStats = PersonnelCategoryStats & {
  total: number;
};

export type ActivePersonnelAgentInput = {
  active: boolean;
  id: string;
  dog_id?: string | null;
  fonction: string | null | undefined;
  dogs?: { id?: string } | null;
};

/**
 * Split personnel into operational cynotechniciens vs administrative staff.
 * Uses the same rule as {@link splitPersonnelIntoTwoTables}.
 */
export function computePersonnelCategoryStats(
  agents: ReadonlyArray<{ fonction: string | null | undefined }>,
): PersonnelCategoryStats {
  let cynotechniciens = 0;
  let administrative = 0;

  for (const agent of agents) {
    if (usesOperationalPersonnelColumns(agent.fonction)) {
      cynotechniciens += 1;
    } else {
      administrative += 1;
    }
  }

  return { cynotechniciens, administrative };
}

function isActiveAvailablePersonnel(
  agent: ActivePersonnelAgentInput,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): boolean {
  if (!agent.active) return false;
  return deriveAgentAvailabilityForAgent(agent, exclusions, reference).status === "available";
}

/**
 * Active + available personnel split into cynotechniciens vs administrative.
 * Excludes inactive records and personnel with active exclusions (same as Fonctionnaires page).
 */
export function computeActivePersonnelCategoryStats(
  agents: ReadonlyArray<ActivePersonnelAgentInput>,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): ActivePersonnelCategoryStats {
  let cynotechniciens = 0;
  let administrative = 0;

  for (const agent of agents) {
    if (!isActiveAvailablePersonnel(agent, exclusions, reference)) continue;
    if (usesOperationalPersonnelColumns(agent.fonction)) {
      cynotechniciens += 1;
    } else {
      administrative += 1;
    }
  }

  return {
    total: cynotechniciens + administrative,
    cynotechniciens,
    administrative,
  };
}
