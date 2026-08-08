import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { todayISODate } from "@/lib/agent-exclusions";

describe("todayISODate", () => {
  it("matches the local calendar day (not UTC)", () => {
    expect(todayISODate()).toBe(format(new Date(), "yyyy-MM-dd"));
  });
});
