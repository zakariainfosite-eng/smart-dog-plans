import { describe, expect, it } from "vitest";
import { format } from "date-fns";

import { localCalendarDayISO } from "@/lib/local-calendar-day";
import { planningDayISO, todayISODate } from "@/lib/agent-exclusions";

describe("localCalendarDayISO", () => {
  it("matches the local calendar day used by planningDayISO and todayISODate", () => {
    const now = new Date();
    expect(localCalendarDayISO(now)).toBe(format(now, "yyyy-MM-dd"));
    expect(localCalendarDayISO(now)).toBe(planningDayISO(now));
    expect(localCalendarDayISO()).toBe(todayISODate());
  });

  it("uses local getFullYear/getMonth/getDate, not UTC toISOString", () => {
    const morning = new Date(2026, 7, 16, 0, 30, 0);
    const evening = new Date(2026, 7, 16, 23, 30, 0);

    expect(localCalendarDayISO(morning)).toBe("2026-08-16");
    expect(localCalendarDayISO(evening)).toBe("2026-08-16");
    expect(planningDayISO(morning)).toBe("2026-08-16");
    expect(planningDayISO(evening)).toBe("2026-08-16");

    const utcMorning = morning.toISOString().slice(0, 10);
    const utcEvening = evening.toISOString().slice(0, 10);
    expect(localCalendarDayISO(morning)).not.toBeUndefined();
    if (utcMorning !== "2026-08-16") {
      expect(localCalendarDayISO(morning)).not.toBe(utcMorning);
    }
    if (utcEvening !== "2026-08-16") {
      expect(localCalendarDayISO(evening)).not.toBe(utcEvening);
    }
  });

  it("does not expire an exclusion that ends on the local calendar day", () => {
    const localToday = localCalendarDayISO(new Date(2026, 7, 16, 0, 30, 0));
    const utcToday = new Date(2026, 7, 16, 0, 30, 0).toISOString().slice(0, 10);
    expect("2026-08-16" < localToday).toBe(false);
    if (utcToday > localToday) {
      expect("2026-08-16" < utcToday).toBe(true);
    }
  });
});
