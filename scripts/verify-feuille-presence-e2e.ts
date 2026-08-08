/**
 * End-to-end verification: validated planning → attendance PDF data.
 * Usage: npx tsx scripts/verify-feuille-presence-e2e.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import {
  buildFeuillePresenceData,
  collectAssignedAgentIds,
  collectFeuillePresenceMetaAgentIds,
  collectPoint653AgentIds,
  formatFeuillePresenceDateLine,
  verifyFeuillePresenceData,
} from "../src/lib/documents/build-feuille-presence-data.ts";
import { FP_POINT_653_ASSIGNMENT } from "../src/lib/documents/feuille-presence-layout.ts";
import { renderFeuillePresencePage } from "../src/lib/documents/feuille-presence-render.ts";
import type { PlanningEngineResult } from "../src/lib/planning/engine.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const logoPath = join(root, "public/assets/police-cynotechnique-logo.png");
const outPath = join(root, "public/previews/feuille-presence-populated-preview.pdf");

const team = (
  id: string,
  first: string,
  last: string,
  mle: string,
  dog: string,
  specialty: "narcotics" | "explosives",
) => ({
  agent_id: id,
  agent_name: `${last} ${first}`,
  professional_number: mle,
  dog_id: `d-${id}`,
  dog_name: dog,
  specialty,
  gender: "male" as const,
  agent_only: false,
});

const agents = [
  {
    id: "n1",
    first_name: "Youssef",
    last_name: "BENALI",
    professional_number: "2001",
    grade: "GARDIEN",
    is_section_chief: false,
    dog_name: "REX",
    dog_specialty: "narcotics" as const,
  },
  {
    id: "n2",
    first_name: "Karim",
    last_name: "IDRISSI",
    professional_number: "2002",
    grade: "GARDIEN",
    is_section_chief: false,
    dog_name: "MAX",
    dog_specialty: "narcotics" as const,
  },
  {
    id: "e1",
    first_name: "Omar",
    last_name: "TAZI",
    professional_number: "3001",
    grade: "GARDIEN",
    is_section_chief: false,
    dog_name: "ROCKY",
    dog_specialty: "explosives" as const,
  },
  {
    id: "aide",
    first_name: "Fatima",
    last_name: "CHAOUI",
    professional_number: "4001",
    grade: "GARDIEN",
    is_section_chief: false,
    dog_name: "LUNA",
    dog_specialty: "narcotics" as const,
  },
  {
    id: "ex1",
    first_name: "Said",
    last_name: "HADDOU",
    professional_number: "5001",
    grade: "GARDIEN",
    is_section_chief: false,
    dog_name: "BRUNO",
    dog_specialty: "narcotics" as const,
  },
];

const engineResult: PlanningEngineResult = {
  eligible: [],
  excluded: [],
  agentExclusions: [
    { agent_id: "ex1", agent_name: "HADDOU Said", reason: "Sick" },
  ],
  unassigned: [],
  point653: [
    {
      ...team("aide", "Fatima", "CHAOUI", "4001", "LUNA", "narcotics"),
      reason: "dog_sick",
    },
  ],
  offDuty: [],
  assignments: [
    { agent_id: "n1", dog_id: "d-n1", checkpoint_id: "cp1", checkpoint_post_id: "p1" },
    { agent_id: "n2", dog_id: "d-n2", checkpoint_id: "cp2", checkpoint_post_id: "p2" },
    { agent_id: "e1", dog_id: "d-e1", checkpoint_id: "cp3", checkpoint_post_id: "p3" },
  ],
  checkpoints: [
    {
      checkpoint_id: "cp1",
      checkpoint_name: "PORT TANGER MED",
      night_only: false,
      posts: [],
      total_required: 1,
      total_staffed: 1,
      is_understaffed: false,
      slots: [
        {
          post_id: "p1",
          specialty_required: "narcotics",
          team: team("n1", "Youssef", "BENALI", "2001", "REX", "narcotics"),
        },
      ],
    },
    {
      checkpoint_id: "cp2",
      checkpoint_name: "GARE TGV",
      night_only: false,
      posts: [],
      total_required: 1,
      total_staffed: 1,
      is_understaffed: false,
      slots: [
        {
          post_id: "p2",
          specialty_required: "narcotics",
          team: team("n2", "Karim", "IDRISSI", "2002", "MAX", "narcotics"),
        },
      ],
    },
    {
      checkpoint_id: "cp3",
      checkpoint_name: "AEROPORT",
      night_only: false,
      posts: [],
      total_required: 1,
      total_staffed: 1,
      is_understaffed: false,
      slots: [
        {
          post_id: "p3",
          specialty_required: "explosives",
          team: team("e1", "Omar", "TAZI", "3001", "ROCKY", "explosives"),
        },
      ],
    },
  ],
  summary: {
    totalEmployees: 5,
    assignedEmployees: 4,
    assignedToCheckpoints: 3,
    point653Employees: 1,
    restEmployees: 0,
    unassignedEmployees: 0,
    fullyStaffedCheckpoints: 3,
    understaffedCheckpoints: 0,
    agentExclusionCount: 1,
    warnings: [],
  },
};

const input = {
  planningDate: new Date(2026, 6, 24),
  shift: "day" as const,
  sectionName: "Section Alpha",
  sectionIndex: 0,
  sectionCommander: {
    fullName: "ALAMI Hassan",
    grade: "BRIGADIER",
    mle: "9001",
  },
  agents,
  exclusionTypesByAgent: { ex1: "sickness" },
  engineResult,
};

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const buildResult = buildFeuillePresenceData(input);
assert(buildResult.ok, `Build failed: ${!buildResult.ok ? buildResult.errors.join("; ") : ""}`);

const data = buildResult.data;
assert(data.narcoticsRows.length === 4, `Expected 4 narcotics rows, got ${data.narcoticsRows.length}`);
assert(data.explosivesRows.length === 1, `Expected 1 explosives row, got ${data.explosivesRows.length}`);
assert(data.narcoticsRows[0].assignment === "PORT TANGER MED", "Operational first");
assert(data.narcoticsRows[2].assignment === FP_POINT_653_ASSIGNMENT, "Point 653 third");
assert(data.narcoticsRows[3].assignment === "Maladie", "Excluded last with real DB motif");
assert(data.narcoticsRows[3].hour === "*****", "Non-op HEURE must show *****");
assert(data.narcoticsRows[3].signature === "*****", "Non-op EMARGEMENT must show *****");
assert(data.narcoticsRows[0].hour === "", "Operational HEURE stays blank");
assert(data.narcoticsRows[0].signature === "", "Operational EMARGEMENT stays blank");
assert(data.chefName === "ALAMI Hassan", "Section commander name from section record");
assert(data.chefGrade === "BRIGADIER", "Section commander grade from section record");
assert(data.chefMle === "9001", "Section commander MLE from section record");
assert(!data.chefNeedsReplacement, "Commander without exclusion keeps printed identity");

const manualFillCommanderResult = buildFeuillePresenceData({
  ...input,
  sectionCommander: {
    fullName: "",
    grade: "",
    mle: "",
    needsManualFill: true,
  },
});
assert(manualFillCommanderResult.ok, "Build with manual-fill chief must succeed");
if (manualFillCommanderResult.ok) {
  assert(manualFillCommanderResult.data.chefNeedsReplacement === true, "Manual-fill chief uses blank block");
  assert(manualFillCommanderResult.data.chefName === "", "Manual-fill clears name");
  assert(manualFillCommanderResult.data.chefGrade === "", "Manual-fill clears grade");
  assert(manualFillCommanderResult.data.chefMle === "", "Manual-fill clears MLE");
}

const adjointReplacementResult = buildFeuillePresenceData({
  ...input,
  sectionCommander: {
    fullName: "BENALI Karim",
    grade: "BRIGADIER-CHEF",
    mle: "9100",
    needsManualFill: false,
    mode: "adjoint_replacement",
  },
});
assert(adjointReplacementResult.ok, "Build with adjoint replacement must succeed");
if (adjointReplacementResult.ok) {
  assert(!adjointReplacementResult.data.chefNeedsReplacement, "Available adjoint prints normally");
  assert(adjointReplacementResult.data.chefMode === "adjoint_replacement", "Adjoint replacement title mode");
  assert(adjointReplacementResult.data.chefName === "BENALI Karim", "Adjoint name printed");
  assert(adjointReplacementResult.data.chefGrade === "BRIGADIER-CHEF", "Adjoint grade printed");
  assert(adjointReplacementResult.data.chefMle === "9100", "Adjoint MLE printed");
}

assert(
  formatFeuillePresenceDateLine(new Date(2026, 7, 26), "day") === "TANGER LE 26 / 08 / 2026",
  "Day shift keeps single date",
);
assert(
  formatFeuillePresenceDateLine(new Date(2026, 7, 26), "night") === "TANGER LE 26-27/08/2026",
  "Night shift same month spans two days",
);
assert(
  formatFeuillePresenceDateLine(new Date(2026, 7, 31), "night") === "TANGER LE 31/08 - 01/09/2026",
  "Night shift cross-month spans calendar boundary",
);

// Agent without dog displays ***
const noDogEngine: PlanningEngineResult = {
  ...engineResult,
  point653: [
    {
      ...team("nodog", "Agent", "SANSCHIEN", "6001", "", "narcotics"),
      dog_name: null,
      reason: "no_operational_assignment",
    },
  ],
};
const noDogAgents = [
  ...agents,
  {
    id: "nodog",
    first_name: "Agent",
    last_name: "SANSCHIEN",
    professional_number: "6001",
    grade: "GARDIEN",
    is_section_chief: false,
    dog_name: null,
    dog_specialty: "narcotics" as const,
  },
];
const noDogBuild = buildFeuillePresenceData({
  ...input,
  agents: noDogAgents,
  engineResult: noDogEngine,
});
assert(noDogBuild.ok, "No-dog planning must build");
const point653Row = noDogBuild.data.narcoticsRows.find((r) => r.fullName === "SANSCHIEN AGENT");
assert(point653Row?.dogName === "***", "Missing dog must display ***");
assert(data.narcoticsRows[0].hour === "", "HEURE empty for operational");

const verifyIssues = verifyFeuillePresenceData(input, data);
assert(verifyIssues.length === 0, `Verification issues: ${verifyIssues.join("; ")}`);

// Under-staffed checkpoint: PDF still generates with assigned agents only
const understaffedEngine: PlanningEngineResult = {
  ...engineResult,
  assignments: engineResult.assignments.filter((a) => a.agent_id !== "n2"),
  checkpoints: engineResult.checkpoints.map((cp) =>
    cp.checkpoint_id === "cp2"
      ? {
          ...cp,
          total_staffed: 0,
          is_understaffed: true,
          slots: cp.slots.map((slot) => ({ ...slot, team: null })),
        }
      : cp,
  ),
};
const understaffedBuild = buildFeuillePresenceData({ ...input, engineResult: understaffedEngine });
assert(understaffedBuild.ok, "Under-staffed planning must still build PDF data");
assert(
  understaffedBuild.data.narcoticsRows.length === 3,
  "Should include operational + Point 653 + excluded, minus unassigned n2",
);

assert(collectFeuillePresenceMetaAgentIds(engineResult).length === 5, "Expected 5 planning agents");
assert(collectAssignedAgentIds(engineResult).length === 3, "Expected 3 checkpoint assignments");
assert(collectPoint653AgentIds(engineResult).length === 1, "Expected 1 Point 653 agent");

const logoBytes = new Uint8Array(readFileSync(logoPath));
const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
renderFeuillePresencePage(doc, 2026, { header: logoBytes }, data);
writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));

// DAY: reserved female presence lines appended; NIGHT: omitted entirely.
const femaleAgents = [
  {
    id: "f-narco",
    first_name: "Sara",
    last_name: "FemmeNarc",
    professional_number: "8001",
    grade: "GARDIEN",
    is_section_chief: false,
    dog_name: "Luna",
    dog_specialty: "narcotics" as const,
  },
  {
    id: "f-explo",
    first_name: "Nadia",
    last_name: "FemmeExplo",
    professional_number: "8002",
    grade: "GARDIEN",
    is_section_chief: false,
    dog_name: "Iris",
    dog_specialty: "explosives" as const,
  },
];
const dayWithFemales = buildFeuillePresenceData({ ...input, shift: "day", femaleAgents });
assert(dayWithFemales.ok, "Day + females must build");
assert(
  dayWithFemales.data.narcoticsRows.some((r) => r.fullName === "FEMMENARC SARA" && r.presenceOnly),
  "Day sheet must include reserved Stupéfiants female line",
);
assert(
  dayWithFemales.data.explosivesRows.some((r) => r.fullName === "FEMMEEXPLO NADIA" && r.presenceOnly),
  "Day sheet must include reserved Explosifs female line",
);
const nightWithFemales = buildFeuillePresenceData({ ...input, shift: "night", femaleAgents });
assert(nightWithFemales.ok, "Night + females must build");
assert(
  !nightWithFemales.data.narcoticsRows.some((r) => r.presenceOnly),
  "Night sheet must omit reserved female lines (narcotics)",
);
assert(
  !nightWithFemales.data.explosivesRows.some((r) => r.presenceOnly),
  "Night sheet must omit reserved female lines (explosives)",
);
assert(
  !nightWithFemales.data.narcoticsRows.some((r) => r.fullName.includes("FEMMENARC")),
  "Night sheet must not list female placeholders",
);
assert(
  nightWithFemales.data.narcoticsRows.length === data.narcoticsRows.length &&
    nightWithFemales.data.explosivesRows.length === data.explosivesRows.length,
  "Night sheet must list only shift-assigned personnel",
);

console.log("✓ buildFeuillePresenceData OK");
console.log(`✓ narcotics: ${data.narcoticsRows.length}, explosives: ${data.explosivesRows.length}`);
console.log("✓ day reserved female lines present; night reserved female lines omitted");
console.log(`✓ verifyFeuillePresenceData OK (${verifyIssues.length} issues)`);
console.log(`✓ populated PDF: ${outPath}`);
console.log("All feuille de présence e2e checks passed.");
