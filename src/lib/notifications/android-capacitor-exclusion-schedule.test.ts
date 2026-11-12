import { describe, expect, it } from "vitest";

import {
  buildCapacitorAndroidExactSchedule,
  coerceFutureCapacitorScheduleAt,
} from "@/lib/notifications/android-capacitor-exclusion-schedule";
import { combineLocalDateTime } from "@/lib/notifications/android-planning-local-notifications";

describe("android-capacitor-exclusion-schedule", () => {
  it("buildCapacitorAndroidExactSchedule uses device-local calendar fields", () => {
    const fireAt = combineLocalDateTime("2026-11-15", "08:30");
    const schedule = buildCapacitorAndroidExactSchedule(fireAt);
    expect(schedule.allowWhileIdle).toBe(true);
    expect(schedule.on).toEqual({
      year: fireAt.getFullYear(),
      month: fireAt.getMonth(),
      day: fireAt.getDate(),
      hour: fireAt.getHours(),
      minute: fireAt.getMinutes(),
      second: fireAt.getSeconds(),
    });
  });

  it("coerceFutureCapacitorScheduleAt rejects past instants", () => {
    const now = combineLocalDateTime("2026-11-15", "09:00");
    expect(coerceFutureCapacitorScheduleAt(combineLocalDateTime("2026-11-15", "08:00"), now)).toBeNull();
    expect(coerceFutureCapacitorScheduleAt(combineLocalDateTime("2026-11-15", "10:00"), now)?.getTime()).toBe(
      combineLocalDateTime("2026-11-15", "10:00").getTime(),
    );
  });
});
