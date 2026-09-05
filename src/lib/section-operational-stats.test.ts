import { describe, expect, it } from "vitest";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import {
  computeSectionOperationalStats,
  getActiveExclusionsForSection,
  groupSectionExclusionTypesByLabel,
  listSectionAvailableMembers,
  listSectionMembers,
  listSectionOperationalSpecialtyMembers,
  listSectionSpecialtyMembers,
  memberSpecialtyFlags,
  SECTION_EXCLUSION_DISPLAY_TYPES,
  SECTION_EXCLUSION_HIDDEN_DISPLAY_TYPES,
  sumSectionExclusionBreakdown,
  emptySectionExclusionBreakdown,
} from "@/lib/section-operational-stats";

function exclusion(
  partial: Partial<AgentExclusionRecord> & Pick<AgentExclusionRecord, "exclusion_type">,
): AgentExclusionRecord {
  return {
    agent_id: partial.agent_id ?? null,
    dog_id: partial.dog_id ?? null,
    exclusion_type: partial.exclusion_type,
    start_date: partial.start_date ?? "2026-01-01",
    end_date: partial.end_date ?? "2026-12-31",
    active: partial.active ?? true,
  };
}

describe("computeSectionOperationalStats", () => {
  const day = "2026-08-05";
  const sectionId = "sec-a";

  const agents = [
    {
      id: "a1",
      section_id: sectionId,
      dog_id: "d1",
      active: true,
      dogs: { id: "d1", specialty: "narcotics" },
    },
    {
      id: "a2",
      section_id: sectionId,
      dog_id: "d2",
      active: true,
      dogs: { id: "d2", specialty: "explosives" },
    },
    { id: "a3", section_id: sectionId, dog_id: null, active: true, dogs: null },
    {
      id: "a4",
      section_id: "sec-b",
      dog_id: "d9",
      active: true,
      dogs: { id: "d9", specialty: "narcotics" },
    },
  ];

  it("counts only members of the section", () => {
    const stats = computeSectionOperationalStats(sectionId, agents, [], day);
    expect(stats.assigned).toBe(3);
    expect(stats.available).toBe(3);
    expect(stats.byReason.sickness).toBe(0);
    expect(stats.narcotics).toBe(1);
    expect(stats.narcoticsTotal).toBe(1);
    expect(stats.explosives).toBe(1);
    expect(stats.explosivesTotal).toBe(1);
  });

  it("attributes dog exclusions to the handler section", () => {
    const stats = computeSectionOperationalStats(
      sectionId,
      agents,
      [exclusion({ dog_id: "d1", exclusion_type: "female_dog_heat" })],
      day,
    );
    expect(stats.available).toBe(2);
    expect(stats.byReason.female_dog_heat).toBe(1);
    expect(stats.assigned).toBe(stats.available + stats.activeExclusions);
  });

  it("counts every active exclusion row in byReason; availability uses top priority", () => {
    const stats = computeSectionOperationalStats(
      sectionId,
      agents,
      [
        exclusion({ agent_id: "a1", exclusion_type: "training" }),
        exclusion({ dog_id: "d1", exclusion_type: "dog_sick" }),
        exclusion({ agent_id: "a2", exclusion_type: "annual_leave" }),
        exclusion({ agent_id: "a3", exclusion_type: "sickness" }),
      ],
      day,
    );
    expect(stats.byReason.training).toBe(1);
    expect(stats.byReason.dog_sick).toBe(1);
    expect(stats.byReason.annual_leave).toBe(1);
    expect(stats.byReason.sickness).toBe(1);
    expect(stats.available).toBe(0);
    expect(stats.activeExclusions).toBe(3);
  });

  it("counts each leave variant separately", () => {
    const stats = computeSectionOperationalStats(
      sectionId,
      agents,
      [
        exclusion({ agent_id: "a1", exclusion_type: "special_leave" }),
        exclusion({ agent_id: "a2", exclusion_type: "administrative_leave" }),
      ],
      day,
    );
    expect(stats.byReason.special_leave).toBe(1);
    expect(stats.byReason.administrative_leave).toBe(1);
    expect(stats.byReason.annual_leave).toBe(0);
  });

  it("counts dog exclusion types individually instead of Autre", () => {
    const stats = computeSectionOperationalStats(
      sectionId,
      agents,
      [
        exclusion({ dog_id: "d1", exclusion_type: "dog_injured" }),
        exclusion({ dog_id: "d2", exclusion_type: "dog_vet_visit" }),
        exclusion({ agent_id: "a3", exclusion_type: "suspension" }),
      ],
      day,
    );
    expect(stats.byReason.dog_injured).toBe(1);
    expect(stats.byReason.dog_vet_visit).toBe(1);
    expect(stats.byReason.suspension).toBe(1);
  });

  it("ignores other sections' dog exclusions", () => {
    const stats = computeSectionOperationalStats(
      sectionId,
      agents,
      [exclusion({ dog_id: "d9", exclusion_type: "dog_sick" })],
      day,
    );
    expect(stats.byReason.dog_sick).toBe(0);
    expect(stats.available).toBe(3);
  });

  it("subtracts any active exclusion from operational specialty totals", () => {
    const stats = computeSectionOperationalStats(
      sectionId,
      agents,
      [
        exclusion({ agent_id: "a1", exclusion_type: "sickness" }),
        exclusion({ agent_id: "a2", exclusion_type: "mission" }),
      ],
      day,
    );
    expect(stats.available).toBe(1);
    expect(stats.narcotics).toBe(0);
    expect(stats.narcoticsTotal).toBe(1);
    expect(stats.explosives).toBe(0);
    expect(stats.explosivesTotal).toBe(1);
    expect(stats.byReason.sickness).toBe(1);
    expect(stats.byReason.mission).toBe(1);
  });

  it("matches operational specialty example (6−2 Stupéfiants, 4 Explosifs)", () => {
    const sectionAgents = [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `n${i}`,
        section_id: sectionId,
        dog_id: `dn${i}`,
        active: true as const,
        dogs: { id: `dn${i}`, specialty: "narcotics" },
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `e${i}`,
        section_id: sectionId,
        dog_id: `de${i}`,
        active: true as const,
        dogs: { id: `de${i}`, specialty: "explosives" },
      })),
    ];
    const stats = computeSectionOperationalStats(
      sectionId,
      sectionAgents,
      [
        exclusion({ dog_id: "dn0", exclusion_type: "female_dog_heat" }),
        exclusion({ agent_id: "n1", exclusion_type: "training" }),
      ],
      day,
    );
    expect(stats.narcotics).toBe(4);
    expect(stats.narcoticsTotal).toBe(6);
    expect(stats.explosives).toBe(4);
    expect(stats.explosivesTotal).toBe(4);
    expect(stats.byReason.female_dog_heat).toBe(1);
    expect(stats.byReason.training).toBe(1);
  });

  it("does not count personnel without a dog or inactive members", () => {
    const stats = computeSectionOperationalStats(
      sectionId,
      [
        ...agents,
        {
          id: "a5",
          section_id: sectionId,
          dog_id: "d5",
          active: false,
          dogs: { id: "d5", specialty: "narcotics" },
        },
      ],
      [],
      day,
    );
    expect(stats.narcotics).toBe(1);
    expect(stats.explosives).toBe(1);
  });

  it("counts multi-specialty dogs in each applicable category", () => {
    expect(
      memberSpecialtyFlags({
        id: "m1",
        section_id: sectionId,
        dog_id: "d-multi",
        active: true,
        dogs: {
          id: "d-multi",
          specialty: "narcotics",
          specialties: ["narcotics", "explosives"],
        },
      }),
    ).toEqual({ narcotics: true, explosives: true, currency: false });

    const stats = computeSectionOperationalStats(
      sectionId,
      [
        {
          id: "m1",
          section_id: sectionId,
          dog_id: "d-multi",
          active: true,
          dogs: {
            id: "d-multi",
            specialty: "narcotics",
            specialties: ["narcotics", "explosives"],
          },
        },
      ],
      [],
      day,
    );
    expect(stats.narcotics).toBe(1);
    expect(stats.explosives).toBe(1);
  });
});

describe("getActiveExclusionsForSection", () => {
  const day = "2026-08-05";
  const sectionId = "sec-a";
  const agents = [
    {
      id: "a1",
      section_id: sectionId,
      dog_id: "d1",
      active: true,
      dogs: { id: "d1", specialty: "narcotics" },
    },
    {
      id: "a2",
      section_id: sectionId,
      dog_id: "d2",
      active: true,
      dogs: { id: "d2", specialty: "explosives" },
    },
    {
      id: "a9",
      section_id: "sec-b",
      dog_id: "d9",
      active: true,
      dogs: { id: "d9", specialty: "narcotics" },
    },
  ];

  it("returns both personnel and dog exclusions for the section", () => {
    const rows = getActiveExclusionsForSection(
      sectionId,
      agents,
      [
        exclusion({ agent_id: "a1", exclusion_type: "sickness" }),
        exclusion({ dog_id: "d2", exclusion_type: "female_dog_heat" }),
        exclusion({ dog_id: "d1", exclusion_type: "dog_sick" }),
        exclusion({ agent_id: "a9", exclusion_type: "mission" }),
        exclusion({ dog_id: "d9", exclusion_type: "dog_temporary_retirement" }),
      ],
      day,
    );

    const types = rows.map((row) => row.exclusion_type).sort();
    expect(types).toEqual(["dog_sick", "female_dog_heat", "sickness"]);
  });

  it("filters by exclusion type (e.g. Maladie only)", () => {
    const rows = getActiveExclusionsForSection(
      sectionId,
      agents,
      [
        exclusion({ agent_id: "a1", exclusion_type: "sickness" }),
        exclusion({ agent_id: "a2", exclusion_type: "annual_leave" }),
        exclusion({ dog_id: "d2", exclusion_type: "dog_sick" }),
      ],
      day,
      ["sickness"],
    );
    expect(rows.map((row) => row.exclusion_type)).toEqual(["sickness"]);
  });

  it("filters grouped leave variants together", () => {
    const rows = getActiveExclusionsForSection(
      sectionId,
      agents,
      [
        exclusion({ agent_id: "a1", exclusion_type: "annual_leave" }),
        exclusion({ agent_id: "a2", exclusion_type: "special_leave" }),
        exclusion({ agent_id: "a1", exclusion_type: "sickness" }),
      ],
      day,
      ["annual_leave", "special_leave", "administrative_leave"],
    );
    expect(rows.map((row) => row.exclusion_type).sort()).toEqual([
      "annual_leave",
      "special_leave",
    ]);
  });
});

describe("SECTION_EXCLUSION_DISPLAY_TYPES", () => {
  it("hides Indisponible types from section card statistics", () => {
    expect(SECTION_EXCLUSION_HIDDEN_DISPLAY_TYPES).toEqual(["other", "dog_other"]);
    expect(SECTION_EXCLUSION_DISPLAY_TYPES).not.toContain("other");
    expect(SECTION_EXCLUSION_DISPLAY_TYPES).not.toContain("dog_other");
    expect(SECTION_EXCLUSION_DISPLAY_TYPES).toContain("sickness");
    expect(SECTION_EXCLUSION_DISPLAY_TYPES).toContain("dog_sick");
  });

  it("does not produce an Indisponible group when building display labels", () => {
    const groups = groupSectionExclusionTypesByLabel(
      SECTION_EXCLUSION_DISPLAY_TYPES,
      (type) => {
        const labels: Record<string, string> = {
          other: "Indisponible",
          dog_other: "Indisponible",
          sickness: "Malade",
        };
        return labels[type] ?? type;
      },
    );

    expect(groups.some((group) => group.label === "Indisponible")).toBe(false);
  });
});

describe("groupSectionExclusionTypesByLabel", () => {
  it("merges types that share the same display label", () => {
    const groups = groupSectionExclusionTypesByLabel(
      [
        "annual_leave",
        "special_leave",
        "administrative_leave",
        "other",
        "dog_other",
        "sickness",
      ],
      (type) => {
        const labels: Record<string, string> = {
          annual_leave: "Congé",
          special_leave: "Congé",
          administrative_leave: "Congé",
          other: "Indisponible",
          dog_other: "Indisponible",
          sickness: "Malade",
        };
        return labels[type] ?? type;
      },
    );

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.label === "Congé")?.types).toEqual([
      "annual_leave",
      "special_leave",
      "administrative_leave",
    ]);
    expect(groups.find((group) => group.label === "Indisponible")?.types).toEqual([
      "other",
      "dog_other",
    ]);
  });

  it("aggregates counts for grouped labels", () => {
    const breakdown = emptySectionExclusionBreakdown();
    breakdown.annual_leave = 2;
    breakdown.special_leave = 1;
    breakdown.administrative_leave = 0;

    expect(
      sumSectionExclusionBreakdown(breakdown, [
        "annual_leave",
        "special_leave",
        "administrative_leave",
      ]),
    ).toBe(3);
  });
});

describe("section card list helpers match card counts", () => {
  const day = "2026-08-05";
  const sectionId = "sec-a";
  const agents = [
    {
      id: "a1",
      section_id: sectionId,
      dog_id: "d1",
      active: true,
      dogs: { id: "d1", specialty: "narcotics" },
    },
    {
      id: "a2",
      section_id: sectionId,
      dog_id: "d2",
      active: true,
      dogs: { id: "d2", specialty: "explosives" },
    },
    { id: "a3", section_id: sectionId, dog_id: null, active: true, dogs: null },
    {
      id: "a4",
      section_id: "sec-b",
      dog_id: "d9",
      active: true,
      dogs: { id: "d9", specialty: "narcotics" },
    },
  ];
  const exclusions = [
    exclusion({ agent_id: "a1", exclusion_type: "sickness" }),
    exclusion({ agent_id: "a2", exclusion_type: "mission" }),
  ];

  it("lists the same assigned / available / specialty rows as the card stats", () => {
    const stats = computeSectionOperationalStats(sectionId, agents, exclusions, day);
    expect(listSectionMembers(sectionId, agents)).toHaveLength(stats.assigned);
    expect(listSectionAvailableMembers(sectionId, agents, exclusions, day)).toHaveLength(
      stats.available,
    );
    expect(listSectionSpecialtyMembers(sectionId, agents, "narcotics")).toHaveLength(
      stats.narcoticsTotal,
    );
    expect(listSectionSpecialtyMembers(sectionId, agents, "explosives")).toHaveLength(
      stats.explosivesTotal,
    );
    expect(
      listSectionOperationalSpecialtyMembers(sectionId, agents, exclusions, "narcotics", day),
    ).toHaveLength(stats.narcotics);
    expect(
      listSectionOperationalSpecialtyMembers(sectionId, agents, exclusions, "explosives", day),
    ).toHaveLength(stats.explosives);
  });
});
