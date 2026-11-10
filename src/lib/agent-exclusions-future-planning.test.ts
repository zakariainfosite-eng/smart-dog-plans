import { describe, expect, it } from "vitest";

import {
  filterActiveExclusions,
  isAgentExclusionActive,
  toPlanningExclusionInputs,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import { exclusionListStatus } from "@/lib/exclusion-list-status";
import { deriveAgentAvailability } from "@/lib/agent-ui";

const AGENT_ID = "ahmed-id";

function leaveExclusion(
  overrides: Partial<AgentExclusionRecord> = {},
): AgentExclusionRecord {
  return {
    agent_id: AGENT_ID,
    dog_id: null,
    exclusion_type: "annual_leave",
    start_date: "2026-08-07",
    end_date: "2026-08-09",
    active: true,
    ...overrides,
  };
}

/** Tuesday 2026-08-05 — leave Thu 07 → Sat 09 */
const TODAY = "2026-08-05";

describe("future exclusions — visibility and planning-date eligibility", () => {
  const row = leaveExclusion();

  it("1 — future exclusion is visible as À venir in the list (today before start)", () => {
    expect(exclusionListStatus(row, TODAY)).toBe("upcoming");
  });

  it("2 — agent remains eligible before the start date", () => {
    expect(isAgentExclusionActive(row, "2026-08-05")).toBe(false);
    expect(isAgentExclusionActive(row, "2026-08-06")).toBe(false);
    expect(deriveAgentAvailability(AGENT_ID, [row], TODAY)).toEqual({ status: "available" });
    expect(toPlanningExclusionInputs([row], TODAY)).toHaveLength(0);
  });

  it("3 — agent becomes ineligible exactly on the start date", () => {
    expect(isAgentExclusionActive(row, "2026-08-07")).toBe(true);
    expect(toPlanningExclusionInputs([row], "2026-08-07")).toHaveLength(1);
  });

  it("4 — agent remains ineligible during the exclusion", () => {
    expect(isAgentExclusionActive(row, "2026-08-08")).toBe(true);
    expect(deriveAgentAvailability(AGENT_ID, [row], "2026-08-08")).toEqual({
      status: "excluded",
      exclusionType: "annual_leave",
    });
  });

  it("5 — agent becomes eligible again after the exclusion ends", () => {
    expect(isAgentExclusionActive(row, "2026-08-10")).toBe(false);
    expect(deriveAgentAvailability(AGENT_ID, [row], "2026-08-10")).toEqual({ status: "available" });
  });

  it("6 — planning for a future date uses exclusions active on that date only", () => {
    const wednesday = filterActiveExclusions([row], "2026-08-06");
    const thursday = filterActiveExclusions([row], "2026-08-07");
    expect(wednesday).toHaveLength(0);
    expect(thursday).toHaveLength(1);
    expect(exclusionListStatus(row, "2026-08-06")).toBe("upcoming");
    expect(exclusionListStatus(row, "2026-08-08")).toBe("inForce");
  });
});
