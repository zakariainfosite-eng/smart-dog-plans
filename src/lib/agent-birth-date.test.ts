import { describe, expect, it } from "vitest";
import {
  formatAgentBirthDateDisplay,
  normalizeAgentBirthDate,
  validateAgentBirthDate,
} from "@/lib/agent-birth-date";

describe("agent birth date", () => {
  const ref = new Date("2026-08-08T12:00:00.000Z");

  it("normalizes and displays as jj/mm/aaaa", () => {
    expect(normalizeAgentBirthDate("1990-05-15")).toBe("1990-05-15");
    expect(formatAgentBirthDateDisplay("1990-05-15")).toBe("15/05/1990");
    expect(formatAgentBirthDateDisplay(null)).toBe("");
  });

  it("rejects future dates and ages outside 18–70", () => {
    expect(validateAgentBirthDate("2027-01-01", ref)).toBe("future");
    expect(validateAgentBirthDate("2015-08-08", ref)).toBe("tooYoung");
    expect(validateAgentBirthDate("1950-01-01", ref)).toBe("tooOld");
    expect(validateAgentBirthDate("1990-05-15", ref)).toBeNull();
  });

  it("allows empty values on forms", () => {
    expect(validateAgentBirthDate("", ref)).toBeNull();
    expect(validateAgentBirthDate(null, ref)).toBeNull();
  });
});
