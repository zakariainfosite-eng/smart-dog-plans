import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXCLUSION_LIST_STATUS_FILTER,
  exclusionListStatus,
  isUpcomingExclusionStart,
  matchesExclusionListStatusFilter,
} from "@/lib/exclusion-list-status";

const TODAY = "2026-09-04";

const inForce = { active: 1, start_date: "2026-08-20", end_date: "2026-09-10" };
const upcoming = { active: 1, start_date: "2026-09-10", end_date: "2026-09-20" };
const completed = { active: 0, start_date: "2026-08-20", end_date: "2026-09-03" };

describe("exclusionListStatus — Exclusions page display only", () => {
  it("TEST 1 — Congé 21/08/2026 → 30/08/2026 is in force", () => {
    expect(
      exclusionListStatus({ active: 1, start_date: "2026-08-21", end_date: "2026-08-30" }, "2026-08-22"),
    ).toBe("inForce");
  });

  it("TEST 2 — Congé 23/08/2026 → 01/09/2026 is upcoming", () => {
    expect(
      exclusionListStatus(
        { active: true, start_date: "2026-08-23", end_date: "2026-09-01" },
        "2026-08-22",
      ),
    ).toBe("upcoming");
  });

  it("TEST 3 — Congé 01/08/2026 → 10/08/2026 is expired", () => {
    expect(
      exclusionListStatus({ active: 0, start_date: "2026-08-01", end_date: "2026-08-10" }, "2026-08-22"),
    ).toBe("expired");
  });

  it("TEST 4 — future female_dog_heat is upcoming", () => {
    expect(
      exclusionListStatus({ active: 1, start_date: "2026-08-25", end_date: "2026-09-10" }, "2026-08-22"),
    ).toBe("upcoming");
    expect(
      matchesExclusionListStatusFilter(
        { active: 1, start_date: "2026-08-25", end_date: "2026-09-10" },
        "upcoming",
        "2026-08-22",
      ),
    ).toBe(true);
    expect(
      matchesExclusionListStatusFilter(
        { active: 1, start_date: "2026-08-25", end_date: "2026-09-10" },
        "inForce",
        "2026-08-22",
      ),
    ).toBe(false);
  });

  it("TEST 5 — current female_dog_heat is in force", () => {
    expect(
      exclusionListStatus({ active: 1, start_date: "2026-08-22", end_date: "2026-08-22" }, "2026-08-22"),
    ).toBe("inForce");
  });

  it("treats an open-ended enabled row as in force when start has been reached", () => {
    expect(
      exclusionListStatus({ active: true, start_date: "2026-08-01", end_date: null }, "2026-08-22"),
    ).toBe("inForce");
  });

  it("detects a future start for the post-create toast", () => {
    expect(isUpcomingExclusionStart("2026-08-23", "2026-08-22")).toBe(true);
    expect(isUpcomingExclusionStart("2026-08-22", "2026-08-22")).toBe(false);
  });
});

describe("default Exclusions list filter (current = En cours + À venir)", () => {
  it("defaults to current — hides Terminée, shows En cours and À venir", () => {
    expect(DEFAULT_EXCLUSION_LIST_STATUS_FILTER).toBe("current");
    expect(exclusionListStatus(completed, TODAY)).toBe("expired");
    expect(matchesExclusionListStatusFilter(inForce, "current", TODAY)).toBe(true);
    expect(matchesExclusionListStatusFilter(upcoming, "current", TODAY)).toBe(true);
    expect(matchesExclusionListStatusFilter(completed, "current", TODAY)).toBe(false);
  });

  it("1 — active exclusion visible by default", () => {
    expect(matchesExclusionListStatusFilter(inForce, DEFAULT_EXCLUSION_LIST_STATUS_FILTER, TODAY)).toBe(
      true,
    );
  });

  it("2 — future exclusion visible by default", () => {
    expect(matchesExclusionListStatusFilter(upcoming, DEFAULT_EXCLUSION_LIST_STATUS_FILTER, TODAY)).toBe(
      true,
    );
  });

  it("3 — completed exclusion hidden by default", () => {
    expect(matchesExclusionListStatusFilter(completed, DEFAULT_EXCLUSION_LIST_STATUS_FILTER, TODAY)).toBe(
      false,
    );
  });

  it("4 — selecting Terminées shows completed exclusions", () => {
    expect(matchesExclusionListStatusFilter(completed, "expired", TODAY)).toBe(true);
    expect(matchesExclusionListStatusFilter(inForce, "expired", TODAY)).toBe(false);
  });

  it("5 — selecting Toutes shows all exclusions", () => {
    expect(matchesExclusionListStatusFilter(inForce, "all", TODAY)).toBe(true);
    expect(matchesExclusionListStatusFilter(upcoming, "all", TODAY)).toBe(true);
    expect(matchesExclusionListStatusFilter(completed, "all", TODAY)).toBe(true);
  });
});
