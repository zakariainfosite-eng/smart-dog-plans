import {
  filterActiveExclusions,
  getActiveExclusionsForAgent,
  isAgentLevelExclusionType,
  isDogLevelExclusionType,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import {
  deriveAgentAvailabilityForAgent,
  pickHighestPriorityPersonnelExclusionType,
} from "@/lib/agent-ui";

export type SectionMemberDogInput = {
  id?: string;
  /** Primary specialty (`narcotics` | `explosives`). */
  specialty?: string | null;
  /**
   * Optional multi-specialty list — when present, each applicable specialty
   * increments its category (composition stats).
   */
  specialties?: readonly string[] | null;
};

export type SectionMemberInput = {
  id: string;
  section_id: string | null;
  dog_id?: string | null;
  /** When false, excluded from specialty composition counts. */
  active?: boolean;
  dogs?: SectionMemberDogInput | null;
};

/**
 * Display buckets on section cards (one count per assigned agent).
 * Leave types are aggregated into `leave` (« Congé »).
 */
export const SECTION_EXCLUSION_BREAKDOWN_KEYS = [
  "sickness",
  "leave",
  "training",
  "mission",
  "absence",
  "dog_sick",
  "female_dog_heat",
  "dog_temporary_retirement",
  "other",
] as const;

export type SectionExclusionBreakdownKey =
  (typeof SECTION_EXCLUSION_BREAKDOWN_KEYS)[number];

export type SectionExclusionBreakdown = Record<SectionExclusionBreakdownKey, number>;

export type SectionOperationalStats = {
  /** Agents currently assigned to the section. */
  assigned: number;
  /** Assigned agents with no active agent/dog exclusion. */
  available: number;
  /** Assigned agents whose highest-priority exclusion is agent-level. */
  unavailable: number;
  /** Distinct assigned agents with any active exclusion (agent or dog). */
  activeExclusions: number;
  /** Per-reason counts — each agent counted once (highest-priority reason). */
  byReason: SectionExclusionBreakdown;
  /**
   * Operational narcotics: assigned dog specialty minus any active exclusion.
   */
  narcotics: number;
  /** All assigned active handlers whose dog specialty includes narcotics. */
  narcoticsTotal: number;
  /**
   * Operational explosives: assigned dog specialty minus any active exclusion.
   */
  explosives: number;
  /** All assigned active handlers whose dog specialty includes explosives. */
  explosivesTotal: number;
};

function emptyBreakdown(): SectionExclusionBreakdown {
  return {
    sickness: 0,
    leave: 0,
    training: 0,
    mission: 0,
    absence: 0,
    dog_sick: 0,
    female_dog_heat: 0,
    dog_temporary_retirement: 0,
    other: 0,
  };
}

/** Map a raw exclusion type to a section-card display bucket. */
export function mapExclusionTypeToSectionBreakdownKey(
  exclusionType: string,
): SectionExclusionBreakdownKey {
  switch (exclusionType) {
    case "sickness":
      return "sickness";
    case "annual_leave":
    case "special_leave":
    case "administrative_leave":
      return "leave";
    case "training":
      return "training";
    case "mission":
      return "mission";
    case "absence":
      return "absence";
    case "dog_sick":
      return "dog_sick";
    case "female_dog_heat":
      return "female_dog_heat";
    case "dog_temporary_retirement":
      return "dog_temporary_retirement";
    default:
      return "other";
  }
}

function normalizeSpecialtyToken(value: string): string {
  return value.trim().toLowerCase();
}

/** True when a specialty token means narcotics / Stupéfiants. */
export function isNarcoticsSpecialty(value: string): boolean {
  const token = normalizeSpecialtyToken(value);
  return (
    token === "narcotics" ||
    token === "stupéfiants" ||
    token === "stupefiants"
  );
}

/** True when a specialty token means explosives / Explosifs. */
export function isExplosivesSpecialty(value: string): boolean {
  const token = normalizeSpecialtyToken(value);
  return token === "explosives" || token === "explosifs";
}

/** Collect specialty tokens from a member's assigned dog (primary + multi-list). */
export function dogSpecialtyTokens(dog: SectionMemberDogInput | null | undefined): string[] {
  if (!dog) return [];
  const tokens: string[] = [];
  if (dog.specialty) tokens.push(String(dog.specialty));
  if (Array.isArray(dog.specialties)) {
    for (const item of dog.specialties) {
      if (item) tokens.push(String(item));
    }
  }
  return tokens;
}

/**
 * Specialty flags for one assigned active member (dog specialty, not function).
 * No dog → neither category. Multi-specialty dog may count in both.
 */
export function memberSpecialtyFlags(agent: SectionMemberInput): {
  narcotics: boolean;
  explosives: boolean;
} {
  if (agent.active === false) {
    return { narcotics: false, explosives: false };
  }
  if (!agent.dog_id && !agent.dogs) {
    return { narcotics: false, explosives: false };
  }

  const tokens = dogSpecialtyTokens(agent.dogs);
  if (tokens.length === 0) {
    return { narcotics: false, explosives: false };
  }

  return {
    narcotics: tokens.some(isNarcoticsSpecialty),
    explosives: tokens.some(isExplosivesSpecialty),
  };
}

/** True when an exclusion type belongs to a section-card breakdown bucket. */
export function exclusionMatchesSectionBreakdownKey(
  exclusionType: string,
  key: SectionExclusionBreakdownKey,
): boolean {
  return mapExclusionTypeToSectionBreakdownKey(exclusionType) === key;
}

/**
 * Per-type counters for a section — one increment per active exclusion row
 * (same membership + active rules as {@link getActiveExclusionsForSection}).
 * Shared by section cards and the exclusions drill-down sheet.
 */
export function countSectionExclusionBreakdown(
  sectionId: string,
  agents: SectionMemberInput[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): SectionExclusionBreakdown {
  const byReason = emptyBreakdown();
  for (const row of getActiveExclusionsForSection(
    sectionId,
    agents,
    exclusions,
    reference,
  )) {
    byReason[mapExclusionTypeToSectionBreakdownKey(row.exclusion_type)] += 1;
  }
  return byReason;
}

/**
 * Operational statistics for a section card — computed from SQLite-backed
 * agents + active exclusions (never hardcoded / never persisted).
 *
 * Rules:
 * - Only personnel with section_id === this section
 * - Dog exclusions count for the handler’s section
 * - byReason = every active exclusion row (synced with Exclusions module)
 * - available / specialty still use one highest-priority reason per agent
 * - Specialty Total = assigned dog specialty (active personnel)
 * - Specialty Operational = Total minus any active agent/dog exclusion
 */
export function computeSectionOperationalStats(
  sectionId: string,
  agents: SectionMemberInput[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): SectionOperationalStats {
  const members = agents.filter((agent) => agent.section_id === sectionId);
  const byReason = countSectionExclusionBreakdown(
    sectionId,
    agents,
    exclusions,
    reference,
  );

  let available = 0;
  let unavailable = 0;
  let activeExclusions = 0;
  let narcotics = 0;
  let narcoticsTotal = 0;
  let explosives = 0;
  let explosivesTotal = 0;

  for (const agent of members) {
    const specialty = memberSpecialtyFlags(agent);
    if (specialty.narcotics) narcoticsTotal += 1;
    if (specialty.explosives) explosivesTotal += 1;

    const availability = deriveAgentAvailabilityForAgent(agent, exclusions, reference);

    if (availability.status === "available") {
      available += 1;
      if (specialty.narcotics) narcotics += 1;
      if (specialty.explosives) explosives += 1;
      continue;
    }

    activeExclusions += 1;

    if (isAgentLevelExclusionType(availability.exclusionType)) {
      unavailable += 1;
    }
  }

  return {
    assigned: members.length,
    available,
    unavailable,
    activeExclusions,
    byReason,
    narcotics,
    narcoticsTotal,
    explosives,
    explosivesTotal,
  };
}

/**
 * All active exclusions for a section — personnel AND dogs assigned to members.
 * Dog exclusions are attributed via the handler’s section (same rule as card stats).
 */
export function getActiveExclusionsForSection(
  sectionId: string,
  agents: SectionMemberInput[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
  breakdownKey?: SectionExclusionBreakdownKey | null,
): AgentExclusionRecord[] {
  const members = agents.filter((agent) => agent.section_id === sectionId);
  const memberIds = new Set(members.map((agent) => agent.id));
  const memberDogIds = new Set(
    members
      .map((agent) => agent.dog_id ?? agent.dogs?.id ?? null)
      .filter((id): id is string => Boolean(id)),
  );

  return filterActiveExclusions(exclusions, reference).filter((row) => {
    if (
      breakdownKey &&
      !exclusionMatchesSectionBreakdownKey(row.exclusion_type, breakdownKey)
    ) {
      return false;
    }
    if (isAgentLevelExclusionType(row.exclusion_type)) {
      return Boolean(row.agent_id && memberIds.has(row.agent_id));
    }
    if (isDogLevelExclusionType(row.exclusion_type)) {
      return Boolean(row.dog_id && memberDogIds.has(row.dog_id));
    }
    if (row.agent_id && memberIds.has(row.agent_id)) return true;
    if (row.dog_id && memberDogIds.has(row.dog_id)) return true;
    return false;
  });
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

/** Highest-priority exclusion type for an assigned section member (or null). */
export function sectionMemberTopExclusionType(
  agent: SectionMemberInput,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): string | null {
  const availability = deriveAgentAvailabilityForAgent(agent, exclusions, reference);
  if (availability.status === "available") return null;
  return availability.exclusionType;
}

/** @deprecated Prefer pickHighestPriorityPersonnelExclusionType from agent-ui. */
export function pickSectionExclusionType(types: string[]): string | null {
  return pickHighestPriorityPersonnelExclusionType(types);
}
