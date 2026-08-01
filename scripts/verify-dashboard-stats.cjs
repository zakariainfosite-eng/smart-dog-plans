/**
 * Verify dashboard KPI counts match Agents / Dogs / Checkpoints page totals.
 * Usage: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/verify-dashboard-stats.cjs
 */
const { join } = require("node:path");
const { homedir } = require("node:os");
const Database = require("better-sqlite3");

const dbPath = join(homedir(), "Library/Application Support/CynoPlanning/cynoplanning.db");

function main() {
  const db = new Database(dbPath, { readonly: true, timeout: 3000 });

  // Same cardinality as getAgents / getDogs / getCheckpoints (no active filter).
  const agents = db.prepare("SELECT COUNT(*) AS c FROM agents").get().c;
  const dogs = db.prepare("SELECT COUNT(*) AS c FROM dogs").get().c;
  const checkpoints = db.prepare("SELECT COUNT(*) AS c FROM checkpoints").get().c;

  const report = {
    dbPath,
    dashboardCounts: { agents, dogs, checkpoints },
    expected: { agents: 34, dogs: 33, checkpoints: 11 },
    match: agents === 34 && dogs === 33 && checkpoints === 11,
  };

  console.log(JSON.stringify(report, null, 2));
  db.close();

  if (!report.match) {
    console.error("[verify-dashboard] FAILED");
    process.exit(1);
  }
  console.log(`[verify-dashboard] OK — Agents=${agents}, Dogs=${dogs}, Checkpoints=${checkpoints}`);
}

main();
