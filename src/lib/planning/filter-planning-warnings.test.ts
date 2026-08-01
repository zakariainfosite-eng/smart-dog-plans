import { describe, expect, it } from "vitest";
import { filterPlanningWarningsForSelectedSection } from "./filter-planning-warnings";

describe("filterPlanningWarningsForSelectedSection", () => {
  const sectionAgentNames = new Set(["Alice Dupont", "Bob Martin"]);

  const baseContext = {
    sectionId: "sec-1",
    sectionName: "1ère Section",
    otherSectionNames: ["2ème Section", "3ème Section"],
    sectionAgentNames,
  };

  it("keeps engine staffing warnings (already scoped to unfilled posts)", () => {
    const warnings = [
      "Checkpoint 20: no eligible male handler for explosives — position left unfilled.",
      "Checkpoint 77 BIS is UNDERSTAFFED (0/2, 2 positions unfilled).",
    ];
    expect(filterPlanningWarningsForSelectedSection(warnings, baseContext)).toEqual(warnings);
  });

  it("drops warnings that mention other section names", () => {
    const warnings = [
      "2ème Section: Checkpoint 20 is UNDERSTAFFED (0/1, 1 position unfilled).",
      "Planning incomplete for 3ème Section",
      "Checkpoint 20 is UNDERSTAFFED (0/1, 1 position unfilled).",
    ];
    expect(filterPlanningWarningsForSelectedSection(warnings, baseContext)).toEqual([
      "Checkpoint 20 is UNDERSTAFFED (0/1, 1 position unfilled).",
    ]);
  });

  it("drops agent INVALID warnings outside the section pool", () => {
    const warnings = [
      "INVALID: Exclusion ignored — Charlie Other (absence): agent not found in section pool or exclusion not applied.",
      "INVALID: Exclusion ignored — Alice Dupont (absence): agent not found in section pool or exclusion not applied.",
    ];
    expect(filterPlanningWarningsForSelectedSection(warnings, baseContext)).toEqual([
      "INVALID: Exclusion ignored — Alice Dupont (absence): agent not found in section pool or exclusion not applied.",
    ]);
  });
});
