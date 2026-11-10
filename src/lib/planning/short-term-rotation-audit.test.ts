/**
 * FIX 04 — short-term rotation audit expectations (no engine changes).
 */
import { addDays, format } from "date-fns";
import { describe, expect, it } from "vitest";

import {
  buildAgentVisitedCheckpoints,
  buildCompatibleCheckpointsByAgent,
  canAssignBySmartRotation,
  qualifyTeams,
  runPlanningEngine,
  type AgentInput,
  type CheckpointInput,
} from "@/lib/planning/engine";

const SECTION = "sec-short-rot";

function male(id: string, n: string): AgentInput {
  return {
    id,
    first_name: "M",
    last_name: id,
    professional_number: n,
    gender: "male",
    active: true,
    section_id: SECTION,
    dog_id: `dog-${id}`,
    dogs: {
      id: `dog-${id}`,
      name: id,
      specialty: "explosives",
      status: "available",
      active: true,
    },
  };
}

function cp(id: string, priority: 1 | 2 | 3 | 4): CheckpointInput {
  return {
    id,
    name: id,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: "allowed",
    priority,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts: [
      {
        id: `post-${id}`,
        shift: "day",
        specialty_required: "explosives",
        required_agents: 1,
        active: true,
        allowed_gender: "all",
        dog_required: true,
      },
    ],
  };
}

describe("short-term Smart Rotation (audit)", () => {
  it("spreads across four equal-priority checkpoints before repeating (scenario A)", () => {
    const agent = male("ahmed", "114877");
    const checkpoints = [
      cp("cp-91", 2),
      cp("cp-20", 2),
      cp("cp-75", 2),
      cp("cp-78", 2),
    ];

    let rotationHistory: { agent_id: string; checkpoint_id: string; planning_date?: string }[] =
      [];
    const yesterdayCheckpointByAgent = new Map<string, string>();
    const sequence: string[] = [];

    for (let d = 0; d < 8; d += 1) {
      const planningDate = addDays(new Date(2026, 0, 5), d);
      const { eligible } = qualifyTeams([agent], [], "day");
      const compatible = buildCompatibleCheckpointsByAgent(
        eligible,
        checkpoints,
        "day",
        planningDate,
        false,
      );
      const visitedBefore = buildAgentVisitedCheckpoints(rotationHistory, compatible);

      const result = runPlanningEngine({
        sectionId: SECTION,
        shift: "day",
        planningDate,
        agents: [agent],
        exclusions: [],
        checkpoints,
        rotationHistory,
        yesterdayCheckpointByAgent: new Map(yesterdayCheckpointByAgent),
        fairnessCounts: new Map(),
      });

      const row = result.assignments.find((a) => a.agent_id === "ahmed");
      expect(row).toBeDefined();
      const cpId = row!.checkpoint_id;
      sequence.push(cpId);

      const visited = visitedBefore.get("ahmed") ?? new Set();
      expect(
        canAssignBySmartRotation("ahmed", cpId, compatible, visitedBefore),
      ).toBe(true);

      rotationHistory.push({
        agent_id: "ahmed",
        checkpoint_id: cpId,
        planning_date: format(planningDate, "yyyy-MM-dd"),
      });
      yesterdayCheckpointByAgent.set("ahmed", cpId);
    }

    expect(new Set(sequence.slice(0, 4)).size).toBe(4);
    expect(sequence[0]).not.toBe(sequence[1]);
    expect(sequence.slice(0, 4).join(",")).not.toMatch(/(cp-91.*cp-20.*cp-91|cp-20.*cp-91.*cp-20)/);
  });

  it("records rescue overrides without breaking the next-day strict gate", () => {
    const agent = male("ahmed", "114877");
    const checkpoints = [cp("cp-p1", 1), cp("cp-p2", 2)];
    const history = [
      { agent_id: "ahmed", checkpoint_id: "cp-p1", planning_date: "2026-04-01" },
    ];

    const planningDate = new Date(2026, 3, 2);
    const { eligible } = qualifyTeams([agent], [], "day");
    const compatible = buildCompatibleCheckpointsByAgent(
      eligible,
      checkpoints,
      "day",
      planningDate,
      false,
    );
    const visited = buildAgentVisitedCheckpoints(history, compatible);

    const result = runPlanningEngine({
      sectionId: SECTION,
      shift: "day",
      planningDate,
      agents: [agent],
      exclusions: [],
      checkpoints,
      rotationHistory: history,
      yesterdayCheckpointByAgent: new Map([["ahmed", "cp-p1"]]),
      fairnessCounts: new Map([["ahmed:cp-p1", 1]]),
    });

    const assignment = result.assignments.find((a) => a.agent_id === "ahmed");
    expect(assignment?.checkpoint_id).toBe("cp-p2");
    expect(canAssignBySmartRotation("ahmed", "cp-p2", compatible, visited)).toBe(true);
  });
});
