/**
 * Unit smoke for cases-statistics aggregation (no live DB required).
 * Run: npx vite-node scripts/smoke-cases-statistics.mjs
 */
import {
  aggregateCasesStatistics,
  resolveCasesStatisticsRange,
} from "../src/lib/statistics/fetch-cases-statistics.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const raw = {
  cases: [
    {
      id: "c1",
      case_date: "2026-01-15",
      specialty: "narcotics",
      seizure_type: "cannabis",
      quantity: 2,
      unit: "kg",
      object_count: null,
      object_type: null,
      banknote_count: null,
      total_amount: null,
      currency_code: null,
      agent_id: "a1",
      dog_id: "d1",
      checkpoint_id: "cp1",
      agents: { id: "a1", first_name: "Ali", last_name: "Ben", section_id: "s1" },
      dogs: { id: "d1", name: "Rex" },
      checkpoints: { id: "cp1", name: "Port" },
    },
    {
      id: "c2",
      case_date: "2026-02-10",
      specialty: "narcotics",
      seizure_type: "exta",
      quantity: 500,
      unit: "g",
      object_count: null,
      object_type: null,
      banknote_count: null,
      total_amount: null,
      currency_code: null,
      agent_id: "a1",
      dog_id: "d1",
      checkpoint_id: "cp1",
      agents: { id: "a1", first_name: "Ali", last_name: "Ben", section_id: "s1" },
      dogs: { id: "d1", name: "Rex" },
      checkpoints: { id: "cp1", name: "Port" },
    },
    {
      id: "c3",
      case_date: "2026-02-20",
      specialty: "explosives",
      seizure_type: null,
      quantity: null,
      unit: null,
      object_count: 3,
      object_type: "grenade",
      banknote_count: null,
      total_amount: null,
      currency_code: null,
      agent_id: "a2",
      dog_id: "d2",
      checkpoint_id: "cp2",
      agents: { id: "a2", first_name: "Sara", last_name: "Amrani", section_id: "s2" },
      dogs: { id: "d2", name: "Max" },
      checkpoints: { id: "cp2", name: "Aéroport" },
    },
    {
      id: "c4",
      case_date: "2025-11-01",
      specialty: "currency",
      seizure_type: null,
      quantity: null,
      unit: null,
      object_count: null,
      object_type: null,
      banknote_count: 12,
      total_amount: 5000,
      currency_code: "EUR",
      agent_id: "a2",
      dog_id: null,
      checkpoint_id: "cp2",
      agents: { id: "a2", first_name: "Sara", last_name: "Amrani", section_id: "s2" },
      dogs: null,
      checkpoints: { id: "cp2", name: "Aéroport" },
    },
  ],
  agents: [
    { id: "a1", first_name: "Ali", last_name: "Ben", section_id: "s1", active: true },
    { id: "a2", first_name: "Sara", last_name: "Amrani", section_id: "s2", active: true },
  ],
  dogs: [
    { id: "d1", name: "Rex", active: true },
    { id: "d2", name: "Max", active: true },
  ],
  sections: [
    { id: "s1", name: "Section 1" },
    { id: "s2", name: "Section 2" },
  ],
  checkpoints: [
    { id: "cp1", name: "Port" },
    { id: "cp2", name: "Aéroport" },
  ],
};

const labels = {
  unknown: "—",
  specialty: (k) => k,
  seizureType: (k) => k,
  objectType: (k) => k,
  team: (agent, dog) => (dog ? `${agent} + ${dog}` : agent),
};

const allYears = aggregateCasesStatistics(
  raw,
  {
    year: "",
    month: "",
    dateFrom: "",
    dateTo: "",
    specialty: "",
    sectionId: "",
    checkpointId: "",
    agentId: "",
    dogId: "",
  },
  (m) => m,
  labels,
);

assert(allYears.totalCases === 4, "total cases");
assert(allYears.seizures.cannabisKg === 2, "cannabis kg");
assert(Math.abs(allYears.seizures.ecstasyKg - 0.5) < 1e-9, "ecstasy kg from 500g");
assert(allYears.seizures.explosivesObjects === 3, "explosives objects");
assert(allYears.seizures.banknotesCount === 12, "banknotes");
assert(allYears.seizures.currencyAmount === 5000, "currency amount");
assert(allYears.seizures.currencyByCode.some((r) => r.label === "EUR" && r.value === 5000), "currency by code");
assert(allYears.seizures.psychotropesPieces === 0, "no piece psychotropes in fixture");
assert(allYears.rankings.topAgents[0]?.value === 2, "top agent has 2 cases");
assert(allYears.rankings.topDogs[0]?.value === 2, "top dog Rex/Max");
assert(allYears.charts.yearlyEvolution.length === 2, "two years in evolution");
assert(!("bySpecialty" in allYears.charts), "no count-only specialty chart payload");
assert(allYears.byTeam.length >= 2, "teams");
console.log("PASS: unfiltered aggregates from synthetic cases");

const year2026 = aggregateCasesStatistics(
  raw,
  {
    year: "2026",
    month: "",
    dateFrom: "",
    dateTo: "",
    specialty: "",
    sectionId: "",
    checkpointId: "",
    agentId: "",
    dogId: "",
  },
  (m) => m,
  labels,
);
assert(year2026.totalCases === 3, "2026 filter");
assert(year2026.charts.monthlyEvolution.length === 12, "12-month chart");
assert(
  year2026.charts.monthlyEvolution.reduce((s, r) => s + r.value, 0) === 3,
  "monthly sum",
);
console.log("PASS: year filter + monthly chart");

const narcoticsOnly = aggregateCasesStatistics(
  raw,
  {
    year: "2026",
    month: "",
    dateFrom: "",
    dateTo: "",
    specialty: "narcotics",
    sectionId: "",
    checkpointId: "",
    agentId: "",
    dogId: "",
  },
  (m) => m,
  labels,
);
assert(narcoticsOnly.totalCases === 2, "specialty filter");
assert(narcoticsOnly.seizures.explosivesObjects === 0, "explosives excluded by specialty");
console.log("PASS: specialty filter");

const range = resolveCasesStatisticsRange({
  year: "2026",
  month: "02",
  dateFrom: "",
  dateTo: "",
  specialty: "",
  sectionId: "",
  checkpointId: "",
  agentId: "",
  dogId: "",
});
assert(range.from === "2026-02-01" && range.to === "2026-02-28", "month range");
console.log("PASS: month range resolution");

const empty = aggregateCasesStatistics(
  { cases: [], agents: [], dogs: [], sections: [], checkpoints: [] },
  {
    year: "2026",
    month: "",
    dateFrom: "",
    dateTo: "",
    specialty: "",
    sectionId: "",
    checkpointId: "",
    agentId: "",
    dogId: "",
  },
  (m) => m,
  labels,
);
assert(empty.totalCases === 0, "empty payload");
assert(empty.seizures.cannabisKg === 0, "empty seizures are zero from data, not demo");
console.log("PASS: empty dataset yields zeros only (no demo numbers)");

console.log("\nAll smoke-cases-statistics checks passed.");
