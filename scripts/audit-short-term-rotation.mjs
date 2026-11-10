/**
 * FIX 04 — Short-term checkpoint rotation audit (read-only).
 * Run: npx --yes tsx scripts/audit-short-term-rotation.mjs
 */
import { addDays, format } from "date-fns";
import {
  buildAgentVisitedCheckpoints,
  buildCompatibleCheckpointsByAgent,
  canAssignBySmartRotation,
  qualifyTeams,
  runPlanningEngine,
  visitedCoversCompatible,
} from "../src/lib/planning/engine.ts";

const SECTION = "sec-rot-audit";

function male(id, n, spec) {
  return {
    id,
    first_name: "M",
    last_name: id,
    professional_number: n,
    gender: "male",
    active: true,
    section_id: SECTION,
    dog_id: `dog-${id}`,
    dogs: {
      id: `dog-${id}`,
      name: id,
      specialty: spec,
      status: "available",
      active: true,
    },
  };
}

function post(id, spec, shift = "day") {
  return {
    id,
    shift,
    specialty_required: spec,
    required_agents: 1,
    active: true,
    allowed_gender: "all",
    dog_required: true,
  };
}

function cp(
  id,
  name,
  priority,
  spec,
  operating_days = [1, 2, 3, 4, 5, 6, 7],
) {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: "allowed",
    priority,
    operating_days,
    day_shift_enabled: true,
    night_shift_enabled: true,
    posts: [post(`post-${id}`, spec)],
  };
}

function cloneVisited(map) {
  return new Map([...map.entries()].map(([k, v]) => [k, new Set(v)]));
}

function cycleLabel(agentId, visited, compatible) {
  const v = visited.get(agentId) ?? new Set();
  const c = compatible.get(agentId) ?? new Set();
  const sorted = [...v].sort();
  const complete = visitedCoversCompatible(v, c);
  return { visited: sorted, complete, pending: [...c].filter((id) => !v.has(id)).sort() };
}

/**
 * Classify today's assignment for one tracked agent.
 */
function classifyRepeat(ctx) {
  const {
    agentId,
    checkpointId,
    visitedBefore,
    compatibleToday,
    openCompatibleUnvisited,
    requireStrict,
    wasRescue,
  } = ctx;

  const wasVisited = visitedBefore.has(checkpointId);
  const cycleComplete = visitedCoversCompatible(visitedBefore, compatibleToday);

  if (!wasVisited) {
    return { repeat: false, legitimacy: "first-visit-in-cycle" };
  }

  if (cycleComplete) {
    return { repeat: true, legitimacy: "cycle-complete-reset" };
  }

  if (wasRescue) {
    if (openCompatibleUnvisited.length > 0) {
      return { repeat: true, legitimacy: "suspicious-rescue-revisit" };
    }
    return { repeat: true, legitimacy: "rescue-no-unvisited-open" };
  }

  if (openCompatibleUnvisited.length > 0) {
    return { repeat: true, legitimacy: "SUSPICIOUS-STRICT-REPEAT" };
  }

  return { repeat: true, legitimacy: "no-unvisited-open-slots" };
}

function openUnvisitedSlots(pendingResult, agentId, compatible, visited) {
  const open = [];
  for (const c of pendingResult.checkpoints) {
    if (!compatible.has(c.checkpoint_id)) continue;
    for (const slot of c.slots) {
      if (slot.team) continue;
      if (visited.has(c.checkpoint_id)) continue;
      open.push(c.checkpoint_id);
    }
  }
  return [...new Set(open)];
}

function simulate({
  name,
  days,
  startDate,
  agents,
  checkpoints,
  exclusionsByDay = () => [],
  trackAgentId,
}) {
  let rotationHistory = [];
  const yesterdayCheckpointByAgent = new Map();
  const fairnessCounts = new Map();
  const rows = [];
  let suspicious = 0;
  let legitimateRepeat = 0;
  let cycleResets = 0;
  let earliestRepeat = null;

  for (let d = 0; d < days; d += 1) {
    const planningDate = addDays(startDate, d);
    const planningISO = format(planningDate, "yyyy-MM-dd");

    const { eligible } = qualifyTeams(agents, exclusionsByDay(d), "day");
    const compatibleToday = buildCompatibleCheckpointsByAgent(
      eligible,
      checkpoints,
      "day",
      planningDate,
      false,
    );
    const visitedBefore = buildAgentVisitedCheckpoints(
      rotationHistory,
      compatibleToday,
    );

    const before = cycleLabel(trackAgentId, visitedBefore, compatibleToday);

    const result = runPlanningEngine({
      sectionId: SECTION,
      shift: "day",
      planningDate,
      agents,
      exclusions: exclusionsByDay(d),
      checkpoints,
      rotationHistory,
      yesterdayCheckpointByAgent: new Map(yesterdayCheckpointByAgent),
      fairnessCounts: new Map(fairnessCounts),
      femaleAgentsForReservation: [],
    });

    const assignment = result.assignments.find((a) => a.agent_id === trackAgentId);
    const rescue = result.structuredWarnings.some(
      (w) =>
        w.code === "ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE" &&
        assignment &&
        w.checkpoint_id === assignment.checkpoint_id,
    );

    const compat = compatibleToday.get(trackAgentId) ?? new Set();
    const visited = visitedBefore.get(trackAgentId) ?? new Set();
    const openAlt = assignment
      ? openUnvisitedSlots(result, trackAgentId, compat, visited)
      : [];

    const priority = checkpoints.find((c) => c.id === assignment?.checkpoint_id)?.priority;

    let classification = { repeat: false, legitimacy: "rest-or-unassigned" };
    if (assignment) {
      classification = classifyRepeat({
        agentId: trackAgentId,
        checkpointId: assignment.checkpoint_id,
        visitedBefore: visited,
        compatibleToday: compat,
        openCompatibleUnvisited: openAlt,
        wasRescue: rescue,
      });
    }

    if (classification.legitimacy === "cycle-complete-reset") cycleResets += 1;
    if (classification.repeat) {
      if (classification.legitimacy === "SUSPICIOUS-STRICT-REPEAT" ||
          classification.legitimacy === "suspicious-rescue-revisit") {
        suspicious += 1;
        if (earliestRepeat === null) earliestRepeat = d + 1;
      } else {
        legitimateRepeat += 1;
      }
    }

    const strictOk = assignment
      ? canAssignBySmartRotation(
          trackAgentId,
          assignment.checkpoint_id,
          compatibleToday,
          visitedBefore,
        )
      : null;

    rows.push({
      day: d + 1,
      date: planningISO,
      agent: trackAgentId,
      checkpoint: assignment?.checkpoint_id ?? "—",
      priority: priority ?? "—",
      cycleBefore: before.visited.join("+") || "∅",
      pendingBefore: before.pending.join("+") || "—",
      repeat: classification.repeat ? "Y" : "N",
      altOpen: openAlt.join("+") || "—",
      reason: classification.legitimacy,
      strictAllowed: strictOk,
      rescue,
    });

    for (const row of result.assignments) {
      rotationHistory.push({
        agent_id: row.agent_id,
        checkpoint_id: row.checkpoint_id,
        planning_date: planningISO,
      });
      const key = `${row.agent_id}:${row.checkpoint_id}`;
      fairnessCounts.set(key, (fairnessCounts.get(key) ?? 0) + 1);
    }

    yesterdayCheckpointByAgent.clear();
    for (const row of result.assignments) {
      yesterdayCheckpointByAgent.set(row.agent_id, row.checkpoint_id);
    }
    for (const row of result.point653) {
      if (row.reason === "no_operational_assignment") {
        yesterdayCheckpointByAgent.delete(row.agent_id);
      }
    }
  }

  const visitedCps = new Set(
    rows.filter((r) => r.checkpoint !== "—").map((r) => r.checkpoint),
  );
  const compatUnion = new Set();
  for (const r of rows) {
    for (const id of (r.pendingBefore === "—" ? [] : r.pendingBefore.split("+"))) {
      if (id) compatUnion.add(id);
    }
  }

  return {
    name,
    rows,
    suspicious,
    legitimateRepeat,
    cycleResets,
    earliestRepeat,
    summary: {
      suspicious,
      legitimateRepeat,
      cycleResets,
      earliestRepeatDistance: earliestRepeat,
      uniqueAssigned: visitedCps.size,
    },
  };
}

function printReport(report) {
  console.log(`\n=== ${report.name} ===\n`);
  console.log(
    "Day | Agent | CP | P | Cycle before | Repeat | Alt open | Reason | StrictOK",
  );
  for (const r of report.rows) {
    console.log(
      [
        String(r.day).padStart(2),
        r.agent,
        r.checkpoint,
        String(r.priority).padStart(2),
        r.cycleBefore,
        r.repeat,
        r.altOpen,
        r.reason,
        r.strictAllowed,
      ].join(" | "),
    );
  }
  console.log("\nSummary:", report.summary);
}

const ahmed = male("ahmed", "114877", "explosives");

// A — four compatible CPs (P2), one agent, 8 days
const scenarioA = simulate({
  name: "Scenario A — 4 compatible checkpoints, 8 days (1 agent)",
  days: 8,
  startDate: new Date(2026, 0, 5),
  agents: [ahmed],
  checkpoints: [
    cp("cp-91", "91", 2, "explosives"),
    cp("cp-20", "20", 2, "explosives"),
    cp("cp-75", "75", 2, "explosives"),
    cp("cp-78", "78", 2, "explosives"),
  ],
  trackAgentId: "ahmed",
});

// B — alternating operating days
const scenarioB = simulate({
  name: "Scenario B — alternating availability (Mon–Thu pattern)",
  days: 8,
  startDate: new Date(2026, 0, 5), // Monday
  agents: [ahmed],
  checkpoints: [
    cp("cp-91", "91", 2, "explosives", [1, 4]), // Mon, Thu
    cp("cp-20", "20", 2, "explosives", [1, 4]),
    cp("cp-75", "75", 2, "explosives", [2]), // Tue
    cp("cp-78", "78", 2, "explosives", [3]), // Wed
  ],
  trackAgentId: "ahmed",
});

// C — mixed priorities, one agent
const scenarioC = simulate({
  name: "Scenario C — P1–P4 priorities (legitimate priority repeats)",
  days: 10,
  startDate: new Date(2026, 1, 2),
  agents: [ahmed],
  checkpoints: [
    cp("cp-p1", "91", 1, "explosives"),
    cp("cp-p2", "20", 2, "explosives"),
    cp("cp-p3", "75", 3, "explosives"),
    cp("cp-p4", "78", 4, "explosives"),
  ],
  trackAgentId: "ahmed",
});

// D — 3 agents, 4 CPs, 14 days
const scenarioD = (() => {
  const agents = [
    male("a1", "101", "explosives"),
    male("a2", "102", "explosives"),
    male("a3", "103", "explosives"),
  ];
  const checkpoints = [
    cp("cp-91", "91", 2, "explosives"),
    cp("cp-20", "20", 2, "explosives"),
    cp("cp-75", "75", 2, "explosives"),
    cp("cp-78", "78", 2, "explosives"),
  ];
  const reports = agents.map((a) =>
    simulate({
      name: `Scenario D — agent ${a.id}`,
      days: 14,
      startDate: new Date(2026, 0, 5),
      agents,
      checkpoints,
      trackAgentId: a.id,
    }),
  );
  return {
    name: "Scenario D — 3 agents × 14 days",
    agents: reports,
    summary: {
      suspicious: reports.reduce((n, r) => n + r.summary.suspicious, 0),
      legitimateRepeat: reports.reduce((n, r) => n + r.summary.legitimateRepeat, 0),
    },
  };
})();

// E — exclusion days 4–6
const scenarioE = simulate({
  name: "Scenario E — exclusion interruption (sick days 4–6)",
  days: 12,
  startDate: new Date(2026, 0, 5),
  agents: [ahmed],
  exclusionsByDay: (d) =>
    d >= 3 && d <= 5
      ? [
          {
            id: `ex-${d}`,
            agent_id: "ahmed",
            dog_id: null,
            exclusion_type: "sickness",
            start_date: "2026-01-01",
            end_date: "2026-12-31",
          },
        ]
      : [],
  checkpoints: [
    cp("cp-91", "91", 2, "explosives"),
    cp("cp-20", "20", 2, "explosives"),
    cp("cp-75", "75", 2, "explosives"),
    cp("cp-78", "78", 2, "explosives"),
  ],
  trackAgentId: "ahmed",
});

// F — P1 cooldown (yesterday P1)
const scenarioF = simulate({
  name: "Scenario F — P1 cooldown after prior P1",
  days: 6,
  startDate: new Date(2026, 2, 10),
  agents: [ahmed],
  checkpoints: [
    cp("cp-p1", "91", 1, "explosives"),
    cp("cp-p2", "20", 2, "explosives"),
    cp("cp-p3", "75", 3, "explosives"),
    cp("cp-p4", "78", 4, "explosives"),
  ],
  trackAgentId: "ahmed",
});

// G — force rotation conflict (pre-visit P1 in history)
let histG = [
  { agent_id: "ahmed", checkpoint_id: "cp-p1", planning_date: "2026-04-01" },
];
const scenarioG = simulate({
  name: "Scenario G — rescue after visited P1 in history",
  days: 5,
  startDate: new Date(2026, 3, 2),
  agents: [ahmed],
  checkpoints: [
    cp("cp-p1", "91", 1, "explosives"),
    cp("cp-p2", "20", 2, "explosives"),
  ],
  trackAgentId: "ahmed",
});
// Pre-seed history before loop inside simulate - need custom run

// Re-run G with preseeded history
function simulateWithHistory({
  name,
  days,
  startDate,
  agents,
  checkpoints,
  trackAgentId,
  initialHistory,
}) {
  let rotationHistory = [...initialHistory];
  const yesterdayCheckpointByAgent = new Map();
  const fairnessCounts = new Map();
  for (const row of initialHistory) {
    const key = `${row.agent_id}:${row.checkpoint_id}`;
    fairnessCounts.set(key, (fairnessCounts.get(key) ?? 0) + 1);
    yesterdayCheckpointByAgent.set(row.agent_id, row.checkpoint_id);
  }

  const rows = [];
  let suspicious = 0;
  for (let d = 0; d < days; d += 1) {
    const planningDate = addDays(startDate, d);
    const planningISO = format(planningDate, "yyyy-MM-dd");
    const { eligible } = qualifyTeams(agents, [], "day");
    const compatibleToday = buildCompatibleCheckpointsByAgent(
      eligible,
      checkpoints,
      "day",
      planningDate,
      false,
    );
    const visitedBefore = buildAgentVisitedCheckpoints(
      rotationHistory,
      compatibleToday,
    );

    const result = runPlanningEngine({
      sectionId: SECTION,
      shift: "day",
      planningDate,
      agents,
      exclusions: [],
      checkpoints,
      rotationHistory,
      yesterdayCheckpointByAgent: new Map(yesterdayCheckpointByAgent),
      fairnessCounts: new Map(fairnessCounts),
    });

    const assignment = result.assignments.find((a) => a.agent_id === trackAgentId);
    const rescue = result.structuredWarnings.some(
      (w) => w.code === "ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE",
    );
    const visited = visitedBefore.get(trackAgentId) ?? new Set();
    const compat = compatibleToday.get(trackAgentId) ?? new Set();
    const openAlt = assignment
      ? openUnvisitedSlots(result, trackAgentId, compat, visited)
      : [];

    const cls = assignment
      ? classifyRepeat({
          agentId: trackAgentId,
          checkpointId: assignment.checkpoint_id,
          visitedBefore: visited,
          compatibleToday: compat,
          openCompatibleUnvisited: openAlt,
          wasRescue: rescue,
        })
      : { repeat: false, legitimacy: "rest" };

    if (
      cls.legitimacy === "SUSPICIOUS-STRICT-REPEAT" ||
      cls.legitimacy === "suspicious-rescue-revisit"
    ) {
      suspicious += 1;
    }

    rows.push({
      day: d + 1,
      checkpoint: assignment?.checkpoint_id ?? "—",
      cycleBefore: [...visited].sort().join("+") || "∅",
      repeat: cls.repeat ? "Y" : "N",
      reason: cls.legitimacy,
      rescue,
    });

    for (const row of result.assignments) {
      rotationHistory.push({
        agent_id: row.agent_id,
        checkpoint_id: row.checkpoint_id,
        planning_date: planningISO,
      });
    }
    yesterdayCheckpointByAgent.clear();
    for (const row of result.assignments) {
      yesterdayCheckpointByAgent.set(row.agent_id, row.checkpoint_id);
    }
  }

  return { name, rows, suspicious };
}

const scenarioG2 = simulateWithHistory({
  name: "Scenario G — pre-seeded P1 visit + open P1/P2",
  days: 5,
  startDate: new Date(2026, 3, 2),
  agents: [ahmed],
  checkpoints: [
    cp("cp-p1", "91", 1, "explosives"),
    cp("cp-p2", "20", 2, "explosives"),
  ],
  trackAgentId: "ahmed",
  initialHistory: [
    { agent_id: "ahmed", checkpoint_id: "cp-p1", planning_date: "2026-04-01" },
  ],
});

printReport(scenarioA);
printReport(scenarioB);
printReport(scenarioC);
console.log("\n=== Scenario D — 3 agents × 14 days ===");
console.log("Total suspicious:", scenarioD.summary.suspicious);
for (const rep of scenarioD.agents) {
  console.log(rep.name, rep.summary);
}
printReport(scenarioE);
printReport(scenarioF);
console.log("\n=== Scenario G ===");
console.log(scenarioG2);

const totalSuspicious =
  scenarioA.summary.suspicious +
  scenarioB.summary.suspicious +
  scenarioC.summary.suspicious +
  scenarioD.summary.suspicious +
  scenarioE.summary.suspicious +
  scenarioF.summary.suspicious +
  scenarioG2.suspicious;

console.log("\n=== FIX 04 decision input ===");
console.log("Total SUSPICIOUS repeats across scenarios:", totalSuspicious);
console.log(
  "Scenario A 8-day sequence:",
  scenarioA.rows.map((r) => r.checkpoint).join(" → "),
);
