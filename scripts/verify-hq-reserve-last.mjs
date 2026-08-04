/**
 * HQ Reserve must be last: no agent at 653 while a specialty-compatible
 * operational slot remains open.
 * Run: npx --yes tsx scripts/verify-hq-reserve-last.mjs
 */
import {
  runPlanningEngine,
  auditReservePriority,
  qualifyTeams,
} from "../src/lib/planning/engine.ts";

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

function checkpoint(id, name, priority = 3) {
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
    posts: [dayPost(`p-${id}`)],
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

console.log("=== Smart Rotation defers agent; last-resort fills before 653 ===");
{
  // m1 already visited cp-a → Phase 1 cannot put m1 on cp-a.
  // With 2 agents and 2 CPs, both must be staffed; nobody at 653.
  const agents = [male("m1"), male("m2")];
  const checkpoints = [checkpoint("cp-a", "A", 1), checkpoint("cp-b", "B", 2)];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 1),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [{ agent_id: "m1", checkpoint_id: "cp-a", planning_date: "2026-02-28" }],
    yesterdayCheckpointByAgent: new Map([["m1", "cp-a"]]),
    fairnessCounts: new Map([["m1:cp-a", 1]]),
  });

  assert(result.assignments.length === 2, "both checkpoints staffed");
  assert(
    result.checkpoints.every((c) => c.total_staffed === 1),
    "no empty operational checkpoint",
  );
  assert(
    result.unassigned.filter((u) => true).length === 0 ||
      result.point653.every((e) => e.reason !== "no_operational_assignment"),
    "no no_operational_assignment reserve while slots exist",
  );
  const { eligible } = qualifyTeams(agents, [], "day");
  assert(
    !auditReservePriority(eligible, result, checkpoints, "day", new Date(2026, 2, 1)),
    "auditReservePriority clean",
  );
  assert(
    result.assignments.find((a) => a.checkpoint_id === "cp-a")?.agent_id === "m2",
    "Phase 1 prefers fresh agent on visited CP (m2→cp-a)",
  );
}

console.log("=== Sole leftover agent fills last open CP instead of 653 ===");
{
  // Only m1 left for two CPs he already visited — last-resort may early-repeat
  // rather than leave CPs empty and park him at 653.
  const agents = [male("m1")];
  const checkpoints = [checkpoint("cp-a", "A", 1), checkpoint("cp-b", "B", 1)];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 2),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [
      { agent_id: "m1", checkpoint_id: "cp-a", planning_date: "2026-03-01" },
      // cycle not complete if only visited A; B still open legally in Phase 1
    ],
    yesterdayCheckpointByAgent: new Map([["m1", "cp-a"]]),
    fairnessCounts: new Map([["m1:cp-a", 1]]),
  });

  // Phase 1 should assign m1→cp-b (unvisited). cp-a stays empty (only 1 agent).
  assert(
    result.assignments.some((a) => a.agent_id === "m1" && a.checkpoint_id === "cp-b"),
    "m1 takes unvisited cp-b under Smart Rotation",
  );
  assert(
    !result.point653.some((e) => e.agent_id === "m1" && e.reason === "no_operational_assignment"),
    "m1 not parked at 653 while he could take cp-b",
  );
}

console.log("=== Early-repeat last resort: open visited CP vs 653 ===");
{
  // Compatible set = {cp-a} only (one CP). After visiting it, cycle resets →
  // Phase 1 allows again. Use two CPs both visited mid-cycle:
  const agents = [male("solo")];
  const checkpoints = [
    checkpoint("cp-x", "X", 1),
    checkpoint("cp-y", "Y", 2),
  ];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 2, 3),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [
      { agent_id: "solo", checkpoint_id: "cp-x", planning_date: "2026-03-01" },
      { agent_id: "solo", checkpoint_id: "cp-y", planning_date: "2026-03-02" },
    ],
    yesterdayCheckpointByAgent: new Map([["solo", "cp-y"]]),
    fairnessCounts: new Map([
      ["solo:cp-x", 1],
      ["solo:cp-y", 1],
    ]),
  });

  // After full cycle, visited cleared → Phase 1 assigns to priority 1 (cp-x).
  // Either way solo must not sit at 653 with empty operational demand.
  assert(result.assignments.length === 1, "solo assigned to an operational CP");
  assert(
    !result.point653.some((e) => e.agent_id === "solo"),
    "solo not at 653 while operational demand exists",
  );
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll HQ Reserve-last checks passed.");
