import { format, subDays } from "date-fns";
import { describe, expect, it } from "vitest";

import { buildCriticalP1CooldownBlockedAgents } from "@/lib/planning/critical-p1-cooldown";
import {
  previousPlanningDate,
  runPlanningEngine,
  type AgentInput,
  type CheckpointInput,
  type RotationHistoryInput,
} from "@/lib/planning/engine";

const PLANNING = new Date(2026, 7, 6); // 2026-08-06
const PREV = previousPlanningDate(PLANNING);

const dayPost = (id: string) => ({
  id,
  shift: "day" as const,
  specialty_required: "narcotics" as const,
  required_agents: 1,
  active: true,
  allowed_gender: "all" as const,
  dog_required: true,
});

function cp(id: string, name: string, priority: 1 | 2 | 3 | 4): CheckpointInput {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: "not_allowed",
    priority,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts: [dayPost(`p-${id}`)],
  };
}

function ahmed(): AgentInput {
  return {
    id: "ahmed",
    first_name: "Ahmed",
    last_name: "Test",
    professional_number: "AHMED",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "d-ahmed",
    dogs: {
      id: "d-ahmed",
      name: "Dog-A",
      specialty: "narcotics",
      status: "available",
      active: true,
    },
  };
}

function otherMale(id: string): AgentInput {
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
      name: id,
      specialty: "narcotics",
      status: "available",
      active: true,
    },
  };
}

function history(
  agentId: string,
  checkpointId: string,
  date: string,
): RotationHistoryInput {
  return { agent_id: agentId, checkpoint_id: checkpointId, planning_date: date };
}

function runWithHistory(
  agents: AgentInput[],
  checkpoints: CheckpointInput[],
  rotationHistory: RotationHistoryInput[],
) {
  return runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: PLANNING,
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory,
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
}

describe("buildCriticalP1CooldownBlockedAgents", () => {
  it("blocks only agents with operational P1 on the previous date", () => {
    const blocked = buildCriticalP1CooldownBlockedAgents(
      [
        history("ahmed", "cp-91", PREV),
        history("bob", "cp-20", PREV),
        history("carl", "cp-p3", PREV),
      ],
      PREV,
      new Map([
        ["cp-91", 1],
        ["cp-20", 1],
        ["cp-p3", 3],
      ]),
    );
    expect(blocked.has("ahmed")).toBe(true);
    expect(blocked.has("bob")).toBe(true);
    expect(blocked.has("carl")).toBe(false);
  });
});

describe("critical P1 cooldown in planning engine", () => {
  const cp91 = cp("cp-91", "91", 1);
  const cp20 = cp("cp-20", "20", 1);
  const cpP2 = cp("cp-p2", "55", 2);
  const cpP3 = cp("cp-p3", "75", 3);

  it("1–2: Ahmed at P1 yesterday cannot work any P1 today", () => {
    const result = runWithHistory([ahmed(), otherMale("m2")], [cp91, cp20], [
      history("ahmed", "cp-91", PREV),
    ]);
    const ahmedAssigned = result.assignments.filter((a) => a.agent_id === "ahmed");
    expect(ahmedAssigned.every((a) => a.checkpoint_id !== "cp-91" && a.checkpoint_id !== "cp-20")).toBe(
      true,
    );
  });

  it("3–4: Ahmed at P1 yesterday can work P2 and P3 today", () => {
    const result = runWithHistory(
      [ahmed(), otherMale("m2")],
      [cp91, cpP2, cpP3],
      [history("ahmed", "cp-91", PREV)],
    );
  const ahmedCp = result.assignments.find((a) => a.agent_id === "ahmed");
    expect(ahmedCp?.checkpoint_id).toMatch(/cp-p[23]/);
  });

  it("5: P1 two days ago only — Ahmed eligible for P1 today", () => {
    const twoDaysAgo = format(subDays(PLANNING, 2), "yyyy-MM-dd");
    const result = runWithHistory([ahmed()], [cp91], [history("ahmed", "cp-91", twoDaysAgo)]);
    expect(result.assignments.some((a) => a.agent_id === "ahmed" && a.checkpoint_id === "cp-91")).toBe(
      true,
    );
  });

  it("6: P2 yesterday — Ahmed can work P1 today", () => {
    const result = runWithHistory([ahmed()], [cp91], [history("ahmed", "cp-p2", PREV)]);
    expect(result.assignments.some((a) => a.agent_id === "ahmed" && a.checkpoint_id === "cp-91")).toBe(
      true,
    );
  });

  it("7: no operational history yesterday — Ahmed can work P1 (653 not in history)", () => {
    const result = runWithHistory([ahmed()], [cp91], []);
    expect(result.assignments.some((a) => a.agent_id === "ahmed" && a.checkpoint_id === "cp-91")).toBe(
      true,
    );
  });

  it("8: rescue phase does not bypass cooldown", () => {
    const blockedOnly = runWithHistory([ahmed()], [cp91], [history("ahmed", "cp-91", PREV)]);
    expect(blockedOnly.assignments).toHaveLength(0);
    expect(
      blockedOnly.structuredWarnings.some((w) => w.code === "ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE"),
    ).toBe(false);
  });

  it("9: exclusion patch does not place P1-cooled-down agent on P1", () => {
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLANNING,
      agents: [ahmed(), otherMale("youssef")],
      exclusions: [{ agent_id: "ahmed", dog_id: null, exclusion_type: "annual_leave" }],
      checkpoints: [cp91, cpP2],
      rotationHistory: [history("youssef", "cp-91", PREV)],
      yesterdayCheckpointByAgent: new Map([["youssef", "cp-91"]]),
      fairnessCounts: new Map(),
      exclusionPatch: {
        openCheckpointPostIds: new Set(["p-cp-91"]),
        preservedAssignments: [],
        preservedPoint653: [],
        preservedOffDuty: [],
        point653ReplacementCount: 0,
      },
    });
    expect(result.assignments.some((a) => a.checkpoint_id === "cp-91")).toBe(false);
    expect(result.assignments.some((a) => a.agent_id === "youssef" && a.checkpoint_id === "cp-91")).toBe(
      false,
    );
  });

  it("10: all agents on P1 cooldown — P1 empty, P2 filled, planning completes", () => {
    const result = runWithHistory(
      [ahmed(), otherMale("m2")],
      [cp91, cp20, cpP2],
      [history("ahmed", "cp-91", PREV), history("m2", "cp-20", PREV)],
    );
    expect(result.assignments.some((a) => a.checkpoint_id === "cp-91")).toBe(false);
    expect(result.assignments.some((a) => a.checkpoint_id === "cp-p2")).toBe(true);
    expect(result.summary.understaffedCheckpoints).toBeGreaterThanOrEqual(1);
  });
});
