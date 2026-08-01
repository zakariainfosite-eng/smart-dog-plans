/**
 * Versioned SQLite migrations for offline CynoPlanning updates.
 *
 * User data lives in Electron userData (cynoplanning.db). Installers replace
 * application files only — migrations run automatically on the next launch.
 *
 * To add a migration in a future release:
 * 1. Append a new entry to SQLITE_MIGRATIONS (never reorder existing ids).
 * 2. Keep the `up` function idempotent when practical (PRAGMA table_info checks).
 * 3. Ship the new Setup.exe — pending migrations run once at startup.
 */
import type Database from "better-sqlite3";
import { copyFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";
const BACKUP_PREFIX = "cynoplanning.db.pre-migration.";
const MAX_BACKUP_FILES = 5;

export type SqliteMigration = {
  /** Stable unique id — never change after release. */
  id: string;
  description: string;
  up: (database: Database.Database) => void;
};

export type RunMigrationsOptions = {
  database: Database.Database;
  userDataPath: string;
  dbPath: string;
  log?: (message: string) => void;
};

function tableColumnNames(database: Database.Database, table: string): Set<string> {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(columns.map((column) => column.name));
}

function migrateSectionsCommanderColumns(database: Database.Database): void {
  const names = tableColumnNames(database, "sections");
  if (!names.has("commander_full_name")) {
    database.exec(`ALTER TABLE sections ADD COLUMN commander_full_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!names.has("commander_grade")) {
    database.exec(`ALTER TABLE sections ADD COLUMN commander_grade TEXT NOT NULL DEFAULT ''`);
  }
  if (!names.has("commander_mle")) {
    database.exec(`ALTER TABLE sections ADD COLUMN commander_mle TEXT NOT NULL DEFAULT ''`);
  }
}

function migrateUsersRoleColumn(database: Database.Database): void {
  const names = tableColumnNames(database, "users");
  if (!names.has("role")) {
    database.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  }
}

function migrateCheckpointsPriorityColumn(database: Database.Database): void {
  const names = tableColumnNames(database, "checkpoints");
  if (!names.has("priority")) {
    database.exec(`ALTER TABLE checkpoints ADD COLUMN priority INTEGER NOT NULL DEFAULT 3`);
  }
}

/** Females are independent of Sections A/B/C — clear any legacy section membership. */
function migrateFemaleAgentsClearSection(database: Database.Database): void {
  database
    .prepare(
      `UPDATE agents SET section_id = NULL, updated_at = datetime('now')
       WHERE lower(gender) = 'female' AND section_id IS NOT NULL`,
    )
    .run();
}

/** Ordered migration history — append only; never reorder or rename released ids. */
export const SQLITE_MIGRATIONS: readonly SqliteMigration[] = [
  {
    id: "001_sections_commander_columns",
    description: "Add commander identity columns to sections",
    up: migrateSectionsCommanderColumns,
  },
  {
    id: "002_users_role_column",
    description: "Add role column to users",
    up: migrateUsersRoleColumn,
  },
  {
    id: "003_checkpoints_priority_column",
    description: "Add priority column to checkpoints",
    up: migrateCheckpointsPriorityColumn,
  },
  {
    id: "004_female_agents_clear_section",
    description: "Clear section assignment for female agents",
    up: migrateFemaleAgentsClearSection,
  },
];

export function ensureSchemaMigrationsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function getAppliedMigrationIds(database: Database.Database): Set<string> {
  ensureSchemaMigrationsTable(database);
  const rows = database
    .prepare(`SELECT id FROM ${SCHEMA_MIGRATIONS_TABLE}`)
    .all() as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

function backupTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * WAL-safe timestamped backup — required before any migration or data reset.
 * Writes `cynoplanning.db.pre-migration.<ISO>.bak` under userData.
 */
export function createPreMigrationBackup(
  database: Database.Database,
  userDataPath: string,
  dbPath: string,
): string {
  if (!existsSync(dbPath)) {
    throw new Error(`Cannot backup missing database: ${dbPath}`);
  }
  database.pragma("wal_checkpoint(FULL)");
  const backupPath = join(userDataPath, `${BACKUP_PREFIX}${backupTimestamp()}.bak`);
  copyFileSync(dbPath, backupPath);
  pruneOldBackups(userDataPath);
  return backupPath;
}

function pruneOldBackups(userDataPath: string): void {
  const backups = readdirSync(userDataPath)
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith(".bak"))
    .sort()
    .reverse();

  for (const file of backups.slice(MAX_BACKUP_FILES)) {
    try {
      unlinkSync(join(userDataPath, file));
    } catch {
      // ignore cleanup errors
    }
  }
}

/** Replace the live database with a pre-migration backup (removes WAL sidecars). */
export function restoreDatabaseFromBackup(
  database: Database.Database,
  dbPath: string,
  backupPath: string,
): void {
  database.close();
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbPath}${suffix}`;
    if (existsSync(sidecar)) {
      unlinkSync(sidecar);
    }
  }
  copyFileSync(backupPath, dbPath);
}

/**
 * Applies pending migrations in order.
 * Creates a backup before the batch; restores it automatically on failure.
 */
export function runPendingMigrations(options: RunMigrationsOptions): void {
  const { database, userDataPath, dbPath, log } = options;
  ensureSchemaMigrationsTable(database);

  const applied = getAppliedMigrationIds(database);
  const pending = SQLITE_MIGRATIONS.filter((migration) => !applied.has(migration.id));
  if (pending.length === 0) {
    log?.("runPendingMigrations: no pending migrations");
    return;
  }

  log?.(`runPendingMigrations: ${pending.length} pending — creating backup`);
  const backupPath = createPreMigrationBackup(database, userDataPath, dbPath);
  log?.(`runPendingMigrations: backup saved to ${backupPath}`);

  const insertMigration = database.prepare(
    `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (id) VALUES (?)`,
  );

  try {
    for (const migration of pending) {
      log?.(`runPendingMigrations: applying ${migration.id}`);
      const apply = database.transaction(() => {
        migration.up(database);
        insertMigration.run(migration.id);
      });
      apply();
      log?.(`runPendingMigrations: applied ${migration.id}`);
    }
  } catch (error) {
    log?.(
      `runPendingMigrations: failed — restoring backup (${error instanceof Error ? error.message : String(error)})`,
    );
    restoreDatabaseFromBackup(database, dbPath, backupPath);
    throw error;
  }
}
