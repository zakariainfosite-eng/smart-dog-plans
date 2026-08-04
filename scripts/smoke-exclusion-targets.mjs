/**
 * Smoke-test personnel + dog exclusion targeting in the planning engine.
 * Run: npx vite-node scripts/smoke-exclusion-targets.mjs
 */
import {
  qualifyTeams,
  buildPoint653Assignments,
} from "../src/lib/planning/engine.ts";

const agents = [
  {
    id: "a1",
    first_name: "Handler",
    last_name: "One",
    professional_number: "H1",
    gender: "male",
    active: true,
    section_id: "s1",
    dog_id: "d1",
    dogs: {
      id: "d1",
      name: "Rex",
      specialty: "narcotics",
      status: "available",
      active: true,
    },
  },
];

const dogOnly = [{ agent_id: null, dog_id: "d1", exclusion_type: "dog_injured" }];
const { eligible, excluded } = qualifyTeams(agents, dogOnly, "day");
const point653 = buildPoint653Assignments(agents, new Set(), dogOnly, excluded);
const dogPass =
  eligible.length === 0 &&
  excluded.length === 0 &&
  point653.some((entry) => entry.agent_id === "a1");
console.log(dogPass ? "PASS: dog_id exclusion blocks dog assignment (Point 653)" : "FAIL: dog_id");

const personnel = [{ agent_id: "a1", dog_id: null, exclusion_type: "suspension" }];
const q2 = qualifyTeams(agents, personnel, "day");
const personnelPass = q2.excluded.some((entry) => entry.agent_id === "a1");
console.log(personnelPass ? "PASS: suspension excludes personnel" : "FAIL: suspension");

if (!dogPass || !personnelPass) process.exit(1);
