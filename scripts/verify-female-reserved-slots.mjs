/**
 * Rotation Engine V2 — day female reserved slots.
 * Run: npx --yes tsx scripts/verify-female-reserved-slots.mjs
 */
import {
  runPlanningEngine,
  FEMALE_SLOT_RESERVATION_CODE,
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

const post = (id, specialty, gender = "all") => ({
  id,
  shift: "day",
  specialty_required: specialty,
  required_agents: 1,
  active: true,
  allowed_gender: gender,
  dog_required: true,
});

function checkpoint(id, name, priority, specialty, female_policy = "allowed") {
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
    posts: [post(`p-${id}`, specialty)],
  };
}

function male(id, specialty = "narcotics") {
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

console.log("=== DAY: reserve one narcotics + one explosives ===");
{
  const agents = [
    male("m1", "narcotics"),
    male("m2", "explosives"),
    male("m3", "narcotics"),
    male("m4", "explosives"),
  ];
  const checkpoints = [
    checkpoint("cp1", "P1", 1, "narcotics"),
    checkpoint("cp2", "P2", 2, "explosives"),
    checkpoint("cp3", "P3", 3, "narcotics"),
    checkpoint("cp4", "P4", 4, "explosives"),
  ];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 3, 1),
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
  assert(reserved.length === 2, "exactly 2 reserved slots");
  assert(
    reserved.some((s) => s.specialty_required === "narcotics"),
    "one Stupéfiants reserved",
  );
  assert(
    reserved.some((s) => s.specialty_required === "explosives"),
    "one Explosifs reserved",
  );
  assert(
    reserved.every((s) => s.team === null),
    "reserved slots left empty (no male assignment)",
  );
  assert(
    result.structuredWarnings.filter((w) => w.code === FEMALE_SLOT_RESERVATION_CODE)
      .length === 2,
    "two RESERVED_FOR_FEMALE_ASSIGNMENT warnings",
  );
  assert(
    !result.structuredWarnings.some(
      (w) =>
        w.code === "NO_ELIGIBLE_AGENT" &&
        reserved.some((s) => s.post_id === w.post_id),
    ),
    "reserved slots not flagged NO_ELIGIBLE_AGENT",
  );
  // Lower priority preferred for reservation (P3 narcotics, P4 explosives).
  assert(
    result.checkpoints.find((c) => c.checkpoint_id === "cp3")?.slots.some(
      (s) => s.reservation === FEMALE_SLOT_RESERVATION_CODE,
    ),
    "narcotics reserved on lower-priority CP",
  );
  assert(
    result.checkpoints.find((c) => c.checkpoint_id === "cp4")?.slots.some(
      (s) => s.reservation === FEMALE_SLOT_RESERVATION_CODE,
    ),
    "explosives reserved on lower-priority CP",
  );
  assert(
    result.checkpoints.find((c) => c.checkpoint_id === "cp3")?.is_understaffed === false,
    "reserved-only gap is not understaffed",
  );
  assert(
    result.checkpoints.find((c) => c.checkpoint_id === "cp1")?.total_staffed === 1,
    "P1 still filled by male",
  );
}

console.log("\n=== NIGHT: no female reservations ===");
{
  const agents = [male("m1", "narcotics"), male("m2", "explosives")];
  const checkpoints = [
    checkpoint("cp1", "P1", 1, "narcotics"),
    checkpoint("cp2", "P2", 2, "explosives"),
  ];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "night",
    planningDate: new Date(2026, 3, 1),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  assert(
    result.checkpoints.every((c) =>
      c.slots.every((s) => s.reservation !== FEMALE_SLOT_RESERVATION_CODE),
    ),
    "night has no RESERVED_FOR_FEMALE_ASSIGNMENT slots",
  );
  assert(
    !result.structuredWarnings.some((w) => w.code === FEMALE_SLOT_RESERVATION_CODE),
    "night has no reservation warnings",
  );
}

console.log("\n=== Male never assigned to reserved slot ===");
{
  const agents = [male("solo", "narcotics")];
  const checkpoints = [checkpoint("cp1", "Only", 3, "narcotics")];
  const result = runPlanningEngine({
    sectionId: "sec1",
    shift: "day",
    planningDate: new Date(2026, 3, 2),
    agents,
    exclusions: [],
    checkpoints,
    rotationHistory: [],
    yesterdayCheckpointByAgent: new Map(),
    fairnessCounts: new Map(),
  });
  const slot = result.checkpoints[0]?.slots[0];
  assert(slot?.reservation === FEMALE_SLOT_RESERVATION_CODE, "sole narcotics slot reserved");
  assert(slot?.team === null, "male not placed on reserved slot");
  assert(result.assignments.length === 0, "no male assignment when only reserved demand");
  assert(result.summary.understaffedCheckpoints === 0, "not counted understaffed");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll female reserved slot checks passed.");
