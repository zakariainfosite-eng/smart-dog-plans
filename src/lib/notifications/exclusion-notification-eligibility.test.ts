import { describe, expect, it } from "vitest";

import { buildExclusionReminderAlertKey } from "@/lib/notifications/exclusion-reminder-alerts";
import {
  exclusionScanWindow,
  milestoneForDaysUntilEnd,
} from "@/lib/notifications/exclusion-return-dates";

describe("exclusion notification eligibility", () => {
  it("creates reminders for active exclusions ending today, tomorrow, or in 2 days", () => {
    const today = "2026-08-13";
    const window = exclusionScanWindow(today);

    expect(window).toEqual({
      minEndDate: "2026-08-13",
      maxEndDate: "2026-08-15",
    });

    expect(milestoneForDaysUntilEnd(2)).toBe("d2");
    expect(milestoneForDaysUntilEnd(1)).toBe("d1");
    expect(milestoneForDaysUntilEnd(0)).toBe("d0");
    expect(milestoneForDaysUntilEnd(3)).toBeNull();
  });

  it("dedup keys combine exclusion id, milestone, and end date", () => {
    expect(buildExclusionReminderAlertKey("ex-1", "d1", "2026-08-14")).toBe(
      "ex-1::d1::2026-08-14",
    );
  });
});
