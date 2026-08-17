import {
  isAgentLevelExclusionType,
  isDogLevelExclusionType,
} from "@/lib/agent-exclusions";
import { normalizeK9Specialty } from "@/lib/agent-ui";
import { isCynotechnicienFonction } from "@/lib/personnel-fonction";
import {
  emptySpecialtyPair,
  type SpecialtyPairStats,
} from "@/lib/personnel-fonction-stats";

export type ExclusionSpecialtyAgentLookup = {
  dog_id?: string | null;
  fonction?: string | null;
};

export type ExclusionSpecialtyDogLookup = {
  specialty?: string | null;
};

export type ExclusionSpecialtyLookups = {
  agentById: ReadonlyMap<string, ExclusionSpecialtyAgentLookup>;
  dogById: ReadonlyMap<string, ExclusionSpecialtyDogLookup>;
};

export type ExclusionSpecialtyRow = {
  exclusion_type: string;
  agent_id?: string | null;
  dog_id?: string | null;
  agent?: {
    id?: string;
    fonction?: string | null;
    dog?: { id?: string } | null;
  } | null;
  dog?: {
    id?: string;
    specialty?: string | null;
  } | null;
};

export type UniqueDogExclusionSpecialtyStats = SpecialtyPairStats & {
  total: number;
};

export type ExcludedPersonnelCardStats = {
  total: number;
  explosives: number;
  narcotics: number;
  administrative: number;
};

/**
 * Specialty for one exclusion row. Administrative personnel never contribute.
 * Dog rows use the excluded dog; personnel rows use the assigned dog.
 */
export function exclusionCynoSpecialty(
  row: ExclusionSpecialtyRow,
  lookups: ExclusionSpecialtyLookups,
): "narcotics" | "explosives" | null {
  if (isDogLevelExclusionType(row.exclusion_type)) {
    const dogId = row.dog_id ?? row.dog?.id ?? null;
    const specialty =
      row.dog?.specialty ?? (dogId ? lookups.dogById.get(dogId)?.specialty : null) ?? null;
    return normalizeK9Specialty(specialty);
  }

  if (!isAgentLevelExclusionType(row.exclusion_type)) return null;

  const agentId = row.agent_id ?? row.agent?.id ?? null;
  const lookupAgent = agentId ? lookups.agentById.get(agentId) : undefined;
  const fonction = lookupAgent?.fonction ?? row.agent?.fonction;
  if (!isCynotechnicienFonction(fonction)) return null;

  const dogId = lookupAgent?.dog_id ?? row.agent?.dog?.id ?? null;
  const specialty = dogId ? lookups.dogById.get(dogId)?.specialty ?? null : null;
  return normalizeK9Specialty(specialty);
}

/** Count exclusion rows by cynotechnical specialty (does not change the card total). */
export function countExclusionCynoSpecialties(
  rows: ReadonlyArray<ExclusionSpecialtyRow>,
  lookups: ExclusionSpecialtyLookups,
): SpecialtyPairStats {
  const counts = emptySpecialtyPair();
  for (const row of rows) {
    const specialty = exclusionCynoSpecialty(row, lookups);
    if (specialty) counts[specialty] += 1;
  }
  return counts;
}

/**
 * Unique excluded dogs by specialty — same rules as the existing
 * “Exclusions chiens par spécialité” cards.
 */
export function computeUniqueDogExclusionSpecialtyStats(
  rows: ReadonlyArray<ExclusionSpecialtyRow>,
  lookups: ExclusionSpecialtyLookups,
): UniqueDogExclusionSpecialtyStats {
  const narcoticsDogIds = new Set<string>();
  const explosivesDogIds = new Set<string>();
  const allDogIds = new Set<string>();

  for (const row of rows) {
    if (!isDogLevelExclusionType(row.exclusion_type)) continue;
    const dogId = row.dog_id ?? row.dog?.id ?? null;
    if (!dogId) continue;

    allDogIds.add(dogId);
    const specialty = exclusionCynoSpecialty(row, lookups);
    if (specialty === "explosives") explosivesDogIds.add(dogId);
    if (specialty === "narcotics") narcoticsDogIds.add(dogId);
  }

  return {
    narcotics: narcoticsDogIds.size,
    explosives: explosivesDogIds.size,
    total: allDogIds.size,
  };
}

/** First active dog-exclusion row per unique dog — same membership as the specialty cards. */
export function listUniqueExcludedDogRows<T extends ExclusionSpecialtyRow>(
  rows: ReadonlyArray<T>,
  lookups: ExclusionSpecialtyLookups,
  specialty: "narcotics" | "explosives" | "all" = "all",
): T[] {
  const seen = new Set<string>();
  const listed: T[] = [];

  for (const row of rows) {
    if (!isDogLevelExclusionType(row.exclusion_type)) continue;
    const dogId = row.dog_id ?? row.dog?.id ?? null;
    if (!dogId || seen.has(dogId)) continue;

    const rowSpecialty = exclusionCynoSpecialty(row, lookups);
    if (specialty === "narcotics" && rowSpecialty !== "narcotics") continue;
    if (specialty === "explosives" && rowSpecialty !== "explosives") continue;

    seen.add(dogId);
    listed.push(row);
  }

  return listed;
}

/**
 * Unique fonctionnaires with an active personnel exclusion.
 * Specialty lines are cynotechniciens only; administrative staff are counted separately.
 */
export function computeExcludedPersonnelCardStats(
  rows: ReadonlyArray<ExclusionSpecialtyRow>,
  lookups: ExclusionSpecialtyLookups,
): ExcludedPersonnelCardStats {
  const seen = new Set<string>();
  let explosives = 0;
  let narcotics = 0;
  let administrative = 0;

  for (const row of rows) {
    if (!isAgentLevelExclusionType(row.exclusion_type)) continue;
    const agentId = row.agent_id ?? row.agent?.id ?? null;
    if (!agentId || seen.has(agentId)) continue;
    seen.add(agentId);

    const lookupAgent = lookups.agentById.get(agentId);
    const fonction = lookupAgent?.fonction ?? row.agent?.fonction;
    if (!isCynotechnicienFonction(fonction)) {
      administrative += 1;
      continue;
    }

    const specialty = exclusionCynoSpecialty(row, lookups);
    if (specialty === "explosives") explosives += 1;
    if (specialty === "narcotics") narcotics += 1;
  }

  return {
    total: seen.size,
    explosives,
    narcotics,
    administrative,
  };
}

/** Same membership as {@link countExclusionCynoSpecialties} for one specialty. */
export function listExclusionRowsByCynoSpecialty<T extends ExclusionSpecialtyRow>(
  rows: ReadonlyArray<T>,
  lookups: ExclusionSpecialtyLookups,
  specialty: "narcotics" | "explosives",
): T[] {
  return rows.filter((row) => exclusionCynoSpecialty(row, lookups) === specialty);
}

export function listExcludedPersonnelRows<T extends ExclusionSpecialtyRow>(
  rows: ReadonlyArray<T>,
  lookups: ExclusionSpecialtyLookups,
  group: "all" | "narcotics" | "explosives" | "administrative" = "all",
): T[] {
  const seen = new Set<string>();
  const listed: T[] = [];

  for (const row of rows) {
    if (!isAgentLevelExclusionType(row.exclusion_type)) continue;
    const agentId = row.agent_id ?? row.agent?.id ?? null;
    if (!agentId || seen.has(agentId)) continue;

    const lookupAgent = lookups.agentById.get(agentId);
    const fonction = lookupAgent?.fonction ?? row.agent?.fonction;
    const isAdmin = !isCynotechnicienFonction(fonction);
    const specialty = exclusionCynoSpecialty(row, lookups);

    if (group === "administrative" && !isAdmin) continue;
    if (group === "narcotics" && (isAdmin || specialty !== "narcotics")) continue;
    if (group === "explosives" && (isAdmin || specialty !== "explosives")) continue;

    seen.add(agentId);
    listed.push(row);
  }

  return listed;
}
