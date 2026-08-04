/**
 * Rotation Engine V2 Phase 1 — acceptance: 100 planning simulations.
 * Run: npx --yes tsx scripts/verify-rotation-engine-v2-phase1.mjs
 *
 * Checks:
 * - 0 early repetitions (agent revisits CP before finishing compatible set)
 * - Determinism (identical inputs → identical assignments)
 * - Priority order respected when staffing is scarce
 * - No Math.random / shuffle in engine source
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildCompatibleCheckpointsByAgent,
  buildAgentVisitedCheckpoints,
  canAssignBySmartRotation,
  runPlanningEngine,
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
  allowed_gender: "male",
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

function male(id, specialty = "narcotics") {
  return {
    id,
    first_name: "M",
    last_name: id,
    professional_number: id.toUpperCase().padStart(4, "0"),
    gender: "male",
    active: true,
    section_id: "sec1",
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

function fingerprint(result) {
  return result.assignments
    .map((a) => `${a.agent_id}>${a.checkpoint_id}:${a.checkpoint_post_id}`)
    .sort()
    .join("|");
}

/** Count early repeats: assign CP while agent still had unvisited compatible CPs. */
function countEarlyRepetitions(simHistory, agents, checkpoints, shift, planningDate) {
  let early = 0;
  const running = [];
  for (const day of simHistory) {
    const eligible = agents.map((a) => ({
      agent_id: a.id,
      agent_name: `${a.first_name} ${a.last_name}`,
      professional_number: a.professional_number,
      dog_id: a.dog_id,
      dog_name: a.dogs?.name ?? null,
      specialty: a.dogs?.specialty ?? null,
      gender: a.gender,
    }));
    const compatible = buildCompatibleCheckpointsByAgent(
      eligible,
      checkpoints,
      shift,
      planningDate,
      false,
    );
    // Visited state BEFORE this day's assignments.
    const visitedBefore = buildAgentVisitedCheckpoints(running, compatible);

    for (const assignment of day.assignments) {
      const ok = canAssignBySmartRotation(
        assignment.agent_id,
        assignment.checkpoint_id,
        compatible,
        visitedBefore,
      );
      if (!ok) early += 1;

      running.push({
        agent_id: assignment.agent_id,
        checkpoint_id: assignment.checkpoint_id,
        planning_date: day.dateISO,
      });
      // Update visitedAfter for next assignment same day (recordAgentCycleVisit semantics)
      const set = visitedBefore.get(assignment.agent_id) ?? new Set();
      const compat = compatible.get(assignment.agent_id) ?? new Set();
      if ([...compat].every((id) => set.has(id))) set.clear();
      set.add(assignment.checkpoint_id);
      if ([...compat].every((id) => set.has(id))) set.clear();
      visitedBefore.set(assignment.agent_id, set);
    }
  }
  return early;
}

console.log("=== Static: no randomness in engine ===");
assert(!/\bMath\.random\s*\(/.test(engineSrc), "engine.ts has no Math.random()");
assert(!/\bfunction shuffle\b/.test(engineSrc), "engine.ts has no shuffle()");
// Primary phases use Strict Smart Rotation; last-resort rescue may override before 653.
assert(
  /requireSmartRotation:\s*true/.test(engineSrc),
  "engine.ts still has Smart Rotation primary phase",
);
assert(
  /ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE/.test(engineSrc),
  "engine.ts reports rotation overrides for operational coverage",
);

console.log("\n=== Determinism twin run ===");
{
  const agents = [male("m1"), male("m2"), male("m3"), male("m4")];
  const checkpoints = [
    checkpoint("cp1", "A", 1),
    checkpoint("cp2", "B", 2),
    checkpoint("cp3", "C", 3),
    checkpoint("cp4", "D", 4),
  ];
  const base = {
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 0, 10),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [
      { agent_id: "m1", checkpoint_id: "cp1", planning_date: "2026-01-08" },
      { agent_id: "m2", checkpoint_id: "cp2", planning_date: "2026-01-08" },
    ],
    yesterdayCheckpointByAgent: new Map([
      ["m1", "cp1"],
      ["m2", "cp2"],
    ]),
    fairnessCounts: new Map([
      ["m1:cp1", 2],
      ["m2:cp2", 1],
    ]),
  };
  const a = fingerprint(runPlanningEngine(base));
  const b = fingerprint(runPlanningEngine(base));
  assert(a === b && a.length > 0, `identical inputs → identical planning (${a})`);
}

console.log("\n=== Priority order under scarcity ===");
{
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 0, 1),
    agents: [male("m1"), male("m2")],
    exclusions: [],
    checkpoints: [
      checkpoint("low", "Z Low", 4),
      checkpoint("crit", "A Critical", 1),
      checkpoint("high", "C High", 2),
      checkpoint("norm", "B Normal", 3),
    ],
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  const staffed = new Set(result.assignments.map((a) => a.checkpoint_id));
  assert(staffed.has("crit") && staffed.has("high"), "Priority 1 and 2 filled first");
  assert(!staffed.has("low"), "Priority 4 left empty when only 2 agents");
}

console.log("\n=== 100 sequential planning simulations ===");
{
  const agents = [
    male("m01"),
    male("m02"),
    male("m03"),
    male("m04"),
    male("m05"),
    male("m06"),
    male("m07"),
    male("m08"),
  ];
  const checkpoints = [
    checkpoint("cp-a", "10", 1),
    checkpoint("cp-b", "20", 1),
    checkpoint("cp-c", "30", 2),
    checkpoint("cp-d", "40", 2),
    checkpoint("cp-e", "50", 3),
    checkpoint("cp-f", "60", 3),
    checkpoint("cp-g", "70", 4),
    checkpoint("cp-h", "80", 4),
  ];

  const rotationHistory = [];
  const fairnessCounts = new Map();
  const simDays = [];
  let totalAssignments = 0;

  for (let day = 0; day < 100; day++) {
    const date = new Date(2026, 0, 1 + day);
    const dateISO = date.toISOString().slice(0, 10);
    const prevISO = new Date(2026, 0, day).toISOString().slice(0, 10);
    const yesterdayCheckpointByAgent = new Map();
    for (const row of rotationHistory) {
      if (row.planning_date === prevISO) {
        yesterdayCheckpointByAgent.set(row.agent_id, row.checkpoint_id);
      }
    }

    const result = runPlanningEngine({
      sectionId: "sec1",
      shift: "day",
      planningDate: date,
      agents,
      exclusions: [],
      checkpoints,
      rotationHistory: [...rotationHistory],
      yesterdayCheckpointByAgent,
      fairnessCounts: new Map(fairnessCounts),
    });

    // Twin determinism every 10th day
    if (day % 10 === 0) {
      const twin = runPlanningEngine({
        sectionId: "sec1",
        shift: "day",
        planningDate: date,
        agents,
        exclusions: [],
        checkpoints,
        rotationHistory: [...rotationHistory],
        yesterdayCheckpointByAgent: new Map(yesterdayCheckpointByAgent),
        fairnessCounts: new Map(fairnessCounts),
      });
      if (fingerprint(result) !== fingerprint(twin)) {
        failed += 1;
        console.error("FAIL: non-deterministic on day", dateISO);
      }
    }

    simDays.push({ dateISO, assignments: result.assignments });
    totalAssignments += result.assignments.length;

    for (const a of result.assignments) {
      rotationHistory.push({
        agent_id: a.agent_id,
        checkpoint_id: a.checkpoint_id,
        planning_date: dateISO,
      });
      const key = `${a.agent_id}:${a.checkpoint_id}`;
      fairnessCounts.set(key, (fairnessCounts.get(key) ?? 0) + 1);
    }
  }

  const early = countEarlyRepetitions(
    simDays,
    agents,
    checkpoints,
    "day",
    new Date(2026, 0, 1),
  );

  assert(simDays.length === 100, "ran 100 simulations");
  assert(totalAssignments > 0, `produced assignments (n=${totalAssignments})`);
  assert(early === 0, `0 early repetitions (got ${early})`);
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll Rotation Engine V2 Phase 1 acceptance checks passed.");
