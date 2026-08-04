/**
 * SQLite database service (Electron main process).
 * Creates cynoplanning.db under app userData and initializes application tables.
 *
 * Offline updates: the installer replaces application binaries only. This file and
 * cynoplanning.db (plus media/ and auth-session.json) live outside the install
 * directory under Electron userData and survive every upgrade.
 */
import Database from "better-sqlite3";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dialog, type App } from "electron";
import {
  formatMigrationFailureDetail,
  isSqliteMigrationError,
  runPendingMigrations,
} from "./migrations";

export {
  SCHEMA_MIGRATIONS_TABLE,
  SQLITE_MIGRATIONS,
  SqliteMigrationError,
  createPreMigrationBackup,
  formatMigrationFailureDetail,
  isMigrationBackupFileName,
  isSqliteMigrationError,
  migrationBackupTimestamp,
  restoreDatabaseFromBackup,
  runPendingMigrations,
} from "./migrations";

const DB_FILE_NAME = "cynoplanning.db";
const STARTUP_LOG_PATH = join(process.cwd(), "electron-startup.log");

let db: Database.Database | null = null;

function dbLog(message: string): void {
  const line = `[electron][sqlite] ${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    appendFileSync(STARTUP_LOG_PATH, `${line}\n`);
  } catch {
    // ignore
  }
}

/**
 * Ordered for foreign-key dependencies (parent tables first).
 * Canonical application tables (+ local `users` for Electron auth).
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'night')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    commander_full_name TEXT NOT NULL DEFAULT '',
    commander_grade TEXT NOT NULL DEFAULT '',
    commander_mle TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS dogs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
    specialty TEXT NOT NULL CHECK (specialty IN ('narcotics', 'explosives', 'currency')),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sick', 'heat')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    photo_url TEXT,
    breed TEXT,
    microchip_number TEXT,
    date_of_birth TEXT,
    training_level TEXT,
    veterinary_notes TEXT,
    observations TEXT CHECK (observations IS NULL OR length(observations) <= 500),
    assignment_date TEXT,
    vaccination_info TEXT,
    health_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    professional_number TEXT NOT NULL UNIQUE,
    grade TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
    fonction TEXT NOT NULL DEFAULT 'cynotechnicien' CHECK (fonction IN (
      'chef_brigadier',
      'chef_brigadier_pi',
      'chef_secretariat',
      'secretaire',
      'assistant_technique',
      'chef_de_section',
      'chef_de_section_pi',
      'chef_materiel',
      'aide_soignant_veterinaire',
      'cynotechnicien'
    )),
    marital_status TEXT DEFAULT NULL CHECK (
      marital_status IS NULL OR marital_status IN ('single', 'married', 'divorced', 'widowed')
    ),
    section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
    dog_id TEXT UNIQUE REFERENCES dogs(id) ON DELETE SET NULL,
    is_section_chief INTEGER NOT NULL DEFAULT 0 CHECK (is_section_chief IN (0, 1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    phone TEXT,
    address TEXT,
    observations TEXT CHECK (observations IS NULL OR length(observations) <= 500),
    photo_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    night_only INTEGER NOT NULL DEFAULT 0 CHECK (night_only IN (0, 1)),
    allowed_gender TEXT NOT NULL DEFAULT 'all' CHECK (allowed_gender IN ('all', 'male', 'female')),
    operating_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
    day_shift_enabled INTEGER NOT NULL DEFAULT 1 CHECK (day_shift_enabled IN (0, 1)),
    night_shift_enabled INTEGER NOT NULL DEFAULT 1 CHECK (night_shift_enabled IN (0, 1)),
    female_policy TEXT NOT NULL DEFAULT 'allowed' CHECK (female_policy IN ('allowed', 'preferred', 'not_allowed')),
    priority INTEGER NOT NULL DEFAULT 3 CHECK (priority IN (1, 2, 3, 4)),
    mandatory INTEGER NOT NULL DEFAULT 1 CHECK (mandatory IN (0, 1)),
    day_explosives INTEGER NOT NULL DEFAULT 0 CHECK (day_explosives >= 0),
    day_narcotics INTEGER NOT NULL DEFAULT 0 CHECK (day_narcotics >= 0),
    night_explosives INTEGER NOT NULL DEFAULT 0 CHECK (night_explosives >= 0),
    night_narcotics INTEGER NOT NULL DEFAULT 0 CHECK (night_narcotics >= 0),
    required_drugs INTEGER NOT NULL DEFAULT 0 CHECK (required_drugs >= 0),
    required_explosives INTEGER NOT NULL DEFAULT 0 CHECK (required_explosives >= 0),
    total_required_staff INTEGER GENERATED ALWAYS AS (required_drugs + required_explosives) STORED,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS checkpoint_posts (
    id TEXT PRIMARY KEY NOT NULL,
    checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
    specialty_required TEXT NOT NULL CHECK (specialty_required IN ('narcotics', 'explosives', 'currency')),
    required_agents INTEGER NOT NULL DEFAULT 1 CHECK (required_agents > 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    shift TEXT NOT NULL DEFAULT 'day' CHECK (shift IN ('day', 'night')),
    dog_required INTEGER NOT NULL DEFAULT 1 CHECK (dog_required IN (0, 1)),
    allowed_gender TEXT NOT NULL DEFAULT 'all' CHECK (allowed_gender IN ('all', 'male', 'female')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS agent_exclusions (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
    dog_id TEXT REFERENCES dogs(id) ON DELETE CASCADE,
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
  )`,

  `CREATE TABLE IF NOT EXISTS planning (
    id TEXT PRIMARY KEY NOT NULL,
    planning_date TEXT NOT NULL,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
    shift TEXT NOT NULL CHECK (shift IN ('day', 'night')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    validated INTEGER NOT NULL DEFAULT 0 CHECK (validated IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (planning_date, section_id, shift)
  )`,

  `CREATE TABLE IF NOT EXISTS planning_assignments (
    id TEXT PRIMARY KEY NOT NULL,
    planning_id TEXT NOT NULL REFERENCES planning(id) ON DELETE CASCADE,
    checkpoint_post_id TEXT REFERENCES checkpoint_posts(id) ON DELETE RESTRICT,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
    dog_id TEXT REFERENCES dogs(id) ON DELETE SET NULL,
    is_hq_reserve INTEGER NOT NULL DEFAULT 0 CHECK (is_hq_reserve IN (0, 1)),
    is_off_duty INTEGER NOT NULL DEFAULT 0 CHECK (is_off_duty IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS rotation_history (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    checkpoint_post_id TEXT REFERENCES checkpoint_posts(id) ON DELETE CASCADE,
    planning_date TEXT NOT NULL,
    is_hq_reserve INTEGER NOT NULL DEFAULT 0 CHECK (is_hq_reserve IN (0, 1)),
    is_off_duty INTEGER NOT NULL DEFAULT 0 CHECK (is_off_duty IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS operational_cases (
    id TEXT PRIMARY KEY NOT NULL,
    case_date TEXT NOT NULL,
    case_number TEXT NOT NULL UNIQUE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
    dog_id TEXT REFERENCES dogs(id) ON DELETE SET NULL,
    checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
    specialty TEXT NOT NULL CHECK (specialty IN ('narcotics', 'explosives', 'currency')),
    location TEXT,
    seizure_type TEXT CHECK (seizure_type IS NULL OR seizure_type IN (
      'cannabis', 'exta', 'pofa', 'cocaine', 'heroin', 'synthetic_drugs',
      'hashish', 'explosives', 'counterfeit_currency', 'other'
    )),
    quantity REAL CHECK (quantity IS NULL OR quantity > 0),
    unit TEXT CHECK (unit IS NULL OR unit IN (
      'kg', 'g', 'units', 'pieces', 'liters', 'banknotes', 'tonne'
    )),
    object_type TEXT CHECK (object_type IS NULL OR object_type IN (
      'firearm', 'bladed_weapon', 'grenade', 'homemade_explosive',
      'ammunition', 'detonator', 'explosive_material', 'other'
    )),
    object_count INTEGER CHECK (object_count IS NULL OR object_count > 0),
    threat_level TEXT CHECK (threat_level IS NULL OR threat_level IN ('low', 'medium', 'high')),
    currency_code TEXT,
    total_amount REAL CHECK (total_amount IS NULL OR total_amount >= 0),
    banknote_count INTEGER CHECK (banknote_count IS NULL OR banknote_count >= 0),
    country TEXT,
    observations TEXT CHECK (observations IS NULL OR length(observations) <= 1000),
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS operational_case_attachments (
    id TEXT PRIMARY KEY NOT NULL,
    case_id TEXT NOT NULL REFERENCES operational_cases(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    mime_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS application_settings (
    id TEXT PRIMARY KEY NOT NULL,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL DEFAULT '{}',
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sections_active ON sections(active)`,
  `CREATE INDEX IF NOT EXISTS idx_dogs_active ON dogs(active)`,
  `CREATE INDEX IF NOT EXISTS idx_dogs_status ON dogs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_dogs_specialty ON dogs(specialty)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_section ON agents(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active)`,
  `CREATE INDEX IF NOT EXISTS idx_checkpoints_active ON checkpoints(active)`,
  `CREATE INDEX IF NOT EXISTS idx_checkpoint_posts_checkpoint ON checkpoint_posts(checkpoint_id)`,
  `CREATE INDEX IF NOT EXISTS idx_checkpoint_posts_specialty ON checkpoint_posts(specialty_required)`,
  // Historical data may contain duplicates on (checkpoint_id, shift, specialty_required);
  // keep a non-unique index so Phase 2 can import every row without data loss.
  `CREATE INDEX IF NOT EXISTS idx_checkpoint_posts_checkpoint_shift_specialty
    ON checkpoint_posts(checkpoint_id, shift, specialty_required)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_agent ON agent_exclusions(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dog ON agent_exclusions(dog_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dates ON agent_exclusions(start_date, end_date)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_active ON agent_exclusions(active)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_is_deleted ON agent_exclusions(is_deleted)`,
  `CREATE INDEX IF NOT EXISTS idx_planning_date ON planning(planning_date)`,
  `CREATE INDEX IF NOT EXISTS idx_planning_section ON planning(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pa_planning ON planning_assignments(planning_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pa_post ON planning_assignments(checkpoint_post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pa_agent ON planning_assignments(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pa_dog ON planning_assignments(dog_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rh_agent ON rotation_history(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rh_post ON rotation_history(checkpoint_post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rh_date ON rotation_history(planning_date)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_agent ON operational_cases(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_date ON operational_cases(case_date)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_specialty ON operational_cases(specialty)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_checkpoint ON operational_cases(checkpoint_id)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_is_deleted ON operational_cases(is_deleted)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_case_attachments_case ON operational_case_attachments(case_id)`,
];

export const SQLITE_SCHEMA_INIT_MESSAGE = "SQLite schema initialized successfully.";

function isIndexStatement(statement: string): boolean {
  return /^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(statement);
}

/** Table / object DDL only — safe before migrations on older user databases. */
export const SCHEMA_TABLE_STATEMENTS: readonly string[] = SCHEMA_STATEMENTS.filter(
  (statement) => !isIndexStatement(statement),
);

/** Indexes may reference columns added by migrations — apply after migrations. */
export const SCHEMA_INDEX_STATEMENTS: readonly string[] = SCHEMA_STATEMENTS.filter(
  (statement) => isIndexStatement(statement),
);

/**
 * Creates missing tables only (CREATE IF NOT EXISTS).
 * Never drops, truncates, or recreates existing user tables.
 * Indexes are applied separately after migrations (see ensureSchemaIndexes).
 */
export function initializeSchema(database: Database.Database): string {
  dbLog("initializeSchema: enter");
  const run = database.transaction(() => {
    for (const statement of SCHEMA_TABLE_STATEMENTS) {
      database.exec(statement);
    }
  });
  run();
  dbLog("initializeSchema: exit");
  return SQLITE_SCHEMA_INIT_MESSAGE;
}

/** Idempotent index creation — run after pending migrations succeed. */
export function ensureSchemaIndexes(database: Database.Database): void {
  dbLog("ensureSchemaIndexes: enter");
  const run = database.transaction(() => {
    for (const statement of SCHEMA_INDEX_STATEMENTS) {
      database.exec(statement);
    }
  });
  run();
  dbLog("ensureSchemaIndexes: exit");
}

export function getDatabasePath(app: App): string {
  return join(app.getPath("userData"), DB_FILE_NAME);
}

/** Electron userData root — hosts cynoplanning.db, media/, and auth-session.json. */
export function getUserDataPath(app: App): string {
  return app.getPath("userData");
}

/**
 * When the DB file is missing, creating a new empty file would silently start
 * at zero rows. Require an explicit confirm (or CYNOPLANNING_ALLOW_EMPTY_DB=1 for CI).
 */
function confirmCreateEmptyDatabase(app: App, dbPath: string): void {
  if (process.env.CYNOPLANNING_ALLOW_EMPTY_DB === "1") {
    dbLog(
      "initializeDatabase: CYNOPLANNING_ALLOW_EMPTY_DB=1 — creating empty DB without prompt",
    );
    return;
  }

  if (!app.isReady()) {
    throw new Error(
      `Database file missing at ${dbPath}, but the app is not ready for a confirm dialog. ` +
        `Restore a backup, or set CYNOPLANNING_ALLOW_EMPTY_DB=1 for non-interactive use.`,
    );
  }

  const result = dialog.showMessageBoxSync({
    type: "warning",
    buttons: ["Create empty database", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "CynoPlanning — No database found",
    message: "No local database was found.",
    detail:
      `Path:\n${dbPath}\n\n` +
      "Creating a new empty database starts with zero agents, dogs, checkpoints, and planning. " +
      "Cancel if you expected existing data (for example after deleting Application Support/CynoPlanning).",
  });

  if (result !== 0) {
    throw new Error(
      `Refusing to create empty database at ${dbPath}. Restore a backup or set CYNOPLANNING_ALLOW_EMPTY_DB=1.`,
    );
  }

  dbLog("initializeDatabase: user confirmed creating empty database");
}

function shouldShowUiDialogs(): boolean {
  // CI / migration verify scripts must never block on modal dialogs.
  if (process.env.CYNOPLANNING_ALLOW_EMPTY_DB === "1") return false;
  if (process.env.CYNOPLANNING_NO_UI === "1") return false;
  return true;
}

function showMigrationFailureDialog(app: App, error: unknown): void {
  if (!shouldShowUiDialogs() || !app.isReady()) {
    return;
  }
  const detail = formatMigrationFailureDetail(error);
  const isMigration = isSqliteMigrationError(error);
  try {
    dialog.showMessageBoxSync({
      type: "error",
      buttons: ["OK"],
      defaultId: 0,
      title: "CynoPlanning — Database migration failed",
      message: isMigration
        ? "A database upgrade failed. Your previous data was restored."
        : "Database initialization failed.",
      detail,
    });
  } catch {
    // headless / CI — dialog optional
  }
}

/**
 * Opens (or creates) cynoplanning.db under Electron userData and runs schema init.
 * Safe to call on every launch when the file already exists — CREATE TABLE IF NOT EXISTS is idempotent.
 * Never deletes or replaces an existing user database file.
 * If the file is missing, prompts before creating an empty DB (see CYNOPLANNING_ALLOW_EMPTY_DB).
 */
export function initializeDatabase(app: App): Database.Database {
  if (db) {
    return db;
  }

  const userDataPath = getUserDataPath(app);
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = getDatabasePath(app);
  dbLog(`initializeDatabase: opening ${dbPath}`);

  if (!existsSync(dbPath)) {
    confirmCreateEmptyDatabase(app, dbPath);
  }

  const connection = new Database(dbPath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");

  try {
    // 1) Missing tables only  2) pending migrations  3) indexes (may need new columns)
    // Never deletes, truncates, or replaces the existing user database file.
    initializeSchema(connection);
    runPendingMigrations({
      database: connection,
      userDataPath,
      dbPath,
      log: dbLog,
    });
    ensureSchemaIndexes(connection);
    db = connection;
  } catch (error) {
    try {
      connection.close();
    } catch {
      // connection may already be closed after a failed migration restore
    }
    db = null;
    showMigrationFailureDialog(app, error);
    throw error;
  }

  dbLog("initializeDatabase: ready");
  return db;
}

export function testDatabaseInitialization(app: App): string {
  initializeDatabase(app);
  return "SQLite initialized successfully";
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("SQLite database has not been initialized.");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
