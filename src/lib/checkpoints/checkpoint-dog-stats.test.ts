import { describe, expect, it } from "vitest";

import type { AgentRow } from "@/integrations/database";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import {
  computeAggregateCheckpointDogStats,
  computeCheckpointDogStats,
  computeCheckpointDogStatsMap,
  computeDogOperationalStatsFromDogs,
  type CheckpointDogAssignment,
} from "@/lib/checkpoints/checkpoint-dog-stats";

function agent(id: string, specialty: string, overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id,
    first_name: "Agent",
    last_name: id,
    professional_number: id,
    grade: "G",
    gender: "male",
    fonction: "cynotechnicien",
    marital_status: "single",
    date_naissance: "1990-01-01",
    origine: null,
    section_id: "sec-1",
    dog_id: `dog-${id}`,
    is_section_chief: false,
    active: true,
    phone: null,
    address: null,
    observations: null,
    photo_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    sections: { id: "sec-1", name: "Section A" },
    dogs: {
      id: `dog-${id}`,
      name: `Dog ${id}`,
      specialty,
      status: "available",
    },
    ...overrides,
  };
}

describe("computeCheckpointDogStats", () => {
  const assignments: CheckpointDogAssignment[] = [
    { checkpointId: "cp-1", agentId: "exp1", dogId: "dog-exp1" },
    { checkpointId: "cp-1", agentId: "exp2", dogId: "dog-exp2" },
    { checkpointId: "cp-1", agentId: "nar1", dogId: "dog-nar1" },
    { checkpointId: "cp-1", agentId: "cur1", dogId: "dog-cur1" },
    { checkpointId: "cp-2", agentId: "exp3", dogId: "dog-exp3" },
  ];

  it("counts total, active, and excluded dogs by specialty from assignments", () => {
    const agents = [
      agent("exp1", "explosives"),
      agent("exp2", "explosives"),
      agent("nar1", "narcotics"),
      agent("cur1", "currency"),
    ];
    const exclusions: AgentExclusionRecord[] = [
      {
        id: "ex-1",
        agent_id: null,
        dog_id: "dog-exp2",
        exclusion_type: "dog_sick",
        start_date: "2026-08-01",
        end_date: "2026-08-31",
        active: true,
        is_deleted: false,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ];

    const stats = computeCheckpointDogStats(
      "cp-1",
      agents,
      assignments,
      exclusions,
      "2026-08-13",
    );

    expect(stats.explosives).toEqual({ total: 2, active: 1, excluded: 1 });
    expect(stats.narcotics).toEqual({ total: 2, active: 2, excluded: 0 });
  });

  it("returns zeros when no dogs are assigned to the checkpoint", () => {
    const stats = computeCheckpointDogStats(
      "cp-empty",
      [agent("exp1", "explosives")],
      assignments,
      [],
      "2026-08-13",
    );
    expect(stats.explosives.total).toBe(0);
    expect(stats.narcotics.total).toBe(0);
  });

  it("ignores expired dog exclusions", () => {
    const agents = [agent("exp1", "explosives")];
    const exclusions: AgentExclusionRecord[] = [
      {
        id: "ex-old",
        agent_id: null,
        dog_id: "dog-exp1",
        exclusion_type: "dog_sick",
        start_date: "2026-07-01",
        end_date: "2026-07-10",
        active: true,
        is_deleted: false,
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
      },
    ];

    const stats = computeCheckpointDogStats(
      "cp-1",
      agents,
      assignments,
      exclusions,
      "2026-08-13",
    );

    expect(stats.explosives).toEqual({ total: 1, active: 1, excluded: 0 });
  });

  it("builds a map entry for every checkpoint", () => {
    const checkpoints = [
      { id: "cp-1", name: "A" },
      { id: "cp-2", name: "B" },
    ] as Parameters<typeof computeCheckpointDogStatsMap>[0];

    const map = computeCheckpointDogStatsMap(
      checkpoints,
      [agent("exp1", "explosives"), agent("exp3", "explosives")],
      assignments,
      [],
      "2026-08-13",
    );

    expect(map.has("cp-1")).toBe(true);
    expect(map.has("cp-2")).toBe(true);
    expect(map.get("cp-2")?.explosives.total).toBe(1);
  });
});

describe("computeDogOperationalStatsFromDogs", () => {
  it("matches Chiens page counts from all dogs regardless of checkpoint assignment", () => {
    const dogs = [
      { id: "dog-exp1", specialty: "explosives" },
      { id: "dog-exp2", specialty: "explosives" },
      { id: "dog-nar1", specialty: "narcotics" },
      { id: "dog-cur1", specialty: "currency" },
      { id: "dog-other", specialty: "search" },
    ];
    const exclusions: AgentExclusionRecord[] = [
      {
        id: "ex-1",
        agent_id: null,
        dog_id: "dog-exp2",
        exclusion_type: "dog_sick",
        start_date: "2026-08-01",
        end_date: "2026-08-31",
        active: true,
        is_deleted: false,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ];

    const stats = computeDogOperationalStatsFromDogs(dogs, exclusions, "2026-08-13");

    expect(stats.activeTotal).toBe(4);
    expect(stats.excludedTotal).toBe(1);
    expect(stats.explosives).toEqual({ total: 2, active: 1, excluded: 1 });
    expect(stats.narcotics).toEqual({ total: 2, active: 2, excluded: 0 });
  });

  it("ignores expired dog exclusions", () => {
    const dogs = [{ id: "dog-exp1", specialty: "explosives" }];
    const exclusions: AgentExclusionRecord[] = [
      {
        id: "ex-old",
        agent_id: null,
        dog_id: "dog-exp1",
        exclusion_type: "dog_sick",
        start_date: "2026-07-01",
        end_date: "2026-07-10",
        active: true,
        is_deleted: false,
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
      },
    ];

    const stats = computeDogOperationalStatsFromDogs(dogs, exclusions, "2026-08-13");

    expect(stats.activeTotal).toBe(1);
    expect(stats.excludedTotal).toBe(0);
    expect(stats.explosives).toEqual({ total: 1, active: 1, excluded: 0 });
  });
});

describe("computeAggregateCheckpointDogStats", () => {
  const assignments = [
    { checkpointId: "cp-1", agentId: "exp1", dogId: "dog-exp1" },
    { checkpointId: "cp-1", agentId: "exp2", dogId: "dog-exp2" },
    { checkpointId: "cp-2", agentId: "nar1", dogId: "dog-nar1" },
    { checkpointId: "cp-2", agentId: "cur1", dogId: "dog-cur1" },
  ];

  it("deduplicates dogs assigned to multiple checkpoints", () => {
    const agents = [
      agent("exp1", "explosives"),
      agent("exp2", "explosives"),
      agent("nar1", "narcotics"),
      agent("cur1", "currency"),
    ];

    const stats = computeAggregateCheckpointDogStats(agents, assignments, [], "2026-08-13");

    expect(stats.explosives).toEqual({ total: 2, active: 2, excluded: 0 });
    expect(stats.narcotics).toEqual({ total: 2, active: 2, excluded: 0 });
  });
});
