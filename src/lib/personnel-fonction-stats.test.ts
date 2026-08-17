import { describe, expect, it } from "vitest";

import {
  computeActivePersonnelCategoryStats,
  computePersonnelCategoryStats,
  countCynotechnicienSpecialties,
} from "@/lib/personnel-fonction-stats";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";

describe("computePersonnelCategoryStats", () => {
  it("counts cynotechniciens separately from administrative personnel", () => {
    const stats = computePersonnelCategoryStats([
      { fonction: "chef_de_section" },
      { fonction: "secretaire" },
      { fonction: "assistant_technique" },
      { fonction: "cynotechnicien" },
      { fonction: "cynotechnicien" },
      { fonction: "legacy_unknown" },
    ]);

    expect(stats).toEqual({
      cynotechniciens: 3,
      administrative: 3,
    });
  });

  it("returns zeros when there are no agents", () => {
    expect(computePersonnelCategoryStats([])).toEqual({
      cynotechniciens: 0,
      administrative: 0,
    });
  });
});

describe("computeActivePersonnelCategoryStats", () => {
  it("counts only active, available personnel by category", () => {
    const exclusions: AgentExclusionRecord[] = [
      {
        agent_id: "agent-1",
        dog_id: null,
        exclusion_type: "sickness",
        start_date: "2026-08-01",
        end_date: "2026-08-31",
        active: true,
      },
    ];

    const stats = computeActivePersonnelCategoryStats(
      [
        { id: "agent-1", active: true, fonction: "cynotechnicien", dog_id: "dog-1" },
        { id: "agent-2", active: true, fonction: "cynotechnicien", dog_id: null },
        { id: "agent-3", active: false, fonction: "cynotechnicien", dog_id: null },
        { id: "agent-4", active: true, fonction: "secretaire", dog_id: null },
      ],
      exclusions,
      "2026-08-13",
    );

    expect(stats).toEqual({
      total: 2,
      cynotechniciens: 1,
      administrative: 1,
    });
  });
});

describe("countCynotechnicienSpecialties", () => {
  it("counts only cynotechniciens and ignores administrative personnel", () => {
    const stats = countCynotechnicienSpecialties([
      { fonction: "cynotechnicien", dogs: { specialty: "narcotics" } },
      { fonction: "cynotechnicien", dogs: { specialty: "currency" } },
      { fonction: "cynotechnicien", dogs: { specialty: "explosives" } },
      { fonction: "secretaire", dogs: { specialty: "narcotics" } },
      { fonction: "chef_de_section", dogs: { specialty: "explosives" } },
      { fonction: "cynotechnicien", dogs: null },
    ]);

    expect(stats).toEqual({ narcotics: 2, explosives: 1 });
  });

  it("returns zeros when there are no matching cynotechniciens", () => {
    expect(
      countCynotechnicienSpecialties([{ fonction: "secretaire", dogs: { specialty: "narcotics" } }]),
    ).toEqual({ narcotics: 0, explosives: 0 });
  });
});
