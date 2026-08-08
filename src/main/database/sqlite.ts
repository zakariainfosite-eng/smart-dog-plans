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
  SCHEMA_INDEX_STATEMENTS,
  SCHEMA_STATEMENTS,
  SCHEMA_TABLE_STATEMENTS,
} from "../../integrations/database/schema-sql";
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

/** Re-export shared DDL so Electron and Capacitor stay on the same schema. */
export { SCHEMA_INDEX_STATEMENTS, SCHEMA_STATEMENTS, SCHEMA_TABLE_STATEMENTS };

export const SQLITE_SCHEMA_INIT_MESSAGE = "SQLite schema initialized successfully.";

/**
 * On app startup: deactivate exclusions whose end_date is strictly before today.
 * Persisted expiration always uses wall-clock today (never a future planning date).
 * Mirrors renderer `expirePastExclusions` without going through the REST bridge.
 */
export function expirePastExclusionsInSqlite(
  database: Database.Database,
  todayISO: string = new Date().toISOString().slice(0, 10),
): number {
  try {
    const result = database
      .prepare(
        `UPDATE agent_exclusions
         SET active = 0, updated_at = datetime('now')
         WHERE active = 1 AND end_date < ? AND is_deleted = 0`,
      )
      .run(todayISO);
    return result.changes;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/no such column:\s*is_deleted/i.test(message)) throw error;
    const legacy = database
      .prepare(
        `UPDATE agent_exclusions
         SET active = 0, updated_at = datetime('now')
         WHERE active = 1 AND end_date < ?`,
      )
      .run(todayISO);
    return legacy.changes;
  }
}

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
  const expired = expirePastExclusionsInSqlite(connection);
  if (expired > 0) {
    dbLog(`initializeDatabase: auto-expired ${expired} past exclusion(s)`);
  }
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
