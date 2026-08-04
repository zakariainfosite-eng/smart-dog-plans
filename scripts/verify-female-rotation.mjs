/**
 * Verifies female cynotechnicians are excluded from the automatic planning engine.
 * Helpers in female-rotation.ts remain available for history/stats; they no longer
 * drive checkpoint / reserve / Smart Rotation assignment.
 * Run: npx tsx scripts/verify-female-rotation.mjs
 */
import { addDays } from "date-fns";
import {
  buildFemaleAssignmentHistoryMaps,
  compareFemaleCheckpointScores,
  isFemaleGroupAActive,
  resolveActiveFemaleAgentIds,
  runPlanningEngine,
  scoreFemaleCheckpointCandidate,
  splitFemaleRotationGroups,
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

const dayPost = (id, specialty, required, allowed_gender = "all") => ({
  id,
  shift: "day",
  specialty_required: specialty,
  required_agents: required,
  active: true,
  allowed_gender,
  dog_required: true,
});

function femaleAgent(id, specialty = "narcotics") {
  return {
    id,
    first_name: "F",
    last_name: id,
    professional_number: id.toUpperCase(),
    gender: "female",
    active: true,
    section_id: null,
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

function maleAgent(id, specialty = "narcotics") {
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
      specialty,
      status: "available",
      active: true,
    },
  };
}

function baseCheckpoint(id, name, postId, required = 1) {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: "allowed",
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts: [dayPost(postId, "narcotics", required)],
  };
}

console.log("=== Unit: group split helpers still available ===");
for (const n of [4, 6, 8]) {
  const teams = Array.from({ length: n }, (_, i) => ({
    agent_id: `f${i}`,
    professional_number: `F${i}`,
  }));
  const { groupA, groupB } = splitFemaleRotationGroups(teams);
  assert(groupA.length === n / 2, `${n} females → Group A size ${n / 2} (got ${groupA.length})`);
  assert(groupB.length === n / 2, `${n} females → Group B size ${n / 2} (got ${groupB.length})`);
}

console.log("=== Unit: day alternation helpers still available ===");
const four = [
  { agent_id: "f0", professional_number: "F0" },
  { agent_id: "f1", professional_number: "F1" },
  { agent_id: "f2", professional_number: "F2" },
  { agent_id: "f3", professional_number: "F3" },
];
const day0 = new Date(2020, 0, 1);
const day1 = addDays(day0, 1);
assert(isFemaleGroupAActive(day0) === true, "epoch day → Group A active");
assert(isFemaleGroupAActive(day1) === false, "next day → Group B active");
assert(resolveActiveFemaleAgentIds(four, day0).size === 2, "day0 active count = 2");

console.log("=== Unit: female history scoring helpers still available ===");
{
  const maps = buildFemaleAssignmentHistoryMaps(
    [
      { agent_id: "f0", checkpoint_id: "cp-a", planning_date: "2020-01-01" },
      { agent_id: "f0", checkpoint_id: "cp-b", planning_date: "2020-01-03" },
    ],
    "2020-01-05",
  );
  const never = scoreFemaleCheckpointCandidate("f0", "cp-c", maps, new Map());
  const used = scoreFemaleCheckpointCandidate("f0", "cp-a", maps, new Map());
  assert(
    compareFemaleCheckpointScores(never, used) < 0,
    "never-assigned checkpoint ranks before a previously used one",
  );
}

console.log("=== Engine: females never enter automatic planning (day) ===");
{
  const females = [0, 1, 2, 3].map((i) => femaleAgent(`f${i}`));
  const males = [maleAgent("m1"), maleAgent("m2"), maleAgent("m3"), maleAgent("m4")];
  const checkpoints = [
    baseCheckpoint("cp-a", "Checkpoint A", "pa", 2),
    baseCheckpoint("cp-b", "Checkpoint B", "pb", 2),
    baseCheckpoint("cp-c", "Checkpoint C", "pc", 2),
    baseCheckpoint("cp-d", "Checkpoint D", "pd", 2),
  ];

  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: day0,
    agents: [...females, ...males],
    exclusions: [],
    checkpoints,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });

  assert(
    result.assignments.every((a) => !a.agent_id.startsWith("f")),
    "no female checkpoint assignments on day",
  );
  assert(
    result.point653.every((e) => !e.agent_id.startsWith("f")),
    "no female HQ Reserve / Point 653 on day",
  );
  assert(
    (result.offDuty ?? []).length === 0,
    "female REST list empty (excluded from engine)",
  );
  assert(
    !result.eligible.some((e) => e.agent_id.startsWith("f")),
    "females not in eligible planning pool",
  );
  assert(
    result.assignments.some((a) => a.agent_id.startsWith("m")),
    "male Smart Rotation still assigns male agents",
  );
}

console.log("=== Engine: females never enter automatic planning (night) ===");
{
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "night",
    planningDate: day0,
    agents: [femaleAgent("f1"), maleAgent("m1")],
    exclusions: [],
    checkpoints: [
      {
        ...baseCheckpoint("cp1", "CP1", "pn1"),
        posts: [
          {
            id: "pn1",
            shift: "night",
            specialty_required: "narcotics",
            required_agents: 1,
            active: true,
            allowed_gender: "all",
            dog_required: true,
          },
        ],
      },
    ],
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  assert(
    !result.assignments.some((a) => a.agent_id === "f1"),
    "female never assigned on night shift",
  );
  assert(
    !result.point653.some((e) => e.agent_id === "f1"),
    "female never sent to Point 653 on night",
  );
  assert(!result.eligible.some((e) => e.agent_id === "f1"), "female not in night pool");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll female exclusion checks passed.");
