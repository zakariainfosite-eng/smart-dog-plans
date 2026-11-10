import { describe, expect, it } from "vitest";

import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import type { CheckpointAssignment, PlanningEngineResult } from "@/lib/planning/engine";
import { findStoredPlanningExclusionConflicts } from "@/lib/planning/stored-planning-exclusion-conflicts";

const PLANNING_DATE = "2026-08-07";

function emptyEngineResult(
  checkpoints: CheckpointAssignment[],
): PlanningEngineResult {
  return {
    eligible: [],
    excluded: [],
    agentExclusions: [],
    checkpoints,
    unassigned: [],
    point653: [],
    offDuty: [],
    assignments: [],
    summary: {
      totalEmployees: 1,
      assignedEmployees: 1,
      assignedToCheckpoints: 1,
      point653Employees: 0,
      restEmployees: 0,
      unassignedEmployees: 0,
      fullyStaffedCheckpoints: 1,
      understaffedCheckpoints: 0,
      agentExclusionCount: 0,
      warnings: [],
    },
    structuredWarnings: [],
  };
}

describe("findStoredPlanningExclusionConflicts", () => {
  it("7 — flags an assigned agent when an exclusion is active on the planning date", () => {
    const exclusions: AgentExclusionRecord[] = [
      {
        agent_id: "ahmed-id",
        dog_id: null,
        exclusion_type: "annual_leave",
        start_date: PLANNING_DATE,
        end_date: "2026-08-09",
        active: true,
      },
    ];

    const engineResult = emptyEngineResult([
      {
        checkpoint_id: "cp-1",
        checkpoint_name: "Poste A",
        night_only: false,
        posts: [],
        slots: [
          {
            post_id: "post-1",
            specialty_required: "narcotics",
            team: {
              agent_id: "ahmed-id",
              agent_name: "Ahmed Benali",
              professional_number: "123",
              dog_id: "dog-1",
              dog_name: "Rex",
              specialty: "narcotics",
              gender: "male",
              agent_only: false,
            },
          },
        ],
        total_required: 1,
        total_staffed: 1,
        is_understaffed: false,
      },
    ]);

    const conflicts = findStoredPlanningExclusionConflicts(
      PLANNING_DATE,
      engineResult,
      exclusions,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.agentName).toBe("Ahmed Benali");
  });

  it("does not flag assignments when the exclusion starts after the planning date", () => {
    const exclusions: AgentExclusionRecord[] = [
      {
        agent_id: "ahmed-id",
        dog_id: null,
        exclusion_type: "annual_leave",
        start_date: "2026-08-08",
        end_date: "2026-08-09",
        active: true,
      },
    ];

    const engineResult = emptyEngineResult([
      {
        checkpoint_id: "cp-1",
        checkpoint_name: "Poste A",
        night_only: false,
        posts: [],
        slots: [
          {
            post_id: "post-1",
            specialty_required: "narcotics",
            team: {
              agent_id: "ahmed-id",
              agent_name: "Ahmed Benali",
              professional_number: "123",
              dog_id: null,
              dog_name: null,
              specialty: null,
              gender: "male",
              agent_only: true,
            },
          },
        ],
        total_required: 1,
        total_staffed: 1,
        is_understaffed: false,
      },
    ]);

    expect(
      findStoredPlanningExclusionConflicts(PLANNING_DATE, engineResult, exclusions),
    ).toHaveLength(0);
  });
});
