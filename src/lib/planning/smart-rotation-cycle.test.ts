import { describe, expect, it } from "vitest";
import {
  buildAgentVisitedCheckpoints,
  buildCompatibleCheckpointsByAgent,
  canAssignBySmartRotation,
  FEMALE_SLOT_RESERVATION_CODE,
  qualifyTeams,
  runPlanningEngine,
  type AgentInput,
  type CheckpointInput,
  type EligibleTeam,
} from "./engine";

const PLANNING_DATE = new Date(2026, 7, 22);

function explosivesMale(
  id: string,
  sectionId: string,
  overrides: Partial<AgentInput> = {},
): AgentInput {
  return {
    id,
    first_name: id === "filali" ? "ABDELALI" : "Male",
    last_name: id === "filali" ? "FILALI" : id,
    professional_number: id === "filali" ? "114877" : id,
    gender: "male",
    active: true,
    section_id: sectionId,
    dog_id: `dog-${id}`,
    dogs: {
      id: `dog-${id}`,
      name: id === "filali" ? "FRIDY" : `Dog-${id}`,
      specialty: "explosives",
      status: "available",
      active: true,
    },
    ...overrides,
  };
}

function explosivesCheckpoint(
  id: string,
  name: string,
  options: { femalePolicy?: CheckpointInput["female_policy"]; priority?: number } = {},
): CheckpointInput {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: options.femalePolicy ?? "allowed",
    priority: options.priority ?? 2,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts: [
      {
        id: `post-${id}-exp`,
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

const CYCLE_CHECKPOINTS: CheckpointInput[] = [
  explosivesCheckpoint("cp-20", "20"),
  explosivesCheckpoint("cp-91", "91"),
  explosivesCheckpoint("cp-77bis", "77 BIS"),
  explosivesCheckpoint("cp-77", "77"),
  explosivesCheckpoint("cp-78", "78", { femalePolicy: "preferred", priority: 9 }),
];

describe("Smart Rotation cycle excludes female-reserved posts for males", () => {
  it("does not require a male to visit a day female-reserved checkpoint", () => {
    const filali = explosivesMale("filali", "sec-1");
    const { eligible } = qualifyTeams([filali], [], "day");
    const reservedExplosivesPost = "post-cp-78-exp";

    const withReserved = buildCompatibleCheckpointsByAgent(
      eligible,
      CYCLE_CHECKPOINTS,
      "day",
      PLANNING_DATE,
      false,
    );
    expect(withReserved.get("filali")?.has("cp-78")).toBe(true);

    const withoutReserved = buildCompatibleCheckpointsByAgent(
      eligible,
      CYCLE_CHECKPOINTS,
      "day",
      PLANNING_DATE,
      false,
      { maleExcludedPostIds: new Set([reservedExplosivesPost]) },
    );
    const compatible = withoutReserved.get("filali") ?? new Set<string>();
    expect([...compatible].sort()).toEqual(["cp-20", "cp-77", "cp-77bis", "cp-91"]);
    expect(compatible.has("cp-78")).toBe(false);

    const visited = buildAgentVisitedCheckpoints(
      [
        { agent_id: "filali", checkpoint_id: "cp-20", planning_date: "2026-07-23" },
        { agent_id: "filali", checkpoint_id: "cp-91", planning_date: "2026-07-29" },
        { agent_id: "filali", checkpoint_id: "cp-77bis", planning_date: "2026-08-03" },
        { agent_id: "filali", checkpoint_id: "cp-77", planning_date: "2026-08-09" },
      ],
      withoutReserved,
    );
    expect([...(visited.get("filali") ?? [])]).toEqual([]);

    for (const checkpointId of ["cp-20", "cp-91", "cp-77bis", "cp-77"]) {
      expect(
        canAssignBySmartRotation("filali", checkpointId, withoutReserved, visited),
      ).toBe(true);
    }
    expect(canAssignBySmartRotation("filali", "cp-78", withoutReserved, visited)).toBe(false);
  });

  it("keeps the female day reservation and does not send FILALI to 653 for checkpoint 78", () => {
    const sectionId = "sec-1";
    const filali = explosivesMale("filali", sectionId);
    const others = ["azouzi", "ben", "rougi"].map((id) => explosivesMale(id, sectionId));

    const result = runPlanningEngine({
      sectionId,
      agents: [filali, ...others],
      exclusions: [],
      checkpoints: CYCLE_CHECKPOINTS,
      shift: "day",
      planningDate: PLANNING_DATE,
      rotationHistory: [
        { agent_id: "filali", checkpoint_id: "cp-20", planning_date: "2026-07-23" },
        { agent_id: "filali", checkpoint_id: "cp-91", planning_date: "2026-07-29" },
        { agent_id: "filali", checkpoint_id: "cp-77bis", planning_date: "2026-08-03" },
        { agent_id: "filali", checkpoint_id: "cp-77", planning_date: "2026-08-09" },
      ],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });

    const reserved78 = result.structuredWarnings.find(
      (warning) =>
        warning.code === FEMALE_SLOT_RESERVATION_CODE &&
        warning.checkpoint_id === "cp-78" &&
        warning.specialty_required === "explosives",
    );
    expect(reserved78).toBeTruthy();
    expect(
      result.checkpoints
        .find((checkpoint) => checkpoint.checkpoint_id === "cp-78")
        ?.slots.some((slot) => slot.reservation === FEMALE_SLOT_RESERVATION_CODE),
    ).toBe(true);

    const filali653 = result.point653.find((entry) => entry.agent_id === "filali");
    expect(filali653).toBeUndefined();
    expect(result.assignments.some((row) => row.agent_id === "filali")).toBe(true);
    expect(result.assignments.some((row) => row.checkpoint_id === "cp-78")).toBe(false);
  });

  it("does not remove a female-reserved checkpoint from a female handler cycle", () => {
    const female: EligibleTeam = {
      agent_id: "f1",
      agent_name: "Female One",
      professional_number: "F1",
      dog_id: "dog-f1",
      dog_name: "Nala",
      specialty: "explosives",
      gender: "female",
      agent_only: false,
    };
    const compatible = buildCompatibleCheckpointsByAgent(
      [female],
      CYCLE_CHECKPOINTS,
      "day",
      PLANNING_DATE,
      false,
      { maleExcludedPostIds: new Set(["post-cp-78-exp"]) },
    );
    expect(compatible.get("f1")?.has("cp-78")).toBe(true);
  });
});
