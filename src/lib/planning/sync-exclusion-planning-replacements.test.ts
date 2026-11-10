import { describe, expect, it } from "vitest";

import { exclusionPlanningDatesEligibleForSync } from "@/lib/planning/sync-exclusion-planning-replacements";

describe("syncExclusionPlanningReplacements scheduling", () => {
  it("9 — does not sync future planning dates before the exclusion starts", () => {
    expect(exclusionPlanningDatesEligibleForSync("2026-08-07", "2026-08-09", "2026-08-05")).toEqual([]);
  });

  it("syncs each day from start through today within the exclusion window", () => {
    expect(exclusionPlanningDatesEligibleForSync("2026-08-07", "2026-08-09", "2026-08-08")).toEqual([
      "2026-08-07",
      "2026-08-08",
    ]);
    expect(exclusionPlanningDatesEligibleForSync("2026-08-07", "2026-08-09", "2026-08-09")).toEqual([
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]);
  });
});
