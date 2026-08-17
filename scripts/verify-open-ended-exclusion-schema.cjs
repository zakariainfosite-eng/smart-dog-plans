/**
 * Verifies migration 019 rebuilds the legacy NOT NULL end_date schema
 * without rewriting existing exclusion values.
 *
 * Usage: npm run electron:build:main && env -u ELECTRON_RUN_AS_NODE electron scripts/verify-open-ended-exclusion-schema.cjs
 */
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const Database = require("better-sqlite3");

function fail(message) {
  console.error("FAIL", message);
  process.exit(1);
}

function ok(message) {
  console.log("OK", message);
}

const OLD_DDL = `
  CREATE TABLE agent_exclusions (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT,
    dog_id TEXT,
    exclusion_type TEXT NOT NULL CHECK (exclusion_type IN (
      'absence', 'sickness', 'administrative_leave', 'special_leave',
      'dog_sick', 'female_dog_heat', 'annual_leave', 'mission', 'training', 'other',
      'suspension',
      'dog_injured', 'dog_temporary_retirement', 'dog_vet_visit', 'dog_training', 'dog_other'
    )),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_date >= start_date),
    CHECK (agent_id IS NOT NULL OR dog_id IS NOT NULL)
  )
`;

(async () => {
  const chunksDir = join(__dirname, "../dist-electron/chunks");
  const databaseChunk = readdirSync(chunksDir).find(
    (name) => name.startsWith("database-") && name.endsWith(".mjs"),
  );
  if (!databaseChunk) {
    fail("missing dist-electron database chunk — run npm run electron:build:main first");
  }

  const sqlite = await import(pathToFileURL(join(chunksDir, databaseChunk)).href);
  const { SQLITE_MIGRATIONS } = sqlite;
  const migration = SQLITE_MIGRATIONS.find((entry) => entry.id === "019_open_ended_dog_exclusions");
  if (!migration) fail("SQLITE_MIGRATIONS is missing 019_open_ended_dog_exclusions");

  const db = new Database(":memory:");
  db.exec(OLD_DDL);
  db.prepare(
    `INSERT INTO agent_exclusions (
      id, agent_id, dog_id, exclusion_type, start_date, end_date, notes, active, is_deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
  ).run("ex-sick", "a1", null, "sickness", "2026-08-01", "2026-08-10", "keep me");
  db.prepare(
    `INSERT INTO agent_exclusions (
      id, agent_id, dog_id, exclusion_type, start_date, end_date, notes, active, is_deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
  ).run("ex-vet", null, "d1", "dog_vet_visit", "2026-08-02", "2026-08-09", null);

  const before = db.prepare(`PRAGMA table_info(agent_exclusions)`).all();
  const beforeEnd = before.find((column) => column.name === "end_date");
  if (!beforeEnd || beforeEnd.notnull !== 1) {
    fail(`expected legacy end_date NOT NULL, got ${JSON.stringify(beforeEnd)}`);
  }
  ok("before: end_date TEXT NOT NULL");

  migration.up(db);
  migration.up(db);
  const afterEnd = db
    .prepare(`PRAGMA table_info(agent_exclusions)`)
    .all()
    .find((column) => column.name === "end_date");
  if (!afterEnd || afterEnd.notnull !== 0) {
    fail(`expected nullable end_date after 019, got ${JSON.stringify(afterEnd)}`);
  }
  ok("after: end_date TEXT NULL");

  const rows = db
    .prepare(
      `SELECT id, exclusion_type, start_date, end_date, notes FROM agent_exclusions ORDER BY id`,
    )
    .all();
  if (rows.length !== 2) fail(`expected 2 preserved rows, got ${rows.length}`);
  if (rows[0].id !== "ex-sick" || rows[0].end_date !== "2026-08-10" || rows[0].notes !== "keep me") {
    fail(`sickness row rewritten: ${JSON.stringify(rows[0])}`);
  }
  if (rows[1].id !== "ex-vet" || rows[1].exclusion_type !== "dog_vet_visit" || rows[1].end_date !== "2026-08-09") {
    fail(`dog_vet_visit row rewritten: ${JSON.stringify(rows[1])}`);
  }
  ok("existing rows preserved with original end_date values");

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE IF NOT EXISTS dogs (id TEXT PRIMARY KEY NOT NULL);
  `);
  db.prepare(`INSERT INTO dogs (id) VALUES (?)`).run("d2");
  db.prepare(`INSERT INTO dogs (id) VALUES (?)`).run("d3");

  db.prepare(
    `INSERT INTO agent_exclusions (
      id, agent_id, dog_id, exclusion_type, start_date, end_date, active, is_deleted
    ) VALUES (?, NULL, ?, 'dog_without_handler', '2026-08-17', NULL, 1, 0)`,
  ).run("ex-open", "d2");
  db.prepare(
    `INSERT INTO agent_exclusions (
      id, agent_id, dog_id, exclusion_type, start_date, end_date, active, is_deleted
    ) VALUES (?, NULL, ?, 'dog_vet_visit', '2026-08-17', NULL, 1, 0)`,
  ).run("ex-obs", "d3");

  const open = db.prepare(`SELECT end_date FROM agent_exclusions WHERE id = 'ex-open'`).get();
  const obs = db.prepare(`SELECT end_date FROM agent_exclusions WHERE id = 'ex-obs'`).get();
  if (open.end_date !== null || obs.end_date !== null) {
    fail(`expected NULL end_date, got open=${open.end_date} obs=${obs.end_date}`);
  }
  ok("new open-ended rows store end_date NULL");
  db.close();
})().catch((error) => {
  fail(error instanceof Error ? error.stack || error.message : String(error));
});
