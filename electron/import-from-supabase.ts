/**
 * Phase 2: copy all Supabase public-table data into local SQLite.
 * Does not switch the app off Supabase; does not change UI or planning.
 */
import type Database from "better-sqlite3";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { App } from "electron";

import {
  createPreMigrationBackup,
  getDatabase,
  getDatabasePath,
  getUserDataPath,
  initializeDatabase,
} from "./database";
import { fetchAllSupabaseRows } from "./supabase-client";

export type TableMigrationStatus = "OK" | "ERROR";

export type TableMigrationReport = {
  table: string;
  supabaseRows: number;
  sqliteRows: number;
  status: TableMigrationStatus;
  error?: string;
};

export type MigrationReport = {
  tables: TableMigrationReport[];
  ok: boolean;
  reportText: string;
};

export type MigrationResult = {
  report: MigrationReport;
  reportText: string;
};

/** Supabase public tables migrated into SQLite (FK-safe insert order). */
const MIGRATE_TABLES = [
  "sections",
  "dogs",
  "agents",
  "checkpoints",
  "checkpoint_posts",
  "agent_exclusions",
  "planning",
  "planning_assignments",
  "rotation_history",
  "operational_cases",
  "operational_case_attachments",
  "application_settings",
] as const;

type MigrateTable = (typeof MIGRATE_TABLES)[number];

/** Children first — clears imported tables without touching local `users`. */
const CLEAR_ORDER: readonly MigrateTable[] = [
  "operational_case_attachments",
  "operational_cases",
  "planning_assignments",
  "rotation_history",
  "planning",
  "agent_exclusions",
  "checkpoint_posts",
  "agents",
  "dogs",
  "checkpoints",
  "sections",
  "application_settings",
];

const PAGE_SIZE = 1000;

function toSqlBool(value: unknown, required = true): number | null {
  if (value == null) return required ? 0 : null;
  return value ? 1 : 0;
}

function jsonText(value: unknown, fallback = "{}"): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function operatingDaysText(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "string") return value;
  return "[1,2,3,4,5,6,7]";
}

async function fetchAllRows(table: string): Promise<Record<string, unknown>[]> {
  return fetchAllSupabaseRows(table, PAGE_SIZE);
}

function clearImportedTables(db: Database.Database): void {
  // Existing DBs may still have the old unique index; drop it so Supabase duplicates can import.
  db.exec(`DROP INDEX IF EXISTS idx_checkpoint_posts_checkpoint_shift_specialty`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_checkpoint_posts_checkpoint_shift_specialty
     ON checkpoint_posts(checkpoint_id, shift, specialty_required)`,
  );

  for (const table of CLEAR_ORDER) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

function countSqlite(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return Number(row.c);
}

function insertSections(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO sections (
      id, name, shift_type, active,
      commander_full_name, commander_grade, commander_mle,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.name,
      row.shift_type,
      toSqlBool(row.active),
      String(row.commander_full_name ?? ""),
      String(row.commander_grade ?? ""),
      String(row.commander_mle ?? ""),
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

function insertDogs(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO dogs (
      id, name, gender, specialty, status, active, photo_url, breed, microchip_number,
      date_of_birth, training_level, veterinary_notes, observations, assignment_date,
      vaccination_info, health_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.name,
      row.gender,
      row.specialty,
      row.status,
      toSqlBool(row.active),
      row.photo_url ?? null,
      row.breed ?? null,
      row.microchip_number ?? null,
      row.date_of_birth ?? null,
      row.training_level ?? null,
      row.veterinary_notes ?? null,
      row.observations ?? null,
      row.assignment_date ?? null,
      row.vaccination_info ?? null,
      row.health_status ?? null,
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

function insertAgents(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO agents (
      id, first_name, last_name, professional_number, grade, gender, section_id, dog_id,
      is_section_chief, active, phone, address, observations, photo_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.first_name,
      row.last_name,
      row.professional_number,
      row.grade,
      row.gender,
      row.section_id ?? null,
      row.dog_id ?? null,
      toSqlBool(row.is_section_chief),
      toSqlBool(row.active),
      row.phone ?? null,
      row.address ?? null,
      row.observations ?? null,
      row.photo_url ?? null,
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

function insertCheckpoints(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO checkpoints (
      id, name, active, night_only, allowed_gender, operating_days, day_shift_enabled,
      night_shift_enabled, female_policy, priority, day_explosives, day_narcotics, night_explosives,
      night_narcotics, required_drugs, required_explosives, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.name,
      toSqlBool(row.active),
      toSqlBool(row.night_only),
      row.allowed_gender ?? "all",
      operatingDaysText(row.operating_days),
      toSqlBool(row.day_shift_enabled ?? true),
      toSqlBool(row.night_shift_enabled ?? true),
      row.female_policy ?? "allowed",
      Number(row.priority ?? 3),
      row.day_explosives ?? 0,
      row.day_narcotics ?? 0,
      row.night_explosives ?? 0,
      row.night_narcotics ?? 0,
      row.required_drugs ?? 0,
      row.required_explosives ?? 0,
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

function insertCheckpointPosts(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO checkpoint_posts (
      id, checkpoint_id, specialty_required, required_agents, active, shift, dog_required,
      allowed_gender, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.checkpoint_id,
      row.specialty_required,
      row.required_agents ?? 1,
      toSqlBool(row.active),
      row.shift ?? "day",
      toSqlBool(row.dog_required ?? true),
      row.allowed_gender ?? "all",
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

function insertAgentExclusions(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO agent_exclusions (
      id, agent_id, exclusion_type, start_date, end_date, notes, active, is_deleted,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.agent_id,
      row.exclusion_type,
      row.start_date,
      row.end_date,
      row.notes ?? null,
      toSqlBool(row.active ?? true),
      toSqlBool(row.is_deleted ?? false),
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

function insertPlanning(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO planning (
      id, planning_date, section_id, shift, created_by, validated, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.planning_date,
      row.section_id,
      row.shift,
      row.created_by ?? null,
      toSqlBool(row.validated),
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

function insertPlanningAssignments(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO planning_assignments (
      id, planning_id, checkpoint_post_id, agent_id, dog_id, is_hq_reserve, is_off_duty,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.planning_id,
      row.checkpoint_post_id ?? null,
      row.agent_id,
      row.dog_id ?? null,
      toSqlBool(row.is_hq_reserve),
      toSqlBool(row.is_off_duty),
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

function insertRotationHistory(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO rotation_history (
      id, agent_id, checkpoint_post_id, planning_date, is_hq_reserve, is_off_duty, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.agent_id,
      row.checkpoint_post_id ?? null,
      row.planning_date,
      toSqlBool(row.is_hq_reserve),
      toSqlBool(row.is_off_duty),
      row.created_at ?? null,
    );
  }
}

function insertOperationalCases(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO operational_cases (
      id, case_date, case_number, agent_id, dog_id, checkpoint_id, specialty, location,
      seizure_type, quantity, unit, object_type, object_count, threat_level, currency_code,
      total_amount, banknote_count, country, observations, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.case_date,
      row.case_number,
      row.agent_id,
      row.dog_id ?? null,
      row.checkpoint_id ?? null,
      row.specialty,
      row.location ?? null,
      row.seizure_type ?? null,
      row.quantity ?? null,
      row.unit ?? null,
      row.object_type ?? null,
      row.object_count ?? null,
      row.threat_level ?? null,
      row.currency_code ?? null,
      row.total_amount ?? null,
      row.banknote_count ?? null,
      row.country ?? null,
      row.observations ?? null,
      toSqlBool(row.is_deleted ?? false),
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

function insertOperationalCaseAttachments(
  db: Database.Database,
  rows: Record<string, unknown>[],
): void {
  const stmt = db.prepare(`
    INSERT INTO operational_case_attachments (
      id, case_id, file_name, storage_path, file_size, mime_type, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.case_id,
      row.file_name,
      row.storage_path,
      row.file_size,
      row.mime_type ?? null,
      row.created_at ?? null,
    );
  }
}

function insertApplicationSettings(db: Database.Database, rows: Record<string, unknown>[]): void {
  const stmt = db.prepare(`
    INSERT INTO application_settings (id, key, value, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    stmt.run(
      row.id,
      row.key,
      jsonText(row.value),
      row.description ?? null,
      row.created_at ?? null,
      row.updated_at ?? null,
    );
  }
}

const INSERT_BY_TABLE: Record<
  MigrateTable,
  (db: Database.Database, rows: Record<string, unknown>[]) => void
> = {
  sections: insertSections,
  dogs: insertDogs,
  agents: insertAgents,
  checkpoints: insertCheckpoints,
  checkpoint_posts: insertCheckpointPosts,
  agent_exclusions: insertAgentExclusions,
  planning: insertPlanning,
  planning_assignments: insertPlanningAssignments,
  rotation_history: insertRotationHistory,
  operational_cases: insertOperationalCases,
  operational_case_attachments: insertOperationalCaseAttachments,
  application_settings: insertApplicationSettings,
};

export function formatMigrationReport(tables: TableMigrationReport[]): string {
  const header = [
    "table".padEnd(32),
    "supabase".padStart(10),
    "sqlite".padStart(10),
    "status".padStart(8),
  ].join(" | ");
  const divider = "-".repeat(header.length);
  const lines = tables.map((row) => {
    const base = [
      row.table.padEnd(32),
      String(row.supabaseRows).padStart(10),
      String(row.sqliteRows).padStart(10),
      row.status.padStart(8),
    ].join(" | ");
    return row.error ? `${base}  ${row.error}` : base;
  });
  const ok = tables.every((row) => row.status === "OK");
  return [header, divider, ...lines, divider, ok ? "RESULT: OK — no data lost" : "RESULT: ERROR"]
    .join("\n");
}

/**
 * Full Supabase → SQLite copy: reset imported tables, insert all rows in one
 * transaction, compare counts, write a migration report under userData.
 */
export async function importDataFromSupabase(app: App): Promise<MigrationResult> {
  initializeDatabase(app);
  const db = getDatabase();
  const dbPath = getDatabasePath(app);
  const userDataPath = getUserDataPath(app);

  // Always snapshot live DB before DELETE/reset — never wipe without a restore point.
  const backupPath = createPreMigrationBackup(db, userDataPath, dbPath);
  console.log(`[electron][migration] pre-import backup: ${backupPath}`);

  const fetched = new Map<MigrateTable, Record<string, unknown>[]>();
  for (const table of MIGRATE_TABLES) {
    fetched.set(table, await fetchAllRows(table));
  }

  const remoteTotal = MIGRATE_TABLES.reduce(
    (sum, table) => sum + (fetched.get(table)?.length ?? 0),
    0,
  );
  const localBusinessTotal = (
    ["agents", "dogs", "checkpoints", "planning"] as const
  ).reduce((sum, table) => sum + countSqlite(db, table), 0);

  if (remoteTotal === 0 && localBusinessTotal > 0) {
    throw new Error(
      `Refusing Supabase → SQLite import: remote returned 0 rows but local DB has ` +
        `${localBusinessTotal} business row(s). Backup kept at ${backupPath}. ` +
        `Check SUPABASE_SERVICE_ROLE_KEY / RLS before retrying.`,
    );
  }

  let failedTable: MigrateTable | null = null;
  let failureMessage: string | null = null;

  try {
    // planning.created_by may reference Supabase auth.users (not local users).
    db.pragma("foreign_keys = OFF");

    const run = db.transaction(() => {
      clearImportedTables(db);

      for (const table of MIGRATE_TABLES) {
        const rows = fetched.get(table) ?? [];
        try {
          INSERT_BY_TABLE[table](db, rows);
          const sqliteRows = countSqlite(db, table);
          if (sqliteRows !== rows.length) {
            throw new Error(
              `Row count mismatch after insert (expected ${rows.length}, got ${sqliteRows})`,
            );
          }
        } catch (error) {
          failedTable = table;
          failureMessage = error instanceof Error ? error.message : String(error);
          throw error;
        }
      }
    });

    run();
  } catch (error) {
    db.pragma("foreign_keys = ON");
    const message = failureMessage ?? (error instanceof Error ? error.message : String(error));
    const tableReports: TableMigrationReport[] = MIGRATE_TABLES.map((table) => ({
      table,
      supabaseRows: fetched.get(table)?.length ?? 0,
      sqliteRows: countSqlite(db, table),
      status: "ERROR" as const,
      error:
        table === failedTable
          ? message
          : `Rolled back because ${failedTable ?? "migration"} failed: ${message}`,
    }));
    const reportText = formatMigrationReport(tableReports);
    console.error("[electron][migration] FAILED — transaction rolled back\n" + reportText);
    throw new Error(`Supabase → SQLite migration failed.\n${reportText}`);
  }

  db.pragma("foreign_keys = ON");

  // Final count verification after commit.
  const tableReports: TableMigrationReport[] = MIGRATE_TABLES.map((table) => {
    const supabaseRows = fetched.get(table)?.length ?? 0;
    const sqliteRows = countSqlite(db, table);
    if (sqliteRows !== supabaseRows) {
      return {
        table,
        supabaseRows,
        sqliteRows,
        status: "ERROR" as const,
        error: `Post-commit count mismatch (expected ${supabaseRows}, got ${sqliteRows})`,
      };
    }
    return { table, supabaseRows, sqliteRows, status: "OK" as const };
  });

  const reportText = formatMigrationReport(tableReports);
  const report: MigrationReport = {
    tables: tableReports,
    ok: tableReports.every((row) => row.status === "OK"),
    reportText,
  };

  const reportPath = join(app.getPath("userData"), "supabase-to-sqlite-migration-report.txt");
  const reportJsonPath = join(app.getPath("userData"), "supabase-to-sqlite-migration-report.json");
  writeFileSync(reportPath, reportText, "utf8");
  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`[electron][migration] database=${getDatabasePath(app)}`);
  console.log("[electron][migration]\n" + reportText);
  console.log(`[electron][migration] report written to ${reportPath}`);

  if (!report.ok) {
    throw new Error(`Supabase → SQLite migration completed with errors.\n${reportText}`);
  }

  return { report, reportText };
}
