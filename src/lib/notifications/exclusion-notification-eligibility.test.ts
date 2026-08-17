import { describe, expect, it } from "vitest";

import { isUpcomingExclusionNotification } from "@/lib/notifications/exclusion-return-messages";
import { buildExclusionReminderAlertKey } from "@/lib/notifications/exclusion-reminder-alerts";
import { isCurrentlyActiveExclusionForNotifications } from "@/lib/notifications/exclusion-reminder-candidates";
import {
  daysUntilEnd,
  exclusionScanWindow,
  milestoneForDaysUntilEnd,
} from "@/lib/notifications/exclusion-return-dates";
import { exclusionNotificationDedupeKey } from "@/lib/notifications/exclusion-return-types";

const TODAY = "2026-08-16";

describe("exclusion notification eligibility", () => {
  it("keeps the 2-day reminder window", () => {
    expect(exclusionScanWindow(TODAY)).toEqual({
      minEndDate: "2026-08-16",
      maxEndDate: "2026-08-18",
    });
  });

  it("creates a d0 reminder for an exclusion ending today", () => {
    expect(daysUntilEnd("2026-08-16", TODAY)).toBe(0);
    expect(milestoneForDaysUntilEnd(0)).toBe("d0");
    expect(isUpcomingExclusionNotification({ end_date: "2026-08-16" }, TODAY)).toBe(true);
  });

  it("creates a d1 reminder for an exclusion ending tomorrow", () => {
    expect(daysUntilEnd("2026-08-17", TODAY)).toBe(1);
    expect(milestoneForDaysUntilEnd(1)).toBe("d1");
  });

  it("creates a d2 reminder for an exclusion ending in 2 days", () => {
    expect(daysUntilEnd("2026-08-18", TODAY)).toBe(2);
    expect(milestoneForDaysUntilEnd(2)).toBe("d2");
  });

  it("creates no reminder for an exclusion ending in 3 days", () => {
    expect(daysUntilEnd("2026-08-19", TODAY)).toBe(3);
    expect(milestoneForDaysUntilEnd(3)).toBeNull();
    const window = exclusionScanWindow(TODAY);
    expect("2026-08-19" <= window.maxEndDate).toBe(false);
  });

  it("creates no reminder for an expired exclusion", () => {
    expect(daysUntilEnd("2026-08-15", TODAY)).toBe(-1);
    expect(milestoneForDaysUntilEnd(-1)).toBeNull();
    expect(isUpcomingExclusionNotification({ end_date: "2026-08-15" }, TODAY)).toBe(false);
    expect(
      isCurrentlyActiveExclusionForNotifications(
        { start_date: "2026-08-01", end_date: "2026-08-15", active: 1 },
        TODAY,
      ),
    ).toBe(false);
  });

  it("notifies an existing old active exclusion when it enters the 0–2 day window", () => {
    const oldExclusion = {
      start_date: "2026-01-10",
      end_date: "2026-08-18",
      active: 1 as const,
    };
    const window = exclusionScanWindow(TODAY);
    expect(isCurrentlyActiveExclusionForNotifications(oldExclusion, TODAY)).toBe(true);
    expect(oldExclusion.end_date >= window.minEndDate).toBe(true);
    expect(oldExclusion.end_date <= window.maxEndDate).toBe(true);
    expect(milestoneForDaysUntilEnd(daysUntilEnd(oldExclusion.end_date, TODAY))).toBe("d2");
  });

  it("does not notify a long-running exclusion still more than 2 days from ending", () => {
    const oldExclusion = {
      start_date: "2026-01-10",
      end_date: "2026-08-20",
      active: true,
    };
    expect(isCurrentlyActiveExclusionForNotifications(oldExclusion, TODAY)).toBe(true);
    expect(milestoneForDaysUntilEnd(daysUntilEnd(oldExclusion.end_date, TODAY))).toBeNull();
  });

  it("dedupes one notification per exclusion and milestone", () => {
    const d0 = exclusionNotificationDedupeKey("ex-old", "d0");
    const d1 = exclusionNotificationDedupeKey("ex-old", "d1");
    const seen = new Set([d0]);
    expect(seen.has(exclusionNotificationDedupeKey("ex-old", "d0"))).toBe(true);
    expect(seen.has(d1)).toBe(false);
    seen.add(d1);
    expect(seen.size).toBe(2);
  });

  it("dedup keys combine exclusion id, milestone, and end date for popups", () => {
    expect(buildExclusionReminderAlertKey("ex-1", "d1", "2026-08-14")).toBe(
      "ex-1::d1::2026-08-14",
    );
  });
});
