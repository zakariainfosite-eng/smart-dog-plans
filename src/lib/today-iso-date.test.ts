import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { isValidPlanningDayISO, planningDayISO, todayISODate } from "@/lib/agent-exclusions";
import { localCalendarDayISO } from "@/lib/local-calendar-day";

describe("todayISODate", () => {
  it("matches the local calendar day (not UTC)", () => {
    expect(todayISODate()).toBe(format(new Date(), "yyyy-MM-dd"));
    expect(todayISODate()).toBe(localCalendarDayISO());
  });
});

describe("planningDayISO", () => {
  it("defaults to today when called without arguments", () => {
    expect(planningDayISO()).toBe(todayISODate());
  });

  it("accepts valid yyyy-MM-dd strings", () => {
    expect(planningDayISO("2026-08-13")).toBe("2026-08-13");
    expect(planningDayISO("2026-08-13T12:00:00")).toBe("2026-08-13");
  });

  it("falls back to today for invalid strings and dates", () => {
    expect(planningDayISO("")).toBe(todayISODate());
    expect(planningDayISO("not-a-date")).toBe(todayISODate());
    expect(planningDayISO(new Date("invalid"))).toBe(todayISODate());
  });
});

describe("isValidPlanningDayISO", () => {
  it("validates calendar day strings", () => {
    expect(isValidPlanningDayISO("2026-08-13")).toBe(true);
    expect(isValidPlanningDayISO("")).toBe(false);
    expect(isValidPlanningDayISO("bad-date")).toBe(false);
    expect(isValidPlanningDayISO("2026-02-30")).toBe(false);
  });
});
