import { describe, expect, it } from "vitest";
import {
  exclusionListStatus,
  isUpcomingExclusionStart,
  matchesExclusionListStatusFilter,
} from "@/lib/exclusion-list-status";

const TODAY = "2026-08-22";

describe("exclusionListStatus — Exclusions page display only", () => {
  it("TEST 1 — Congé 21/08/2026 → 30/08/2026 is in force", () => {
    expect(
      exclusionListStatus({ active: 1, start_date: "2026-08-21", end_date: "2026-08-30" }, TODAY),
    ).toBe("inForce");
  });

  it("TEST 2 — Congé 23/08/2026 → 01/09/2026 is upcoming", () => {
    expect(
      exclusionListStatus(
        { active: true, start_date: "2026-08-23", end_date: "2026-09-01" },
        TODAY,
      ),
    ).toBe("upcoming");
  });

  it("TEST 3 — Congé 01/08/2026 → 10/08/2026 is expired", () => {
    expect(
      exclusionListStatus({ active: 0, start_date: "2026-08-01", end_date: "2026-08-10" }, TODAY),
    ).toBe("expired");
  });

  it("TEST 4 — future female_dog_heat is upcoming", () => {
    expect(
      exclusionListStatus({ active: 1, start_date: "2026-08-25", end_date: "2026-09-10" }, TODAY),
    ).toBe("upcoming");
    expect(
      matchesExclusionListStatusFilter(
        { active: 1, start_date: "2026-08-25", end_date: "2026-09-10" },
        "upcoming",
        TODAY,
      ),
    ).toBe(true);
    expect(
      matchesExclusionListStatusFilter(
        { active: 1, start_date: "2026-08-25", end_date: "2026-09-10" },
        "inForce",
        TODAY,
      ),
    ).toBe(false);
  });

  it("TEST 5 — current female_dog_heat is in force", () => {
    expect(
      exclusionListStatus({ active: 1, start_date: "2026-08-22", end_date: "2026-08-22" }, TODAY),
    ).toBe("inForce");
  });

  it("default En vigueur filter keeps today's rows and hides upcoming", () => {
    const inForce = { active: 1, start_date: "2026-08-21", end_date: "2026-08-30" };
    const upcoming = { active: 1, start_date: "2026-08-23", end_date: "2026-09-01" };
    expect(matchesExclusionListStatusFilter(inForce, "inForce", TODAY)).toBe(true);
    expect(matchesExclusionListStatusFilter(upcoming, "inForce", TODAY)).toBe(false);
    expect(matchesExclusionListStatusFilter(upcoming, "all", TODAY)).toBe(true);
  });

  it("treats an open-ended enabled row as in force when start has been reached", () => {
    expect(
      exclusionListStatus({ active: true, start_date: "2026-08-01", end_date: null }, TODAY),
    ).toBe("inForce");
  });

  it("detects a future start for the post-create toast", () => {
    expect(isUpcomingExclusionStart("2026-08-23", TODAY)).toBe(true);
    expect(isUpcomingExclusionStart("2026-08-22", TODAY)).toBe(false);
  });
});
