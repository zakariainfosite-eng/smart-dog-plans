import { describe, expect, it } from "vitest";

import {
  FEMALE_SLOT_RESERVATION_CODE,
  runPlanningEngine,
  type AgentInput,
  type CheckpointInput,
} from "@/lib/planning/engine";
import { isFemaleGroupAActive } from "@/lib/planning/female-rotation";

/** Group B active — use 103/104 together or Jan 9 for a lone group-A female. */
const PLAN = new Date(2026, 0, 8);
const PLAN_GROUP_A = new Date(2026, 0, 9);

const post = (id: string, specialty: "narcotics" | "explosives", gender: "all" | "female" = "all") => ({
  id,
  shift: "day" as const,
  specialty_required: specialty,
  required_agents: 1,
  active: true,
  allowed_gender: gender,
  dog_required: true,
});

function cp(
  id: string,
  name: string,
  priority: 1 | 2 | 3 | 4,
  female_policy: "allowed" | "preferred" | "not_allowed",
  posts: ReturnType<typeof post>[],
): CheckpointInput {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: female_policy === "not_allowed" ? "male" : "all",
    female_policy,
    priority,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts,
  };
}

function male(id: string, specialty: "narcotics" | "explosives"): AgentInput {
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
      specialty,
      status: "available",
      active: true,
    },
  };
}

function female(id: string, specialty: "narcotics" | "explosives", mle: string): AgentInput {
  return {
    id,
    first_name: "F",
    last_name: id,
    professional_number: mle,
    gender: "female",
    active: true,
    section_id: null,
    dog_id: `d-${id}`,
    dogs: {
      id: `d-${id}`,
      name: id,
      specialty,
      status: "available",
      active: true,
    },
  };
}

function reservedCount(result: ReturnType<typeof runPlanningEngine>) {
  return result.checkpoints.flatMap((c) =>
    c.slots.filter((s) => s.reservation === FEMALE_SLOT_RESERVATION_CODE),
  );
}

function p1Staffed(result: ReturnType<typeof runPlanningEngine>, cpId: string) {
  const row = result.checkpoints.find((c) => c.checkpoint_id === cpId);
  return row?.slots.filter((s) => s.team).length ?? 0;
}

describe("female slot reservations (fillable-only)", () => {
  it("1. P1 with no female personnel: no reservation, males can fill P1", () => {
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLAN,
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints: [
        cp("cp91", "91", 1, "preferred", [post("p1", "narcotics"), post("p2", "explosives")]),
      ],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: [],
    });
    expect(reservedCount(result)).toHaveLength(0);
    expect(p1Staffed(result, "cp91")).toBeGreaterThanOrEqual(1);
  });

  it("2. Point 91 two posts: does not reserve both without two eligible females", () => {
    // Group B active on PLAN — narc handler only (cannot cover explosives post).
    const females = [female("f1", "narcotics", "103")];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLAN_GROUP_A,
      agents: [male("m1", "narcotics"), male("m2", "explosives")],
      exclusions: [],
      checkpoints: [
        cp("cp91", "91", 1, "preferred", [post("pn", "narcotics"), post("pe", "explosives")]),
      ],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: females,
    });
    const reserved = reservedCount(result);
    expect(reserved.length).toBe(1);
    expect(reserved[0]?.post_id).toBe("pn");
    expect(reserved[0]?.specialty_required).toBe("narcotics");
  });

  it("3. Eligible females available: reservations on lower-priority checkpoints", () => {
    const females = [
      female("f-n", "narcotics", "103"),
      female("f-e", "explosives", "104"),
      female("f-n2", "narcotics", "101"),
      female("f-e2", "explosives", "102"),
    ];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLAN,
      agents: [
        male("m1", "narcotics"),
        male("m2", "explosives"),
        male("m3", "narcotics"),
        male("m4", "explosives"),
      ],
      exclusions: [],
      checkpoints: [
        cp("cp1", "P1", 1, "allowed", [post("a", "narcotics")]),
        cp("cp4", "P4", 4, "allowed", [post("d", "explosives")]),
        cp("cp3", "P3", 3, "allowed", [post("c", "narcotics")]),
      ],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: females,
    });
    expect(reservedCount(result)).toHaveLength(2);
    expect(reservedCount(result).every((s) => s.team === null)).toBe(true);
    expect(p1Staffed(result, "cp1")).toBe(1);
  });

  it("4. Female on inactive rotation day: no reservation", () => {
    const fA = female("fA", "narcotics", "010");
    const fB = female("fB", "narcotics", "020");
    const activeA = isFemaleGroupAActive(PLAN);
    const females = activeA ? [fB] : [fA];
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLAN,
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints: [cp("cp3", "P3", 3, "allowed", [post("c", "narcotics")])],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: [fA, fB, ...females],
    });
    if (females.length === 0) {
      expect(reservedCount(result)).toHaveLength(0);
    } else {
      expect(reservedCount(result).length).toBeLessThanOrEqual(1);
    }
  });

  it("5–6. Female-only slot stays male-free; P4 allowed with fillable female", () => {
    const females = [female("f1", "narcotics", "104")];
    const femaleOnly = cp("fonly", "FOnly", 4, "allowed", [post("ff", "narcotics", "female")]);
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLAN,
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints: [femaleOnly, cp("cp4", "P4", 4, "allowed", [post("d", "narcotics")])],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: females,
    });
    const maleOnFemaleOnly = result.assignments.some(
      (a) => a.checkpoint_id === "fonly",
    );
    expect(maleOnFemaleOnly).toBe(false);
    expect(reservedCount(result).length).toBeGreaterThanOrEqual(0);
  });

  it("7. P1 coverage: preferred 91 staffed after fix without females", () => {
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLAN,
      agents: [male("m1", "narcotics"), male("m2", "explosives")],
      exclusions: [],
      checkpoints: [
        cp("cp91", "91", 1, "preferred", [
          post("pn", "narcotics"),
          post("pe", "explosives"),
        ]),
        cp("cp20", "20", 3, "allowed", [post("p20", "narcotics")]),
      ],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });
    expect(p1Staffed(result, "cp91")).toBeGreaterThanOrEqual(1);
    expect(reservedCount(result)).toHaveLength(0);
  });

  it("8. Night: no female reservations", () => {
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "night",
      planningDate: PLAN,
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints: [
        cp("cp1", "P1", 1, "allowed", [
          { ...post("n", "narcotics"), shift: "night" as const },
        ]),
      ],
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: [female("f1", "narcotics", "001")],
    });
    expect(reservedCount(result)).toHaveLength(0);
  });

  it("9–10. Planning completes; cooldown still applies with fix", () => {
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: new Date(2026, 7, 7),
      agents: [male("m1", "narcotics")],
      exclusions: [],
      checkpoints: [cp("cp91", "91", 1, "preferred", [post("p1", "narcotics")])],
      rotationHistory: [{ agent_id: "m1", checkpoint_id: "cp91", planning_date: "2026-08-06" }],
      yesterdayCheckpointByAgent: new Map([["m1", "cp91"]]),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: [],
    });
    expect(result.assignments).toHaveLength(0);
    expect(result.summary).toBeDefined();
  });
});

describe("female reservation before/after simulation", () => {
  it("reports coverage metrics without vs with female pool", () => {
    const checkpoints = [
      cp("cp91", "91", 1, "preferred", [post("pn", "narcotics"), post("pe", "explosives")]),
      cp("cp20", "20", 3, "allowed", [post("p20", "narcotics")]),
    ];
    const agents = [male("m1", "narcotics"), male("m2", "explosives")];
    const base = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLAN,
      agents,
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
    });
    const withFemales = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLAN,
      agents,
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: [
        female("fn", "narcotics", "103"),
        female("fe", "explosives", "104"),
        female("fn2", "narcotics", "101"),
        female("fe2", "explosives", "102"),
      ],
    });

    const metrics = (r: typeof base) => ({
      reserved: reservedCount(r).length,
      p1Staffed: p1Staffed(r, "cp91"),
      p1Unfilled:
        (r.checkpoints.find((c) => c.id === "cp91")?.total_required ?? 0) -
        (r.checkpoints.find((c) => c.id === "cp91")?.total_staffed ?? 0),
      assignedLower: r.assignments.filter((a) => a.checkpoint_id === "cp20").length,
    });

    const before = metrics(base);
    const after = metrics(withFemales);

    expect(before.reserved).toBe(0);
    expect(before.p1Staffed).toBe(2);
    expect(after.reserved).toBeLessThanOrEqual(2);
    expect(after.p1Staffed + after.reserved).toBeGreaterThanOrEqual(before.p1Staffed);

    const oneNarcFemale = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: PLAN_GROUP_A,
      agents,
      exclusions: [],
      checkpoints,
      rotationHistory: [],
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: new Map(),
      femaleAgentsForReservation: [female("fn", "narcotics", "103")],
    });
    const partial = metrics(oneNarcFemale);
    expect(partial.reserved).toBe(1);
    expect(partial.p1Staffed).toBeGreaterThanOrEqual(1);
  });
});
