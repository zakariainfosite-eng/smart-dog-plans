import { describe, expect, it } from "vitest";

import {
  computeUniqueDogExclusionSpecialtyStats,
  countExclusionCynoSpecialties,
  exclusionCynoSpecialty,
  computeExcludedPersonnelCardStats,
  listExclusionRowsByCynoSpecialty,
  listUniqueExcludedDogRows,
  listExcludedPersonnelRows,
  type ExclusionSpecialtyLookups,
  type ExclusionSpecialtyRow,
} from "@/lib/exclusions-specialty-stats";

function lookups(opts?: {
  agents?: Array<[string, { dog_id?: string | null; fonction?: string | null }]>;
  dogs?: Array<[string, { specialty?: string | null }]>;
}): ExclusionSpecialtyLookups {
  return {
    agentById: new Map(opts?.agents ?? []),
    dogById: new Map(opts?.dogs ?? []),
  };
}

function personnelRow(
  partial: Partial<ExclusionSpecialtyRow> & Pick<ExclusionSpecialtyRow, "agent_id">,
): ExclusionSpecialtyRow {
  return {
    exclusion_type: "sickness",
    dog_id: null,
    ...partial,
  };
}

function dogRow(
  partial: Partial<ExclusionSpecialtyRow> & Pick<ExclusionSpecialtyRow, "dog_id">,
): ExclusionSpecialtyRow {
  return {
    exclusion_type: "dog_sick",
    agent_id: null,
    ...partial,
  };
}

describe("exclusionCynoSpecialty", () => {
  it("ignores administrative personnel even when a dog specialty exists", () => {
    const ctx = lookups({
      agents: [["a1", { dog_id: "d1", fonction: "secretaire" }]],
      dogs: [["d1", { specialty: "narcotics" }]],
    });
    expect(exclusionCynoSpecialty(personnelRow({ agent_id: "a1" }), ctx)).toBeNull();
  });

  it("uses the assigned dog specialty for cynotechniciens", () => {
    const ctx = lookups({
      agents: [["a1", { dog_id: "d1", fonction: "cynotechnicien" }]],
      dogs: [["d1", { specialty: "explosives" }]],
    });
    expect(exclusionCynoSpecialty(personnelRow({ agent_id: "a1" }), ctx)).toBe("explosives");
  });

  it("groups currency with narcotics for dog exclusions", () => {
    const ctx = lookups({
      dogs: [["d1", { specialty: "currency" }]],
    });
    expect(exclusionCynoSpecialty(dogRow({ dog_id: "d1" }), ctx)).toBe("narcotics");
  });
});

describe("countExclusionCynoSpecialties", () => {
  it("counts rows, not unique people, and skips admin", () => {
    const ctx = lookups({
      agents: [
        ["cyno", { dog_id: "d-n", fonction: "cynotechnicien" }],
        ["admin", { dog_id: "d-n", fonction: "chef_de_section" }],
      ],
      dogs: [
        ["d-n", { specialty: "narcotics" }],
        ["d-e", { specialty: "explosives" }],
      ],
    });

    const stats = countExclusionCynoSpecialties(
      [
        personnelRow({ agent_id: "cyno", exclusion_type: "sickness" }),
        personnelRow({ agent_id: "admin", exclusion_type: "sickness" }),
        dogRow({ dog_id: "d-e", exclusion_type: "female_dog_heat" }),
      ],
      ctx,
    );

    expect(stats).toEqual({ narcotics: 1, explosives: 1 });
  });
});

describe("listExclusionRowsByCynoSpecialty", () => {
  it("returns the same rows counted by countExclusionCynoSpecialties", () => {
    const ctx = lookups({
      agents: [
        ["cyno", { dog_id: "d-n", fonction: "cynotechnicien" }],
        ["admin", { dog_id: "d-n", fonction: "chef_de_section" }],
      ],
      dogs: [
        ["d-n", { specialty: "narcotics" }],
        ["d-e", { specialty: "explosives" }],
      ],
    });
    const rows = [
      personnelRow({ agent_id: "cyno", exclusion_type: "sickness" }),
      personnelRow({ agent_id: "admin", exclusion_type: "sickness" }),
      dogRow({ dog_id: "d-e", exclusion_type: "female_dog_heat" }),
    ];
    const counts = countExclusionCynoSpecialties(rows, ctx);
    expect(listExclusionRowsByCynoSpecialty(rows, ctx, "narcotics")).toHaveLength(counts.narcotics);
    expect(listExclusionRowsByCynoSpecialty(rows, ctx, "explosives")).toHaveLength(counts.explosives);
  });
});

describe("listUniqueExcludedDogRows", () => {
  it("matches unique dog specialty card counts", () => {
    const ctx = lookups({
      dogs: [
        ["d-n", { specialty: "narcotics" }],
        ["d-e", { specialty: "explosives" }],
      ],
    });
    const rows = [
      dogRow({ dog_id: "d-n", exclusion_type: "dog_sick" }),
      dogRow({ dog_id: "d-n", exclusion_type: "dog_injured" }),
      dogRow({ dog_id: "d-e", exclusion_type: "female_dog_heat" }),
    ];
    const stats = computeUniqueDogExclusionSpecialtyStats(rows, ctx);
    expect(listUniqueExcludedDogRows(rows, ctx)).toHaveLength(stats.total);
    expect(listUniqueExcludedDogRows(rows, ctx, "narcotics")).toHaveLength(stats.narcotics);
    expect(listUniqueExcludedDogRows(rows, ctx, "explosives")).toHaveLength(stats.explosives);
  });
});

describe("listExcludedPersonnelRows", () => {
  it("matches unique personnel card counts", () => {
    const ctx = lookups({
      agents: [
        ["cyno-n", { dog_id: "d-n", fonction: "cynotechnicien" }],
        ["cyno-e", { dog_id: "d-e", fonction: "cynotechnicien" }],
        ["admin", { dog_id: null, fonction: "secretaire" }],
      ],
      dogs: [
        ["d-n", { specialty: "narcotics" }],
        ["d-e", { specialty: "explosives" }],
      ],
    });
    const rows = [
      personnelRow({ agent_id: "cyno-n", exclusion_type: "sickness" }),
      personnelRow({ agent_id: "cyno-n", exclusion_type: "mission" }),
      personnelRow({ agent_id: "cyno-e", exclusion_type: "annual_leave" }),
      personnelRow({ agent_id: "admin", exclusion_type: "sickness" }),
      dogRow({ dog_id: "d-e", exclusion_type: "female_dog_heat" }),
    ];
    const stats = computeExcludedPersonnelCardStats(rows, ctx);
    expect(listExcludedPersonnelRows(rows, ctx)).toHaveLength(stats.total);
    expect(listExcludedPersonnelRows(rows, ctx, "narcotics")).toHaveLength(stats.narcotics);
    expect(listExcludedPersonnelRows(rows, ctx, "explosives")).toHaveLength(stats.explosives);
    expect(listExcludedPersonnelRows(rows, ctx, "administrative")).toHaveLength(stats.administrative);
  });
});

describe("computeUniqueDogExclusionSpecialtyStats", () => {
  it("counts unique dogs and ignores personnel rows", () => {
    const ctx = lookups({
      agents: [["cyno", { dog_id: "d-n", fonction: "cynotechnicien" }]],
      dogs: [
        ["d-n", { specialty: "narcotics" }],
        ["d-e", { specialty: "explosives" }],
      ],
    });

    const stats = computeUniqueDogExclusionSpecialtyStats(
      [
        dogRow({ dog_id: "d-n", exclusion_type: "dog_sick" }),
        dogRow({ dog_id: "d-n", exclusion_type: "dog_injured" }),
        dogRow({ dog_id: "d-e", exclusion_type: "female_dog_heat" }),
        personnelRow({ agent_id: "cyno" }),
      ],
      ctx,
    );

    expect(stats).toEqual({ total: 2, narcotics: 1, explosives: 1 });
  });
});

describe("computeExcludedPersonnelCardStats", () => {
  it("counts unique personnel, splits cyno specialty from administrative, ignores dogs", () => {
    const ctx = lookups({
      agents: [
        ["cyno-n", { dog_id: "d-n", fonction: "cynotechnicien" }],
        ["cyno-e", { dog_id: "d-e", fonction: "cynotechnicien" }],
        ["admin", { dog_id: null, fonction: "secretaire" }],
      ],
      dogs: [
        ["d-n", { specialty: "narcotics" }],
        ["d-e", { specialty: "explosives" }],
      ],
    });

    const stats = computeExcludedPersonnelCardStats(
      [
        personnelRow({ agent_id: "cyno-n", exclusion_type: "sickness" }),
        personnelRow({ agent_id: "cyno-n", exclusion_type: "mission" }),
        personnelRow({ agent_id: "cyno-e", exclusion_type: "annual_leave" }),
        personnelRow({ agent_id: "admin", exclusion_type: "sickness" }),
        dogRow({ dog_id: "d-e", exclusion_type: "female_dog_heat" }),
      ],
      ctx,
    );

    expect(stats).toEqual({
      total: 3,
      explosives: 1,
      narcotics: 1,
      administrative: 1,
    });
  });
});
