import { describe, expect, it } from "vitest";
import {
  deriveAgentAvailability,
  pickHighestPriorityPersonnelExclusionType,
} from "@/lib/agent-ui";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";

function exclusion(
  partial: Partial<AgentExclusionRecord> & Pick<AgentExclusionRecord, "exclusion_type">,
): AgentExclusionRecord {
  return {
    agent_id: partial.agent_id ?? null,
    dog_id: partial.dog_id ?? null,
    exclusion_type: partial.exclusion_type,
    start_date: partial.start_date ?? "2026-01-01",
    end_date: partial.end_date ?? "2026-12-31",
    active: partial.active ?? true,
  };
}

describe("deriveAgentAvailability", () => {
  const day = "2026-08-05";

  it("shows Disponible when there is no active exclusion", () => {
    expect(deriveAgentAvailability("a1", [], day, "d1")).toEqual({ status: "available" });
  });

  it("shows agent exclusion reason", () => {
    const rows = [exclusion({ agent_id: "a1", exclusion_type: "training" })];
    expect(deriveAgentAvailability("a1", rows, day, "d1")).toEqual({
      status: "excluded",
      exclusionType: "training",
    });
  });

  it("shows dog exclusion when agent has no personal exclusion", () => {
    const rows = [
      exclusion({ agent_id: null, dog_id: "d1", exclusion_type: "female_dog_heat" }),
    ];
    expect(deriveAgentAvailability("a1", rows, day, "d1")).toEqual({
      status: "excluded",
      exclusionType: "female_dog_heat",
    });
  });

  it("prefers agent exclusion over dog exclusion", () => {
    const rows = [
      exclusion({ agent_id: "a1", exclusion_type: "mission" }),
      exclusion({ agent_id: null, dog_id: "d1", exclusion_type: "dog_sick" }),
    ];
    expect(deriveAgentAvailability("a1", rows, day, "d1")).toEqual({
      status: "excluded",
      exclusionType: "mission",
    });
  });

  it("picks highest-priority dog exclusion among several", () => {
    const type = pickHighestPriorityPersonnelExclusionType([
      "dog_training",
      "female_dog_heat",
      "dog_sick",
    ]);
    expect(type).toBe("female_dog_heat");
  });
});
