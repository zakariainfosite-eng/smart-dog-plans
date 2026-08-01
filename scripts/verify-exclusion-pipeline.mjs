/**
 * Verifies exclusion loading and categorization for daily planning.
 * Run: npx vite-node scripts/verify-exclusion-pipeline.mjs
 */
import {
  buildPlanningExclusionReport,
  isExclusionInDateRange,
  toPlanningExclusionInputs,
} from "../src/lib/agent-exclusions.ts";
import { runPlanningEngine, qualifyTeams } from "../src/lib/planning/engine.ts";

const planningDate = "2026-07-24";
const sectionAgentIds = new Set(["a1", "a2", "a3"]);

const records = [
  {
    agent_id: "a1",
    exclusion_type: "training",
    start_date: "2026-07-24",
    end_date: "2026-07-24",
    active: true,
  },
  {
    agent_id: "a2",
    exclusion_type: "sickness",
    start_date: "2026-07-24",
    end_date: "2026-07-30",
    active: true,
  },
  {
    agent_id: "a3",
    exclusion_type: "dog_sick",
    start_date: "2026-07-24",
    end_date: "2026-07-24",
    active: true,
  },
  {
    agent_id: "a9",
    exclusion_type: "training",
    start_date: "2026-07-24",
    end_date: "2026-07-24",
    active: true,
  },
];

console.log("=== Date range (ISO string) ===");
console.log(
  isExclusionInDateRange(records[0], planningDate)
    ? "PASS: same-day exclusion active"
    : "FAIL: same-day exclusion inactive",
);

const report = buildPlanningExclusionReport(records, planningDate, sectionAgentIds);
console.log(
  report.inputs.length === 3 && report.agentExclusions.length === 2 && report.dogExclusions.length === 1
    ? "PASS: exclusion report categorizes agent vs dog vs out-of-section"
    : "FAIL: exclusion report miscategorized rows",
);
console.log(
  report.ignored.some((entry) => entry.agent_id === "a9")
    ? "PASS: other-section exclusion ignored with reason"
    : "FAIL: other-section exclusion not reported",
);

const agents = [
  {
    id: "a1",
    first_name: "Train",
    last_name: "One",
    professional_number: "T1",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "d1",
    dogs: { id: "d1", name: "Rex", specialty: "narcotics", status: "available", active: true },
  },
  {
    id: "a2",
    first_name: "Sick",
    last_name: "Two",
    professional_number: "S1",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "d2",
    dogs: { id: "d2", name: "Max", specialty: "explosives", status: "available", active: true },
  },
  {
    id: "a3",
    first_name: "Dog",
    last_name: "Sick",
    professional_number: "D1",
    gender: "male",
    active: true,
    section_id: "sec1",
    dog_id: "d3",
    dogs: { id: "d3", name: "Bolt", specialty: "narcotics", status: "available", active: true },
  },
];

const inputs = toPlanningExclusionInputs(records, planningDate).filter((entry) =>
  sectionAgentIds.has(entry.agent_id),
);
const engineResult = runPlanningEngine({
  sectionId: "sec1",
  agents,
  exclusions: inputs,
  exclusionDebug: report,
  checkpoints: [],
  shift: "day",
  planningDate: new Date(`${planningDate}T12:00:00`),
  rotationHistory: [],
  yesterdayCheckpointByAgent: new Map(),
  fairnessCounts: new Map(),
});

console.log(
  engineResult.summary.agentExclusionCount === 2
    ? "PASS: agent exclusion counter matches Formation/Sick records"
    : `FAIL: expected agentExclusionCount=2 got ${engineResult.summary.agentExclusionCount}`,
);
console.log(
  engineResult.point653.some((entry) => entry.agent_id === "a3")
    ? "PASS: dog sick exclusion routed to Point 653"
    : "FAIL: dog sick not at Point 653",
);
console.log(
  !engineResult.point653.some((entry) => ["a1", "a2"].includes(entry.agent_id))
    ? "PASS: agent exclusions never sent to Point 653"
    : "FAIL: agent exclusion leaked to Point 653",
);

const { excluded: qualifiedExcluded } = qualifyTeams(agents, inputs, "day");
console.log(
  qualifiedExcluded.length === 2
    ? "PASS: qualifyTeams marks agent exclusions as excluded"
    : `FAIL: qualifyTeams excluded count ${qualifiedExcluded.length}`,
);
