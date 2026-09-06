/**
 * Verifies checkpoint operational config, female policy, operating days, and exclusions.
 * Run: node scripts/verify-planning-rules.mjs
 */
import {
  filterCheckpointsForPlanning,
  isCheckpointOperationalForPlanning,
  qualifyTeams,
  runPlanningEngine,
  auditReservePriority,
  auditOperationalViolations,
  auditExclusionViolations,
  NIGHT_SHIFT_FEMALE_EXCLUSION_REASON,
  shouldApplyNightFemaleFallback,
  hasAvailableFemaleForSpecialty,
} from "../src/lib/planning/engine.ts";

const post = (id, specialty, required, allowed_gender = "all", shift = "day") => ({
  id,
  specialty_required: specialty,
  required_agents: required,
  active: true,
  allowed_gender,
  shift,
  dog_required: true,
});

function cp(overrides) {
  return {
    active: true,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    female_policy: "allowed",
    night_only: false,
    allowed_gender: "all",
    ...overrides,
  };
}

const checkpoints = [
  cp({
    id: "cp-day",
    name: "Checkpoint 1",
    posts: [
      post("p1-day", "narcotics", 1, "all", "day"),
      post("p1-night", "narcotics", 1, "all", "night"),
    ],
  }),
  cp({
    id: "cp-night",
    name: "Checkpoint Night",
    night_only: true,
    day_shift_enabled: false,
    night_shift_enabled: true,
    posts: [post("p2", "narcotics", 1, "all", "night")],
  }),
];

const agents = [
  {
    id: "m1",
    first_name: "John",
    last_name: "Male",
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
    last_name: "Male2",
    professional_number: "M2",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "d2",
    dogs: { id: "d2", name: "Max", specialty: "narcotics", status: "available", active: true },
  },
  {
    id: "f1",
    first_name: "Jane",
    last_name: "Female",
    professional_number: "F1",
    gender: "female",
    active: true,
    section_id: "sec1",
    dog_id: "d3",
    dogs: { id: "d3", name: "Luna", specialty: "narcotics", status: "available", active: true },
  },
  {
    id: "f2",
    first_name: "Anna",
    last_name: "Female2",
    professional_number: "F2",
    gender: "female",
    active: true,
    section_id: "sec1",
    dog_id: "d4",
    dogs: { id: "d4", name: "Bella", specialty: "narcotics", status: "available", active: true },
  },
  {
    id: "m3",
    first_name: "Carl",
    last_name: "Male3",
    professional_number: "M3",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "d5",
    dogs: { id: "d5", name: "Rocky", specialty: "narcotics", status: "available", active: true },
  },
];

const planningDate = new Date("2026-07-16");
const emptyMap = () => new Map();

console.log("=== Rule 1: Shift-specific checkpoints ===");
const dayCps = filterCheckpointsForPlanning(checkpoints, "day", planningDate);
const nightCps = filterCheckpointsForPlanning(checkpoints, "night", planningDate);
console.log("Day checkpoints:", dayCps.map((c) => c.name).join(", ") || "(none)");
console.log("Night checkpoints:", nightCps.map((c) => c.name).join(", ") || "(none)");
console.log(
  dayCps.length === 1 && dayCps[0].id === "cp-day"
    ? "PASS: night-only checkpoint excluded from day"
    : "FAIL: night-only on day",
);
console.log(
  nightCps.length === 2 ? "PASS: night includes day+night checkpoints" : "FAIL: night missing checkpoints",
);

console.log("\n=== Rule 1b: Operating days ===");
const weekdayCheckpoint = cp({
  id: "cp-weekday",
  name: "Weekday Only",
  operating_days: [1, 2, 3, 4, 5],
  posts: [post("p-wd", "narcotics", 1, "all", "day")],
});
const thursday = new Date("2026-07-16");
const sunday = new Date("2026-07-19");
console.log(
  filterCheckpointsForPlanning([weekdayCheckpoint], "day", thursday).length === 1
    ? "PASS: checkpoint open on configured weekday"
    : "FAIL: weekday filter (open)",
);
console.log(
  filterCheckpointsForPlanning([weekdayCheckpoint], "day", sunday).length === 0
    ? "PASS: checkpoint closed on unconfigured day"
    : "FAIL: weekday filter (closed)",
);

console.log("\n=== Rule 2: Night shift female exclusion (operational rule) ===");
const { eligible: dayEligible } = qualifyTeams(agents, [], "day");
const { eligible: nightEligible, excluded: nightExcluded } = qualifyTeams(agents, [], "night");
const femalesExcludedAtNight = nightExcluded.filter((t) =>
  ["f1", "f2"].includes(t.agent_id),
).every((t) => t.reason === NIGHT_SHIFT_FEMALE_EXCLUSION_REASON);
console.log(
  dayEligible.length === 5 && nightEligible.length === 3 && femalesExcludedAtNight
    ? "PASS: female agents excluded from night planning candidate pool"
    : "FAIL: night planning must ignore female agents",
);

console.log("\n=== Rule 2b: Checkpoint female_policy (database-driven) ===");
const noFemaleCheckpoint = cp({
  id: "cp-no-female",
  name: "No Female",
  female_policy: "not_allowed",
  allowed_gender: "male",
  posts: [post("p-nf", "narcotics", 1, "male", "day")],
});
const noFemaleResult = runPlanningEngine({
  sectionId: "sec1",
  agents,
  exclusions: [],
  checkpoints: [noFemaleCheckpoint],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const femaleOnNoFemale = noFemaleResult.assignments.some((a) => ["f1", "f2"].includes(a.agent_id));
console.log(
  !femaleOnNoFemale
    ? "PASS: female_policy not_allowed blocks female agents"
    : "FAIL: female assigned despite not_allowed policy",
);

console.log("\n=== Rule 3: Active exclusions (engine input) ===");
const sickAgent = { agent_id: "m1", exclusion_type: "sickness" };
const { eligible: withExclusion, excluded: withExclusionExcluded } = qualifyTeams(
  agents,
  [sickAgent],
  "day",
);
const m1Assigned = withExclusion.some((t) => t.agent_id === "m1");
const m1InExcluded = withExclusionExcluded.some((t) => t.agent_id === "m1");
console.log(
  !m1Assigned && m1InExcluded
    ? "PASS: active agent exclusion removes cynotechnicien from operational pool and lists as excluded"
    : "FAIL: agent exclusion ignored",
);
const sickExclusionPlanning = runPlanningEngine({
  sectionId: "sec1",
  agents,
  exclusions: [sickAgent],
  checkpoints,
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const sickOnCheckpoint = sickExclusionPlanning.assignments.some((a) => a.agent_id === "m1");
const sickOnPoint653 = sickExclusionPlanning.point653.some((a) => a.agent_id === "m1");
const sickExclusionViolations = auditExclusionViolations(
  agents,
  [sickAgent],
  sickExclusionPlanning,
);
console.log(
  !sickOnCheckpoint && !sickOnPoint653 && sickExclusionPlanning.excluded.some((e) => e.agent_id === "m1")
    ? "PASS: sick cynotechnicien excluded from checkpoints and Point 653"
    : "FAIL: sick cynotechnicien must not appear in planning output",
);
console.log(
  sickExclusionViolations.length === 0
    ? "PASS: no exclusion audit violations for properly excluded agent"
    : `FAIL: unexpected exclusion violations: ${sickExclusionViolations.join("; ")}`,
);
const trainingAgent = { agent_id: "m2", exclusion_type: "training" };
const trainingPlanning = runPlanningEngine({
  sectionId: "sec1",
  agents,
  exclusions: [trainingAgent],
  checkpoints,
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
console.log(
  !trainingPlanning.assignments.some((a) => a.agent_id === "m2") &&
    !trainingPlanning.point653.some((a) => a.agent_id === "m2")
    ? "PASS: training cynotechnicien excluded from checkpoints and Point 653"
    : "FAIL: training cynotechnicien must not appear in planning output",
);
console.log(
  "Note: daily-planning loads exclusions with .eq('active', true) — disabled rows are not passed to engine.",
);

console.log("\n=== Full planning run: Day ===");
const dayResult = runPlanningEngine({
  sectionId: "sec1",
  agents,
  exclusions: [],
  checkpoints,
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
console.log("Checkpoints planned:", dayResult.checkpoints.map((c) => c.checkpoint_name).join(", "));
console.log("Assignments:", dayResult.assignments.length);
console.log(
  !dayResult.checkpoints.some((c) => c.checkpoint_id === "cp-night")
    ? "PASS: night-only checkpoint not in day plan"
    : "FAIL: night-only in day plan",
);

console.log("\n=== Full planning run: Night ===");
const nightResult = runPlanningEngine({
  sectionId: "sec1",
  agents,
  exclusions: [],
  checkpoints,
  shift: "night",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
console.log("Checkpoints planned:", nightResult.checkpoints.map((c) => c.checkpoint_name).join(", "));
console.log("Assignments:", nightResult.assignments.length);
console.log(
  nightResult.checkpoints.some((c) => c.checkpoint_id === "cp-night")
    ? "PASS: night-only checkpoint included on night"
    : "FAIL: night-only missing on night",
);
const nightFemaleAssigned = nightResult.assignments.some((a) => ["f1", "f2"].includes(a.agent_id));
const nightOperationalWarnings = auditOperationalViolations(
  nightResult,
  checkpoints,
  "night",
  planningDate,
  new Map(agents.map((a) => [a.id, a.gender])),
);
console.log(
  !nightFemaleAssigned &&
    !nightOperationalWarnings.some((w) => w.includes("Female agent assigned to night"))
    ? "PASS: night planning never assigns female agents"
    : "FAIL: female agent assigned on night shift",
);

console.log("\n=== Rule 4: Per-requirement gender (post-level) ===");
const mixedGenderCheckpoint = cp({
  id: "cp-mixed",
  name: "Checkpoint 21",
  posts: [
    post("p-narc-male", "narcotics", 1, "male", "day"),
    post("p-expl-female", "explosives", 1, "female", "day"),
  ],
});
const mixedAgents = [
  {
    id: "nm1",
    first_name: "Narc",
    last_name: "Male",
    professional_number: "NM1",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "dn1",
    dogs: { id: "dn1", name: "NarcDog", specialty: "narcotics", status: "available", active: true },
  },
  {
    id: "nf1",
    first_name: "Narc",
    last_name: "Female",
    professional_number: "NF1",
    gender: "female",
    active: true,
    section_id: "sec1",
    dog_id: "dn2",
    dogs: { id: "dn2", name: "NarcGirl", specialty: "narcotics", status: "available", active: true },
  },
  {
    id: "em1",
    first_name: "Expl",
    last_name: "Male",
    professional_number: "EM1",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "de1",
    dogs: { id: "de1", name: "ExplDog", specialty: "explosives", status: "available", active: true },
  },
  {
    id: "ef1",
    first_name: "Expl",
    last_name: "Female",
    professional_number: "EF1",
    gender: "female",
    active: true,
    section_id: "sec1",
    dog_id: "de2",
    dogs: { id: "de2", name: "ExplGirl", specialty: "explosives", status: "available", active: true },
  },
];
const mixedResult = runPlanningEngine({
  sectionId: "sec1",
  agents: mixedAgents,
  exclusions: [],
  checkpoints: [mixedGenderCheckpoint],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const narcAssign = mixedResult.assignments.find((a) => a.checkpoint_post_id === "p-narc-male");
const explAssign = mixedResult.assignments.find((a) => a.checkpoint_post_id === "p-expl-female");
console.log(
  narcAssign?.agent_id === "nm1" && explAssign?.agent_id === "ef1"
    ? "PASS: narcotics male-only + explosives female-only on same checkpoint"
    : "FAIL: per-post gender not respected",
);

console.log("\n=== Rule 5: Gender enforcement on assignment ===");
function assertNoGenderViolations(label, result, cps, agentList) {
  const agentById = new Map(agentList.map((a) => [a.id, a]));
  const violations = [];
  for (const assignment of result.assignments) {
    const checkpoint = cps.find((c) => c.id === assignment.checkpoint_id);
    const slot = checkpoint?.posts.find((p) => p.id === assignment.checkpoint_post_id);
    const agent = agentById.get(assignment.agent_id);
    if (!checkpoint || !slot || !agent) continue;
    const allowed =
      slot.allowed_gender === "all" || slot.allowed_gender === "male" || slot.allowed_gender === "female"
        ? slot.allowed_gender
        : checkpoint.allowed_gender;
    if (allowed === "male" && agent.gender !== "male") violations.push({ label, cp: checkpoint.name });
    if (allowed === "female" && agent.gender !== "female") violations.push({ label, cp: checkpoint.name });
  }
  return violations;
}

const femaleOnlyAgents = [
  agents[2],
  agents[3],
  { ...agents[0], id: "m-narc", dog_id: "d-narc", dogs: { ...agents[0].dogs, id: "d-narc", specialty: "narcotics" } },
];
const femaleOnlyCheckpoint = cp({
  id: "cp-female",
  name: "FemaleOnly",
  female_policy: "preferred",
  allowed_gender: "female",
  posts: [post("p-female", "narcotics", 1, "female", "day")],
});
const femaleOnlyResult = runPlanningEngine({
  sectionId: "sec1",
  agents: femaleOnlyAgents,
  exclusions: [],
  checkpoints: [femaleOnlyCheckpoint],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const femaleViolations = assertNoGenderViolations("female-only", femaleOnlyResult, [femaleOnlyCheckpoint], femaleOnlyAgents);
const femaleAssignedMale = femaleOnlyResult.assignments.some((a) => a.agent_id === "m-narc");
console.log(
  !femaleAssignedMale && femaleViolations.length === 0
    ? "PASS: female-only checkpoint never receives a male"
    : "FAIL: female-only checkpoint gender violation",
);

const maleOnlyAgents = [
  agents[0],
  agents[1],
  { ...agents[2], id: "f-narc", dog_id: "d-f-narc", dogs: { ...agents[2].dogs, id: "d-f-narc", specialty: "narcotics" } },
];
const maleOnlyCheckpoint = cp({
  id: "cp-male",
  name: "MaleOnly",
  female_policy: "not_allowed",
  allowed_gender: "male",
  posts: [post("p-male", "narcotics", 1, "male", "day")],
});
const maleOnlyResult = runPlanningEngine({
  sectionId: "sec1",
  agents: maleOnlyAgents,
  exclusions: [],
  checkpoints: [maleOnlyCheckpoint],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const maleViolations = assertNoGenderViolations("male-only", maleOnlyResult, [maleOnlyCheckpoint], maleOnlyAgents);
const maleAssignedFemale = maleOnlyResult.assignments.some((a) => a.agent_id === "f-narc");
console.log(
  !maleAssignedFemale && maleViolations.length === 0
    ? "PASS: male-only checkpoint never receives a female"
    : "FAIL: male-only checkpoint gender violation",
);

console.log("\n=== Rule 6: Assignment priority (reserve last) ===");
const priorityAgents = [
  {
    id: "m-open",
    first_name: "Open",
    last_name: "Male",
    professional_number: "OM1",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "d-open-m",
    dogs: { id: "d-open-m", name: "Rex", specialty: "narcotics", status: "available", active: true },
  },
  {
    id: "f-constrained",
    first_name: "Constrained",
    last_name: "Female",
    professional_number: "CF1",
    gender: "female",
    active: true,
    section_id: "sec1",
    dog_id: "d-constrained-f",
    dogs: { id: "d-constrained-f", name: "Luna", specialty: "narcotics", status: "available", active: true },
  },
];
const openFirstCheckpoint = cp({
  id: "cp-open",
  name: "A Open",
  posts: [post("p-open", "narcotics", 1, "all", "day")],
});
const constrainedCheckpoint = cp({
  id: "cp-constrained",
  name: "B FemaleOnly",
  female_policy: "preferred",
  allowed_gender: "female",
  posts: [post("p-constrained", "narcotics", 1, "female", "day")],
});
const priorityCheckpoints = [openFirstCheckpoint, constrainedCheckpoint];
const priorityResult = runPlanningEngine({
  sectionId: "sec1",
  agents: priorityAgents,
  exclusions: [],
  checkpoints: priorityCheckpoints,
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const constrainedCp = priorityResult.checkpoints.find((c) => c.checkpoint_id === "cp-constrained");
const constrainedAssign = priorityResult.assignments.find((a) => a.checkpoint_post_id === "p-constrained");
const { eligible: priorityEligible } = qualifyTeams(priorityAgents, [], "day");
const prematureReserve = auditReservePriority(
  priorityEligible,
  priorityResult,
  priorityCheckpoints,
  "day",
  planningDate,
);
console.log(
  constrainedCp?.total_staffed === 1 &&
    constrainedAssign?.agent_id === "f-constrained" &&
    priorityResult.assignments.length === 2 &&
    priorityResult.unassigned.length === 0
    ? "PASS: constrained checkpoint staffed before reserve"
    : "FAIL: constrained checkpoint staffing priority",
);
console.log(
  !prematureReserve
    ? "PASS: no reserve agent while compatible open slot exists"
    : "FAIL: reserve assigned before all compatible slots filled",
);

const preferredMaleOnlyResult = runPlanningEngine({
  sectionId: "sec1",
  agents: [priorityAgents[0]],
  exclusions: [],
  checkpoints: [constrainedCheckpoint],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
console.log(
  preferredMaleOnlyResult.checkpoints[0]?.total_staffed === 1 &&
    preferredMaleOnlyResult.assignments[0]?.agent_id === "m-open" &&
    preferredMaleOnlyResult.unassigned.length === 0
    ? "PASS: preferred female policy assigns compatible male when no female exists"
    : "FAIL: preferred female policy must fallback to male instead of reserve",
);

const rotationCheckpointA = cp({
  id: "cp-rot-a",
  name: "Rotation A",
  posts: [post("p-rot-a", "narcotics", 1, "all", "day")],
});
const rotationCheckpointB = cp({
  id: "cp-rot-b",
  name: "Rotation B",
  posts: [post("p-rot-b", "narcotics", 1, "all", "day")],
});
const rotationAgentBlocked = {
  id: "m-rot-blocked",
  first_name: "Blocked",
  last_name: "Agent",
  professional_number: "RA1",
  gender: "male",
  active: true,
  section_id: "sec1",
  dog_id: "d-rot-blocked",
  dogs: {
    id: "d-rot-blocked",
    name: "Rex",
    specialty: "narcotics",
    status: "available",
    active: true,
  },
};
const rotationAgentFresh = {
  id: "m-rot-fresh",
  first_name: "Fresh",
  last_name: "Agent",
  professional_number: "RA2",
  gender: "male",
  active: true,
  section_id: "sec1",
  dog_id: "d-rot-fresh",
  dogs: {
    id: "d-rot-fresh",
    name: "Max",
    specialty: "narcotics",
    status: "available",
    active: true,
  },
};
const rotationResult = runPlanningEngine({
  sectionId: "sec1",
  agents: [rotationAgentBlocked, rotationAgentFresh],
  exclusions: [],
  checkpoints: [rotationCheckpointA, rotationCheckpointB],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [{ agent_id: "m-rot-blocked", checkpoint_id: "cp-rot-a" }],
});
const { eligible: rotationEligible } = qualifyTeams(
  [rotationAgentBlocked, rotationAgentFresh],
  [],
  "day",
);
const rotationReserveAudit = auditReservePriority(
  rotationEligible,
  rotationResult,
  [rotationCheckpointA, rotationCheckpointB],
  "day",
  planningDate,
);
console.log(
  rotationResult.assignments.length === 2 &&
    rotationResult.unassigned.length === 0 &&
    rotationResult.checkpoints.every((c) => c.total_staffed === 1) &&
    !rotationReserveAudit
    ? "PASS: mandatory fill staffs all checkpoints before reserve when rotation defers one agent"
    : "FAIL: compatible team must not stay in reserve while a checkpoint slot is open",
);

console.log("\n=== Rule 7: Night female-only gender fallback ===");
const femaleOnlyNightCheckpoint = cp({
  id: "cp75",
  name: "75",
  female_policy: "preferred",
  allowed_gender: "female",
  posts: [
    post("p75-day", "narcotics", 1, "female", "day"),
    post("p75-night", "narcotics", 1, "female", "night"),
  ],
});
const maleNarcAgent = {
  id: "m-narc",
  first_name: "Night",
  last_name: "Male",
  professional_number: "NM1",
  gender: "male",
  active: true,
  section_id: "sec1",
  dog_id: "d-nm",
  dogs: { id: "d-nm", name: "Rex", specialty: "narcotics", status: "available", active: true },
};
const femaleNarcAgent = {
  id: "f-narc",
  first_name: "Day",
  last_name: "Female",
  professional_number: "FN1",
  gender: "female",
  active: true,
  section_id: "sec1",
  dog_id: "d-fn",
  dogs: { id: "d-fn", name: "Luna", specialty: "narcotics", status: "available", active: true },
};

const nightFallbackResult = runPlanningEngine({
  sectionId: "sec1",
  agents: [maleNarcAgent],
  exclusions: [],
  checkpoints: [femaleOnlyNightCheckpoint],
  shift: "night",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const nightAssign = nightFallbackResult.assignments.find((a) => a.agent_id === "m-narc");
console.log(
  nightAssign?.checkpoint_id === "cp75" && nightFallbackResult.checkpoints[0]?.total_staffed === 1
    ? "PASS: night planning assigns male to female-only checkpoint when no female is eligible"
    : "FAIL: night female-only fallback did not staff checkpoint",
);

const dayFemaleResult = runPlanningEngine({
  sectionId: "sec1",
  agents: [maleNarcAgent, femaleNarcAgent],
  exclusions: [],
  checkpoints: [femaleOnlyNightCheckpoint],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const dayAssign = dayFemaleResult.assignments.find((a) => a.checkpoint_post_id === "p75-day");
console.log(
  dayAssign?.agent_id === "f-narc" && !dayFemaleResult.assignments.some((a) => a.agent_id === "m-narc")
    ? "PASS: day planning keeps female-only restriction"
    : "FAIL: day planning must not assign male to female-only checkpoint",
);

const { eligible: nightFallbackEligible } = qualifyTeams([maleNarcAgent], [], "night");
console.log(
  !shouldApplyNightFemaleFallback("female", "day", nightFallbackEligible, new Set(), "narcotics")
    ? "PASS: night fallback never applies during day planning"
    : "FAIL: night fallback must not apply during day planning",
);
console.log(
  shouldApplyNightFemaleFallback("female", "night", nightFallbackEligible, new Set(), "narcotics") &&
    !hasAvailableFemaleForSpecialty(nightFallbackEligible, new Set(), "narcotics")
    ? "PASS: night fallback only after confirming no available female handler"
    : "FAIL: night fallback gate must require absent female handlers",
);

const maleOnlyNightCheckpoint = cp({
  id: "cp20",
  name: "20",
  female_policy: "not_allowed",
  allowed_gender: "male",
  posts: [post("p20", "narcotics", 1, "male", "night")],
});
const maleNarcAgent2 = {
  ...maleNarcAgent,
  id: "m-narc-2",
  professional_number: "NM2",
  dog_id: "d-nm2",
  dogs: { id: "d-nm2", name: "Max", specialty: "narcotics", status: "available", active: true },
};
const nightPriorityResult = runPlanningEngine({
  sectionId: "sec1",
  agents: [maleNarcAgent, maleNarcAgent2],
  exclusions: [],
  checkpoints: [maleOnlyNightCheckpoint, femaleOnlyNightCheckpoint],
  shift: "night",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
console.log(
  nightPriorityResult.assignments.length === 2 &&
    nightPriorityResult.unassigned.length === 0 &&
    nightPriorityResult.checkpoints.every((c) => c.total_staffed === 1)
    ? "PASS: night fills male-only first, then female-only via fallback, before reserve"
    : "FAIL: night checkpoint priority / fallback ordering",
);

console.log("\n=== Rule 8: No shift enabled ===");
const closedCheckpoint = cp({
  id: "cp-closed",
  name: "Closed",
  day_shift_enabled: false,
  night_shift_enabled: false,
  posts: [post("p-closed", "narcotics", 1, "all", "day")],
});
console.log(
  filterCheckpointsForPlanning([closedCheckpoint], "day", planningDate).length === 0 &&
    filterCheckpointsForPlanning([closedCheckpoint], "night", planningDate).length === 0
    ? "PASS: checkpoint with no enabled shift never appears in planning"
    : "FAIL: disabled shifts should exclude checkpoint",
);

console.log("\n=== Rule 9: Operational config enforced before assignment ===");
const dayDisabledCheckpoint = cp({
  id: "cp-day-off",
  name: "Day Off",
  day_shift_enabled: false,
  night_shift_enabled: true,
  posts: [
    post("p-day-off", "narcotics", 1, "all", "day"),
    post("p-night-on", "narcotics", 1, "all", "night"),
  ],
});
const sundayClosedCheckpoint = cp({
  id: "cp-sunday-off",
  name: "Sunday Off",
  operating_days: [1, 2, 3, 4, 5, 6],
  posts: [post("p-sun-off", "narcotics", 1, "all", "day")],
});
console.log(
  !isCheckpointOperationalForPlanning(dayDisabledCheckpoint, "day", planningDate) &&
    isCheckpointOperationalForPlanning(dayDisabledCheckpoint, "night", planningDate) &&
    !isCheckpointOperationalForPlanning(sundayClosedCheckpoint, "day", sunday)
    ? "PASS: checkpoint config gates weekday and shift before planning"
    : "FAIL: operational config gate",
);
const dayOffResult = runPlanningEngine({
  sectionId: "sec1",
  agents,
  exclusions: [],
  checkpoints: [dayDisabledCheckpoint],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const dayOffWarnings = auditOperationalViolations(
  dayOffResult,
  [dayDisabledCheckpoint],
  "day",
  planningDate,
  new Map(agents.map((a) => [a.id, a.gender])),
);
console.log(
  dayOffResult.checkpoints.length === 0 &&
    dayOffResult.assignments.length === 0 &&
    !dayOffWarnings.some((w) => w.includes("day is disabled"))
    ? "PASS: day-disabled checkpoint never appears in day planning"
    : "FAIL: closed day shift checkpoint leaked into planning",
);

console.log("\n=== Rule 10: Point 653 headquarters reserve ===");
const sickDogAgent = {
  id: "m-sick-dog",
  first_name: "Sick",
  last_name: "Dog",
  professional_number: "SD1",
  gender: "male",
  active: true,
  section_id: "sec1",
  dog_id: "d-sick",
  dogs: { id: "d-sick", name: "Rex", specialty: "narcotics", status: "available", active: true },
};
const point653Result = runPlanningEngine({
  sectionId: "sec1",
  agents: [sickDogAgent],
  exclusions: [{ agent_id: "m-sick-dog", dog_id: "d-sick", exclusion_type: "dog_sick" }],
  checkpoints: [checkpoints[0]],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const sickDogPoint653 = point653Result.point653.find((e) => e.agent_id === "m-sick-dog");
console.log(
  point653Result.assignments.length === 0 &&
    sickDogPoint653?.reason === "dog_sick" &&
    point653Result.point653.length === 1
    ? "PASS: sick-dog cynotechnicien assigned to Point 653 after operational pass"
    : "FAIL: Point 653 must receive cynotechnicien with sick dog",
);
console.log(
  !auditReservePriority(point653Result.eligible, point653Result, [checkpoints[0]], "day", planningDate)
    ? "PASS: Point 653 only after operational checkpoints processed"
    : "FAIL: Point 653 assigned while compatible checkpoint slot open",
);

console.log("\n=== Rule 11: Exclusion validation diagnostics ===");
const heatDogAgent = {
  id: "m-heat-dog",
  first_name: "Heat",
  last_name: "Dog",
  professional_number: "HD1",
  gender: "male",
  active: true,
  section_id: "sec1",
  dog_id: "d-heat",
  dogs: { id: "d-heat", name: "Luna", specialty: "explosives", status: "available", active: true },
};
const heatDogResult = runPlanningEngine({
  sectionId: "sec1",
  agents: [heatDogAgent],
  exclusions: [{ agent_id: "m-heat-dog", dog_id: "d-heat", exclusion_type: "female_dog_heat" }],
  checkpoints: [checkpoints[0]],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
const heatOnCheckpoint = heatDogResult.assignments.some((a) => a.agent_id === "m-heat-dog");
const heatViolations = auditExclusionViolations([], [], heatDogResult);
console.log(
  !heatOnCheckpoint &&
    heatDogResult.point653.some((e) => e.agent_id === "m-heat-dog" && e.reason === "dog_in_heat")
    ? "PASS: dog in heat routed to Point 653, not operational checkpoint"
    : "FAIL: dog in heat must not be assigned to operational checkpoint",
);
const noDogAgent = {
  id: "m-no-dog",
  first_name: "No",
  last_name: "Dog",
  professional_number: "ND1",
  gender: "male",
  active: true,
  section_id: "sec1",
  dog_id: null,
  dogs: null,
};
const noDogResult = runPlanningEngine({
  sectionId: "sec1",
  agents: [noDogAgent],
  exclusions: [],
  checkpoints: [checkpoints[0]],
  shift: "day",
  planningDate,
  yesterdayCheckpointByAgent: emptyMap(),
  fairnessCounts: emptyMap(),
  rotationHistory: [],
});
console.log(
  noDogResult.assignments.length === 0 &&
    noDogResult.point653.some((e) => e.agent_id === "m-no-dog" && e.reason === "no_assigned_dog")
    ? "PASS: cynotechnicien without dog assigned to Point 653"
    : "FAIL: no-dog cynotechnicien must go to Point 653",
);
console.log(
  heatViolations.length === 0 && auditExclusionViolations([], [], noDogResult).length === 0
    ? "PASS: valid Point 653 routing produces no exclusion audit errors"
    : "FAIL: exclusion audit reported false positives",
);
