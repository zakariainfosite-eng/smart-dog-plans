import { describe, expect, it } from "vitest";
import {
  resolveSectionCommanderDisplay,
  SECTION_COMMANDER_TITLE_ADJOINT_REPLACEMENT,
  SECTION_COMMANDER_TITLE_CHIEF,
  sectionCommanderTitleForMode,
} from "@/lib/section-commander-display";

const chief = {
  id: "chief-1",
  first_name: "Hassan",
  last_name: "Alami",
  grade: "BRIGADIER",
  professional_number: "9001",
  section_id: "sec-1",
  fonction: "chef_de_section" as const,
  active: true,
};

const adjoint = {
  id: "adj-1",
  first_name: "Karim",
  last_name: "Benali",
  grade: "BRIGADIER-CHEF",
  professional_number: "9100",
  section_id: "sec-1",
  fonction: "chef_de_section_pi" as const,
  active: true,
};

describe("resolveSectionCommanderDisplay", () => {
  it("shows the real chef when available", () => {
    const result = resolveSectionCommanderDisplay({
      sectionId: "sec-1",
      agents: [chief, adjoint],
      exclusions: [],
    });
    expect(result.mode).toBe("chief");
    expect(result.fullName).toBe("Hassan Alami");
    expect(result.mle).toBe("9001");
    expect(sectionCommanderTitleForMode(result.mode)).toBe(SECTION_COMMANDER_TITLE_CHIEF);
  });

  it("replaces an excluded chef with an available adjoint (display-only interim)", () => {
    const result = resolveSectionCommanderDisplay({
      sectionId: "sec-1",
      agents: [chief, adjoint],
      exclusions: [{ agent_id: "chief-1", exclusion_type: "sickness" }],
    });
    expect(result.mode).toBe("adjoint_replacement");
    expect(result.fullName).toBe("Karim Benali");
    expect(result.grade).toBe("BRIGADIER-CHEF");
    expect(result.mle).toBe("9100");
    expect(sectionCommanderTitleForMode(result.mode)).toBe("CHEF DE SECTION (INTÉRIM)");
    expect(sectionCommanderTitleForMode(result.mode)).toBe(
      SECTION_COMMANDER_TITLE_ADJOINT_REPLACEMENT,
    );
    // Permanent roles/sections must remain unchanged on the source records.
    expect(chief.fonction).toBe("chef_de_section");
    expect(chief.section_id).toBe("sec-1");
    expect(adjoint.fonction).toBe("chef_de_section_pi");
    expect(adjoint.section_id).toBe("sec-1");
  });

  it("uses blank fill-in when chef is excluded and no adjoint is available", () => {
    const result = resolveSectionCommanderDisplay({
      sectionId: "sec-1",
      agents: [chief],
      exclusions: [{ agent_id: "chief-1", exclusion_type: "mission" }],
    });
    expect(result.mode).toBe("manual_fill");
    expect(result.needsManualFill).toBe(true);
    expect(result.fullName).toBe("");
    expect(sectionCommanderTitleForMode(result.mode)).toBe(SECTION_COMMANDER_TITLE_CHIEF);
  });

  it("restores the real chef when the exclusion ends", () => {
    const result = resolveSectionCommanderDisplay({
      sectionId: "sec-1",
      agents: [chief, adjoint],
      exclusions: [],
    });
    expect(result.mode).toBe("chief");
    expect(result.fullName).toBe("Hassan Alami");
  });

  it("never prefixes the display name with grade", () => {
    const result = resolveSectionCommanderDisplay({
      sectionId: "sec-1",
      agents: [chief],
      exclusions: [],
      fallback: {
        fullName: "BRIGADIER Hassan Alami",
        grade: "BRIGADIER",
        mle: "9001",
      },
    });
    expect(result.fullName).toBe("Hassan Alami");
    expect(result.fullName.toLowerCase().startsWith("brigadier")).toBe(false);
  });

  it("skips an excluded adjoint when looking for a replacement", () => {
    const result = resolveSectionCommanderDisplay({
      sectionId: "sec-1",
      agents: [chief, adjoint],
      exclusions: [
        { agent_id: "chief-1", exclusion_type: "sickness" },
        { agent_id: "adj-1", exclusion_type: "annual_leave" },
      ],
    });
    expect(result.mode).toBe("manual_fill");
    expect(result.needsManualFill).toBe(true);
  });
});
