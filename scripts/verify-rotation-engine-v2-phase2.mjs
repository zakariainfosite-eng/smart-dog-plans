/**
 * Rotation Engine V2 Phase 2 — HQ Reserve under Strict Rotation + structured warnings.
 * Run: npx --yes tsx scripts/verify-rotation-engine-v2-phase2.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  runPlanningEngine,
  canAssignBySmartRotation,
  buildCompatibleCheckpointsByAgent,
  buildAgentVisitedCheckpoints,
  ROTATION_OVERRIDE_CODE,
  FEMALE_SLOT_RESERVATION_CODE,
} from "../src/lib/planning/engine.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const engineSrc = readFileSync(join(__dirname, "../src/lib/planning/engine.ts"), "utf8");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

const dayPost = (id, specialty = "narcotics") => ({
  id,
  shift: "day",
  specialty_required: specialty,
  required_agents: 1,
  active: true,
  allowed_gender: "all",
  dog_required: true,
});

function checkpoint(id, name, priority = 3, specialty = "narcotics") {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "male",
    female_policy: "not_allowed",
    priority,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts: [dayPost(`p-${id}`, specialty)],
  };
}

function male(id, section_id = "sec1", specialty = "narcotics") {
  return {
    id,
    first_name: "M",
    last_name: id,
    professional_number: id.toUpperCase().padStart(4, "0"),
    gender: "male",
    active: true,
    section_id,
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

console.log("=== Static: no randomness; rescue override is explicit ===");
assert(!/\bMath\.random\s*\(/.test(engineSrc), "no Math.random()");
assert(!/\bfunction shuffle\b/.test(engineSrc), "no shuffle()");
assert(
  /ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE/.test(engineSrc),
  "engine defines ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE",
);
assert(
  /requireSmartRotation:\s*false/.test(engineSrc),
  "last-resort rescue may set requireSmartRotation:false",
);

console.log("\n=== Phase 2: HQ floater fills when section blocked ===");
{
  const agents = [
    male("sec-a", "sec1"),
    male("hq1", null), // dedicated HQ Reserve floater
  ];
  const checkpoints = [checkpoint("cp-a", "A", 1), checkpoint("cp-b", "B", 2)];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 10),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [
      { agent_id: "sec-a", checkpoint_id: "cp-a", planning_date: "2026-03-09" },
      { agent_id: "sec-a", checkpoint_id: "cp-b", planning_date: "2026-03-08" },
    ],
    yesterdayCheckpointByAgent: new Map([["sec-a", "cp-a"]]),
    fairnessCounts: new Map([
      ["sec-a:cp-a", 1],
      ["sec-a:cp-b", 1],
    ]),
  });

  // After full cycle, sec-a can take P1. HQ may fill the other.
  assert(result.assignments.length === 2, "both CPs staffed (section + HQ)");
  assert(
    result.assignments.some((a) => a.agent_id === "hq1"),
    "HQ floater used in Phase 2",
  );
  assert(result.structuredWarnings.length === 0, "no structured warnings when full");
}

console.log("\n=== Phase 2: Smart Rotation blocks → leave empty + warning ===");
{
  const agents = [male("solo")];
  const checkpoints = [checkpoint("cp-a", "A", 1), checkpoint("cp-b", "B", 2)];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 11),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [
      { agent_id: "solo", checkpoint_id: "cp-a", planning_date: "2026-03-10" },
    ],
    yesterdayCheckpointByAgent: new Map([["solo", "cp-a"]]),
    fairnessCounts: new Map([["solo:cp-a", 1]]),
  });

  assert(
    result.assignments.some((a) => a.checkpoint_id === "cp-b"),
    "solo takes unvisited cp-b",
  );
  assert(
    !result.assignments.some((a) => a.checkpoint_id === "cp-a"),
    "cp-a left empty (early repeat forbidden)",
  );
  assert(
    result.structuredWarnings.some(
      (w) => w.checkpoint_id === "cp-a" && w.code === "SMART_ROTATION_BLOCKED",
    ),
    "SMART_ROTATION_BLOCKED for empty visited CP",
  );
  assert(
    !result.summary.warnings.some((w) => w.startsWith("INVALID: Checkpoint")),
    "no false INVALID reserve conflict when only rotation-blocked",
  );
}

console.log("\n=== Phase 2.2: override Smart Rotation before Point 653 ===");
{
  // Both agents already visited cp-a → Strict Rotation cannot fill cp-a.
  // Rescue must override and staff cp-a rather than park anyone at 653.
  const agents = [male("m1"), male("m2")];
  const checkpoints = [checkpoint("cp-a", "A", 1), checkpoint("cp-b", "B", 2)];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 20),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [
      { agent_id: "m1", checkpoint_id: "cp-a", planning_date: "2026-03-18" },
      { agent_id: "m2", checkpoint_id: "cp-a", planning_date: "2026-03-19" },
    ],
    yesterdayCheckpointByAgent: new Map([
      ["m1", "cp-a"],
      ["m2", "cp-a"],
    ]),
    fairnessCounts: new Map([
      ["m1:cp-a", 1],
      ["m2:cp-a", 1],
    ]),
  });

  assert(result.assignments.length === 2, "both CPs staffed after rescue");
  assert(
    result.checkpoints.every((c) => c.total_staffed === 1),
    "no empty operational CP after rescue",
  );
  assert(
    result.point653.filter((e) => e.reason === "no_operational_assignment").length === 0,
    "no operational agent parked at 653 after rescue",
  );
  assert(
    result.structuredWarnings.some((w) => w.code === ROTATION_OVERRIDE_CODE),
    "ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE emitted",
  );
  assert(
    result.structuredWarnings.some(
      (w) => w.code === ROTATION_OVERRIDE_CODE && w.checkpoint_id === "cp-a",
    ),
    "override targets the SR-blocked checkpoint",
  );
}

console.log("\n=== Rescue never touches female reserved day slots ===");
{
  const agents = [
    male("m1", "sec1", "narcotics"),
    male("m2", "sec1", "explosives"),
  ];
  const checkpoints = [
    {
      id: "cp-n",
      name: "N",
      night_only: false,
      active: true,
      allowed_gender: "all",
      female_policy: "allowed",
      priority: 4,
      operating_days: [1, 2, 3, 4, 5, 6, 7],
      day_shift_enabled: true,
      night_shift_enabled: true,
      posts: [dayPost("p-n", "narcotics")],
    },
    {
      id: "cp-e",
      name: "E",
      night_only: false,
      active: true,
      allowed_gender: "all",
      female_policy: "allowed",
      priority: 4,
      operating_days: [1, 2, 3, 4, 5, 6, 7],
      day_shift_enabled: true,
      night_shift_enabled: true,
      posts: [dayPost("p-e", "explosives")],
    },
  ];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 21),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  const reserved = result.checkpoints.flatMap((c) =>
    c.slots.filter((s) => s.reservation === FEMALE_SLOT_RESERVATION_CODE),
  );
  assert(reserved.length === 2, "two female reserved slots");
  assert(
    reserved.every((s) => s.team === null),
    "rescue did not assign males to female reserved slots",
  );
  assert(
    !result.structuredWarnings.some(
      (w) =>
        w.code === ROTATION_OVERRIDE_CODE &&
        reserved.some((s) => s.post_id === w.post_id),
    ),
    "no rotation override on female reserved posts",
  );
}

console.log("\n=== Phase 2.1: never park at 653 while legal operational slot remains ===");
{
  // Two compatible agents, two CPs. Nobody may sit at 653 with an open legal slot.
  const agents = [male("m1"), male("m2")];
  const checkpoints = [checkpoint("cp-a", "A", 1), checkpoint("cp-b", "B", 2)];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 15),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  assert(result.assignments.length === 2, "both operational CPs filled");
  assert(
    result.point653.filter((e) => e.reason === "no_operational_assignment").length === 0,
    "no operational-capable agent at 653 while CPs need staff",
  );
  assert(result.checkpoints.every((c) => c.total_staffed === 1), "no empty operational CP");
}

{
  // Agent blocked for cp-a may take cp-b; must not go to 653 while cp-b is open.
  const agents = [male("solo")];
  const checkpoints = [checkpoint("cp-a", "A", 1), checkpoint("cp-b", "B", 2)];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 16),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [
      { agent_id: "solo", checkpoint_id: "cp-a", planning_date: "2026-03-15" },
    ],
    yesterdayCheckpointByAgent: new Map([["solo", "cp-a"]]),
    fairnessCounts: new Map([["solo:cp-a", 1]]),
  });
  assert(
    result.assignments.some((a) => a.agent_id === "solo" && a.checkpoint_id === "cp-b"),
    "solo fills legal open CP instead of 653",
  );
  assert(
    !result.point653.some((e) => e.agent_id === "solo"),
    "solo not at 653 while cp-b was legally open",
  );
}

console.log("\n=== Structured codes: NO_SPECIALTY_MATCH / NO_AVAILABLE_DOG ===");
{
  const agents = [male("m1", "sec1", "narcotics")];
  const checkpoints = [checkpoint("cp-e", "E", 1, "explosives")];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 12),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  assert(
    result.structuredWarnings.some((w) => w.code === "NO_SPECIALTY_MATCH"),
    "NO_SPECIALTY_MATCH when only narcotics dog vs explosives CP",
  );
}

{
  const agents = [
    {
      ...male("m1"),
      dog_id: null,
      dogs: null,
    },
  ];
  const checkpoints = [checkpoint("cp-a", "A", 1)];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 13),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  assert(
    result.structuredWarnings.some((w) => w.code === "NO_AVAILABLE_DOG"),
    "NO_AVAILABLE_DOG when agent has no dog",
  );
}

console.log("\n=== Determinism ===");
{
  const agents = [male("m1"), male("m2"), male("hq", null)];
  const checkpoints = [
    checkpoint("cp-a", "A", 1),
    checkpoint("cp-b", "B", 2),
    checkpoint("cp-c", "C", 3),
  ];
  const base = {
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 14),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  };
  const a = runPlanningEngine(base);
  const b = runPlanningEngine(base);
  const fp = (r) =>
    r.assignments
      .map((x) => `${x.agent_id}>${x.checkpoint_id}`)
      .sort()
      .join("|");
  assert(fp(a) === fp(b), "identical inputs → identical assignments");
  assert(
    JSON.stringify(a.structuredWarnings) === JSON.stringify(b.structuredWarnings),
    "identical structured warnings",
  );
}

console.log("\n=== 100-day Priority + 0 early reps ===");
{
  const agents = [male("m1"), male("m2"), male("m3"), male("hq", null)];
  const checkpoints = [
    checkpoint("cp1", "P1", 1),
    checkpoint("cp2", "P2", 2),
    checkpoint("cp3", "P3", 3),
    checkpoint("cp4", "P4", 4),
  ];
  let history = [];
  let early = 0;
  let fingerprints = [];
  for (let day = 0; day < 100; day++) {
    const planningDate = new Date(2026, 0, 1 + day);
    const dateISO = planningDate.toISOString().slice(0, 10);
    const fairness = new Map();
    for (const row of history) {
      const key = `${row.agent_id}:${row.checkpoint_id}`;
      fairness.set(key, (fairness.get(key) ?? 0) + 1);
    }
    const yesterday = new Map();
    for (const row of history) {
      if (row.planning_date === new Date(2026, 0, day).toISOString().slice(0, 10)) {
        yesterday.set(row.agent_id, row.checkpoint_id);
      }
    }
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate,
      agents,
      exclusions: [],
      checkpoints,
      rotationHistory: history,
      yesterdayCheckpointByAgent: yesterday,
      fairnessCounts: fairness,
    });

    fingerprints.push(
      result.assignments
        .map((a) => `${a.agent_id}>${a.checkpoint_id}`)
        .sort()
        .join("|"),
    );

    const eligible = agents
      .filter((a) => a.section_id === "sec1" || a.section_id == null)
      .filter((a) => a.dogs)
      .map((a) => ({
        agent_id: a.id,
        agent_name: a.id,
        professional_number: a.professional_number,
        dog_id: a.dog_id,
        dog_name: a.dogs.name,
        specialty: a.dogs.specialty,
        gender: "male",
        agent_only: false,
      }));
    const compatible = buildCompatibleCheckpointsByAgent(
      eligible,
      checkpoints,
      "day",
      planningDate,
      false,
    );
    const visitedBefore = buildAgentVisitedCheckpoints(history, compatible);
    for (const assignment of result.assignments) {
      if (
        !canAssignBySmartRotation(
          assignment.agent_id,
          assignment.checkpoint_id,
          compatible,
          visitedBefore,
        )
      ) {
        early += 1;
      }
      const set = visitedBefore.get(assignment.agent_id) ?? new Set();
      const compat = compatible.get(assignment.agent_id) ?? new Set();
      if ([...compat].every((id) => set.has(id))) set.clear();
      set.add(assignment.checkpoint_id);
      if ([...compat].every((id) => set.has(id))) set.clear();
      visitedBefore.set(assignment.agent_id, set);
      history.push({
        agent_id: assignment.agent_id,
        checkpoint_id: assignment.checkpoint_id,
        planning_date: dateISO,
      });
    }

    // Scarce day: P1 must never stay empty while a lower priority is filled with fewer agents
    // (with 4 agents and 4 CPs all should fill — skip scarcity check here)
  }
  assert(early === 0, `0 early repetitions across 100 days (got ${early})`);
  const twin = [];
  history = [];
  for (let day = 0; day < 100; day++) {
    const planningDate = new Date(2026, 0, 1 + day);
    const dateISO = planningDate.toISOString().slice(0, 10);
    const fairness = new Map();
    for (const row of history) {
      const key = `${row.agent_id}:${row.checkpoint_id}`;
      fairness.set(key, (fairness.get(key) ?? 0) + 1);
    }
    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate,
      agents,
      exclusions: [],
      checkpoints,
      rotationHistory: history,
      yesterdayCheckpointByAgent: new Map(),
      fairnessCounts: fairness,
    });
    twin.push(
      result.assignments
        .map((a) => `${a.agent_id}>${a.checkpoint_id}`)
        .sort()
        .join("|"),
    );
    for (const assignment of result.assignments) {
      history.push({
        agent_id: assignment.agent_id,
        checkpoint_id: assignment.checkpoint_id,
        planning_date: dateISO,
      });
    }
  }
  assert(
    fingerprints.join("||") === twin.join("||"),
    "100-day twin replay is deterministic",
  );
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll Rotation Engine V2 Phase 2 checks passed.");
