import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNING_SETTINGS,
  canEditPlanningSettings,
  isValidHhmm,
  isWithinDayShiftWindow,
  normalizeHhmm,
  parsePlanningSettings,
  validatePlanningSettings,
} from "@/lib/planning-settings";

describe("planning settings", () => {
  it("keeps the current 09:00–21:00 / 21:00–09:00 windows as defaults", () => {
    expect(parsePlanningSettings(null)).toEqual(DEFAULT_PLANNING_SETTINGS);
    expect(DEFAULT_PLANNING_SETTINGS).toEqual({
      dayStart: "09:00",
      dayEnd: "21:00",
      nightStart: "21:00",
      nightEnd: "09:00",
    });
  });

  it("accepts HH:mm and HH:mm:ss", () => {
    expect(isValidHhmm("09:00")).toBe(true);
    expect(isValidHhmm("21:00")).toBe(true);
    expect(normalizeHhmm("9:00")).toBe("09:00");
    expect(normalizeHhmm("21:00:00")).toBe("21:00");
    expect(isValidHhmm("24:00")).toBe(false);
    expect(isValidHhmm("9")).toBe(false);
  });

  it("does not treat empty shift hours as a format error", () => {
    expect(
      validatePlanningSettings({
        dayStart: "",
        dayEnd: "",
        nightStart: "",
        nightEnd: "",
      }),
    ).toEqual({});
  });

  it("rejects identical start and end times", () => {
    const errors = validatePlanningSettings({
      ...DEFAULT_PLANNING_SETTINGS,
      dayStart: "09:00",
      dayEnd: "09:00",
    });
    expect(errors.dayStart).toBe("same");
    expect(errors.dayEnd).toBe("same");
  });

  it("treats overnight night windows as valid", () => {
    expect(
      validatePlanningSettings({
        dayStart: "09:00",
        dayEnd: "20:00",
        nightStart: "20:00",
        nightEnd: "09:00",
      }),
    ).toEqual({});
  });

  it("matches the current day window at 09:00 inclusive and 21:00 exclusive", () => {
    const hours = DEFAULT_PLANNING_SETTINGS;
    expect(isWithinDayShiftWindow(new Date(2026, 7, 17, 8, 59), hours)).toBe(false);
    expect(isWithinDayShiftWindow(new Date(2026, 7, 17, 9, 0), hours)).toBe(true);
    expect(isWithinDayShiftWindow(new Date(2026, 7, 17, 20, 59), hours)).toBe(true);
    expect(isWithinDayShiftWindow(new Date(2026, 7, 17, 21, 0), hours)).toBe(false);
  });

  it("applies a shorter future day window without rewriting history data", () => {
    const hours = { ...DEFAULT_PLANNING_SETTINGS, dayEnd: "20:00", nightStart: "20:00" };
    expect(isWithinDayShiftWindow(new Date(2026, 7, 17, 19, 59), hours)).toBe(true);
    expect(isWithinDayShiftWindow(new Date(2026, 7, 17, 20, 0), hours)).toBe(false);
  });

  it("restricts edits to the existing admin role", () => {
    expect(canEditPlanningSettings("admin")).toBe(true);
    expect(canEditPlanningSettings("user")).toBe(false);
    expect(canEditPlanningSettings(null)).toBe(false);
  });
});
