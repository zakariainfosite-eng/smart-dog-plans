/**
 * FIX 03 — Smart Rotation multi-day fairness audit (read-only).
 * Run: npx --yes tsx scripts/audit-smart-rotation-fairness.mjs
 */
import { addDays, format } from "date-fns";
import { normalizeCheckpointPriority } from "../src/lib/checkpoints/operational-config.ts";
import {
  buildCompatibleCheckpointsByAgent,
  runPlanningEngine,
} from "../src/lib/planning/engine.ts";

const SECTION = "sec-audit";
const START = new Date(2026, 0, 6); // Monday
const DAYS = 30;

function post(id, specialty) {
  return {
    id,
    shift: "day",
    specialty_required: specialty,
    required_agents: 1,
    active: true,
    allowed_gender: "all",
    dog_required: true,
  };
}

function checkpoint(
  id,
  name,
  priority,
  specialty,
  restricted_agent_ids = [],
) {
  return {
    id,
    name,
    night_only: false,
    active: true,
    allowed_gender: "all",
    female_policy: "allowed",
    priority,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: true,
    restricted_agent_ids,
    posts: [post(`post-${id}`, specialty)],
  };
}

function male(id, matricule, specialty, extra = {}) {
  return {
    id,
    first_name: "M",
    last_name: id,
    professional_number: matricule,
    gender: "male",
    active: true,
    section_id: SECTION,
    dog_id: `dog-${id}`,
    dogs: {
      id: `dog-${id}`,
      name: `Dog-${id}`,
      specialty,
      status: "available",
      active: true,
    },
    ...extra,
  };
}

/** Realistic section: mixed pools + one restriction + P1–P4 + both specialties. */
const AGENTS = [
  male("n1", "100", "narcotics"),
  male("n2", "105", "narcotics"),
  male("n3", "110", "narcotics"),
  male("e1", "200", "explosives"),
  male("e2", "205", "explosives"),
  male("e3", "210", "explosives"),
];

const CHECKPOINTS = [
  checkpoint("cp-p1n", "91-N", 1, "narcotics"),
  checkpoint("cp-p1e", "91-E", 1, "explosives"),
  checkpoint("cp-p2n", "20-N", 2, "narcotics"),
  checkpoint("cp-p2e", "20-E", 2, "explosives"),
  checkpoint("cp-p3n", "55-N", 3, "narcotics"),
  checkpoint("cp-p3e", "55-E", 3, "explosives", ["e3"]),
  checkpoint("cp-p4n", "78-N", 4, "narcotics"),
  checkpoint("cp-p4e", "78-E", 4, "explosives"),
];

function exclusionsForDay(dayIndex) {
  /** m3 sick on days 10–12 (0-based 9–11). */
  if (dayIndex < 9 || dayIndex > 11) return [];
  return [
    {
      id: `ex-m3-${dayIndex}`,
      agent_id: "n3",
      dog_id: null,
      exclusion_type: "sickness",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    },
  ];
}

function priorityOfCheckpoint(checkpointId) {
  const row = CHECKPOINTS.find((c) => c.id === checkpointId);
  return row ? normalizeCheckpointPriority(row.priority) : null;
}

function runSimulation() {
  let rotationHistory = [];
  let fairnessCounts = new Map();
  const yesterdayCheckpointByAgent = new Map();

  const stats = new Map(
    AGENTS.map((a) => [
      a.id,
      {
        agent: a.id,
        matricule: a.professional_number,
        specialty: a.dogs.specialty,
        eligibleCheckpoints: new Set(),
        visitedCheckpoints: new Set(),
        p1: 0,
        p2: 0,
        p3: 0,
        p4: 0,
        p653: 0,
        rest: 0,
        assignmentDays: 0,
        repeatSameCheckpoint: 0,
        lastCheckpoint: null,
        tieBreakWins: 0,
      },
    ]),
  );

  for (let d = 0; d < DAYS; d += 1) {
    const planningDate = addDays(START, d);
    const planningISO = format(planningDate, "yyyy-MM-dd");

    const result = runPlanningEngine({
      sectionId: SECTION,
      shift: "day",
      planningDate,
      agents: AGENTS,
      exclusions: exclusionsForDay(d),
      checkpoints: CHECKPOINTS,
      rotationHistory,
      yesterdayCheckpointByAgent: new Map(yesterdayCheckpointByAgent),
      fairnessCounts: new Map(fairnessCounts),
      femaleAgentsForReservation: [],
    });

    const eligible = result.eligible.filter((t) => t.gender === "male");
    const compatible = buildCompatibleCheckpointsByAgent(
      eligible,
      CHECKPOINTS,
      "day",
      planningDate,
      false,
    );

    for (const team of eligible) {
      const row = stats.get(team.agent_id);
      const compat = compatible.get(team.agent_id) ?? new Set();
      for (const id of compat) row.eligibleCheckpoints.add(id);
    }

    const assignedToday = new Set();
    for (const row of result.assignments) {
      assignedToday.add(row.agent_id);
      const agentStats = stats.get(row.agent_id);
      const pr = priorityOfCheckpoint(row.checkpoint_id);
      if (pr === 1) agentStats.p1 += 1;
      else if (pr === 2) agentStats.p2 += 1;
      else if (pr === 3) agentStats.p3 += 1;
      else if (pr === 4) agentStats.p4 += 1;

      agentStats.visitedCheckpoints.add(row.checkpoint_id);
      if (agentStats.lastCheckpoint === row.checkpoint_id) {
        agentStats.repeatSameCheckpoint += 1;
      }
      agentStats.lastCheckpoint = row.checkpoint_id;
      agentStats.assignmentDays += 1;

      rotationHistory.push({
        agent_id: row.agent_id,
        checkpoint_id: row.checkpoint_id,
        planning_date: planningISO,
      });

      const fairnessKey = `${row.agent_id}:${row.checkpoint_id}`;
      fairnessCounts.set(fairnessKey, (fairnessCounts.get(fairnessKey) ?? 0) + 1);
    }

    for (const row of result.point653) {
      const agentStats = stats.get(row.agent_id);
      if (agentStats) agentStats.p653 += 1;
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

  return stats;
}

function analyze(stats) {
  const rows = [...stats.values()].map((s) => ({
    agent: s.agent,
    matricule: s.matricule,
    specialty: s.specialty,
    eligible: s.eligibleCheckpoints.size,
    uniqueVisited: s.visitedCheckpoints.size,
    p1: s.p1,
    p2: s.p2,
    p3: s.p3,
    p4: s.p4,
  p653: s.p653,
    samePointRepeats: s.repeatSameCheckpoint,
    operationalDays: s.assignmentDays,
  }));

  const narcComparable = rows.filter((r) => r.specialty === "narcotics");
  const explComparable = rows.filter((r) => r.specialty === "explosives");

  const p1Spread = (group) => {
    const vals = group.map((r) => r.p1);
    return Math.max(...vals) - Math.min(...vals);
  };

  const totalOp = (r) => r.p1 + r.p2 + r.p3 + r.p4;

  return {
    rows,
    narcP1Spread: p1Spread(narcComparable),
    explP1Spread: p1Spread(explComparable),
    narcTotalSpread: Math.max(...narcComparable.map(totalOp)) -
      Math.min(...narcComparable.map(totalOp)),
    explTotalSpread: Math.max(...explComparable.map(totalOp)) -
      Math.min(...explComparable.map(totalOp)),
    lowestMatriculeNarc: narcComparable.reduce((best, r) =>
      totalOp(r) > totalOp(best) ? best : r,
    ),
    highestMatriculeNarc: narcComparable.reduce((best, r) =>
      totalOp(r) < totalOp(best) ? best : r,
    ),
  };
}

const stats = runSimulation();
const report = analyze(stats);

console.log("=== Smart Rotation fairness audit (30 days) ===\n");
console.log(
  "Agent | Matr. | Spec | Eligible CPs | Unique visited | P1 | P2 | P3 | P4 | 653 | Same-CP repeats",
);
console.log("---".repeat(12));
for (const r of report.rows) {
  console.log(
    [
      r.agent.padEnd(5),
      String(r.matricule).padStart(5),
      r.specialty === "narcotics" ? "Narc" : "Expl",
      String(r.eligible).padStart(3),
      String(r.uniqueVisited).padStart(3),
      String(r.p1).padStart(2),
      String(r.p2).padStart(2),
      String(r.p3).padStart(2),
      String(r.p4).padStart(2),
      String(r.p653).padStart(3),
      String(r.samePointRepeats).padStart(3),
    ].join(" | "),
  );
}

console.log("\n=== Aggregates ===");
console.log("Narcotics agents — P1 spread (max-min):", report.narcP1Spread);
console.log("Explosives agents — P1 spread (max-min):", report.explP1Spread);
console.log("Narcotics agents — total operational spread:", report.narcTotalSpread);
console.log("Explosives agents — total operational spread:", report.explTotalSpread);
console.log(
  "Lowest matricule narc (100) total ops:",
  report.narcP1Spread,
  "vs highest matricule (110) — inspect rows above",
);

/** Second sim: 4 identical-pool agents, single P2 checkpoint alternating days */
function tieBreakProbe() {
  const agents = [
    male("a1", "001", "narcotics"),
    male("a2", "002", "narcotics"),
    male("a3", "003", "narcotics"),
    male("a4", "004", "narcotics"),
  ];
  const cps = [
    checkpoint("cp-only", "Only", 2, "narcotics"),
    checkpoint("cp-p1", "Crit", 1, "narcotics"),
  ];
  const wins = new Map(agents.map((a) => [a.id, 0]));
  let history = [];
  let fairness = new Map();
  const yest = new Map();

  for (let d = 0; d < 30; d += 1) {
    const planningDate = addDays(new Date(2026, 2, 1), d);
    const planningISO = format(planningDate, "yyyy-MM-dd");
    const result = runPlanningEngine({
      sectionId: SECTION,
      shift: "day",
      planningDate,
      agents,
      exclusions: [],
      checkpoints: cps,
      rotationHistory: history,
      yesterdayCheckpointByAgent: new Map(yest),
      fairnessCounts: new Map(fairness),
    });

    for (const row of result.assignments) {
      wins.set(row.agent_id, (wins.get(row.agent_id) ?? 0) + 1);
      history.push({
        agent_id: row.agent_id,
        checkpoint_id: row.checkpoint_id,
        planning_date: planningISO,
      });
      const key = `${row.agent_id}:${row.checkpoint_id}`;
      fairness.set(key, (fairness.get(key) ?? 0) + 1);
    }
    yest.clear();
    for (const row of result.assignments) {
      yest.set(row.agent_id, row.checkpoint_id);
    }
  }
  return Object.fromEntries(wins);
}

const tieWins = tieBreakProbe();
console.log("\n=== Tie-break probe (4 equal narc agents, 2 CPs, 30 days) ===");
console.log(tieWins);
const winVals = Object.values(tieWins);
console.log("Assignment win spread (max-min):", Math.max(...winVals) - Math.min(...winVals));
