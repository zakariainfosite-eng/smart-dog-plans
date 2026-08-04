import { describe, expect, it } from "vitest";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import {
  deriveDogOperationalStatus,
  dogOperationalStatusKey,
  pickHighestPriorityDogExclusionType,
} from "@/lib/dog-operational-status";

function exclusion(
  overrides: Partial<AgentExclusionRecord> &
    Pick<AgentExclusionRecord, "dog_id" | "exclusion_type">,
): AgentExclusionRecord {
  return {
    agent_id: null,
    active: true,
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    ...overrides,
  };
}

describe("deriveDogOperationalStatus", () => {
  const dogId = "dog-1";
  const day = "2026-08-04";

  it("shows Disponible when there is no active exclusion", () => {
    const status = deriveDogOperationalStatus(dogId, [], day);
    expect(status).toEqual({ kind: "available" });
    expect(dogOperationalStatusKey(status)).toBe("available");
  });

  it("shows En chaleur after creating female_dog_heat", () => {
    const status = deriveDogOperationalStatus(
      dogId,
      [exclusion({ dog_id: dogId, exclusion_type: "female_dog_heat" })],
      day,
    );
    expect(status).toEqual({ kind: "excluded", exclusionType: "female_dog_heat" });
  });

  it("shows Malade after changing exclusion to dog_sick", () => {
    const status = deriveDogOperationalStatus(
      dogId,
      [exclusion({ dog_id: dogId, exclusion_type: "dog_sick" })],
      day,
    );
    expect(status).toEqual({ kind: "excluded", exclusionType: "dog_sick" });
  });

  it("returns Disponible after exclusion is deleted", () => {
    const status = deriveDogOperationalStatus(dogId, [], day);
    expect(status).toEqual({ kind: "available" });
  });

  it("returns Disponible when exclusion is disabled", () => {
    const status = deriveDogOperationalStatus(
      dogId,
      [exclusion({ dog_id: dogId, exclusion_type: "dog_sick", active: false })],
      day,
    );
    expect(status).toEqual({ kind: "available" });
  });

  it("returns Disponible when exclusion is expired", () => {
    const status = deriveDogOperationalStatus(
      dogId,
      [
        exclusion({
          dog_id: dogId,
          exclusion_type: "dog_sick",
          start_date: "2026-07-01",
          end_date: "2026-07-31",
        }),
      ],
      day,
    );
    expect(status).toEqual({ kind: "available" });
  });

  it("ignores other dogs' exclusions", () => {
    const status = deriveDogOperationalStatus(
      dogId,
      [exclusion({ dog_id: "other-dog", exclusion_type: "dog_sick" })],
      day,
    );
    expect(status).toEqual({ kind: "available" });
  });

  it("picks highest priority among multiple active exclusions", () => {
    const type = pickHighestPriorityDogExclusionType([
      exclusion({ dog_id: dogId, exclusion_type: "dog_training" }),
      exclusion({ dog_id: dogId, exclusion_type: "female_dog_heat" }),
      exclusion({ dog_id: dogId, exclusion_type: "dog_sick" }),
    ]);
    expect(type).toBe("female_dog_heat");

    const status = deriveDogOperationalStatus(
      dogId,
      [
        exclusion({ dog_id: dogId, exclusion_type: "dog_vet_visit" }),
        exclusion({ dog_id: dogId, exclusion_type: "dog_injured" }),
      ],
      day,
    );
    expect(status).toEqual({ kind: "excluded", exclusionType: "dog_injured" });
  });
});
