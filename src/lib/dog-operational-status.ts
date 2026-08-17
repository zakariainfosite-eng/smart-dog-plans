import {
  exclusionTypeI18nKey,
  filterActiveExclusions,
  isDogLevelExclusionType,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";

/**
 * Display / operational status for a dog — never persisted.
 * Derived exclusively from active dog-level exclusions on the reference day.
 */
export type DogOperationalStatus =
  | { kind: "available" }
  | { kind: "excluded"; exclusionType: string };

/**
 * Priority when several dog exclusions are active the same day.
 * Lower number = higher priority.
 * En chaleur > Malade > Blessé > Vétérinaire > Dressage > Retraité temporairement > Autre
 */
export const DOG_EXCLUSION_STATUS_PRIORITY: Record<string, number> = {
  female_dog_heat: 0,
  dog_sick: 1,
  dog_injured: 2,
  dog_vet_visit: 3,
  dog_without_handler: 3.5,
  dog_training: 4,
  dog_temporary_retirement: 5,
  dog_other: 6,
};

export function dogExclusionStatusPriority(type: string): number {
  return DOG_EXCLUSION_STATUS_PRIORITY[type] ?? 100;
}

export function getActiveExclusionsForDog(
  exclusions: AgentExclusionRecord[],
  dogId: string,
  reference: Date | string = new Date(),
): AgentExclusionRecord[] {
  return filterActiveExclusions(exclusions, reference).filter(
    (row) => row.dog_id === dogId && isDogLevelExclusionType(row.exclusion_type),
  );
}

export function isDogExcludedOnDate(
  dogId: string,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): boolean {
  return getActiveExclusionsForDog(exclusions, dogId, reference).length > 0;
}

/** Pick the highest-priority dog exclusion type name, or null if none. */
export function pickHighestPriorityDogExclusionTypeName(
  types: string[],
): string | null {
  const dogTypes = types.filter((type) => isDogLevelExclusionType(type));
  if (dogTypes.length === 0) return null;
  return (
    [...dogTypes].sort(
      (a, b) => dogExclusionStatusPriority(a) - dogExclusionStatusPriority(b),
    )[0] ?? null
  );
}

/** Pick the highest-priority active dog exclusion type, or null if none. */
export function pickHighestPriorityDogExclusionType(
  exclusions: AgentExclusionRecord[],
): string | null {
  return pickHighestPriorityDogExclusionTypeName(
    exclusions.map((row) => row.exclusion_type),
  );
}

/**
 * Real current status for Dogs table / details / filters.
 * Active dog exclusion → that exclusion type; otherwise → Disponible.
 */
export function deriveDogOperationalStatus(
  dogId: string,
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): DogOperationalStatus {
  const active = getActiveExclusionsForDog(exclusions, dogId, reference);
  const exclusionType = pickHighestPriorityDogExclusionType(active);
  if (!exclusionType) return { kind: "available" };
  return { kind: "excluded", exclusionType };
}

/** Stable filter / compare key for a computed dog status. */
export function dogOperationalStatusKey(status: DogOperationalStatus): string {
  return status.kind === "available" ? "available" : status.exclusionType;
}

export function dogOperationalStatusTone(
  status: DogOperationalStatus,
): "success" | "warning" | "danger" | "neutral" | "primary" | "info" | "purple" {
  if (status.kind === "available") return "success";
  switch (status.exclusionType) {
    case "dog_sick":
    case "dog_injured":
      return "danger";
    case "female_dog_heat":
    case "dog_vet_visit":
    case "dog_without_handler":
      return "warning";
    case "dog_training":
      return "info";
    case "dog_temporary_retirement":
      return "purple";
    default:
      return "neutral";
  }
}

/** i18n key for badge / details label. */
export function dogOperationalStatusLabelKey(status: DogOperationalStatus): string {
  if (status.kind === "available") return "dogStatus.available";
  return exclusionTypeI18nKey(status.exclusionType);
}
