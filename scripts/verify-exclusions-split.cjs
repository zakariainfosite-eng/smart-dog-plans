/**
 * Verify personnel vs dog exclusion separation rules against SQLite.
 *
 * Run:
 *   env -u ELECTRON_RUN_AS_NODE electron scripts/verify-exclusions-split.cjs
 */
const { app } = require("electron");
const { join } = require("node:path");
const { existsSync } = require("node:fs");
const Database = require("better-sqlite3");

app.setPath("userData", join(app.getPath("appData"), "CynoPlanning"));

const AGENT_LEVEL = new Set([
  "absence",
  "sickness",
  "annual_leave",
  "special_leave",
  "administrative_leave",
  "mission",
  "training",
  "suspension",
  "other",
]);
const DOG_LEVEL = new Set([
  "dog_sick",
  "female_dog_heat",
  "dog_injured",
  "dog_temporary_retirement",
  "dog_vet_visit",
  "dog_training",
  "dog_other",
]);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

app.whenReady().then(() => {
  const dbPath = join(app.getPath("userData"), "cynoplanning.db");
  if (!existsSync(dbPath)) {
    console.log("SKIP: no DB");
    app.quit();
    return;
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT id, agent_id, dog_id, exclusion_type, start_date, end_date, active
         FROM agent_exclusions`,
      )
      .all();

    const personnel = rows.filter((r) => AGENT_LEVEL.has(r.exclusion_type));
    const dogs = rows.filter((r) => DOG_LEVEL.has(r.exclusion_type));
    const overlap = personnel.filter((r) => DOG_LEVEL.has(r.exclusion_type));
    assert(overlap.length === 0, "type sets must be disjoint");

    for (const row of personnel) {
      assert(!DOG_LEVEL.has(row.exclusion_type), "personnel row leaked dog type");
    }
    for (const row of dogs) {
      assert(!AGENT_LEVEL.has(row.exclusion_type), "dog row leaked personnel type");
    }

    const unclassified = rows.filter(
      (r) => !AGENT_LEVEL.has(r.exclusion_type) && !DOG_LEVEL.has(r.exclusion_type),
    );
    assert(unclassified.length === 0, `unknown exclusion types: ${unclassified.map((r) => r.exclusion_type)}`);

    console.log(`Total exclusions: ${rows.length}`);
    console.log(`Personnel table source: ${personnel.length}`);
    console.log(`Dogs table source: ${dogs.length}`);
    assert(
      personnel.length + dogs.length === rows.length,
      "every row belongs to exactly one table",
    );
    console.log("PASS: personnel and dog exclusions are cleanly partitioned by type");
    console.log("PASS: existing rows preserved (read-only check)");
  } finally {
    db.close();
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  app.quit();
});
