/**
 * Verifies checkpoint priority assignment order.
 * Run: npx tsx scripts/verify-checkpoint-priority.mjs
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

function checkpoint(id, name, priority) {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: "allowed",
    priority,
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

console.log("=== Priority assignment order ===");
{
  // Only 2 males for 4 checkpoints → Critical & High should fill first; Low may stay empty.
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2020, 0, 1),
    agents: [male("m1"), male("m2")],
    exclusions: [],
    checkpoints: [
      checkpoint("cp-low", "Z Low", 4),
      checkpoint("cp-critical", "A Critical", 1),
      checkpoint("cp-normal", "B Normal", 3),
      checkpoint("cp-high", "C High", 2),
    ],
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });

  const assigned = new Set(result.assignments.map((a) => a.checkpoint_id));
  assert(assigned.has("cp-critical"), "priority 1 (Critical) is assigned");
  assert(assigned.has("cp-high"), "priority 2 (High) is assigned");
  assert(!assigned.has("cp-low") || !assigned.has("cp-normal"), "lower priorities may remain unassigned when agents are scarce");

  const staffedOrder = result.checkpoints
    .filter((cp) => cp.total_staffed > 0)
    .map((cp) => cp.checkpoint_id);

  // Among staffed, Critical and High should be present; Low should not if only 2 agents.
  assert(
    staffedOrder.includes("cp-critical") && staffedOrder.includes("cp-high"),
    `Critical and High staffed first (got ${staffedOrder.join(",")})`,
  );
  assert(
    !staffedOrder.includes("cp-low"),
    "Low priority left unstaffed when only 2 agents available",
  );
}

console.log("=== Default priority is Normal (3) ===");
{
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2020, 0, 1),
    agents: [male("m1")],
    exclusions: [],
    checkpoints: [
      {
        id: "cp-default",
        name: "Default",
        night_only: false,
        active: true,
        allowed_gender: "all",
        female_policy: "allowed",
        // priority omitted → normalize to 3
        operating_days: [1, 2, 3, 4, 5, 6, 7],
        day_shift_enabled: true,
        night_shift_enabled: true,
        posts: [dayPost("p-default")],
      },
    ],
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  assert(
    result.checkpoints[0]?.checkpoint_id === "cp-default",
    "checkpoint without priority still plans (defaults to Normal)",
  );
  assert(result.assignments.length === 1, "default-priority checkpoint receives assignment");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll checkpoint priority checks passed.");
