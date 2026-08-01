import { describe, expect, it } from "vitest";
import { runPlanningEngine, type AgentInput, type CheckpointInput } from "./engine";

function maleAgent(overrides: Partial<AgentInput> & Pick<AgentInput, "id" | "section_id">): AgentInput {
  return {
    first_name: "Male",
    last_name: overrides.id,
    professional_number: overrides.id,
    gender: "male",
    active: true,
    dog_id: `dog-${overrides.id}`,
    dogs: {
      id: `dog-${overrides.id}`,
      name: `Dog-${overrides.id}`,
      specialty: "explosives",
      status: "available",
      active: true,
    },
    ...overrides,
  };
}

function femaleAgent(overrides: Partial<AgentInput> & Pick<AgentInput, "id">): AgentInput {
  return {
    first_name: "Female",
    last_name: overrides.id,
    professional_number: overrides.id,
    gender: "female",
    active: true,
    section_id: null,
    dog_id: `dog-${overrides.id}`,
    dogs: {
      id: `dog-${overrides.id}`,
      name: `Dog-${overrides.id}`,
      specialty: "explosives",
      status: "available",
      active: true,
    },
    ...overrides,
  };
}

const maleOnlyCheckpoint: CheckpointInput = {
  id: "cp-20",
  name: "20",
  night_only: false,
  active: true,
  allowed_gender: "male",
  female_policy: "not_allowed",
  priority: 1,
  operating_days: [1, 2, 3, 4, 5, 6, 7],
  day_shift_enabled: true,
  night_shift_enabled: true,
  posts: [
    {
      id: "post-20-day-e",
      shift: "day",
      specialty_required: "explosives",
      required_agents: 1,
      active: true,
      allowed_gender: "male",
      dog_required: true,
    },
  ],
};

describe("unfilledCheckpointPosts warning generation", () => {
  it("does not warn position left unfilled when males later fully staff a male-only post", () => {
    const sectionId = "section-1";
    const result = runPlanningEngine({
      sectionId,
      agents: [
        maleAgent({ id: "m1", section_id: sectionId }),
        femaleAgent({ id: "f1" }),
      ],
      exclusions: [],
      checkpoints: [maleOnlyCheckpoint],
      shift: "day",
      planningDate: new Date(2026, 6, 27),
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    expect(result.summary.fullyStaffedCheckpoints).toBe(1);
    expect(result.summary.understaffedCheckpoints).toBe(0);
    expect(result.checkpoints[0]?.total_staffed).toBe(1);
    expect(
      result.summary.warnings.some((w) => w.includes("position left unfilled")),
    ).toBe(false);
    expect(result.summary.warnings.some((w) => w.includes("UNDERSTAFFED"))).toBe(false);
  });

  it("emits underfill warnings only when posts remain unfilled after assignment", () => {
    const sectionId = "section-1";
    const result = runPlanningEngine({
      sectionId,
      agents: [femaleAgent({ id: "f1" })],
      exclusions: [],
      checkpoints: [maleOnlyCheckpoint],
      shift: "day",
      planningDate: new Date(2026, 6, 27),
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    expect(result.summary.understaffedCheckpoints).toBe(1);
    expect(result.summary.warnings.some((w) => w.includes("UNDERSTAFFED"))).toBe(true);
    expect(
      result.summary.warnings.some((w) => w.includes("position left unfilled")),
    ).toBe(true);
  });
});
