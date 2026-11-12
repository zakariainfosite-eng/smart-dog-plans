import { describe, expect, it } from "vitest";

import {
  fireAtFromPendingSchedule,
  pendingScheduleMatchesFireAt,
} from "@/lib/notifications/android-exclusion-pending-schedule";
import { combineLocalDateTime } from "@/lib/notifications/android-planning-local-notifications";

describe("android-exclusion-pending-schedule", () => {
  it("parses schedule.on in device-local fields", () => {
    const fireAt = combineLocalDateTime("2026-11-15", "08:30");
    const parsed = fireAtFromPendingSchedule({
      on: {
        year: fireAt.getFullYear(),
        month: fireAt.getMonth(),
        day: fireAt.getDate(),
        hour: fireAt.getHours(),
        minute: fireAt.getMinutes(),
        second: 0,
      },
    });
    expect(parsed?.getTime()).toBe(fireAt.getTime());
  });

  it("matches fireAt within tolerance", () => {
    const fireAt = combineLocalDateTime("2026-11-15", "14:00");
    expect(
      pendingScheduleMatchesFireAt(
        { on: { year: fireAt.getFullYear(), month: fireAt.getMonth(), day: fireAt.getDate(), hour: 14, minute: 0 } },
        fireAt,
      ),
    ).toBe(true);
  });
});
