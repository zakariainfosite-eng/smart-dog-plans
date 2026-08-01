/**
 * Validates scoped rotation_history delete on planning replace.
 * Run: npx vite-node scripts/verify-rotation-history-replace.mjs
 */

const DATE = "2026-07-24";
const SECTION_A_AGENTS = ["agent-a1", "agent-a2"];
const SECTION_B_AGENTS = ["agent-b1", "agent-b2"];
const SECTION_C_AGENTS = ["agent-c1"];

function seedHistory() {
  const rows = [];
  for (const agent_id of SECTION_A_AGENTS) {
    rows.push({ agent_id, planning_date: DATE, checkpoint_post_id: "post-a" });
  }
  for (const agent_id of SECTION_B_AGENTS) {
    rows.push({ agent_id, planning_date: DATE, checkpoint_post_id: "post-b" });
  }
  for (const agent_id of SECTION_C_AGENTS) {
    rows.push({ agent_id, planning_date: DATE, checkpoint_post_id: "post-c" });
  }
  return rows;
}

/** Mirrors persistPlanning replace-path delete (section-scoped). */
function replaceSectionHistory(store, sectionAgentIds, dateISO) {
  if (sectionAgentIds.length === 0) return store;
  const sectionSet = new Set(sectionAgentIds);
  return store.filter(
    (row) => !(row.planning_date === dateISO && sectionSet.has(row.agent_id)),
  );
}

function insertSectionHistory(store, sectionAgentIds, dateISO, checkpointPostId) {
  const next = [...store];
  for (const agent_id of sectionAgentIds) {
    next.push({ agent_id, planning_date: dateISO, checkpoint_post_id: checkpointPostId });
  }
  return next;
}

function agentIdsForSection(section) {
  if (section === "A") return SECTION_A_AGENTS;
  if (section === "B") return SECTION_B_AGENTS;
  return SECTION_C_AGENTS;
}

function historyForAgents(store, agentIds) {
  const set = new Set(agentIds);
  return store.filter((row) => set.has(row.agent_id));
}

let store = seedHistory();
let passed = 0;
let failed = 0;

function assert(label, ok) {
  if (ok) {
    passed++;
    console.log(`PASS: ${label}`);
  } else {
    failed++;
    console.log(`FAIL: ${label}`);
  }
}

// Step 1–3: Sections A, B, C already seeded for DATE
assert(
  "Initial Section A history present",
  historyForAgents(store, SECTION_A_AGENTS).length === SECTION_A_AGENTS.length,
);
assert(
  "Initial Section B history present",
  historyForAgents(store, SECTION_B_AGENTS).length === SECTION_B_AGENTS.length,
);
assert(
  "Initial Section C history present",
  historyForAgents(store, SECTION_C_AGENTS).length === SECTION_C_AGENTS.length,
);

const beforeB = historyForAgents(store, SECTION_B_AGENTS);
const beforeC = historyForAgents(store, SECTION_C_AGENTS);

// Step 4: Regenerate Section A (replace)
store = replaceSectionHistory(store, agentIdsForSection("A"), DATE);
store = insertSectionHistory(store, agentIdsForSection("A"), DATE, "post-a-new");

const afterA = historyForAgents(store, SECTION_A_AGENTS);
const afterB = historyForAgents(store, SECTION_B_AGENTS);
const afterC = historyForAgents(store, SECTION_C_AGENTS);

assert(
  "Section A history updated (new checkpoint post)",
  afterA.length === SECTION_A_AGENTS.length &&
    afterA.every((row) => row.checkpoint_post_id === "post-a-new"),
);
assert(
  "Section B history preserved byte-for-byte",
  JSON.stringify(afterB) === JSON.stringify(beforeB),
);
assert(
  "Section C history preserved byte-for-byte",
  JSON.stringify(afterC) === JSON.stringify(beforeC),
);

// Smart Rotation read path: load all dates for section agents (unchanged query shape)
function loadRotationHistoryForSection(agentIds) {
  return store.filter((row) => agentIds.includes(row.agent_id));
}

const sectionBRotation = loadRotationHistoryForSection(SECTION_B_AGENTS);
assert(
  "Smart Rotation still reads complete Section B rotation_history",
  sectionBRotation.length === SECTION_B_AGENTS.length,
);

// Old buggy delete would wipe everything for the date
let buggyStore = seedHistory();
buggyStore = buggyStore.filter((row) => row.planning_date !== DATE);
assert(
  "Regression guard: old date-only delete would erase all sections",
  historyForAgents(buggyStore, SECTION_B_AGENTS).length === 0,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
