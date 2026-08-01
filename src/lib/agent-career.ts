import type { Database } from "@/integrations/database/schema-types";

type ExclusionType = Database["public"]["Enums"]["exclusion_type"];

export const EXCLUSION_LEAVE_TYPES: ExclusionType[] = [
  "annual_leave",
  "administrative_leave",
  "special_leave",
  "absence",
];

export const EXCLUSION_TRAINING_TYPES: ExclusionType[] = ["training"];

export const EXCLUSION_MEDICAL_TYPES: ExclusionType[] = ["sickness"];

export const EXCLUSION_DOG_TYPES: ExclusionType[] = ["dog_sick", "female_dog_heat"];

export type AgentCareerSummary = {
  totalOperationalCases: number;
  totalExclusions: number;
  totalLeavePeriods: number;
  totalTrainingExclusions: number;
  totalMedicalLeave: number;
  totalDogRelatedExclusions: number;
};

export function computeAgentCareerSummary(
  totalOperationalCases: number,
  exclusionTypes: ExclusionType[],
): AgentCareerSummary {
  const countMatching = (types: ExclusionType[]) =>
    exclusionTypes.filter((type) => types.includes(type)).length;

  return {
    totalOperationalCases,
    totalExclusions: exclusionTypes.length,
    totalLeavePeriods: countMatching(EXCLUSION_LEAVE_TYPES),
    totalTrainingExclusions: countMatching(EXCLUSION_TRAINING_TYPES),
    totalMedicalLeave: countMatching(EXCLUSION_MEDICAL_TYPES),
    totalDogRelatedExclusions: countMatching(EXCLUSION_DOG_TYPES),
  };
}
