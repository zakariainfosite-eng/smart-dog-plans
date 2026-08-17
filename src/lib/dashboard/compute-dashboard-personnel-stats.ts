import {
  cynotechnicienSpecialty,
  deriveAgentAvailabilityForAgent,
  resolveAgentDogId,
} from "@/lib/agent-ui";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import { isCynotechnicienFonction } from "@/lib/personnel-fonction";
import {
  emptySpecialtyPair,
  type ActivePersonnelAgentInput,
  type SpecialtyPairStats,
} from "@/lib/personnel-fonction-stats";

export type { SpecialtyPairStats };

export type DashboardPersonnelStats = {
  totalFonctionnaires: number;
  cynotechniciensBySpecialty: SpecialtyPairStats;
  activeCynotechniciens: number;
  activeCynotechniciensBySpecialty: SpecialtyPairStats;
  cynotechniciensWithoutDog: number;
  excludedCynotechniciensBySpecialty: SpecialtyPairStats;
};

export type DashboardPersonnelAgentInput = ActivePersonnelAgentInput & {
  first_name?: string;
  last_name?: string;
  sections?: { name?: string | null } | null;
  dogs?: { id?: string; name?: string | null; specialty?: string | null } | null;
};

export type DashboardPersonnelGroups<T extends DashboardPersonnelAgentInput = DashboardPersonnelAgentInput> = {
  totalFonctionnaires: T[];
  cynotechniciensNarcotics: T[];
  cynotechniciensExplosives: T[];
  activeCynotechniciens: T[];
  activeCynotechniciensNarcotics: T[];
  activeCynotechniciensExplosives: T[];
  cynotechniciensWithoutDog: T[];
  excludedCynotechniciensNarcotics: T[];
  excludedCynotechniciensExplosives: T[];
};

function hasAssignedDog(agent: DashboardPersonnelAgentInput): boolean {
  return Boolean(resolveAgentDogId(agent));
}

function emptyGroups<T extends DashboardPersonnelAgentInput>(): DashboardPersonnelGroups<T> {
  return {
    totalFonctionnaires: [],
    cynotechniciensNarcotics: [],
    cynotechniciensExplosives: [],
    activeCynotechniciens: [],
    activeCynotechniciensNarcotics: [],
    activeCynotechniciensExplosives: [],
    cynotechniciensWithoutDog: [],
    excludedCynotechniciensNarcotics: [],
    excludedCynotechniciensExplosives: [],
  };
}

/**
 * Same membership rules as {@link computeDashboardPersonnelStats}.
 * Counts are always `group.length` so dialog rows cannot drift from the card.
 */
export function collectDashboardPersonnelGroups<T extends DashboardPersonnelAgentInput>(
  agents: ReadonlyArray<T>,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): DashboardPersonnelGroups<T> {
  const groups = emptyGroups<T>();
  groups.totalFonctionnaires = [...agents];

  for (const agent of agents) {
    if (!isCynotechnicienFonction(agent.fonction)) continue;

    if (!hasAssignedDog(agent)) groups.cynotechniciensWithoutDog.push(agent);

    const specialty = cynotechnicienSpecialty(agent);
    if (specialty === "narcotics") groups.cynotechniciensNarcotics.push(agent);
    if (specialty === "explosives") groups.cynotechniciensExplosives.push(agent);

    if (!agent.active) continue;

    const availability = deriveAgentAvailabilityForAgent(agent, exclusions, reference);
    if (availability.status === "excluded") {
      if (specialty === "narcotics") groups.excludedCynotechniciensNarcotics.push(agent);
      if (specialty === "explosives") groups.excludedCynotechniciensExplosives.push(agent);
      continue;
    }

    groups.activeCynotechniciens.push(agent);
    if (specialty === "narcotics") groups.activeCynotechniciensNarcotics.push(agent);
    if (specialty === "explosives") groups.activeCynotechniciensExplosives.push(agent);
  }

  return groups;
}

export function dashboardPersonnelStatsFromGroups(
  groups: DashboardPersonnelGroups,
): DashboardPersonnelStats {
  return {
    totalFonctionnaires: groups.totalFonctionnaires.length,
    cynotechniciensBySpecialty: {
      narcotics: groups.cynotechniciensNarcotics.length,
      explosives: groups.cynotechniciensExplosives.length,
    },
    activeCynotechniciens: groups.activeCynotechniciens.length,
    activeCynotechniciensBySpecialty: {
      narcotics: groups.activeCynotechniciensNarcotics.length,
      explosives: groups.activeCynotechniciensExplosives.length,
    },
    cynotechniciensWithoutDog: groups.cynotechniciensWithoutDog.length,
    excludedCynotechniciensBySpecialty: {
      narcotics: groups.excludedCynotechniciensNarcotics.length,
      explosives: groups.excludedCynotechniciensExplosives.length,
    },
  };
}

/**
 * Dashboard KPI counts — reuses Fonctionnaires availability + fonction rules.
 * Does not change exclusion, planning, or assignment logic.
 */
export function computeDashboardPersonnelStats(
  agents: ReadonlyArray<DashboardPersonnelAgentInput>,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): DashboardPersonnelStats {
  return dashboardPersonnelStatsFromGroups(collectDashboardPersonnelGroups(agents, exclusions, reference));
}

export function createEmptyDashboardPersonnelStats(): DashboardPersonnelStats {
  return {
    totalFonctionnaires: 0,
    cynotechniciensBySpecialty: emptySpecialtyPair(),
    activeCynotechniciens: 0,
    activeCynotechniciensBySpecialty: emptySpecialtyPair(),
    cynotechniciensWithoutDog: 0,
    excludedCynotechniciensBySpecialty: emptySpecialtyPair(),
  };
}

export function createEmptyDashboardPersonnelGroups(): DashboardPersonnelGroups {
  return emptyGroups();
}
