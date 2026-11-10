import { describe, expect, it } from "vitest";

import { exclusionListStatus } from "@/lib/exclusion-list-status";
import {
  isAgentExclusionActive,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import {
  exclusionPlanningDatesEligibleForSync,
} from "@/lib/planning/sync-exclusion-planning-replacements";
import {
  formatExclusionReplacementWarning,
} from "@/lib/planning/patch-stored-planning-for-exclusions";
import {
  findStoredPlanningSlotConflicts,
} from "@/lib/planning/stored-planning-exclusion-conflicts";
import {
  runPlanningEngine,
  type AgentInput,
  type CheckpointInput,
  type ExclusionInput,
  type PlanningEngineResult,
} from "@/lib/planning/engine";

const SECTION_ID = "sec-auto-replace";
const THURSDAY = new Date(2026, 7, 7);
const TUESDAY = "2026-08-05";
const THURSDAY_ISO = "2026-08-07";

function maleHandler(
  id: string,
  specialty: "explosives" | "narcotics",
): AgentInput {
  return {
    id,
    first_name: id,
    last_name: "Test",
    professional_number: id,
    gender: "male",
    active: true,
    section_id: SECTION_ID,
    dog_id: `dog-${id}`,
    dogs: {
      id: `dog-${id}`,
      name: `Dog-${id}`,
      specialty,
      status: "available",
      active: true,
    },
  };
}

function checkpoint(id: string, specialty: "explosives" | "narcotics"): CheckpointInput {
  return {
    id: `cp-${id}`,
    name: id,
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
        id: `post-${id}`,
        shift: "day",
        specialty_required: specialty,
        required_agents: 1,
        active: true,
        allowed_gender: "male",
        dog_required: true,
      },
    ],
  };
}

function buildStoredResult(
  ahmedOnPoint91: boolean,
  karimOnPoint20: boolean,
): PlanningEngineResult {
  const cp91 = checkpoint("Point 91", "explosives");
  const cp20 = checkpoint("Point 20", "explosives");
  const slots = [];
  const assignments = [];

  if (ahmedOnPoint91) {
    slots.push({
      post_id: "post-Point 91",
      specialty_required: "explosives" as const,
      team: {
        agent_id: "ahmed",
        agent_name: "ahmed Test",
        professional_number: "ahmed",
        dog_id: "dog-ahmed",
        dog_name: "Dog-ahmed",
        specialty: "explosives" as const,
        gender: "male" as const,
        agent_only: false,
      },
    });
    assignments.push({
      agent_id: "ahmed",
      dog_id: "dog-ahmed",
      checkpoint_id: "cp-Point 91",
      checkpoint_post_id: "post-Point 91",
    });
  }

  if (karimOnPoint20) {
    slots.push({
      post_id: "post-Point 20",
      specialty_required: "explosives" as const,
      team: {
        agent_id: "karim",
        agent_name: "karim Test",
        professional_number: "karim",
        dog_id: "dog-karim",
        dog_name: "Dog-karim",
        specialty: "explosives" as const,
        gender: "male" as const,
        agent_only: false,
      },
    });
    assignments.push({
      agent_id: "karim",
      dog_id: "dog-karim",
      checkpoint_id: "cp-Point 20",
      checkpoint_post_id: "post-Point 20",
    });
  }

  return {
    eligible: [],
    excluded: [],
    agentExclusions: [],
    checkpoints: [
      {
        checkpoint_id: "cp-Point 91",
        checkpoint_name: "Point 91",
        night_only: false,
        posts: [
          {
            post_id: "post-Point 91",
            specialty_required: "explosives",
            required: 1,
            staffed: ahmedOnPoint91 ? 1 : 0,
          },
        ],
        slots: slots.filter((s) => s.post_id === "post-Point 91"),
        total_required: 1,
        total_staffed: ahmedOnPoint91 ? 1 : 0,
        is_understaffed: !ahmedOnPoint91,
      },
      {
        checkpoint_id: "cp-Point 20",
        checkpoint_name: "Point 20",
        night_only: false,
        posts: [
          {
            post_id: "post-Point 20",
            specialty_required: "explosives",
            required: 1,
            staffed: karimOnPoint20 ? 1 : 0,
          },
        ],
        slots: slots.filter((s) => s.post_id === "post-Point 20"),
        total_required: 1,
        total_staffed: karimOnPoint20 ? 1 : 0,
        is_understaffed: !karimOnPoint20,
      },
    ],
    unassigned: [],
    point653: [],
    offDuty: [],
    assignments,
    structuredWarnings: [],
    summary: {
      totalEmployees: 3,
      assignedEmployees: assignments.length,
      assignedToCheckpoints: assignments.length,
      point653Employees: 0,
      restEmployees: 0,
      unassignedEmployees: 0,
      fullyStaffedCheckpoints: assignments.length,
      understaffedCheckpoints: 2 - assignments.length,
      agentExclusionCount: 0,
      warnings: [],
    },
  };
}

describe("automatic exclusion replacement (Planning Engine reuse)", () => {
  const leaveRow: AgentExclusionRecord = {
    agent_id: "ahmed",
    dog_id: null,
    exclusion_type: "annual_leave",
    start_date: THURSDAY_ISO,
    end_date: "2026-08-09",
    active: true,
  };

  const exclusions: ExclusionInput[] = [
    {
      agent_id: "ahmed",
      dog_id: null,
      exclusion_type: "annual_leave",
    },
  ];

  it("1–2 — future exclusion visible as À venir; Ahmed stays assigned before Thursday", () => {
    expect(exclusionListStatus(leaveRow, TUESDAY)).toBe("upcoming");
    expect(isAgentExclusionActive(leaveRow, TUESDAY)).toBe(false);

    const stored = buildStoredResult(true, true);
    const conflictsTuesday = findStoredPlanningSlotConflicts(TUESDAY, stored, [leaveRow]);
    expect(conflictsTuesday).toHaveLength(0);
  });

  it("3–6 — on Thursday Ahmed at Point 91 is replaced; Point 20 unchanged (Smart Rotation)", () => {
    const stored = buildStoredResult(true, true);
    const conflicts = findStoredPlanningSlotConflicts(THURSDAY_ISO, stored, [leaveRow]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.checkpointName).toBe("Point 91");

    const ahmed = maleHandler("ahmed", "explosives");
    const karim = maleHandler("karim", "explosives");
    const youssef = maleHandler("youssef", "explosives");

    const result = runPlanningEngine({
      sectionId: SECTION_ID,
      agents: [ahmed, karim, youssef],
      exclusions,
      checkpoints: [checkpoint("Point 91", "explosives"), checkpoint("Point 20", "explosives")],
      shift: "day",
      planningDate: THURSDAY,
      rotationHistory: [
        {
          agent_id: "youssef",
          checkpoint_id: "cp-Point 91",
          planning_date: "2026-08-06",
        },
      ],
      yesterdayCheckpointByAgent: new Map([["youssef", "cp-Point 91"]]),
      fairnessCounts: new Map(),
      exclusionPatch: {
        openCheckpointPostIds: new Set(["post-Point 91"]),
        preservedAssignments: stored.assignments.filter(
          (row) => row.checkpoint_post_id === "post-Point 20",
        ),
        preservedPoint653: [],
        preservedOffDuty: [],
        point653ReplacementCount: 0,
      },
    });

    const point91 = result.assignments.find((row) => row.checkpoint_post_id === "post-Point 91");
    const point20 = result.assignments.find((row) => row.checkpoint_post_id === "post-Point 20");

    expect(point91?.agent_id).not.toBe("ahmed");
    expect(point91?.agent_id).toBe("youssef");
    expect(point20?.agent_id).toBe("karim");
  });

  it("7–8 — Friday and Saturday are separate sync dates; no replacement message uses exact French shape", () => {
    expect(exclusionPlanningDatesEligibleForSync("2026-08-07", "2026-08-09", "2026-08-05")).toEqual(
      [],
    );
    expect(exclusionPlanningDatesEligibleForSync("2026-08-07", "2026-08-09", "2026-08-08")).toEqual([
      "2026-08-07",
      "2026-08-08",
    ]);
    expect(formatExclusionReplacementWarning("Point 91", THURSDAY_ISO)).toBe(
      "Aucun remplaçant disponible pour Point 91 — 2026-08-07.",
    );
  });

  it("8 — when no replacement exists, the post stays unassigned", () => {
    const stored = buildStoredResult(true, false);
    const ahmed = maleHandler("ahmed", "explosives");

    const result = runPlanningEngine({
      sectionId: SECTION_ID,
      agents: [ahmed],
      exclusions,
      checkpoints: [checkpoint("Point 91", "explosives")],
      shift: "day",
      planningDate: THURSDAY,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      exclusionPatch: {
        openCheckpointPostIds: new Set(["post-Point 91"]),
        preservedAssignments: [],
        preservedPoint653: [],
        preservedOffDuty: [],
        point653ReplacementCount: 0,
      },
    });

    expect(
      result.assignments.find((row) => row.checkpoint_post_id === "post-Point 91"),
    ).toBeUndefined();
    expect(result.checkpoints[0]?.is_understaffed).toBe(true);
  });
});
