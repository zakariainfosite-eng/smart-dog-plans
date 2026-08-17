import { describe, expect, it } from "vitest";

import { resolveSemanticBadgeTone } from "@/lib/ui/semantic-badge-tone";

describe("resolveSemanticBadgeTone", () => {
  it("keeps text-driven tones for English and Arabic labels", () => {
    expect(resolveSemanticBadgeTone("Available", "status")).toBe("success");
    expect(resolveSemanticBadgeTone("Explosives", "specialty")).toBe("warning");
    expect(resolveSemanticBadgeTone("Narcotics", "specialty")).toBe("info");
    expect(resolveSemanticBadgeTone("متفجرات", "specialty")).toBe("warning");
    expect(resolveSemanticBadgeTone("مخدرات", "specialty")).toBe("info");
  });
});
