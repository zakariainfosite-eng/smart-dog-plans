import { describe, expect, it } from "vitest";

import { isOpenEndedExclusionType } from "@/lib/agent-exclusions";
import {
  isCurrentlyActiveExclusionForNotifications,
  isExclusionRowEnabled,
} from "@/lib/notifications/exclusion-reminder-candidates";

describe("exclusion reminder candidates", () => {
  it("treats SQLite active=1 the same as active=true", () => {
    expect(isExclusionRowEnabled(true)).toBe(true);
    expect(isExclusionRowEnabled(1)).toBe(true);
    expect(isExclusionRowEnabled(false)).toBe(false);
    expect(isExclusionRowEnabled(0)).toBe(false);
  });

  it("includes a long-lived exclusion created months ago once the end date is in the window", () => {
    const today = "2026-08-16";
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-03-01", end_date: "2026-08-16", active: 1 },
        today,
      ),
    ).toBe(true);
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-03-01", end_date: "2026-08-15", active: 1 },
        today,
      ),
    ).toBe(false);
  });

  it("includes legacy active exclusions whose end date is in the reminder window", () => {
    const today = "2026-08-13";
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-08-01", end_date: "2026-08-15", active: 1 },
        today,
      ),
    ).toBe(true);
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-08-01", end_date: "2026-08-14", active: true },
        today,
      ),
    ).toBe(true);
  });

  it("excludes disabled or out-of-range exclusions", () => {
    const today = "2026-08-13";
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-08-01", end_date: "2026-08-15", active: 0 },
        today,
      ),
    ).toBe(false);
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-08-14", end_date: "2026-08-20", active: true },
        today,
      ),
    ).toBe(false);
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-08-01", end_date: "2026-08-12", active: true },
        today,
      ),
    ).toBe(false);
  });

  it("does not generate end-date reminders for open-ended dog types", () => {
    expect(isOpenEndedExclusionType("dog_vet_visit")).toBe(true);
    expect(isOpenEndedExclusionType("dog_without_handler")).toBe(true);
    expect(isOpenEndedExclusionType("dog_sick")).toBe(false);
  });

  it("does not throw when end_date is missing (open-ended exclusions)", () => {
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-08-01", end_date: "", active: true },
        "2026-08-17",
      ),
    ).toBe(false);
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-08-01", end_date: null as unknown as string, active: true },
        "2026-08-17",
      ),
    ).toBe(false);
  });
});
