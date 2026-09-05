import {
  ALL_EXCLUSION_TYPES,
  filterActiveExclusions,
  getActiveExclusionsForAgent,
  isAgentLevelExclusionType,
  isDogLevelExclusionType,
  type AgentExclusionRecord,
  type ExclusionType,
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

/** Exclusion types omitted from section card statistics UI (records unchanged). */
export const SECTION_EXCLUSION_HIDDEN_DISPLAY_TYPES: readonly ExclusionType[] = [
  "other",
  "dog_other",
];

/** Ordered exclusion types shown on section cards (same source as Exclusions module). */
export const SECTION_EXCLUSION_DISPLAY_TYPES = ALL_EXCLUSION_TYPES.filter(
  (type) => !(SECTION_EXCLUSION_HIDDEN_DISPLAY_TYPES as readonly string[]).includes(type),
);

export type SectionExclusionBreakdownKey = ExclusionType;

export type SectionExclusionBreakdown = Record<ExclusionType, number>;

export type SectionOperationalStats = {
  /** Agents currently assigned to the section. */
  assigned: number;
  /** Assigned agents with no active agent/dog exclusion. */
  available: number;
  /** Assigned agents whose highest-priority exclusion is agent-level. */
  unavailable: number;
  /** Distinct assigned agents with any active exclusion (agent or dog). */
  activeExclusions: number;
  /** Per-type counts — one increment per active exclusion row. */
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

export function emptySectionExclusionBreakdown(): SectionExclusionBreakdown {
  return Object.fromEntries(
    ALL_EXCLUSION_TYPES.map((type) => [type, 0]),
  ) as SectionExclusionBreakdown;
}

/** One row on the section exclusions card (unique display label). */
export type SectionExclusionDisplayGroup = {
  key: string;
  label: string;
  types: ExclusionType[];
};

/** Group exclusion types that share the same localized label (e.g. Congé, Indisponible). */
export function groupSectionExclusionTypesByLabel(
  types: readonly ExclusionType[],
  labelForType: (type: ExclusionType) => string,
): SectionExclusionDisplayGroup[] {
  const groups: SectionExclusionDisplayGroup[] = [];
  const indexByLabel = new Map<string, number>();

  for (const type of types) {
    const label = labelForType(type);
    const existingIndex = indexByLabel.get(label);
    if (existingIndex !== undefined) {
      groups[existingIndex].types.push(type);
      continue;
    }
    indexByLabel.set(label, groups.length);
    groups.push({ key: type, label, types: [type] });
  }

  return groups;
}

export function sumSectionExclusionBreakdown(
  breakdown: SectionExclusionBreakdown,
  types: readonly ExclusionType[],
): number {
  return types.reduce((total, type) => total + (breakdown[type] ?? 0), 0);
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

/** True when a specialty token means currency / Monnaie (existing dog specialty). */
export function isCurrencySpecialty(value: string): boolean {
  const token = normalizeSpecialtyToken(value);
  return token === "currency" || token === "devises" || token === "monnaie";
}

export type SectionSpecialtyKind = "narcotics" | "explosives" | "currency";

function specialtyMatchesKind(token: string, kind: SectionSpecialtyKind): boolean {
  if (kind === "narcotics") return isNarcoticsSpecialty(token);
  if (kind === "explosives") return isExplosivesSpecialty(token);
  return isCurrencySpecialty(token);
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
  currency: boolean;
} {
  if (agent.active === false) {
    return { narcotics: false, explosives: false, currency: false };
  }
  if (!agent.dog_id && !agent.dogs) {
    return { narcotics: false, explosives: false, currency: false };
  }

  const tokens = dogSpecialtyTokens(agent.dogs);
  if (tokens.length === 0) {
    return { narcotics: false, explosives: false, currency: false };
  }

  return {
    narcotics: tokens.some(isNarcoticsSpecialty),
    explosives: tokens.some(isExplosivesSpecialty),
    currency: tokens.some(isCurrencySpecialty),
  };
}

/** Assigned personnel of a section — same membership as {@link computeSectionOperationalStats}. */
export function listSectionMembers<T extends SectionMemberInput>(
  sectionId: string,
  agents: readonly T[],
): T[] {
  return agents.filter((agent) => agent.section_id === sectionId);
}

export function isSectionMemberAvailable(
  agent: SectionMemberInput,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): boolean {
  return deriveAgentAvailabilityForAgent(agent, exclusions, reference).status === "available";
}

/** Assigned members with no active agent/dog exclusion (same rule as the card). */
export function listSectionAvailableMembers<T extends SectionMemberInput>(
  sectionId: string,
  agents: readonly T[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): T[] {
  return listSectionMembers(sectionId, agents).filter((agent) =>
    isSectionMemberAvailable(agent, exclusions, reference),
  );
}

/** Assigned active handlers whose dog specialty matches the card category. */
export function listSectionSpecialtyMembers<T extends SectionMemberInput>(
  sectionId: string,
  agents: readonly T[],
  kind: SectionSpecialtyKind,
): T[] {
  return listSectionMembers(sectionId, agents).filter((agent) => {
    const tokens = dogSpecialtyTokens(agent.dogs);
    if (agent.active === false || (!agent.dog_id && !agent.dogs) || tokens.length === 0) {
      return false;
    }
    return tokens.some((token) => specialtyMatchesKind(token, kind));
  });
}

/** Specialty members who are currently available (card “Opérationnel”). */
export function listSectionOperationalSpecialtyMembers<T extends SectionMemberInput>(
  sectionId: string,
  agents: readonly T[],
  exclusions: AgentExclusionRecord[],
  kind: SectionSpecialtyKind,
  reference: Date | string = new Date(),
): T[] {
  return listSectionSpecialtyMembers(sectionId, agents, kind).filter((agent) =>
    isSectionMemberAvailable(agent, exclusions, reference),
  );
}

export function compareSectionMemberNames(
  a: { id: string; last_name?: string; first_name?: string },
  b: { id: string; last_name?: string; first_name?: string },
): number {
  const byLast = (a.last_name ?? "").localeCompare(b.last_name ?? "", undefined, {
    sensitivity: "base",
  });
  if (byLast !== 0) return byLast;
  const byFirst = (a.first_name ?? "").localeCompare(b.first_name ?? "", undefined, {
    sensitivity: "base",
  });
  if (byFirst !== 0) return byFirst;
  return a.id.localeCompare(b.id);
}

function isKnownExclusionType(type: string): type is ExclusionType {
  return (ALL_EXCLUSION_TYPES as readonly string[]).includes(type);
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
  const byReason = emptySectionExclusionBreakdown();
  for (const row of getActiveExclusionsForSection(
    sectionId,
    agents,
    exclusions,
    reference,
  )) {
    if (isKnownExclusionType(row.exclusion_type)) {
      byReason[row.exclusion_type] += 1;
    }
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
  exclusionTypes?: readonly ExclusionType[] | null,
): AgentExclusionRecord[] {
  const members = agents.filter((agent) => agent.section_id === sectionId);
  const memberIds = new Set(members.map((agent) => agent.id));
  const memberDogIds = new Set(
    members
      .map((agent) => agent.dog_id ?? agent.dogs?.id ?? null)
      .filter((id): id is string => Boolean(id)),
  );
  const typeFilter =
    exclusionTypes && exclusionTypes.length > 0
      ? new Set<string>(exclusionTypes)
      : null;

  return filterActiveExclusions(exclusions, reference).filter((row) => {
    if (typeFilter && !typeFilter.has(row.exclusion_type)) {
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
