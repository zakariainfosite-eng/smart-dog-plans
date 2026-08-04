/**
 * Verifies Smart Rotation Phase 1 — mandatory checkpoint cycle before repeat.
 * Run: npx tsx scripts/verify-smart-rotation.mjs
 */
import {
  buildCompatibleCheckpointsByAgent,
  buildAgentVisitedCheckpoints,
  canAssignBySmartRotation,
  runPlanningEngine,
} from "../src/lib/planning/engine.ts";

const post = (id, specialty, required, allowed_gender = "all") => ({
  id,
  shift: "day",
  specialty_required: specialty,
  required_agents: required,
  active: true,
  allowed_gender,
  dog_required: true,
});

const cpBase = {
  night_only: false,
  active: true,
  female_policy: "allowed",
  priority: 3,
  mandatory: true,
  operating_days: [1, 2, 3, 4, 5, 6, 7],
  day_shift_enabled: true,
  night_shift_enabled: true,
};

const checkpoints = [
  {
    id: "cp-a",
    name: "Checkpoint A",
    allowed_gender: "all",
    ...cpBase,
    posts: [post("pa", "narcotics", 1)],
  },
  {
    id: "cp-b",
    name: "Checkpoint B",
    allowed_gender: "all",
    ...cpBase,
    posts: [post("pb", "narcotics", 1)],
  },
];

const agents = [
  {
    id: "m1",
    first_name: "John",
    last_name: "One",
    professional_number: "M1",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "d1",
    dogs: { id: "d1", name: "Rex", specialty: "narcotics", status: "available", active: true },
  },
  {
    id: "m2",
    first_name: "Bob",
    last_name: "Two",
    professional_number: "M2",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "d2",
    dogs: { id: "d2", name: "Max", specialty: "narcotics", status: "available", active: true },
  },
];

const compatible = new Map([
  ["m1", new Set(["cp-a", "cp-b"])],
  ["m2", new Set(["cp-a", "cp-b"])],
]);

console.log("=== Unit: canAssignBySmartRotation ===");
const visitedPartial = new Map([["m1", new Set(["cp-a"])]]);
console.assert(
  !canAssignBySmartRotation("m1", "cp-a", compatible, visitedPartial),
  "visited checkpoint blocked before cycle complete",
);
console.assert(
  canAssignBySmartRotation("m1", "cp-b", compatible, visitedPartial),
  "unvisited checkpoint allowed",
);
const visitedComplete = new Map([["m1", new Set(["cp-a", "cp-b"])]]);
console.assert(
  canAssignBySmartRotation("m1", "cp-a", compatible, visitedComplete),
  "cycle reset allows repeat checkpoint",
);
console.log("PASS: rotation eligibility rules");

console.log("\n=== Integration: planning avoids repeat checkpoint ===");
const rotationHistory = [{ agent_id: "m1", checkpoint_id: "cp-a" }];
const result = runPlanningEngine({
  sectionId: "sec1",
  agents,
  exclusions: [],
  checkpoints,
  shift: "day",
  planningDate: new Date("2026-07-16"),
  rotationHistory,
  yesterdayCheckpointByAgent: new Map(),
  fairnessCounts: new Map([["m1:cp-a", 5], ["m1:cp-b", 0]]),
});

const m1Assignment = result.assignments.find((a) => a.agent_id === "m1");
console.log("m1 assigned to:", m1Assignment?.checkpoint_id ?? "(unassigned)");
console.assert(
  m1Assignment?.checkpoint_id === "cp-b",
  "m1 must not repeat cp-a despite higher fairness at cp-a",
);
console.log("PASS: smart rotation overrides fairness");

console.log("\n=== Integration: cycle reset after all checkpoints visited ===");
const fullHistory = [
  { agent_id: "m1", checkpoint_id: "cp-a" },
  { agent_id: "m1", checkpoint_id: "cp-b" },
];
const resetResult = runPlanningEngine({
  sectionId: "sec1",
  agents: [agents[0]],
  exclusions: [],
  checkpoints,
  shift: "day",
  planningDate: new Date("2026-07-17"),
  rotationHistory: fullHistory,
  yesterdayCheckpointByAgent: new Map(),
  fairnessCounts: new Map(),
});
console.assert(
  resetResult.assignments.some((a) => a.agent_id === "m1" && a.checkpoint_id === "cp-a"),
  "m1 can return to cp-a after full cycle",
);
console.log("PASS: cycle reset");

console.log("\n=== Gender-aware compatible checkpoints ===");
const planningDay = new Date("2026-07-16");
const genderCheckpoints = [
  {
    id: "cp20",
    name: "20",
    allowed_gender: "male",
    ...cpBase,
    posts: [post("p20", "narcotics", 1, "male")],
  },
  {
    id: "cp75",
    name: "75",
    allowed_gender: "female",
    ...cpBase,
    posts: [post("p75", "narcotics", 1, "female")],
  },
  {
    id: "cp78",
    name: "78",
    allowed_gender: "female",
    ...cpBase,
    posts: [post("p78", "narcotics", 1, "female")],
  },
  {
    id: "cp9",
    name: "9",
    allowed_gender: "male",
    ...cpBase,
    posts: [post("p9", "narcotics", 1, "male")],
  },
];
const femaleTeam = {
  agent_id: "f1",
  agent_name: "Jane",
  professional_number: "F1",
  dog_id: "d1",
  dog_name: "Luna",
  specialty: "narcotics",
  gender: "female",
};
const maleTeam = {
  agent_id: "m1",
  agent_name: "John",
  professional_number: "M1",
  dog_id: "d2",
  dog_name: "Rex",
  specialty: "narcotics",
  gender: "male",
};
const femaleCompatible = buildCompatibleCheckpointsByAgent(
  [femaleTeam],
  genderCheckpoints,
  "day",
  planningDay,
);
const maleCompatible = buildCompatibleCheckpointsByAgent(
  [maleTeam],
  genderCheckpoints,
  "day",
  planningDay,
);
const femaleSet = [...(femaleCompatible.get("f1") ?? [])].sort();
const maleSet = [...(maleCompatible.get("m1") ?? [])].sort();
console.assert(
  femaleSet.join(",") === "cp75,cp78",
  `female compatible checkpoints expected cp75,cp78 got ${femaleSet.join(",")}`,
);
console.assert(
  maleSet.join(",") === "cp20,cp9",
  `male compatible checkpoints expected cp20,cp9 got ${maleSet.join(",")}`,
);
console.log("PASS: compatible lists are gender-aware");

const genderHistory = [
  { agent_id: "f1", checkpoint_id: "cp75" },
  { agent_id: "f1", checkpoint_id: "cp20" },
];
const femaleVisited = buildAgentVisitedCheckpoints(genderHistory, femaleCompatible);
console.assert(
  !canAssignBySmartRotation("f1", "cp20", femaleCompatible, femaleVisited),
  "female agent must never rotate to male-only checkpoint",
);
console.assert(
  canAssignBySmartRotation("f1", "cp78", femaleCompatible, femaleVisited),
  "female agent can rotate to next compatible checkpoint",
);
console.log("PASS: rotation stays inside gender-compatible checkpoints");

const genderPlanning = runPlanningEngine({
  sectionId: "sec1",
  agents: [
    {
      id: "m1",
      first_name: "John",
      last_name: "M",
      professional_number: "M1",
      gender: "male",
      active: true,
      section_id: "sec1",
      dog_id: "d2",
      dogs: { id: "d2", name: "Rex", specialty: "narcotics", status: "available", active: true },
    },
  ],
  exclusions: [],
  checkpoints: genderCheckpoints,
  shift: "day",
  planningDate: planningDay,
  rotationHistory: [{ agent_id: "m1", checkpoint_id: "cp20", planning_date: "2026-07-15" }],
  yesterdayCheckpointByAgent: new Map([["m1", "cp20"]]),
  fairnessCounts: new Map([
    ["m1:cp20", 5],
    ["m1:cp9", 0],
  ]),
});
const genderAssignment = genderPlanning.assignments.find((a) => a.agent_id === "m1");
console.assert(
  genderAssignment?.checkpoint_id === "cp9",
  "male agent must be assigned to next compatible checkpoint, not a repeat",
);
console.log("PASS: planning rotation respects gender-compatible cycle");

console.log("\n=== Night female-only fallback in compatible checkpoints ===");
const nightFemaleCp = {
  id: "cp75",
  name: "75",
  allowed_gender: "female",
  ...cpBase,
  day_shift_enabled: false,
  night_shift_enabled: true,
  posts: [
    {
      id: "p75n",
      shift: "night",
      specialty_required: "narcotics",
      required_agents: 1,
      active: true,
      allowed_gender: "female",
      dog_required: true,
    },
  ],
};
const nightMaleTeam = {
  agent_id: "m1",
  agent_name: "John",
  professional_number: "M1",
  dog_id: "d2",
  dog_name: "Rex",
  specialty: "narcotics",
  gender: "male",
};
const nightCompatible = buildCompatibleCheckpointsByAgent(
  [nightMaleTeam],
  [nightFemaleCp],
  "night",
  planningDay,
  true,
);
console.assert(
  nightCompatible.get("m1")?.has("cp75"),
  "male agent must be compatible with female-only checkpoint at night via fallback",
);
console.log("PASS: smart rotation compatible set includes night fallback checkpoints");

console.log("\nAll Smart Rotation Phase 1 checks passed.");
