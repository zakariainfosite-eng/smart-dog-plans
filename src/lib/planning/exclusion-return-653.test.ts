import { describe, expect, it } from "vitest";
import {
  qualifyTeams,
  runPlanningEngine,
  type AgentInput,
  type CheckpointInput,
  type ExclusionInput,
} from "./engine";

const PLANNING_DATE = new Date(2026, 7, 22);
const SECTION_ID = "sec-return";

function maleHandler(
  id: string,
  specialty: "explosives" | "narcotics",
  dogStatus = "available",
): AgentInput {
  return {
    id,
    first_name: "Male",
    last_name: id,
    professional_number: id,
    gender: "male",
    active: true,
    section_id: SECTION_ID,
    dog_id: `dog-${id}`,
    dogs: {
      id: `dog-${id}`,
      name: `Dog-${id}`,
      specialty,
      status: dogStatus,
      active: true,
    },
  };
}

/** Male-only so the day female reservation does not consume the only test slot. */
function openCheckpoint(
  id: string,
  specialty: "explosives" | "narcotics",
): CheckpointInput {
  return {
    id,
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

function plan(params: {
  agents: AgentInput[];
  exclusions?: ExclusionInput[];
  checkpoints?: CheckpointInput[];
  rotationHistory?: { agent_id: string; checkpoint_id: string; planning_date: string }[];
}) {
  return runPlanningEngine({
    sectionId: SECTION_ID,
    agents: params.agents,
    exclusions: params.exclusions ?? [],
    checkpoints: params.checkpoints ?? [openCheckpoint("cp-20", "explosives")],
    shift: "day",
    planningDate: PLANNING_DATE,
    rotationHistory: params.rotationHistory ?? [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
}

describe("Smart Rotation after an exclusion ends", () => {
  it("does not send an agent returning from maladie to Point 653 when a slot is open", () => {
    const returned = maleHandler("returned-maladie", "explosives");
    const other = maleHandler("other-maladie", "explosives");

    const { eligible, excluded } = qualifyTeams([returned, other], [], "day");
    expect(eligible.map((team) => team.agent_id).sort()).toEqual([
      "other-maladie",
      "returned-maladie",
    ]);
    expect(excluded.find((row) => row.agent_id === "returned-maladie")).toBeUndefined();

    const result = plan({
      agents: [returned, other],
      rotationHistory: [
        { agent_id: "returned-maladie", checkpoint_id: "cp-20", planning_date: "2026-07-01" },
        { agent_id: "other-maladie", checkpoint_id: "cp-20", planning_date: "2026-08-20" },
      ],
    });

    expect(result.assignments.some((row) => row.agent_id === "returned-maladie")).toBe(true);
    expect(result.point653.find((row) => row.agent_id === "returned-maladie")).toBeUndefined();
    expect(result.excluded.find((row) => row.agent_id === "returned-maladie")).toBeUndefined();
  });

  it("keeps an active maladie in Excluded Personnel, not Point 653", () => {
    const sick = maleHandler("active-maladie", "explosives");
    const other = maleHandler("cover-maladie", "explosives");

    const result = plan({
      agents: [sick, other],
      exclusions: [{ agent_id: "active-maladie", exclusion_type: "sickness" }],
    });

    expect(result.assignments.some((row) => row.agent_id === "active-maladie")).toBe(false);
    expect(result.point653.find((row) => row.agent_id === "active-maladie")).toBeUndefined();
    expect(result.excluded.some((row) => row.agent_id === "active-maladie")).toBe(true);
    expect(result.assignments.some((row) => row.agent_id === "cover-maladie")).toBe(true);
  });

  it("does not send a dog returning from exclusion to Point 653 because of leftover dogs.status", () => {
    const returnedSick = maleHandler("returned-dog-sick", "explosives", "sick");
    const returnedHeat = maleHandler("returned-dog-heat", "explosives", "heat");
    const other = maleHandler("other-dog", "explosives");

    const { eligible } = qualifyTeams([returnedSick, returnedHeat, other], [], "day");
    expect(eligible.map((team) => team.agent_id).sort()).toEqual([
      "other-dog",
      "returned-dog-heat",
      "returned-dog-sick",
    ]);

    const sickResult = plan({
      agents: [returnedSick, other],
      rotationHistory: [
        { agent_id: "returned-dog-sick", checkpoint_id: "cp-20", planning_date: "2026-07-01" },
        { agent_id: "other-dog", checkpoint_id: "cp-20", planning_date: "2026-08-20" },
      ],
    });
    expect(sickResult.assignments.some((row) => row.agent_id === "returned-dog-sick")).toBe(true);
    expect(sickResult.point653.find((row) => row.agent_id === "returned-dog-sick")).toBeUndefined();

    const heatResult = plan({
      agents: [returnedHeat, other],
      rotationHistory: [
        { agent_id: "returned-dog-heat", checkpoint_id: "cp-20", planning_date: "2026-07-01" },
        { agent_id: "other-dog", checkpoint_id: "cp-20", planning_date: "2026-08-20" },
      ],
    });
    expect(heatResult.assignments.some((row) => row.agent_id === "returned-dog-heat")).toBe(true);
    expect(heatResult.point653.find((row) => row.agent_id === "returned-dog-heat")).toBeUndefined();
  });

  it("still routes an active dog sick or heat exclusion to Point 653", () => {
    const sickDog = maleHandler("active-dog-sick", "explosives");
    const heatDog = maleHandler("active-dog-heat", "explosives");
    const cover = maleHandler("cover-dog", "explosives");

    const sickResult = plan({
      agents: [sickDog, cover],
      exclusions: [
        { agent_id: "active-dog-sick", dog_id: "dog-active-dog-sick", exclusion_type: "dog_sick" },
      ],
    });
    expect(sickResult.assignments.some((row) => row.agent_id === "active-dog-sick")).toBe(false);
    expect(sickResult.point653.find((row) => row.agent_id === "active-dog-sick")?.reason).toBe(
      "dog_sick",
    );
    expect(sickResult.assignments.some((row) => row.agent_id === "cover-dog")).toBe(true);

    const heatResult = plan({
      agents: [heatDog, cover],
      exclusions: [
        {
          agent_id: "active-dog-heat",
          dog_id: "dog-active-dog-heat",
          exclusion_type: "female_dog_heat",
        },
      ],
    });
    expect(heatResult.assignments.some((row) => row.agent_id === "active-dog-heat")).toBe(false);
    expect(heatResult.point653.find((row) => row.agent_id === "active-dog-heat")?.reason).toBe(
      "dog_in_heat",
    );
  });

  it("still routes a cynotechnicien without a dog to Point 653", () => {
    const noDog: AgentInput = {
      ...maleHandler("no-dog", "explosives"),
      dog_id: null,
      dogs: null,
    };

    const result = plan({ agents: [noDog] });
    expect(result.assignments).toHaveLength(0);
    expect(result.point653.find((row) => row.agent_id === "no-dog")?.reason).toBe(
      "no_assigned_dog",
    );
  });

  it("uses previous assignment history after a return instead of forcing Point 653", () => {
    const returned = maleHandler("returned-history", "explosives");
    const other = maleHandler("other-history", "explosives");
    const checkpoints = [
      openCheckpoint("cp-20", "explosives"),
      openCheckpoint("cp-91", "explosives"),
    ];

    const result = plan({
      agents: [returned, other],
      checkpoints,
      rotationHistory: [
        { agent_id: "returned-history", checkpoint_id: "cp-20", planning_date: "2026-08-10" },
      ],
    });

    const returnedAssignment = result.assignments.find(
      (row) => row.agent_id === "returned-history",
    );
    expect(returnedAssignment).toBeTruthy();
    expect(returnedAssignment?.checkpoint_id).toBe("cp-91");
    expect(result.point653.find((row) => row.agent_id === "returned-history")).toBeUndefined();
    expect(result.assignments.some((row) => row.agent_id === "other-history")).toBe(true);
  });
});
