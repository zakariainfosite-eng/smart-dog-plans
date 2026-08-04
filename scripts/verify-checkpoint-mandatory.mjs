/**
 * Verifies Mandatory vs Optional assignment order and Smart Rotation protection.
 * Run: npx tsx scripts/verify-checkpoint-mandatory.mjs
 */
import { runPlanningEngine } from "../src/lib/planning/engine.ts";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

const dayPost = (id, required = 1) => ({
  id,
  shift: "day",
  specialty_required: "narcotics",
  required_agents: required,
  active: true,
  allowed_gender: "all",
  dog_required: true,
});

function checkpoint(id, name, priority, mandatory = true) {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: "allowed",
    priority,
    mandatory,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts: [dayPost(`p-${id}`, 1)],
  };
}

function male(id) {
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
      name: `Dog-${id}`,
      specialty: "narcotics",
      status: "available",
      active: true,
    },
  };
}

console.log("=== Same priority: Mandatory before Optional ===");
{
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2020, 0, 1),
    agents: [male("m1")],
    exclusions: [],
    checkpoints: [
      checkpoint("cp-opt", "Optional P1", 1, false),
      checkpoint("cp-man", "Mandatory P1", 1, true),
    ],
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });

  const assigned = result.assignments.map((a) => a.checkpoint_id);
  assert(assigned.includes("cp-man"), "Mandatory P1 is assigned with 1 agent");
  assert(!assigned.includes("cp-opt"), "Optional P1 left empty when scarce");
  assert(
    result.summary.warnings.some((w) => w.startsWith("INFO:") && w.includes("Optional P1")),
    "INFO warning for uncovered optional checkpoint",
  );
  assert(result.summary.optionalSkipped === 1, "optionalSkipped = 1");
  assert(result.summary.mandatoryCovered === 1, "mandatoryCovered = 1");
}

console.log("=== Optional never breaks Smart Rotation (Phase 2) ===");
{
  // Agent already visited optional CP in history; compatible set = {opt, man}.
  // Phase 1 Smart Rotation: can assign man (not visited). Optional stays empty.
  // Phase 2 must NOT reassign optional by breaking cycle.
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2020, 0, 2),
    agents: [male("m1")],
    exclusions: [],
    checkpoints: [
      checkpoint("cp-opt", "76", 3, false),
      checkpoint("cp-man", "753", 3, true),
    ],
    rotationHistory: [{ agent_id: "m1", checkpoint_id: "cp-opt", planning_date: "2020-01-01" }],
    yesterdayCheckpointByAgent: new Map([["m1", "cp-opt"]]),
    fairnessCounts: new Map([["m1:cp-opt", 1]]),
  });

  const assigned = result.assignments.map((a) => a.checkpoint_id);
  assert(assigned.includes("cp-man"), "Mandatory filled under Smart Rotation");
  assert(!assigned.includes("cp-opt"), "Optional not force-filled by Phase 2");
}

console.log("=== Priority still dominates mandatory ===");
{
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2020, 0, 1),
    agents: [male("m1")],
    exclusions: [],
    checkpoints: [
      checkpoint("cp-low-man", "Low Mandatory", 4, true),
      checkpoint("cp-crit-opt", "Critical Optional", 1, false),
    ],
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });

  const assigned = result.assignments.map((a) => a.checkpoint_id);
  assert(
    assigned.includes("cp-crit-opt"),
    "Priority 1 Optional still preferred over Priority 4 Mandatory when only Smart Rotation fills",
  );
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll checkpoint mandatory checks passed.");
