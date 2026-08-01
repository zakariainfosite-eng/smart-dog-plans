/**
 * Verifies Female Rotation — independent of male Smart Rotation.
 * Run: npx tsx scripts/verify-female-rotation.mjs
 */
import { addDays, format } from "date-fns";
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

console.log("=== Unit: group split scalability ===");
for (const n of [4, 6, 8]) {
  const teams = Array.from({ length: n }, (_, i) => ({
    agent_id: `f${i}`,
    professional_number: `F${i}`,
  }));
  const { groupA, groupB } = splitFemaleRotationGroups(teams);
  assert(groupA.length === n / 2, `${n} females → Group A size ${n / 2} (got ${groupA.length})`);
  assert(groupB.length === n / 2, `${n} females → Group B size ${n / 2} (got ${groupB.length})`);
}

console.log("=== Unit: day alternation ===");
const four = [
  { agent_id: "f0", professional_number: "F0" },
  { agent_id: "f1", professional_number: "F1" },
  { agent_id: "f2", professional_number: "F2" },
  { agent_id: "f3", professional_number: "F3" },
];
const day0 = new Date(2020, 0, 1);
const day1 = addDays(day0, 1);
const day2 = addDays(day0, 2);
assert(isFemaleGroupAActive(day0) === true, "epoch day → Group A active");
assert(isFemaleGroupAActive(day1) === false, "next day → Group B active");
assert(isFemaleGroupAActive(day2) === true, "day after → Group A again");

const active0 = [...resolveActiveFemaleAgentIds(four, day0)].sort();
const active1 = [...resolveActiveFemaleAgentIds(four, day1)].sort();
assert(active0.length === 2, "day0 active count = 2");
assert(active1.length === 2, "day1 active count = 2");
assert(
  active0.every((id) => !active1.includes(id)),
  "active groups are disjoint across consecutive days",
);

console.log("=== Unit: female history scoring ===");
{
  const maps = buildFemaleAssignmentHistoryMaps(
    [
      { agent_id: "f0", checkpoint_id: "cp-a", planning_date: "2020-01-01" },
      { agent_id: "f0", checkpoint_id: "cp-b", planning_date: "2020-01-03" },
      { agent_id: "f0", checkpoint_id: "cp-a", planning_date: "2019-12-20" },
    ],
    "2020-01-05",
  );
  assert(
    maps.lastWorkingCheckpointByAgent.get("f0") === "cp-b",
    "last working checkpoint is most recent prior day",
  );
  assert(
    maps.lastAssignedDateByPair.get("f0:cp-a") === "2020-01-01",
    "pair date keeps latest assignment to cp-a",
  );

  const never = scoreFemaleCheckpointCandidate("f0", "cp-c", maps, new Map());
  const used = scoreFemaleCheckpointCandidate("f0", "cp-a", maps, new Map());
  assert(
    compareFemaleCheckpointScores(never, used) < 0,
    "never-assigned checkpoint ranks before a previously used one",
  );

  const consecutive = scoreFemaleCheckpointCandidate("f0", "cp-b", maps, new Map());
  const other = scoreFemaleCheckpointCandidate("f0", "cp-a", maps, new Map());
  assert(
    compareFemaleCheckpointScores(other, consecutive) < 0,
    "avoids repeating last working-day checkpoint",
  );
}

console.log("=== Engine: females excluded from night ===");
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
  const assignedIds = new Set(result.assignments.map((a) => a.agent_id));
  assert(!assignedIds.has("f1"), "female never assigned on night shift");
  assert(
    !result.point653.some((e) => e.agent_id === "f1"),
    "female never sent to Point 653 on night",
  );
  assert(
    !(result.offDuty ?? []).some((e) => e.agent_id === "f1"),
    "female not in day REST list on night planning",
  );
  assert(
    !result.eligible.some((e) => e.agent_id === "f1"),
    "female not in night planning pool",
  );
}

console.log("=== Engine: only active female group assigned on day ===");
{
  const females = [0, 1, 2, 3].map((i) => femaleAgent(`f${i}`));
  const males = [maleAgent("m1"), maleAgent("m2"), maleAgent("m3"), maleAgent("m4")];
  const checkpoints = [
    baseCheckpoint("cp-a", "Checkpoint A", "pa", 2),
    baseCheckpoint("cp-b", "Checkpoint B", "pb", 2),
    baseCheckpoint("cp-c", "Checkpoint C", "pc", 2),
    baseCheckpoint("cp-d", "Checkpoint D", "pd", 2),
  ];

  const dayA = runPlanningEngine({
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
  const dayB = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: day1,
    agents: [...females, ...males],
    exclusions: [],
    checkpoints,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });

  const assignedFemalesA = dayA.assignments
    .map((a) => a.agent_id)
    .filter((id) => id.startsWith("f"))
    .sort();
  const assignedFemalesB = dayB.assignments
    .map((a) => a.agent_id)
    .filter((id) => id.startsWith("f"))
    .sort();

  const expectedA = [
    ...resolveActiveFemaleAgentIds(
      females.map((f) => ({ agent_id: f.id, professional_number: f.professional_number })),
      day0,
    ),
  ].sort();
  const expectedB = [
    ...resolveActiveFemaleAgentIds(
      females.map((f) => ({ agent_id: f.id, professional_number: f.professional_number })),
      day1,
    ),
  ].sort();

  assert(
    assignedFemalesA.every((id) => expectedA.includes(id)),
    `day0 assigned females ⊆ active group (${assignedFemalesA.join(",")})`,
  );
  assert(
    assignedFemalesB.every((id) => expectedB.includes(id)),
    `day1 assigned females ⊆ active group (${assignedFemalesB.join(",")})`,
  );
  assert(
    assignedFemalesA.every((id) => !expectedB.includes(id)),
    "day0 does not assign the resting female group",
  );

  for (const id of females.map((f) => f.id).filter((id) => !expectedA.includes(id))) {
    assert(
      !dayA.assignments.some((a) => a.agent_id === id),
      `resting female ${id} not in male Smart Rotation assignments on day0`,
    );
    assert(
      (dayA.offDuty ?? []).some((e) => e.agent_id === id),
      `resting female ${id} marked REST on day0`,
    );
    assert(
      !dayA.point653.some((e) => e.agent_id === id),
      `resting female ${id} never in Point 653 on day0`,
    );
  }

  assert(
    dayA.point653.every((e) => !e.agent_id.startsWith("f")),
    "no female appears in Point 653 on day0",
  );
}

console.log("=== Engine: female avoids repeating last working checkpoint ===");
{
  const females = [femaleAgent("f0"), femaleAgent("f1"), femaleAgent("f2"), femaleAgent("f3")];
  const males = [maleAgent("m1"), maleAgent("m2")];
  const checkpoints = [
    baseCheckpoint("cp-a", "Checkpoint A", "pa"),
    baseCheckpoint("cp-b", "Checkpoint B", "pb"),
  ];

  const activeA = [
    ...resolveActiveFemaleAgentIds(
      females.map((f) => ({ agent_id: f.id, professional_number: f.professional_number })),
      day0,
    ),
  ];
  assert(activeA.includes("f0"), "precondition: f0 in active group on day0");

  const day2Result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: day2,
    agents: [...females, ...males],
    exclusions: [],
    checkpoints,
    rotationHistory: [
      {
        agent_id: "f0",
        checkpoint_id: "cp-a",
        planning_date: format(day0, "yyyy-MM-dd"),
      },
    ],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map([["f0:cp-a", 1]]),
  });

  const f0 = day2Result.assignments.find((a) => a.agent_id === "f0");
  assert(!!f0, "f0 assigned on next working day");
  assert(
    f0?.checkpoint_id === "cp-b",
    `f0 avoids consecutive working-day repeat of cp-a (got ${f0?.checkpoint_id})`,
  );
}

console.log("=== Engine: males still assigned by Smart Rotation ===");
{
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: day0,
    agents: [femaleAgent("f0"), femaleAgent("f1"), maleAgent("m1"), maleAgent("m2")],
    exclusions: [],
    checkpoints: [baseCheckpoint("cp1", "CP1", "p1", 2)],
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  const malesAssigned = result.assignments.filter((a) => a.agent_id.startsWith("m"));
  assert(malesAssigned.length >= 1, "male Smart Rotation still assigns male agents");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll Female Rotation checks passed.");
