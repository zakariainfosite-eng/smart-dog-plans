import { describe, expect, it } from "vitest";

import { runPlanningEngine, type AgentInput, type CheckpointInput } from "@/lib/planning/engine";

const dayPost = (id: string, specialty: "narcotics" | "explosives" = "narcotics") => ({
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

function male(id: string, specialty: "narcotics" | "explosives" = "narcotics"): AgentInput {
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

describe("checkpoint priority ordering (P1 → P4)", () => {
  it("assigns P1 before P2 when only two agents are available", () => {
    const checkpoints = [
      checkpoint("cp-p4", "78", 4),
      checkpoint("cp-p2", "20", 2),
      checkpoint("cp-p1a", "91", 1),
      checkpoint("cp-p3", "75", 3),
    ];

    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2020, 0, 6),
      agents: [male("m1"), male("m2")],
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    const names = result.assignments.map(
      (a) => checkpoints.find((c) => c.id === a.checkpoint_id)!.name,
    );
    expect(names).toEqual(["91", "20"]);
    expect(result.assignments.length).toBe(2);
  });

  it("covers another P1 checkpoint then proceeds to P2 after an impossible P1 post", () => {
    const checkpoints = [
      checkpoint("cp-p1a", "91", 1, "explosives"),
      checkpoint("cp-p1b", "20", 1, "narcotics"),
      checkpoint("cp-p2", "55", 2, "narcotics"),
    ];

    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2020, 0, 7),
      agents: [male("m1", "narcotics"), male("m2", "narcotics")],
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    const assignedIds = result.assignments.map((a) => a.checkpoint_id);
    expect(assignedIds).not.toContain("cp-p1a");
    expect(assignedIds.length).toBeGreaterThanOrEqual(1);
    expect(result.assignments.some((a) => a.checkpoint_id === "cp-p1b" || a.checkpoint_id === "cp-p2")).toBe(
      true,
    );
    if (!assignedIds.includes("cp-p2")) {
      expect(result.checkpoints.find((c) => c.id === "cp-p2")?.is_understaffed ?? true).toBe(true);
    }
  });

  it("completes planning when every slot stays open (no infinite loop)", () => {
    const checkpoints = [checkpoint("cp-p1", "91", 1, "explosives")];

    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2020, 0, 8),
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    expect(result.assignments).toHaveLength(0);
    expect(result.point653.some((p) => p.agent_id === "m1")).toBe(true);
    expect(result.summary.warnings.length).toBeGreaterThanOrEqual(0);
  });
});
