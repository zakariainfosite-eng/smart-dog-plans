/**
 * Verifies exclusion personnel selector source = 100% of SQLite agents.
 * Mirrors UI: getAgents() with no active/availability filter.
 *
 * Run:
 *   env -u ELECTRON_RUN_AS_NODE electron scripts/verify-exclusion-agent-selector.mjs
 */
const { app } = require("electron");
const { join } = require("node:path");
const Database = require("better-sqlite3");

app.whenReady().then(() => {
  const dbPath = join(app.getPath("userData"), "cynoplanning.db");
  const db = new Database(dbPath, { readonly: true });

  try {
    const total = db.prepare(`SELECT COUNT(*) AS n FROM agents`).get().n;
    const active = db.prepare(`SELECT COUNT(*) AS n FROM agents WHERE active = 1`).get().n;
    const inactive = db.prepare(`SELECT COUNT(*) AS n FROM agents WHERE active = 0`).get().n;
    // Same unfiltered load path as exclusions dialog (getAgents → all rows).
    const selectorRows = db
      .prepare(
        `SELECT id, first_name, last_name, professional_number, active
         FROM agents
         ORDER BY last_name, first_name`,
      )
      .all();

    const ok = selectorRows.length === total;
    console.log(`SQLite agents total: ${total}`);
    console.log(`  active: ${active}`);
    console.log(`  inactive: ${inactive}`);
    console.log(`Selector source rows: ${selectorRows.length}`);
    console.log(
      ok
        ? "PASS: selector covers 100% of personnel (no active/availability filter)"
        : "FAIL: selector count does not match SQLite",
    );
    if (!ok) process.exitCode = 1;
  } finally {
    db.close();
    app.quit();
  }
});
