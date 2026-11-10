/**
 * FIX 03 — documents multi-day Smart Rotation fairness expectations (audit-only).
 * Does not assert perfect equality; catches pathological bias only.
 */
import { addDays, format } from "date-fns";
import { describe, expect, it } from "vitest";

import { normalizeCheckpointPriority } from "@/lib/checkpoints/operational-config";
import {
  buildCompatibleCheckpointsByAgent,
  runPlanningEngine,
  type AgentInput,
  type CheckpointInput,
} from "@/lib/planning/engine";

const SECTION = "sec-fairness-audit";

function male(
  id: string,
  matricule: string,
  specialty: "narcotics" | "explosives",
): AgentInput {
  return {
    id,
    first_name: "M",
    last_name: id,
    professional_number: matricule,
    gender: "male",
    active: true,
    section_id: SECTION,
    dog_id: `dog-${id}`,
    dogs: {
      id: `dog-${id}`,
      name: id,
      specialty,
      status: "available",
      active: true,
    },
  };
}

function checkpoint(
  id: string,
  priority: 1 | 2 | 3 | 4,
  specialty: "narcotics" | "explosives",
  restricted_agent_ids: string[] = [],
): CheckpointInput {
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
    restricted_agent_ids,
    posts: [
      {
        id: `post-${id}`,
        shift: "day",
        specialty_required: specialty,
        required_agents: 1,
        active: true,
        allowed_gender: "all",
        dog_required: true,
      },
    ],
  };
}

describe("Smart Rotation fairness audit (multi-day)", () => {
  it("terminates and avoids P1 cooldown violations over 30 days", () => {
    const agents = [male("n1", "100", "narcotics"), male("n2", "105", "narcotics")];
    const checkpoints = [
      checkpoint("cp-p1", 1, "narcotics"),
      checkpoint("cp-p2", 2, "narcotics"),
    ];

    let rotationHistory: { agent_id: string; checkpoint_id: string; planning_date?: string }[] =
      [];
    const yesterdayCheckpointByAgent = new Map<string, string>();
    let violations = 0;

    for (let d = 0; d < 30; d += 1) {
      const planningDate = addDays(new Date(2026, 0, 6), d);
      const result = runPlanningEngine({
        sectionId: SECTION,
        shift: "day",
        planningDate,
        agents,
        exclusions: [],
        checkpoints,
        rotationHistory,
        yesterdayCheckpointByAgent: new Map(yesterdayCheckpointByAgent),
        fairnessCounts: new Map(),
      });

      expect(result.summary).toBeDefined();

      for (const row of result.assignments) {
        const yesterdayCp = yesterdayCheckpointByAgent.get(row.agent_id);
        const todayPr = normalizeCheckpointPriority(
          checkpoints.find((c) => c.id === row.checkpoint_id)?.priority,
        );
        const yesterdayPr = yesterdayCp
          ? normalizeCheckpointPriority(
              checkpoints.find((c) => c.id === yesterdayCp)?.priority,
            )
          : null;
        if (todayPr === 1 && yesterdayPr === 1) violations += 1;

        rotationHistory.push({
          agent_id: row.agent_id,
          checkpoint_id: row.checkpoint_id,
          planning_date: format(planningDate, "yyyy-MM-dd"),
        });
      }

      yesterdayCheckpointByAgent.clear();
      for (const row of result.assignments) {
        yesterdayCheckpointByAgent.set(row.agent_id, row.checkpoint_id);
      }
    }

    expect(violations).toBe(0);
  });

  it("distributes work evenly among four comparable narcotics agents", () => {
    const agents = [
      male("a1", "001", "narcotics"),
      male("a2", "002", "narcotics"),
      male("a3", "003", "narcotics"),
      male("a4", "004", "narcotics"),
    ];
    const checkpoints = [
      checkpoint("cp-p2", 2, "narcotics"),
      checkpoint("cp-p1", 1, "narcotics"),
    ];

    const wins = new Map(agents.map((a) => [a.id, 0]));
    let rotationHistory: { agent_id: string; checkpoint_id: string; planning_date?: string }[] =
      [];
    const yesterdayCheckpointByAgent = new Map<string, string>();
    const fairnessCounts = new Map<string, number>();

    for (let d = 0; d < 30; d += 1) {
      const planningDate = addDays(new Date(2026, 2, 1), d);
      const result = runPlanningEngine({
        sectionId: SECTION,
        shift: "day",
        planningDate,
        agents,
        exclusions: [],
        checkpoints,
        rotationHistory,
        yesterdayCheckpointByAgent: new Map(yesterdayCheckpointByAgent),
        fairnessCounts: new Map(fairnessCounts),
      });

      for (const row of result.assignments) {
        wins.set(row.agent_id, (wins.get(row.agent_id) ?? 0) + 1);
        rotationHistory.push({
          agent_id: row.agent_id,
          checkpoint_id: row.checkpoint_id,
          planning_date: format(planningDate, "yyyy-MM-dd"),
        });
        const key = `${row.agent_id}:${row.checkpoint_id}`;
        fairnessCounts.set(key, (fairnessCounts.get(key) ?? 0) + 1);
      }

      yesterdayCheckpointByAgent.clear();
      for (const row of result.assignments) {
        yesterdayCheckpointByAgent.set(row.agent_id, row.checkpoint_id);
      }
    }

    const counts = [...wins.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });

  it("keeps P1 spread within tolerance for comparable explosives handlers", () => {
    const agents = [
      male("e1", "200", "explosives"),
      male("e2", "205", "explosives"),
    ];
    const checkpoints = [
      checkpoint("cp-p1e", 1, "explosives"),
      checkpoint("cp-p2e", 2, "explosives"),
      checkpoint("cp-p3e", 3, "explosives"),
    ];

    const p1 = new Map(agents.map((a) => [a.id, 0]));
    let rotationHistory: { agent_id: string; checkpoint_id: string; planning_date?: string }[] =
      [];
    const yesterdayCheckpointByAgent = new Map<string, string>();
    const fairnessCounts = new Map<string, number>();
    let lastEligible: ReturnType<typeof runPlanningEngine>["eligible"] = [];

    for (let d = 0; d < 30; d += 1) {
      const planningDate = addDays(new Date(2026, 0, 6), d);
      const result = runPlanningEngine({
        sectionId: SECTION,
        shift: "day",
        planningDate,
        agents,
        exclusions: [],
        checkpoints,
        rotationHistory,
        yesterdayCheckpointByAgent: new Map(yesterdayCheckpointByAgent),
        fairnessCounts: new Map(fairnessCounts),
      });
      lastEligible = result.eligible;

      for (const row of result.assignments) {
        const pr = normalizeCheckpointPriority(
          checkpoints.find((c) => c.id === row.checkpoint_id)?.priority,
        );
        if (pr === 1) p1.set(row.agent_id, (p1.get(row.agent_id) ?? 0) + 1);
        rotationHistory.push({
          agent_id: row.agent_id,
          checkpoint_id: row.checkpoint_id,
          planning_date: format(planningDate, "yyyy-MM-dd"),
        });
      }
      yesterdayCheckpointByAgent.clear();
      for (const row of result.assignments) {
        yesterdayCheckpointByAgent.set(row.agent_id, row.checkpoint_id);
      }
    }

    const compatible = buildCompatibleCheckpointsByAgent(
      lastEligible.filter((t) => t.gender === "male"),
      checkpoints,
      "day",
      addDays(new Date(2026, 0, 6), 29),
      false,
    );
    expect(compatible.get("e1")?.size).toBe(compatible.get("e2")?.size);

    const vals = [...p1.values()];
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(2);
  });
});
