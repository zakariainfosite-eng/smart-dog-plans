import { describe, expect, it } from "vitest";

import {
  previousPlanningDate,
  ROTATION_OVERRIDE_CODE,
  runPlanningEngine,
  type AgentInput,
  type CheckpointInput,
} from "@/lib/planning/engine";

const dayPost = (
  id: string,
  specialty: "narcotics" | "explosives" = "narcotics",
) => ({
  id,
  shift: "day" as const,
  specialty_required: specialty,
  required_agents: 1,
  active: true,
  allowed_gender: "all" as const,
  dog_required: true,
});

function checkpoint(
  id: string,
  name: string,
  priority: 1 | 2 | 3 | 4,
  specialty: "narcotics" | "explosives" = "narcotics",
): CheckpointInput {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: "allowed",
    priority,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts: [dayPost(`p-${id}`, specialty)],
  };
}

function male(
  id: string,
  specialty: "narcotics" | "explosives" = "narcotics",
): AgentInput {
  return {
    id,
    first_name: "M",
    last_name: id,
    professional_number: id.toUpperCase(),
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: `d-${id}`,
    dogs: {
      id: `d-${id}`,
      name: `Dog-${id}`,
      specialty,
      status: "available",
      active: true,
    },
  };
}

function priorityName(checkpointId: string, checkpoints: CheckpointInput[]) {
  return checkpoints.find((c) => c.id === checkpointId)?.name;
}

describe("P1 → P4 operational priority (FIX 02)", () => {
  it("1. assigns P1 before P2 when two eligible teams exist", () => {
    const checkpoints = [checkpoint("cp-p2", "20", 2), checkpoint("cp-p1", "91", 1)];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 2),
      agents: [male("m1"), male("m2")],
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    const order = result.assignments.map((a) => priorityName(a.checkpoint_id, checkpoints));
    expect(order[0]).toBe("91");
    expect(order[1]).toBe("20");
  });

  it("2. staffs both P1 specialties before any P2", () => {
    const checkpoints = [
      checkpoint("cp-p2n", "20", 2, "narcotics"),
      checkpoint("cp-p1e", "91e", 1, "explosives"),
      checkpoint("cp-p1n", "91n", 1, "narcotics"),
    ];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 3),
      agents: [male("m1", "narcotics"), male("m2", "explosives")],
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    expect(result.assignments.some((a) => a.checkpoint_id === "cp-p2n")).toBe(false);
    expect(result.assignments.filter((a) => ["cp-p1n", "cp-p1e"].includes(a.checkpoint_id)).length).toBe(2);
  });

  it("3. continues to P2 when P1 specialty is impossible", () => {
    const checkpoints = [
      checkpoint("cp-p2", "20", 2, "narcotics"),
      checkpoint("cp-p1", "91", 1, "explosives"),
    ];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 4),
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    expect(result.assignments.some((a) => a.checkpoint_id === "cp-p2")).toBe(true);
    expect(result.checkpoints.find((c) => c.checkpoint_id === "cp-p1")?.total_staffed).toBe(0);
  });

  it("4. does not assign P2 while P1 can be rescued under rotation override", () => {
    const checkpoints = [
      checkpoint("cp-p2", "20", 2, "explosives"),
      checkpoint("cp-p1", "91", 1, "explosives"),
    ];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 5, 15),
      agents: [male("m1", "explosives")],
      exclusions: [],
      checkpoints,
      rotationHistory: [
        { agent_id: "m1", checkpoint_id: "cp-p1", planning_date: "2026-05-01" },
      ],
      yesterdayCheckpointByAgent: new Map([["m1", "cp-p2"]]),
      fairnessCounts: new Map(),
    });

    expect(result.assignments[0]?.checkpoint_id).toBe("cp-p1");
    expect(result.structuredWarnings.some((w) => w.code === ROTATION_OVERRIDE_CODE)).toBe(true);
    expect(result.checkpoints.find((c) => c.checkpoint_id === "cp-p2")?.total_staffed).toBe(0);
  });

  it("5. keeps Critical P1 cooldown — no P1 today after P1 yesterday", () => {
    const planningDate = new Date(2026, 7, 6);
    const prevISO = previousPlanningDate(planningDate);
    const checkpoints = [checkpoint("cp-p1", "91", 1)];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate,
      agents: [male("m1")],
      exclusions: [],
      checkpoints,
      rotationHistory: [
        { agent_id: "m1", checkpoint_id: "cp-p1", planning_date: prevISO },
      ],
      yesterdayCheckpointByAgent: new Map([["m1", "cp-p1"]]),
      fairnessCounts: new Map(),
    });

    expect(result.assignments).toHaveLength(0);
    expect(result.checkpoints.find((c) => c.checkpoint_id === "cp-p1")?.total_staffed).toBe(0);
    expect(result.summary).toBeDefined();
  });

  it("6. does not use excluded agent on P1", () => {
    const checkpoints = [checkpoint("cp-p2", "20", 2), checkpoint("cp-p1", "91", 1)];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 5),
      agents: [male("m1"), male("m2")],
      exclusions: [
        {
          id: "ex1",
          agent_id: "m1",
          dog_id: null,
          exclusion_type: "sickness",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
        },
      ],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    expect(result.assignments.some((a) => a.agent_id === "m1")).toBe(false);
    expect(result.assignments.some((a) => a.checkpoint_id === "cp-p1")).toBe(true);
  });

  it("7. does not place narcotics team on explosives post", () => {
    const checkpoints = [checkpoint("cp-p1", "91", 1, "explosives")];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 6),
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    expect(result.assignments).toHaveLength(0);
  });

  it("8. female reservations still gate fillability (FIX 01)", () => {
    const post = dayPost("pn", "narcotics");
    const cp: CheckpointInput = {
      ...checkpoint("cp-p3", "30", 3, "narcotics"),
      posts: [post],
    };
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 0, 8),
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints: [cp],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: [],
    });
    expect(
      result.checkpoints.every((c) =>
        c.slots.every((s) => s.reservation !== "RESERVED_FOR_FEMALE_ASSIGNMENT"),
      ),
    ).toBe(true);
    expect(result.assignments).toHaveLength(1);
  });

  it("9. assigns Point 653 only after operational slots", () => {
    const checkpoints = [
      checkpoint("cp-p2", "20", 2),
      checkpoint("cp-p1", "91", 1),
    ];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 7),
      agents: [male("m1"), male("m2"), male("m3")],
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    expect(result.assignments.length).toBe(2);
    expect(result.point653.length).toBe(1);
    expect(result.point653.every((p) => p.reason === "no_operational_assignment")).toBe(true);
  });

  it("10. terminates normally when no assignment is possible", () => {
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 2, 8),
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints: [checkpoint("cp-p1", "91", 1, "explosives")],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    expect(result.assignments).toHaveLength(0);
    expect(result.summary).toBeDefined();
    expect(result.point653).toHaveLength(1);
  });
});

describe("P1 priority simulation (before vs after FIX 02)", () => {
  it("documents coverage when rotation blocks strict P1", () => {
    const checkpoints = [
      checkpoint("cp-p2", "20", 2, "explosives"),
      checkpoint("cp-p1", "91", 1, "explosives"),
    ];
    const params = {
      sectionId: "sec1",
      shift: "day" as const,
      planningDate: new Date(2026, 5, 15),
      agents: [male("m1", "explosives")],
      exclusions: [] as const,
      checkpoints,
      rotationHistory: [
        { agent_id: "m1", checkpoint_id: "cp-p1", planning_date: "2026-05-01" },
      ],
      yesterdayCheckpointByAgent: new Map([["m1", "cp-p2"]]),
      fairnessCounts: new Map(),
    };

    const result = runPlanningEngine({ ...params, exclusions: [] });
    const p1 = result.checkpoints.find((c) => c.checkpoint_id === "cp-p1");
    const p2 = result.checkpoints.find((c) => c.checkpoint_id === "cp-p2");
    const lowerWhileP1Open =
      result.assignments.some((a) => a.checkpoint_id === "cp-p2") &&
      (p1?.total_staffed ?? 0) === 0;

    expect(lowerWhileP1Open).toBe(false);
    expect(p1?.total_staffed).toBe(1);
    expect(p2?.total_staffed).toBe(0);
  });
});
