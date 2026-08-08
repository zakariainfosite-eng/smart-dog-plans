import { describe, expect, it } from "vitest";
import {
  exclusionCalendarStatus,
  isAgentExclusionActive,
  isExclusionPastEndDate,
  toPlanningExclusionInputs,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import { deriveAgentAvailability } from "@/lib/agent-ui";
import { deriveDogOperationalStatus } from "@/lib/dog-operational-status";
import { computeSectionOperationalStats } from "@/lib/section-operational-stats";

function exclusion(
  partial: Partial<AgentExclusionRecord> &
    Pick<AgentExclusionRecord, "exclusion_type" | "end_date">,
): AgentExclusionRecord {
  return {
    agent_id: partial.agent_id ?? "a1",
    dog_id: partial.dog_id ?? null,
    exclusion_type: partial.exclusion_type,
    start_date: partial.start_date ?? "2026-07-01",
    end_date: partial.end_date,
    active: partial.active ?? true,
  };
}

describe("automatic exclusion expiration rules", () => {
  const today = "2026-08-06";

  it("treats today > end_date as past (inclusive end day still active)", () => {
    expect(isExclusionPastEndDate({ end_date: "2026-08-05" }, today)).toBe(true);
    expect(isExclusionPastEndDate({ end_date: "2026-08-06" }, today)).toBe(false);
    expect(isExclusionPastEndDate({ end_date: "2026-08-07" }, today)).toBe(false);
  });

  it("marks calendar status Expiré when end_date has passed", () => {
    expect(exclusionCalendarStatus(exclusion({ exclusion_type: "sickness", end_date: "2026-08-05" }), today)).toBe(
      "expired",
    );
  });

  it("stops affecting planning once active is cleared after end_date", () => {
    const past = exclusion({
      exclusion_type: "sickness",
      end_date: "2026-08-05",
      active: false,
    });
    expect(isAgentExclusionActive(past, today)).toBe(false);
    expect(deriveAgentAvailability("a1", [past], today)).toEqual({ status: "available" });
  });

  it("returns dog to Disponible after heat exclusion expires", () => {
    const past = exclusion({
      agent_id: null,
      dog_id: "d1",
      exclusion_type: "female_dog_heat",
      end_date: "2026-08-05",
      active: false,
    });
    expect(deriveDogOperationalStatus("d1", [past], today)).toEqual({ kind: "available" });
  });

  it("restores specialty operational count after dog exclusion expires", () => {
    const members = [
      {
        id: "a1",
        section_id: "s1",
        dog_id: "d1",
        active: true,
        dogs: { id: "d1", specialty: "narcotics" },
      },
    ];
    const expired = exclusion({
      agent_id: "a1",
      dog_id: "d1",
      exclusion_type: "female_dog_heat",
      end_date: "2026-08-05",
      active: false,
    });
    const stats = computeSectionOperationalStats("s1", members, [expired], today);
    expect(stats.narcoticsTotal).toBe(1);
    expect(stats.narcotics).toBe(1);
    expect(stats.available).toBe(1);
  });

  it("still counts specialty as excluded while active and within range", () => {
    const members = [
      {
        id: "a1",
        section_id: "s1",
        dog_id: "d1",
        active: true,
        dogs: { id: "d1", specialty: "narcotics" },
      },
    ];
    const active = exclusion({
      agent_id: "a1",
      dog_id: "d1",
      exclusion_type: "female_dog_heat",
      end_date: "2026-08-10",
      active: true,
    });
    const stats = computeSectionOperationalStats("s1", members, [active], today);
    expect(stats.narcoticsTotal).toBe(1);
    expect(stats.narcotics).toBe(0);
  });
});

describe("planning / PDF reference date (not wall-clock today)", () => {
  // Today = 06/08/2026 — exclusion still in force until 25/08.
  const row = exclusion({
    exclusion_type: "sickness",
    start_date: "2026-08-05",
    end_date: "2026-08-25",
    active: true,
  });

  it("keeps exclusion ACTIVE for planning date inside the range (20/08)", () => {
    const planningDate = "2026-08-20";
    expect(isAgentExclusionActive(row, planningDate)).toBe(true);
    expect(toPlanningExclusionInputs([row], planningDate)).toHaveLength(1);
  });

  it("treats exclusion as expired for planning date after end_date (27/08)", () => {
    const planningDate = "2026-08-27";
    expect(isAgentExclusionActive(row, planningDate)).toBe(false);
    expect(isExclusionPastEndDate(row, planningDate)).toBe(true);
    expect(toPlanningExclusionInputs([row], planningDate)).toHaveLength(0);
  });

  it("still treats the same row as active when dashboard uses today (06/08)", () => {
    expect(isAgentExclusionActive(row, "2026-08-06")).toBe(true);
  });
});
