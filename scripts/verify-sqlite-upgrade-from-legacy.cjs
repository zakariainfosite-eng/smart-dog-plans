/**
 * Real upgrade test: build a legacy (pre-migration) CynoPlanning SQLite DB with
 * operational data, run the production startup path, and verify:
 * - all old rows still exist
 * - new columns/tables present
 * - no duplicate migration executions
 * - app DB opens cleanly after upgrade
 *
 * Usage: npm run electron:build:main && npm run electron:verify-upgrade
 */
const { app } = require("electron");
const { mkdtempSync, readdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const Database = require("better-sqlite3");

const tempRoot = mkdtempSync(join(tmpdir(), "cyno-legacy-upgrade-"));
const tempUserData = join(tempRoot, "userData");
const dbPath = join(tempUserData, "cynoplanning.db");

process.env.CYNOPLANNING_ALLOW_EMPTY_DB = "1";

app.setName("CynoPlanning");
app.setPath("userData", tempUserData);

function fail(message) {
  console.error("FAIL", message);
  process.exit(1);
}

function ok(message) {
  console.log("OK", message);
}

function count(db, table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

/**
 * Minimal schema as shipped before versioned migrations (no commander cols,
 * no checkpoint priority/mandatory, no agents.fonction / marital_status,
 * exclusions without dog_id).
 */
function createLegacyDatabase(path) {
  const { mkdirSync } = require("node:fs");
  mkdirSync(tempUserData, { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE sections (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'night')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE dogs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
      specialty TEXT NOT NULL CHECK (specialty IN ('narcotics', 'explosives', 'currency')),
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sick', 'heat')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      professional_number TEXT NOT NULL UNIQUE,
      grade TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
      section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
      dog_id TEXT UNIQUE REFERENCES dogs(id) ON DELETE SET NULL,
      is_section_chief INTEGER NOT NULL DEFAULT 0 CHECK (is_section_chief IN (0, 1)),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      phone TEXT,
      address TEXT,
      observations TEXT,
      photo_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE checkpoints (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE checkpoint_posts (
      id TEXT PRIMARY KEY NOT NULL,
      checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      shift TEXT NOT NULL CHECK (shift IN ('day', 'night')),
      specialty_required TEXT CHECK (
        specialty_required IS NULL OR specialty_required IN ('narcotics', 'explosives', 'currency')
      ),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_exclusions (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      exclusion_type TEXT NOT NULL CHECK (exclusion_type IN (
        'absence', 'sickness', 'administrative_leave', 'special_leave',
        'dog_sick', 'female_dog_heat', 'annual_leave', 'mission', 'training', 'other'
      )),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (end_date >= start_date)
    );

    CREATE TABLE planning (
      id TEXT PRIMARY KEY NOT NULL,
      planning_date TEXT NOT NULL,
      section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
      shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'night')),
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE planning_assignments (
      id TEXT PRIMARY KEY NOT NULL,
      planning_id TEXT NOT NULL REFERENCES planning(id) ON DELETE CASCADE,
      checkpoint_post_id TEXT REFERENCES checkpoint_posts(id) ON DELETE SET NULL,
      agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      dog_id TEXT REFERENCES dogs(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE rotation_history (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      checkpoint_post_id TEXT REFERENCES checkpoint_posts(id) ON DELETE CASCADE,
      planning_date TEXT NOT NULL,
      is_hq_reserve INTEGER NOT NULL DEFAULT 0 CHECK (is_hq_reserve IN (0, 1)),
      is_off_duty INTEGER NOT NULL DEFAULT 0 CHECK (is_off_duty IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE operational_cases (
      id TEXT PRIMARY KEY NOT NULL,
      case_date TEXT NOT NULL,
      case_number TEXT NOT NULL UNIQUE,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
      dog_id TEXT REFERENCES dogs(id) ON DELETE SET NULL,
      checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
      specialty TEXT NOT NULL CHECK (specialty IN ('narcotics', 'explosives', 'currency')),
      is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE application_settings (
      id TEXT PRIMARY KEY NOT NULL,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    INSERT INTO sections (id, name, shift_type, active) VALUES
      ('sec-a', 'Section A', 'day', 1),
      ('sec-b', 'Section B', 'night', 1);

    INSERT INTO dogs (id, name, gender, specialty, status, active) VALUES
      ('dog-1', 'Rex', 'male', 'narcotics', 'available', 1),
      ('dog-2', 'Luna', 'female', 'explosives', 'available', 1),
      ('dog-3', 'Max', 'male', 'currency', 'available', 1);

    INSERT INTO agents (
      id, first_name, last_name, professional_number, grade, gender,
      section_id, dog_id, is_section_chief, active
    ) VALUES
      ('agt-1', 'Ahmed', 'Benali', 'P1001', 'Brigadier', 'male', 'sec-a', 'dog-1', 0, 1),
      ('agt-2', 'Karim', 'Said', 'P1002', 'Gardien', 'male', 'sec-a', 'dog-3', 1, 1),
      ('agt-3', 'Sara', 'Nouri', 'P1003', 'Gardien', 'female', NULL, 'dog-2', 0, 1);

    INSERT INTO checkpoints (id, name, code, active) VALUES
      ('cp-1', 'Poste Frontière Nord', 'PFN', 1),
      ('cp-2', 'Aéroport', 'AER', 1);

    INSERT INTO checkpoint_posts (id, checkpoint_id, name, shift, specialty_required, active) VALUES
      ('post-1', 'cp-1', 'Entrée', 'day', 'narcotics', 1),
      ('post-2', 'cp-2', 'Hall', 'night', 'explosives', 1);

    INSERT INTO agent_exclusions (
      id, agent_id, exclusion_type, start_date, end_date, notes, active, is_deleted
    ) VALUES
      ('excl-1', 'agt-1', 'annual_leave', '2026-01-01', '2026-01-05', 'Congé', 1, 0);

    INSERT INTO planning (id, planning_date, section_id, shift_type, status) VALUES
      ('plan-1', '2026-02-01', 'sec-a', 'day', 'published'),
      ('plan-2', '2026-02-02', 'sec-b', 'night', 'draft');

    INSERT INTO planning_assignments (
      id, planning_id, checkpoint_post_id, agent_id, dog_id
    ) VALUES
      ('pa-1', 'plan-1', 'post-1', 'agt-1', 'dog-1'),
      ('pa-2', 'plan-1', 'post-2', 'agt-2', 'dog-3');

    INSERT INTO rotation_history (
      id, agent_id, checkpoint_post_id, planning_date, is_hq_reserve, is_off_duty
    ) VALUES
      ('rh-1', 'agt-1', 'post-1', '2026-01-15', 0, 0),
      ('rh-2', 'agt-2', 'post-2', '2026-01-16', 1, 0);

    INSERT INTO operational_cases (
      id, case_date, case_number, agent_id, dog_id, checkpoint_id, specialty, is_deleted
    ) VALUES
      ('case-1', '2026-01-20', 'CASE-001', 'agt-1', 'dog-1', 'cp-1', 'narcotics', 0);

    INSERT INTO application_settings (id, key, value) VALUES
      ('set-1', 'locale', '{"lang":"fr"}');

    INSERT INTO users (id, email, password_hash) VALUES
      ('user-1', 'admin@local', 'hash');
  `);

  const snapshot = {
    agents: count(db, "agents"),
    dogs: count(db, "dogs"),
    checkpoints: count(db, "checkpoints"),
    sections: count(db, "sections"),
    planning: count(db, "planning"),
    planning_assignments: count(db, "planning_assignments"),
    rotation_history: count(db, "rotation_history"),
    agent_exclusions: count(db, "agent_exclusions"),
    operational_cases: count(db, "operational_cases"),
    application_settings: count(db, "application_settings"),
    agentIds: db.prepare(`SELECT id FROM agents ORDER BY id`).all().map((r) => r.id),
    dogIds: db.prepare(`SELECT id FROM dogs ORDER BY id`).all().map((r) => r.id),
    planningIds: db.prepare(`SELECT id FROM planning ORDER BY id`).all().map((r) => r.id),
    caseNumbers: db
      .prepare(`SELECT case_number FROM operational_cases ORDER BY case_number`)
      .all()
      .map((r) => r.case_number),
  };

  db.close();
  return snapshot;
}

app.whenReady().then(async () => {
  try {
    const before = createLegacyDatabase(dbPath);
    ok(
      `legacy DB seeded (agents=${before.agents}, dogs=${before.dogs}, planning=${before.planning}, history=${before.rotation_history})`,
    );

    // Confirm legacy shape lacks new columns.
    {
      const probe = new Database(dbPath, { readonly: true });
      const agentCols = columnNames(probe, "agents");
      const checkpointCols = columnNames(probe, "checkpoints");
      const sectionCols = columnNames(probe, "sections");
      if (agentCols.includes("fonction") || agentCols.includes("marital_status")) {
        fail("legacy fixture unexpectedly already has agents.fonction/marital_status");
      }
      if (checkpointCols.includes("priority") || checkpointCols.includes("mandatory")) {
        fail("legacy fixture unexpectedly already has checkpoints.priority/mandatory");
      }
      if (sectionCols.includes("commander_full_name")) {
        fail("legacy fixture unexpectedly already has sections commander columns");
      }
      probe.close();
    }

    const chunksDir = join(__dirname, "../dist-electron/chunks");
    const databaseChunk = readdirSync(chunksDir).find(
      (name) => name.startsWith("database-") && name.endsWith(".mjs"),
    );
    if (!databaseChunk) {
      fail("missing dist-electron database chunk — run npm run electron:build:main first");
    }

    const sqlite = await import(pathToFileURL(join(chunksDir, databaseChunk)).href);
    const {
      initializeDatabase,
      closeDatabase,
      getDatabase,
      SCHEMA_MIGRATIONS_TABLE,
      SQLITE_MIGRATIONS,
      isMigrationBackupFileName,
    } = sqlite;

    const mockApp = {
      isReady: () => true,
      getPath: (name) => {
        if (name === "userData") return tempUserData;
        throw new Error(`unexpected getPath(${name})`);
      },
    };

    // Production startup path: open existing DB + migrate.
    initializeDatabase(mockApp);
    const database = getDatabase();

    const after = {
      agents: count(database, "agents"),
      dogs: count(database, "dogs"),
      checkpoints: count(database, "checkpoints"),
      sections: count(database, "sections"),
      planning: count(database, "planning"),
      planning_assignments: count(database, "planning_assignments"),
      rotation_history: count(database, "rotation_history"),
      agent_exclusions: count(database, "agent_exclusions"),
      operational_cases: count(database, "operational_cases"),
      application_settings: count(database, "application_settings"),
      agentIds: database.prepare(`SELECT id FROM agents ORDER BY id`).all().map((r) => r.id),
      dogIds: database.prepare(`SELECT id FROM dogs ORDER BY id`).all().map((r) => r.id),
      planningIds: database.prepare(`SELECT id FROM planning ORDER BY id`).all().map((r) => r.id),
      caseNumbers: database
        .prepare(`SELECT case_number FROM operational_cases ORDER BY case_number`)
        .all()
        .map((r) => r.case_number),
    };

    for (const key of [
      "agents",
      "dogs",
      "checkpoints",
      "sections",
      "planning",
      "planning_assignments",
      "rotation_history",
      "agent_exclusions",
      "operational_cases",
      "application_settings",
    ]) {
      if (after[key] !== before[key]) {
        fail(`row count changed for ${key}: before=${before[key]} after=${after[key]}`);
      }
    }
    if (JSON.stringify(after.agentIds) !== JSON.stringify(before.agentIds)) {
      fail("agent ids changed after upgrade");
    }
    if (JSON.stringify(after.dogIds) !== JSON.stringify(before.dogIds)) {
      fail("dog ids changed after upgrade");
    }
    if (JSON.stringify(after.planningIds) !== JSON.stringify(before.planningIds)) {
      fail("planning ids changed after upgrade");
    }
    if (JSON.stringify(after.caseNumbers) !== JSON.stringify(before.caseNumbers)) {
      fail("operational case numbers changed after upgrade");
    }
    ok("all legacy operational rows preserved (counts + ids)");

    const agentCols = columnNames(database, "agents");
    for (const required of ["fonction", "marital_status", "date_naissance", "origine"]) {
      if (!agentCols.includes(required)) {
        fail(`missing new column agents.${required}`);
      }
    }
    const legacyOrigins = database
      .prepare(`SELECT COUNT(*) AS n FROM agents WHERE origine IS NOT NULL`)
      .get().n;
    if (legacyOrigins !== 0) {
      fail(`expected existing agents.origine to remain NULL, got ${legacyOrigins} populated row(s)`);
    }
    const checkpointCols = columnNames(database, "checkpoints");
    for (const required of ["priority", "mandatory"]) {
      if (!checkpointCols.includes(required)) {
        fail(`missing new column checkpoints.${required}`);
      }
    }
    const sectionCols = columnNames(database, "sections");
    for (const required of ["commander_full_name", "commander_grade", "commander_mle"]) {
      if (!sectionCols.includes(required)) {
        fail(`missing new column sections.${required}`);
      }
    }
    const exclusionCols = columnNames(database, "agent_exclusions");
    if (!exclusionCols.includes("dog_id")) {
      fail("missing new column agent_exclusions.dog_id");
    }
    const userCols = columnNames(database, "users");
    if (!userCols.includes("role")) {
      fail("missing new column users.role");
    }
    ok("new columns added (fonction, marital_status, date_naissance, origine, mandatory, priority, dog_id, …)");

    const history = database
      .prepare(
        `SELECT id, name, applied_at, success FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY id`,
      )
      .all();
    if (history.length !== SQLITE_MIGRATIONS.length) {
      fail(`expected ${SQLITE_MIGRATIONS.length} migration rows, got ${history.length}`);
    }
    const ids = history.map((row) => row.id);
    if (new Set(ids).size !== ids.length) {
      fail("duplicate migration ids in schema_migrations");
    }
    for (const migration of SQLITE_MIGRATIONS) {
      const row = history.find((entry) => entry.id === migration.id);
      if (!row) fail(`missing migration ${migration.id}`);
      if (row.success !== 1) fail(`${migration.id} success=${row.success}`);
      if (!row.name) fail(`${migration.id} missing name`);
      if (!row.applied_at) fail(`${migration.id} missing applied_at`);
    }
    ok("schema_migrations complete (version/name/date/success, no duplicates)");

    const backups = readdirSync(tempUserData).filter((name) =>
      isMigrationBackupFileName(name),
    );
    if (backups.length < 1) {
      fail("expected at least one pre-migration backup");
    }
    ok(`timestamped backup present (${backups[0]})`);

    // Idempotent second startup — no extra migration rows.
    closeDatabase();
    initializeDatabase(mockApp);
    const historyAgain = getDatabase()
      .prepare(`SELECT COUNT(*) AS n FROM ${SCHEMA_MIGRATIONS_TABLE}`)
      .get().n;
    if (historyAgain !== SQLITE_MIGRATIONS.length) {
      fail(`second startup changed migration count to ${historyAgain}`);
    }
    const agentsAgain = count(getDatabase(), "agents");
    if (agentsAgain !== before.agents) {
      fail("second startup changed agent count");
    }
    ok("application starts normally after migration (idempotent re-open)");

    // Sample row integrity
    const agent = getDatabase()
      .prepare(`SELECT first_name, last_name, professional_number, fonction FROM agents WHERE id = ?`)
      .get("agt-1");
    if (!agent || agent.professional_number !== "P1001" || agent.fonction !== "cynotechnicien") {
      fail(`agent agt-1 corrupted: ${JSON.stringify(agent)}`);
    }
    const planning = getDatabase()
      .prepare(`SELECT planning_date, status FROM planning WHERE id = ?`)
      .get("plan-1");
    if (!planning || planning.planning_date !== "2026-02-01") {
      fail(`planning plan-1 corrupted: ${JSON.stringify(planning)}`);
    }
    ok("sample personnel + planning rows intact");

    console.log("ALL_LEGACY_UPGRADE_CHECKS_PASSED");
    closeDatabase();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});
