/**
 * Production SQLite migration runner for offline CynoPlanning updates.
 *
 * Safety contract (long-term upgrades V1→Vn):
 * - Installers replace application binaries only. cynoplanning.db in Electron
 *   userData is never deleted, recreated, or replaced by the installer.
 * - On every startup: detect applied versions, run ONLY missing migrations.
 * - Before any pending batch: timestamped WAL-safe backup under userData.
 * - On failure: stop, restore backup, surface a clear error — never leave a
 *   partially migrated database.
 * - Migrations must be additive/idempotent (new columns/tables/indexes/CHECKs).
 *   Table rebuilds (SQLite CHECK limits) copy every row before DROP.
 *
 * To add a migration in a future release:
 * 1. Append a new entry to SQLITE_MIGRATIONS (never reorder/rename released ids).
 * 2. Keep `up` idempotent (PRAGMA table_info / probe inserts).
 * 3. Ship the new installer — pending migrations run once at next launch.
 */
import type Database from "better-sqlite3";
import { copyFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";

/** Current backup file pattern: backup_YYYY-MM-DD_HH-MM-SS.db */
export const MIGRATION_BACKUP_PREFIX = "backup_";
/** Legacy backups from older builds — still pruned/restorable. */
const LEGACY_BACKUP_PREFIX = "cynoplanning.db.pre-migration.";
const MAX_BACKUP_FILES = 5;

export type SqliteMigration = {
  /** Stable unique version id — never change after release. */
  id: string;
  /** Human-readable name stored in schema_migrations.name */
  description: string;
  up: (database: Database.Database) => void;
  /**
   * When true, run outside a SQLite transaction.
   * Required for table rebuilds that toggle PRAGMA foreign_keys (no-op inside a txn).
   */
  noTransaction?: boolean;
};

export type RunMigrationsOptions = {
  database: Database.Database;
  userDataPath: string;
  dbPath: string;
  log?: (message: string) => void;
};

/** Thrown after automatic backup restore when a migration fails. */
export class SqliteMigrationError extends Error {
  readonly migrationId: string | null;
  readonly backupPath: string | null;
  readonly restored: boolean;

  constructor(
    message: string,
    options: {
      migrationId?: string | null;
      backupPath?: string | null;
      restored?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SqliteMigrationError";
    this.migrationId = options.migrationId ?? null;
    this.backupPath = options.backupPath ?? null;
    this.restored = options.restored ?? false;
  }
}

export function isSqliteMigrationError(error: unknown): error is SqliteMigrationError {
  return error instanceof SqliteMigrationError;
}

/** User-facing detail for dialogs / startup logs. */
export function formatMigrationFailureDetail(error: unknown): string {
  if (error instanceof SqliteMigrationError) {
    const lines = [error.message];
    if (error.migrationId) {
      lines.push(`Migration: ${error.migrationId}`);
    }
    if (error.restored && error.backupPath) {
      lines.push(`Database restored from: ${error.backupPath}`);
    }
    lines.push(
      "Your operational data was not left in a partially migrated state.",
      "Quit the app, restore a backup if needed, then retry or contact support.",
    );
    return lines.join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function tableColumnNames(database: Database.Database, table: string): Set<string> {
  return new Set(tableColumnInfo(database, table).map((column) => column.name));
}

function tableColumnInfo(
  database: Database.Database,
  table: string,
): Array<{ name: string; notnull: number; type: string }> {
  return database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    notnull: number;
    type: string;
  }>;
}

function agentExclusionsCreateSql(database: Database.Database): string {
  const row = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_exclusions'`)
    .get() as { sql?: string } | undefined;
  return row?.sql ?? "";
}

/** True when end_date still rejects NULL or chien-sans-maître is not in the CHECK. */
export function agentExclusionsNeedsOpenEndedRebuild(database: Database.Database): boolean {
  const names = tableColumnNames(database, "agent_exclusions");
  if (!names.has("end_date")) return false;
  const endDate = tableColumnInfo(database, "agent_exclusions").find(
    (column) => column.name === "end_date",
  );
  if (!endDate || Number(endDate.notnull) !== 0) return true;
  return !agentExclusionsCreateSql(database).includes("dog_without_handler");
}

export function assertAgentExclusionsOpenEndedSchema(database: Database.Database): void {
  if (agentExclusionsNeedsOpenEndedRebuild(database)) {
    throw new Error(
      "SQLite schema error: agent_exclusions.end_date is still NOT NULL " +
        "(or dog_without_handler is missing from exclusion_type). " +
        "Pending migration 019_open_ended_dog_exclusions was not applied. " +
        "Quit the app, then run: npm run electron:build:main && npm run electron:apply-migrations",
    );
  }
}

/**
 * SQLite requires foreign_keys to be disabled before a table-rebuild transaction starts.
 * The rebuild itself remains transactional, so a crash cannot strand a dropped live table.
 */
function runCrashAtomicTableRebuild(database: Database.Database, rebuild: () => void): void {
  database.pragma("foreign_keys = OFF");
  try {
    database.transaction(rebuild)();
  } finally {
    database.pragma("foreign_keys = ON");
  }
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

function migrateExclusionReturnNotifications(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS exclusion_notifications (
      id TEXT PRIMARY KEY NOT NULL,
      exclusion_id TEXT NOT NULL REFERENCES agent_exclusions(id) ON DELETE CASCADE,
      agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
      dog_id TEXT REFERENCES dogs(id) ON DELETE CASCADE,
      subject_kind TEXT NOT NULL CHECK (subject_kind IN ('personnel', 'dog')),
      notification_type TEXT NOT NULL,
      milestone TEXT NOT NULL CHECK (milestone IN ('d7', 'd3', 'd1', 'd0')),
      end_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      exclusion_type TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (exclusion_id, milestone)
    );
    CREATE INDEX IF NOT EXISTS idx_exclusion_notifications_return_date
      ON exclusion_notifications(return_date);
    CREATE INDEX IF NOT EXISTS idx_exclusion_notifications_is_read
      ON exclusion_notifications(is_read);
  `);
}

function migrateExclusionNotificationsD2Milestone(database: Database.Database): void {
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'exclusion_notifications'")
    .get() as { name: string } | undefined;
  if (!table) return;

  database.exec(`
    CREATE TABLE exclusion_notifications__d2_v1 (
      id TEXT PRIMARY KEY NOT NULL,
      exclusion_id TEXT NOT NULL REFERENCES agent_exclusions(id) ON DELETE CASCADE,
      agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
      dog_id TEXT REFERENCES dogs(id) ON DELETE CASCADE,
      subject_kind TEXT NOT NULL CHECK (subject_kind IN ('personnel', 'dog')),
      notification_type TEXT NOT NULL,
      milestone TEXT NOT NULL CHECK (milestone IN ('d2', 'd1', 'd0', 'd7', 'd3')),
      end_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      exclusion_type TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (exclusion_id, milestone)
    );
    INSERT INTO exclusion_notifications__d2_v1
      SELECT * FROM exclusion_notifications;
    DROP TABLE exclusion_notifications;
    ALTER TABLE exclusion_notifications__d2_v1 RENAME TO exclusion_notifications;
    CREATE INDEX IF NOT EXISTS idx_exclusion_notifications_return_date
      ON exclusion_notifications(return_date);
    CREATE INDEX IF NOT EXISTS idx_exclusion_notifications_is_read
      ON exclusion_notifications(is_read);
  `);
}

function migrateCheckpointsPriorityColumn(database: Database.Database): void {
  const names = tableColumnNames(database, "checkpoints");
  if (!names.has("priority")) {
    database.exec(`ALTER TABLE checkpoints ADD COLUMN priority INTEGER NOT NULL DEFAULT 3`);
  }
}

/** Mandatory vs optional for planning — independent of priority. Default YES (true). */
function migrateCheckpointsMandatoryColumn(database: Database.Database): void {
  const names = tableColumnNames(database, "checkpoints");
  if (!names.has("mandatory")) {
    database.exec(`ALTER TABLE checkpoints ADD COLUMN mandatory INTEGER NOT NULL DEFAULT 1`);
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

/**
 * Personnel roles — existing rows become Cynotechnicien for compatibility.
 * Non-cynotechnicien roles never keep section / dog assignment.
 */
function migrateAgentsFonctionColumn(database: Database.Database): void {
  const names = tableColumnNames(database, "agents");
  if (!names.has("fonction")) {
    database.exec(`ALTER TABLE agents ADD COLUMN fonction TEXT NOT NULL DEFAULT 'cynotechnicien'`);
  }
  database
    .prepare(
      `UPDATE agents SET fonction = 'cynotechnicien'
       WHERE fonction IS NULL OR trim(fonction) = ''`,
    )
    .run();
}

/**
 * Support roles never keep dog assignment.
 * Chef de section may keep section_id (linked commander); other non-cynos clear section.
 */
function migrateNonCynoClearAssignment(database: Database.Database): void {
  const names = tableColumnNames(database, "agents");
  if (!names.has("fonction")) return;
  database
    .prepare(
      `UPDATE agents SET dog_id = NULL, updated_at = datetime('now')
       WHERE fonction IS NOT NULL
         AND fonction != 'cynotechnicien'
         AND dog_id IS NOT NULL`,
    )
    .run();
  database
    .prepare(
      `UPDATE agents SET section_id = NULL, updated_at = datetime('now')
       WHERE fonction IS NOT NULL
         AND fonction NOT IN ('cynotechnicien', 'chef_de_section', 'chef_de_section_pi')
         AND section_id IS NOT NULL`,
    )
    .run();
}

/**
 * Allow fonction = chef_materiel.
 *
 * - If the column was added via ALTER (no CHECK), all values are already allowed.
 * - If an older CREATE TABLE CHECK blocks chef_materiel, rebuild the table.
 *   Rebuild must run with noTransaction (PRAGMA foreign_keys is ignored inside a txn).
 */
function migrateAgentsFonctionChefMateriel(database: Database.Database): void {
  const names = tableColumnNames(database, "agents");
  if (!names.has("fonction")) return;

  const probeId = "__migrate_007_chef_materiel_probe__";
  try {
    database
      .prepare(
        `INSERT INTO agents (
          id, first_name, last_name, professional_number, grade, gender, fonction, active
        ) VALUES (?, '_', '_', ?, '_', 'male', 'chef_materiel', 0)`,
      )
      .run(probeId, probeId);
    database.prepare(`DELETE FROM agents WHERE id = ?`).run(probeId);
    return;
  } catch {
    try {
      database.prepare(`DELETE FROM agents WHERE id = ?`).run(probeId);
    } catch {
      // probe row may not exist
    }
  }

  runCrashAtomicTableRebuild(database, () => {
    database.exec(`
      CREATE TABLE agents__fonction_v2 (
        id TEXT PRIMARY KEY NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        professional_number TEXT NOT NULL UNIQUE,
        grade TEXT NOT NULL,
        gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
        fonction TEXT NOT NULL DEFAULT 'cynotechnicien' CHECK (fonction IN (
          'cynotechnicien',
          'assistant_technique',
          'aide_soignant_veterinaire',
          'chef_de_section',
          'chef_materiel'
        )),
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
      );

      INSERT INTO agents__fonction_v2 (
        id, first_name, last_name, professional_number, grade, gender, fonction,
        section_id, dog_id, is_section_chief, active, phone, address, observations,
        photo_url, created_at, updated_at
      )
      SELECT
        id, first_name, last_name, professional_number, grade, gender,
        COALESCE(NULLIF(trim(fonction), ''), 'cynotechnicien'),
        section_id, dog_id, is_section_chief, active, phone, address, observations,
        photo_url, created_at, updated_at
      FROM agents;

      DROP TABLE agents;
      ALTER TABLE agents__fonction_v2 RENAME TO agents;

      CREATE INDEX IF NOT EXISTS idx_agents_section ON agents(section_id);
      CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);
    `);
  });
}

/**
 * Expand agents.fonction CHECK to the full personnel hierarchy.
 * Required so new roles (Chef Brigade, Secrétaire, Adjoint Chef de section, …) can be stored.
 * Existing values are preserved; unknown empty → cynotechnicien.
 */
function migrateAgentsFonctionHierarchyV2(database: Database.Database): void {
  const names = tableColumnNames(database, "agents");
  if (!names.has("fonction")) return;

  const probeId = "__migrate_011_fonction_hierarchy_probe__";
  try {
    database
      .prepare(
        `INSERT INTO agents (
          id, first_name, last_name, professional_number, grade, gender, fonction, active
        ) VALUES (?, '_', '_', ?, '_', 'male', 'chef_brigade', 0)`,
      )
      .run(probeId, probeId);
    database.prepare(`DELETE FROM agents WHERE id = ?`).run(probeId);
    // Also confirm chef_de_section_pi is accepted when CHECK already rebuilt.
    database
      .prepare(
        `INSERT INTO agents (
          id, first_name, last_name, professional_number, grade, gender, fonction, active
        ) VALUES (?, '_', '_', ?, '_', 'male', 'chef_de_section_pi', 0)`,
      )
      .run(`${probeId}_pi`, `${probeId}_pi`);
    database.prepare(`DELETE FROM agents WHERE id = ?`).run(`${probeId}_pi`);
    return;
  } catch {
    try {
      database.prepare(`DELETE FROM agents WHERE id = ?`).run(probeId);
    } catch {
      // probe row may not exist
    }
    try {
      database.prepare(`DELETE FROM agents WHERE id = ?`).run(`${probeId}_pi`);
    } catch {
      // probe row may not exist
    }
  }

  const hasMarital = names.has("marital_status");

  runCrashAtomicTableRebuild(database, () => {
    database.exec(`
      CREATE TABLE agents__fonction_v3 (
        id TEXT PRIMARY KEY NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        professional_number TEXT NOT NULL UNIQUE,
        grade TEXT NOT NULL,
        gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
        fonction TEXT NOT NULL DEFAULT 'cynotechnicien' CHECK (fonction IN (
          'chef_brigade',
          'chef_brigade_pi',
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
      );
    `);

    if (hasMarital) {
      database.exec(`
        INSERT INTO agents__fonction_v3 (
          id, first_name, last_name, professional_number, grade, gender, fonction,
          marital_status, section_id, dog_id, is_section_chief, active, phone, address,
          observations, photo_url, created_at, updated_at
        )
        SELECT
          id, first_name, last_name, professional_number, grade, gender,
          COALESCE(NULLIF(trim(fonction), ''), 'cynotechnicien'),
          marital_status, section_id, dog_id, is_section_chief, active, phone, address,
          observations, photo_url, created_at, updated_at
        FROM agents;
      `);
    } else {
      database.exec(`
        INSERT INTO agents__fonction_v3 (
          id, first_name, last_name, professional_number, grade, gender, fonction,
          section_id, dog_id, is_section_chief, active, phone, address,
          observations, photo_url, created_at, updated_at
        )
        SELECT
          id, first_name, last_name, professional_number, grade, gender,
          COALESCE(NULLIF(trim(fonction), ''), 'cynotechnicien'),
          section_id, dog_id, is_section_chief, active, phone, address,
          observations, photo_url, created_at, updated_at
        FROM agents;
      `);
    }

    database.exec(`
      DROP TABLE agents;
      ALTER TABLE agents__fonction_v3 RENAME TO agents;

      CREATE INDEX IF NOT EXISTS idx_agents_section ON agents(section_id);
      CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);
    `);
  });
}

/**
 * Canonical rename chef_brigade → chef_brigadier (+ PI) and ensure CHECK accepts
 * the full hierarchy used by UI / Electron validation.
 *
 * Strictly required: SQLite CHECK cannot be ALTERed in place.
 */
function migrateAgentsFonctionBrigadierCanonical(database: Database.Database): void {
  const names = tableColumnNames(database, "agents");
  if (!names.has("fonction")) return;

  const probeId = "__migrate_012_fonction_brigadier_probe__";
  let acceptsBrigadier = false;
  try {
    database
      .prepare(
        `INSERT INTO agents (
          id, first_name, last_name, professional_number, grade, gender, fonction, active
        ) VALUES (?, '_', '_', ?, '_', 'male', 'chef_brigadier', 0)`,
      )
      .run(probeId, probeId);
    database.prepare(`DELETE FROM agents WHERE id = ?`).run(probeId);
    acceptsBrigadier = true;
  } catch {
    try {
      database.prepare(`DELETE FROM agents WHERE id = ?`).run(probeId);
    } catch {
      // probe row may not exist
    }
  }

  const remapSql = `
    CASE trim(fonction)
      WHEN 'chef_brigade' THEN 'chef_brigadier'
      WHEN 'chef_brigade_pi' THEN 'chef_brigadier_pi'
      ELSE COALESCE(NULLIF(trim(fonction), ''), 'cynotechnicien')
    END
  `;

  if (acceptsBrigadier) {
    database
      .prepare(`UPDATE agents SET fonction = 'chef_brigadier' WHERE fonction = 'chef_brigade'`)
      .run();
    database
      .prepare(
        `UPDATE agents SET fonction = 'chef_brigadier_pi' WHERE fonction = 'chef_brigade_pi'`,
      )
      .run();
    return;
  }

  const hasMarital = names.has("marital_status");

  runCrashAtomicTableRebuild(database, () => {
    database.exec(`
      CREATE TABLE agents__fonction_v4 (
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
      );
    `);

    if (hasMarital) {
      database.exec(`
        INSERT INTO agents__fonction_v4 (
          id, first_name, last_name, professional_number, grade, gender, fonction,
          marital_status, section_id, dog_id, is_section_chief, active, phone, address,
          observations, photo_url, created_at, updated_at
        )
        SELECT
          id, first_name, last_name, professional_number, grade, gender,
          ${remapSql},
          marital_status, section_id, dog_id, is_section_chief, active, phone, address,
          observations, photo_url, created_at, updated_at
        FROM agents;
      `);
    } else {
      database.exec(`
        INSERT INTO agents__fonction_v4 (
          id, first_name, last_name, professional_number, grade, gender, fonction,
          section_id, dog_id, is_section_chief, active, phone, address,
          observations, photo_url, created_at, updated_at
        )
        SELECT
          id, first_name, last_name, professional_number, grade, gender,
          ${remapSql},
          section_id, dog_id, is_section_chief, active, phone, address,
          observations, photo_url, created_at, updated_at
        FROM agents;
      `);
    }

    database.exec(`
      DROP TABLE agents;
      ALTER TABLE agents__fonction_v4 RENAME TO agents;

      CREATE INDEX IF NOT EXISTS idx_agents_section ON agents(section_id);
      CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);
    `);
  });
}

/**
 * Exclusions may target a cynotechnicien (agent_id) and/or a dog (dog_id).
 * Expands exclusion_type CHECK with suspension + dog-specific reasons.
 * Backfills dog_id for legacy dog-level rows from the assigned handler's dog.
 */
function migrateAgentExclusionsDogTarget(database: Database.Database): void {
  const names = tableColumnNames(database, "agent_exclusions");
  const hasDogId = names.has("dog_id");
  const probeId = "__migrate_008_exclusion_probe__";

  let schemaReady = false;
  if (hasDogId) {
    const agentRow = database.prepare(`SELECT id FROM agents LIMIT 1`).get() as
      { id: string } | undefined;
    if (agentRow) {
      try {
        database
          .prepare(
            `INSERT INTO agent_exclusions (
              id, agent_id, dog_id, exclusion_type, start_date, end_date, active, is_deleted
            ) VALUES (?, ?, NULL, 'suspension', '2099-01-01', '2099-01-01', 0, 0)`,
          )
          .run(probeId, agentRow.id);
        database.prepare(`DELETE FROM agent_exclusions WHERE id = ?`).run(probeId);
        schemaReady = true;
      } catch {
        try {
          database.prepare(`DELETE FROM agent_exclusions WHERE id = ?`).run(probeId);
        } catch {
          // probe row may not exist
        }
        schemaReady = false;
      }
    } else {
      // No agents to probe — assume dog_id column presence is enough for empty DBs
      schemaReady = true;
    }
  }

  if (schemaReady) {
    database.exec(`
      UPDATE agent_exclusions
      SET dog_id = (
        SELECT agents.dog_id FROM agents WHERE agents.id = agent_exclusions.agent_id
      )
      WHERE dog_id IS NULL
        AND exclusion_type IN (
          'dog_sick', 'female_dog_heat', 'dog_injured', 'dog_temporary_retirement',
          'dog_vet_visit', 'dog_training', 'dog_other'
        )
        AND agent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM agents
          WHERE agents.id = agent_exclusions.agent_id AND agents.dog_id IS NOT NULL
        )
    `);
    database.exec(
      `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dog ON agent_exclusions(dog_id)`,
    );
    return;
  }

  runCrashAtomicTableRebuild(database, () => {
    database.exec(`
      CREATE TABLE agent_exclusions__v2 (
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
      );
    `);

    if (hasDogId) {
      database.exec(`
        INSERT INTO agent_exclusions__v2 (
          id, agent_id, dog_id, exclusion_type, start_date, end_date, notes,
          active, is_deleted, created_at, updated_at
        )
        SELECT
          e.id,
          e.agent_id,
          COALESCE(
            e.dog_id,
            CASE
              WHEN e.exclusion_type IN (
                'dog_sick', 'female_dog_heat', 'dog_injured', 'dog_temporary_retirement',
                'dog_vet_visit', 'dog_training', 'dog_other'
              )
              THEN (SELECT a.dog_id FROM agents a WHERE a.id = e.agent_id)
              ELSE NULL
            END
          ),
          e.exclusion_type,
          e.start_date,
          e.end_date,
          e.notes,
          e.active,
          e.is_deleted,
          e.created_at,
          e.updated_at
        FROM agent_exclusions e
      `);
    } else {
      database.exec(`
        INSERT INTO agent_exclusions__v2 (
          id, agent_id, dog_id, exclusion_type, start_date, end_date, notes,
          active, is_deleted, created_at, updated_at
        )
        SELECT
          e.id,
          e.agent_id,
          CASE
            WHEN e.exclusion_type IN (
              'dog_sick', 'female_dog_heat', 'dog_injured', 'dog_temporary_retirement',
              'dog_vet_visit', 'dog_training', 'dog_other'
            )
            THEN (SELECT a.dog_id FROM agents a WHERE a.id = e.agent_id)
            ELSE NULL
          END,
          e.exclusion_type,
          e.start_date,
          e.end_date,
          e.notes,
          e.active,
          e.is_deleted,
          e.created_at,
          e.updated_at
        FROM agent_exclusions e
      `);
    }

    database.exec(`
      DROP TABLE agent_exclusions;
      ALTER TABLE agent_exclusions__v2 RENAME TO agent_exclusions;

      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_agent ON agent_exclusions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dog ON agent_exclusions(dog_id);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dates ON agent_exclusions(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_active ON agent_exclusions(active);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_is_deleted ON agent_exclusions(is_deleted);
    `);
  });
}

/**
 * Situation familiale — nullable so existing personnel stay intact (UI: Non renseignée).
 * New/edited personnel must set a value via the form.
 */
function migrateAgentsMaritalStatusColumn(database: Database.Database): void {
  const names = tableColumnNames(database, "agents");
  if (!names.has("marital_status")) {
    database.exec(`ALTER TABLE agents ADD COLUMN marital_status TEXT DEFAULT NULL`);
  }
}

/** Nullable birth date — legacy rows stay NULL until filled in the form. */
function migrateAgentsDateNaissanceColumn(database: Database.Database): void {
  const names = tableColumnNames(database, "agents");
  if (!names.has("date_naissance")) {
    database.exec(`ALTER TABLE agents ADD COLUMN date_naissance TEXT DEFAULT NULL`);
  }
}

/** Nullable origin — existing personnel rows remain unchanged (NULL). */
function migrateAgentsOrigineColumn(database: Database.Database): void {
  const names = tableColumnNames(database, "agents");
  if (!names.has("origine")) {
    database.exec(`ALTER TABLE agents ADD COLUMN origine TEXT DEFAULT NULL`);
  }
}

function migrateRoleDocumentsModule(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS role_documents (
      id TEXT PRIMARY KEY NOT NULL,
      reference_number TEXT UNIQUE,
      role_category TEXT NOT NULL CHECK (role_category IN ('veterinary', 'assistant', 'secretary', 'equipment_chief')),
      template_id TEXT NOT NULL,
      document_kind TEXT NOT NULL CHECK (document_kind IN ('report', 'message', 'monthly')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
      title TEXT NOT NULL,
      report_month INTEGER CHECK (report_month IS NULL OR (report_month >= 1 AND report_month <= 12)),
      report_year INTEGER CHECK (report_year IS NULL OR report_year >= 2000),
      agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      dog_id TEXT REFERENCES dogs(id) ON DELETE SET NULL,
      section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_by_user_id TEXT,
      created_by_email TEXT,
      created_by_name TEXT NOT NULL DEFAULT '',
      finalized_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS document_reference_sequences (
      prefix TEXT NOT NULL CHECK (prefix IN ('RAP', 'MSG')),
      year INTEGER NOT NULL CHECK (year >= 2000),
      last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
      PRIMARY KEY (prefix, year)
    );
    CREATE INDEX IF NOT EXISTS idx_role_documents_role_category ON role_documents(role_category);
    CREATE INDEX IF NOT EXISTS idx_role_documents_status ON role_documents(status);
    CREATE INDEX IF NOT EXISTS idx_role_documents_template ON role_documents(template_id);
    CREATE INDEX IF NOT EXISTS idx_role_documents_agent ON role_documents(agent_id);
    CREATE INDEX IF NOT EXISTS idx_role_documents_dog ON role_documents(dog_id);
    CREATE INDEX IF NOT EXISTS idx_role_documents_section ON role_documents(section_id);
    CREATE INDEX IF NOT EXISTS idx_role_documents_created_at ON role_documents(created_at);
    CREATE INDEX IF NOT EXISTS idx_role_documents_report_period ON role_documents(report_year, report_month);
  `);
}

function migrateRoleDocumentsEquipmentChiefCategory(database: Database.Database): void {
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'role_documents'")
    .get() as { name: string } | undefined;
  if (!table) return;

  database.exec(`
    CREATE TABLE role_documents__equipment_chief_v1 (
      id TEXT PRIMARY KEY NOT NULL,
      reference_number TEXT UNIQUE,
      role_category TEXT NOT NULL CHECK (role_category IN ('veterinary', 'assistant', 'secretary', 'equipment_chief')),
      template_id TEXT NOT NULL,
      document_kind TEXT NOT NULL CHECK (document_kind IN ('report', 'message', 'monthly')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
      title TEXT NOT NULL,
      report_month INTEGER CHECK (report_month IS NULL OR (report_month >= 1 AND report_month <= 12)),
      report_year INTEGER CHECK (report_year IS NULL OR report_year >= 2000),
      agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      dog_id TEXT REFERENCES dogs(id) ON DELETE SET NULL,
      section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_by_user_id TEXT,
      created_by_email TEXT,
      created_by_name TEXT NOT NULL DEFAULT '',
      finalized_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO role_documents__equipment_chief_v1
      SELECT * FROM role_documents;
    DROP TABLE role_documents;
    ALTER TABLE role_documents__equipment_chief_v1 RENAME TO role_documents;
    CREATE INDEX IF NOT EXISTS idx_role_documents_role_category ON role_documents(role_category);
    CREATE INDEX IF NOT EXISTS idx_role_documents_status ON role_documents(status);
    CREATE INDEX IF NOT EXISTS idx_role_documents_template ON role_documents(template_id);
    CREATE INDEX IF NOT EXISTS idx_role_documents_agent ON role_documents(agent_id);
    CREATE INDEX IF NOT EXISTS idx_role_documents_dog ON role_documents(dog_id);
    CREATE INDEX IF NOT EXISTS idx_role_documents_section ON role_documents(section_id);
    CREATE INDEX IF NOT EXISTS idx_role_documents_created_at ON role_documents(created_at);
    CREATE INDEX IF NOT EXISTS idx_role_documents_report_period ON role_documents(report_year, report_month);
  `);
}

/**
 * Allow NULL end_date for open-ended dog exclusions and add `dog_without_handler`.
 * Existing rows keep every stored value, including existing end dates.
 */
function migrateOpenEndedDogExclusions(database: Database.Database): void {
  if (!agentExclusionsNeedsOpenEndedRebuild(database)) return;

  const beforeCount = (
    database.prepare(`SELECT COUNT(*) AS n FROM agent_exclusions`).get() as { n: number }
  ).n;

  runCrashAtomicTableRebuild(database, () => {
    database.exec(`
      CREATE TABLE agent_exclusions__open_ended (
        id TEXT PRIMARY KEY NOT NULL,
        agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
        dog_id TEXT REFERENCES dogs(id) ON DELETE CASCADE,
        exclusion_type TEXT NOT NULL CHECK (exclusion_type IN (
          'absence', 'sickness', 'administrative_leave', 'special_leave',
          'dog_sick', 'female_dog_heat', 'annual_leave', 'mission', 'training', 'other',
          'suspension',
          'dog_injured', 'dog_temporary_retirement', 'dog_vet_visit', 'dog_without_handler',
          'dog_training', 'dog_other'
        )),
        start_date TEXT NOT NULL,
        end_date TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (end_date IS NULL OR end_date >= start_date),
        CHECK (agent_id IS NOT NULL OR dog_id IS NOT NULL)
      );
      INSERT INTO agent_exclusions__open_ended (
        id, agent_id, dog_id, exclusion_type, start_date, end_date, notes,
        active, is_deleted, created_at, updated_at
      )
      SELECT
        id, agent_id, dog_id, exclusion_type, start_date, end_date, notes,
        active, is_deleted, created_at, updated_at
      FROM agent_exclusions;
      DROP TABLE agent_exclusions;
      ALTER TABLE agent_exclusions__open_ended RENAME TO agent_exclusions;
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_agent ON agent_exclusions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dog ON agent_exclusions(dog_id);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dates ON agent_exclusions(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_active ON agent_exclusions(active);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_is_deleted ON agent_exclusions(is_deleted);
    `);
  });

  const afterCount = (
    database.prepare(`SELECT COUNT(*) AS n FROM agent_exclusions`).get() as { n: number }
  ).n;
  if (afterCount !== beforeCount) {
    throw new Error(
      `019_open_ended_dog_exclusions: row count changed (${beforeCount} → ${afterCount})`,
    );
  }
  if (agentExclusionsNeedsOpenEndedRebuild(database)) {
    throw new Error("019_open_ended_dog_exclusions: end_date is still NOT NULL after rebuild");
  }
}

/** True when `rest` (Repos) is missing from the exclusion_type CHECK. */
export function agentExclusionsNeedsRestTypeRebuild(database: Database.Database): boolean {
  if (!tableColumnNames(database, "agent_exclusions").has("exclusion_type")) return false;
  return !agentExclusionsCreateSql(database).includes("'rest'");
}

/**
 * Add personnel exclusion type `rest` (UI: Repos). Copies every existing row.
 */
function migrateAgentExclusionsRestType(database: Database.Database): void {
  if (!agentExclusionsNeedsRestTypeRebuild(database)) return;

  const beforeCount = (
    database.prepare(`SELECT COUNT(*) AS n FROM agent_exclusions`).get() as { n: number }
  ).n;

  runCrashAtomicTableRebuild(database, () => {
    database.exec(`
      CREATE TABLE agent_exclusions__rest (
        id TEXT PRIMARY KEY NOT NULL,
        agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
        dog_id TEXT REFERENCES dogs(id) ON DELETE CASCADE,
        exclusion_type TEXT NOT NULL CHECK (exclusion_type IN (
          'absence', 'sickness', 'administrative_leave', 'special_leave',
          'dog_sick', 'female_dog_heat', 'annual_leave', 'mission', 'training', 'rest', 'other',
          'suspension',
          'dog_injured', 'dog_temporary_retirement', 'dog_vet_visit', 'dog_without_handler',
          'dog_training', 'dog_other'
        )),
        start_date TEXT NOT NULL,
        end_date TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (end_date IS NULL OR end_date >= start_date),
        CHECK (agent_id IS NOT NULL OR dog_id IS NOT NULL)
      );
      INSERT INTO agent_exclusions__rest (
        id, agent_id, dog_id, exclusion_type, start_date, end_date, notes,
        active, is_deleted, created_at, updated_at
      )
      SELECT
        id, agent_id, dog_id, exclusion_type, start_date, end_date, notes,
        active, is_deleted, created_at, updated_at
      FROM agent_exclusions;
      DROP TABLE agent_exclusions;
      ALTER TABLE agent_exclusions__rest RENAME TO agent_exclusions;
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_agent ON agent_exclusions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dog ON agent_exclusions(dog_id);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dates ON agent_exclusions(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_active ON agent_exclusions(active);
      CREATE INDEX IF NOT EXISTS idx_agent_exclusions_is_deleted ON agent_exclusions(is_deleted);
    `);
  });

  const afterCount = (
    database.prepare(`SELECT COUNT(*) AS n FROM agent_exclusions`).get() as { n: number }
  ).n;
  if (afterCount !== beforeCount) {
    throw new Error(
      `021_agent_exclusions_rest_type: row count changed (${beforeCount} → ${afterCount})`,
    );
  }
  if (agentExclusionsNeedsRestTypeRebuild(database)) {
    throw new Error("021_agent_exclusions_rest_type: rest is still missing from exclusion_type CHECK");
  }
}

/**
 * Informational-only table: manual (and future imported) administrative events.
 * Automatic events stay in their own modules and are merged at read time, so no
 * planning/rotation/exclusion behaviour depends on this table.
 */
function migrateAgentAdministrativeHistory(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_administrative_history (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN (
        'conge', 'permission', 'arret_maladie', 'formation', 'exclusion_formation', 'autre'
      )),
      start_date TEXT NOT NULL,
      end_date TEXT,
      reason TEXT,
      observation TEXT,
      reference TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN (
        'manual', 'import', 'conge', 'permission', 'maladie', 'formation',
        'exclusion', 'cas_operationnel', 'planning'
      )),
      source_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (end_date IS NULL OR end_date >= start_date)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_admin_history_agent ON agent_administrative_history(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_admin_history_start_date ON agent_administrative_history(start_date);
    CREATE INDEX IF NOT EXISTS idx_agent_admin_history_type ON agent_administrative_history(event_type);
    CREATE INDEX IF NOT EXISTS idx_agent_admin_history_source ON agent_administrative_history(source_type, source_id);
  `);
}

function migrateAgentCheckpointRestrictions(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_checkpoint_restrictions (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (agent_id, checkpoint_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_checkpoint_restrictions_checkpoint
      ON agent_checkpoint_restrictions(checkpoint_id);
    CREATE INDEX IF NOT EXISTS idx_agent_checkpoint_restrictions_agent
      ON agent_checkpoint_restrictions(agent_id);
  `);
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
  {
    id: "005_agents_fonction_column",
    description: "Add personnel fonction role column (default cynotechnicien)",
    up: migrateAgentsFonctionColumn,
  },
  {
    id: "006_non_cyno_clear_assignment",
    description: "Clear section/dog for non-cynotechnicien support roles",
    up: migrateNonCynoClearAssignment,
  },
  {
    id: "007_agents_fonction_chef_materiel",
    description: "Allow chef_materiel personnel fonction value",
    up: migrateAgentsFonctionChefMateriel,
    noTransaction: true,
  },
  {
    id: "008_agent_exclusions_dog_target",
    description: "Support dog-targeted exclusions and expanded exclusion types",
    up: migrateAgentExclusionsDogTarget,
    noTransaction: true,
  },
  {
    id: "009_agents_marital_status_column",
    description: "Add marital_status (situation familiale) to agents — nullable for existing rows",
    up: migrateAgentsMaritalStatusColumn,
  },
  {
    id: "010_checkpoints_mandatory_column",
    description: "Add mandatory boolean to checkpoints (default true / YES)",
    up: migrateCheckpointsMandatoryColumn,
  },
  {
    id: "011_agents_fonction_hierarchy_v2",
    description:
      "Expand agents.fonction CHECK for full personnel hierarchy (Chef Brigade, PI, Secrétariat, …)",
    up: migrateAgentsFonctionHierarchyV2,
    noTransaction: true,
  },
  {
    id: "012_agents_fonction_brigadier_canonical",
    description:
      "Rename chef_brigade → chef_brigadier (+ PI) and expand fonction CHECK to canonical hierarchy",
    up: migrateAgentsFonctionBrigadierCanonical,
    noTransaction: true,
  },
  {
    id: "013_exclusion_return_notifications",
    description: "Alert center table for upcoming exclusion return milestones",
    up: migrateExclusionReturnNotifications,
  },
  {
    id: "014_agents_date_naissance_column",
    description: "Add date_naissance (date of birth) to agents — nullable for existing rows",
    up: migrateAgentsDateNaissanceColumn,
  },
  {
    id: "015_agents_origine_column",
    description: "Add origine to agents — nullable for existing rows",
    up: migrateAgentsOrigineColumn,
  },
  {
    id: "016_role_documents_module",
    description: "Rapports & Messages — role_documents and reference sequences",
    up: migrateRoleDocumentsModule,
  },
  {
    id: "017_role_documents_equipment_chief",
    description: "Rapports & Messages — allow equipment_chief role category",
    up: migrateRoleDocumentsEquipmentChiefCategory,
  },
  {
    id: "018_exclusion_notifications_d2_milestone",
    description: "Exclusion end reminders — add d2 milestone (2 days before end)",
    up: migrateExclusionNotificationsD2Milestone,
  },
  {
    id: "019_open_ended_dog_exclusions",
    description: "Open-ended dog exclusions — nullable end_date + chien sans maître",
    up: migrateOpenEndedDogExclusions,
    noTransaction: true,
  },
  {
    id: "020_agent_administrative_history",
    description: "Historique administratif du fonctionnaire — saisie manuelle et import",
    up: migrateAgentAdministrativeHistory,
  },
  {
    id: "021_agent_exclusions_rest_type",
    description: "Add Repos (rest) personnel exclusion type to CHECK",
    up: migrateAgentExclusionsRestType,
    noTransaction: true,
  },
  {
    id: "022_agent_checkpoint_restrictions",
    description: "Permanent per-checkpoint cynotechnician restrictions",
    up: migrateAgentCheckpointRestrictions,
  },
];

function schemaMigrationColumnNames(database: Database.Database): Set<string> {
  return tableColumnNames(database, SCHEMA_MIGRATIONS_TABLE);
}

/**
 * Ensures schema_migrations exists with version/name/date/success columns.
 * Safe on older DBs that only had (id, applied_at).
 */
export function ensureSchemaMigrationsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      success INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1))
    )
  `);

  const names = schemaMigrationColumnNames(database);
  if (!names.has("name")) {
    database.exec(
      `ALTER TABLE ${SCHEMA_MIGRATIONS_TABLE} ADD COLUMN name TEXT NOT NULL DEFAULT ''`,
    );
  }
  if (!names.has("applied_at")) {
    database.exec(
      `ALTER TABLE ${SCHEMA_MIGRATIONS_TABLE} ADD COLUMN applied_at TEXT NOT NULL DEFAULT (datetime('now'))`,
    );
  }
  if (!names.has("success")) {
    database.exec(
      `ALTER TABLE ${SCHEMA_MIGRATIONS_TABLE} ADD COLUMN success INTEGER NOT NULL DEFAULT 1`,
    );
  }

  // Backfill human-readable names for rows recorded by older runners.
  database
    .prepare(
      `UPDATE ${SCHEMA_MIGRATIONS_TABLE}
       SET name = id
       WHERE name IS NULL OR trim(name) = ''`,
    )
    .run();
}

/** Successfully applied migration version ids (failed rows are not skipped). */
export function getAppliedMigrationIds(database: Database.Database): Set<string> {
  ensureSchemaMigrationsTable(database);
  const rows = database
    .prepare(
      `SELECT id FROM ${SCHEMA_MIGRATIONS_TABLE}
       WHERE COALESCE(success, 1) = 1`,
    )
    .all() as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local timestamp for backup_YYYY-MM-DD_HH-MM-SS.db */
export function migrationBackupTimestamp(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `_${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`
  );
}

export function isMigrationBackupFileName(name: string): boolean {
  if (/^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/.test(name)) {
    return true;
  }
  return name.startsWith(LEGACY_BACKUP_PREFIX) && name.endsWith(".bak");
}

/**
 * WAL-safe timestamped backup — required before any migration batch.
 * Writes `backup_YYYY-MM-DD_HH-MM-SS.db` under userData.
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
  const backupPath = join(
    userDataPath,
    `${MIGRATION_BACKUP_PREFIX}${migrationBackupTimestamp()}.db`,
  );
  copyFileSync(dbPath, backupPath);
  pruneOldBackups(userDataPath);
  return backupPath;
}

function pruneOldBackups(userDataPath: string): void {
  const backups = readdirSync(userDataPath)
    .filter((name) => isMigrationBackupFileName(name))
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
  if (!existsSync(backupPath)) {
    throw new Error(`Cannot restore — backup missing: ${backupPath}`);
  }
  try {
    database.close();
  } catch {
    // connection may already be closed
  }
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbPath}${suffix}`;
    if (existsSync(sidecar)) {
      unlinkSync(sidecar);
    }
  }
  copyFileSync(backupPath, dbPath);
}

function recordSuccessfulMigration(database: Database.Database, migration: SqliteMigration): void {
  database
    .prepare(
      `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (id, name, applied_at, success)
       VALUES (?, ?, datetime('now'), 1)`,
    )
    .run(migration.id, migration.description);
}

/** Fail loudly if a required migrated column is missing (avoids silent UI defaults). */
export function assertAgentsFonctionSchema(database: Database.Database): void {
  const names = tableColumnNames(database, "agents");
  if (!names.has("fonction")) {
    throw new Error(
      "SQLite schema error: agents.fonction column is missing. " +
        "Pending migration 005_agents_fonction_column was not applied. " +
        "Restart the app after rebuilding the Electron main process (npm run electron:build:main).",
    );
  }

  // Ensure CHECK accepts the canonical hierarchy (migration 012).
  const probeId = "__assert_fonction_brigadier__";
  try {
    database
      .prepare(
        `INSERT INTO agents (
          id, first_name, last_name, professional_number, grade, gender, fonction, active
        ) VALUES (?, '_', '_', ?, '_', 'male', 'chef_brigadier', 0)`,
      )
      .run(probeId, probeId);
    database.prepare(`DELETE FROM agents WHERE id = ?`).run(probeId);
  } catch (error) {
    try {
      database.prepare(`DELETE FROM agents WHERE id = ?`).run(probeId);
    } catch {
      // probe may not exist
    }
    throw new Error(
      "SQLite schema error: agents.fonction CHECK rejects chef_brigadier. " +
        "Pending migration 012_agents_fonction_brigadier_canonical was not applied. " +
        "Quit the app, then run: npm run electron:build:main && npm run electron:apply-migrations. " +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/** Fail loudly if checkpoints.mandatory is missing (planning SELECT requires it). */
export function assertCheckpointsMandatorySchema(database: Database.Database): void {
  const names = tableColumnNames(database, "checkpoints");
  if (!names.has("mandatory")) {
    throw new Error(
      "SQLite schema error: checkpoints.mandatory column is missing. " +
        "Pending migration 010_checkpoints_mandatory_column was not applied. " +
        "Quit the app, then run: npm run electron:build:main && npm run electron:apply-migrations",
    );
  }
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
    log?.(
      `runPendingMigrations: no pending migrations (${applied.size}/${SQLITE_MIGRATIONS.length} recorded)`,
    );
  } else {
    log?.(`runPendingMigrations: ${pending.length} pending — creating backup`);
    const backupPath = createPreMigrationBackup(database, userDataPath, dbPath);
    log?.(`runPendingMigrations: backup saved to ${backupPath}`);

    let currentId: string | null = null;
    try {
      for (const migration of pending) {
        currentId = migration.id;
        log?.(`runPendingMigrations: applying ${migration.id} (${migration.description})`);
        if (migration.noTransaction) {
          migration.up(database);
          recordSuccessfulMigration(database, migration);
        } else {
          const apply = database.transaction(() => {
            migration.up(database);
            recordSuccessfulMigration(database, migration);
          });
          apply();
        }
        log?.(`runPendingMigrations: applied ${migration.id}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log?.(
        `runPendingMigrations: failed at ${currentId ?? "unknown"} — restoring backup (${reason})`,
      );
      let restored = false;
      try {
        restoreDatabaseFromBackup(database, dbPath, backupPath);
        restored = true;
        log?.(`runPendingMigrations: restored database from ${backupPath}`);
      } catch (restoreError) {
        log?.(
          `runPendingMigrations: CRITICAL — restore failed (${
            restoreError instanceof Error ? restoreError.message : String(restoreError)
          })`,
        );
        throw new SqliteMigrationError(
          `Database migration failed and automatic restore also failed. ` +
            `Manual restore required from: ${backupPath}. Original error: ${reason}`,
          {
            migrationId: currentId,
            backupPath,
            restored: false,
            cause: error,
          },
        );
      }
      throw new SqliteMigrationError(
        `Database migration failed. The previous database was restored automatically. (${reason})`,
        {
          migrationId: currentId,
          backupPath,
          restored,
          cause: error,
        },
      );
    }
  }

  assertAgentsFonctionSchema(database);
  log?.("runPendingMigrations: agents.fonction schema OK");
  assertCheckpointsMandatorySchema(database);
  log?.("runPendingMigrations: checkpoints.mandatory schema OK");
  assertAgentExclusionsOpenEndedSchema(database);
  log?.("runPendingMigrations: agent_exclusions.end_date nullable schema OK");
}
