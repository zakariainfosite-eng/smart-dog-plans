import { describe, expect, it } from "vitest";
import { formatReferenceNumber } from "@/lib/reports-messages/reference-numbers";
import { getReferencePrefixForKind } from "@/lib/reports-messages/templates";

describe("formatReferenceNumber", () => {
  it("pads sequence to three digits", () => {
    expect(formatReferenceNumber("RAP", 2026, 1)).toBe("RAP-2026-001");
    expect(formatReferenceNumber("RAP", 2026, 42)).toBe("RAP-2026-042");
    expect(formatReferenceNumber("MSG", 2026, 100)).toBe("MSG-2026-100");
  });
});

describe("getReferencePrefixForKind", () => {
  it("uses MSG for messages and RAP for other kinds", () => {
    expect(getReferencePrefixForKind("message")).toBe("MSG");
    expect(getReferencePrefixForKind("report")).toBe("RAP");
    expect(getReferencePrefixForKind("monthly")).toBe("RAP");
  });
});
