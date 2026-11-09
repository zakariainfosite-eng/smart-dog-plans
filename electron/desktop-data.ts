import Database from "better-sqlite3";
import { BrowserWindow, dialog, type App } from "electron";
import { copyFileSync, existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";

import {
  SCHEMA_MIGRATIONS_TABLE,
  SCHEMA_TABLE_NAMES,
} from "../src/integrations/database/schema-sql";
import type { ClearLocalDataResult } from "../src/lib/clear-local-data";
import type {
  SqliteColumnInfo,
  WindowsDbConfirmationCounts,
  WindowsDbImportResult,
  WindowsDbInspection,
  WindowsDbIncompatibleTable,
} from "../src/lib/windows-db-import";
import {
  closeDatabase,
  createPreMigrationBackup,
  getDatabase,
  getDatabasePath,
  getUserDataPath,
  initializeDatabase,
} from "./database";

const SQLITE_MAGIC = "SQLite format 3\0";
const ALWAYS_SKIP_COLUMNS = new Set(["total_required_staff"]);
const SKIP_SOURCE_TABLES = new Set(["schema_migrations", "sqlite_sequence"]);
const CONFIRMATION_TABLES = {
  agents: "agents",
  dogs: "dogs",
  checkpoints: "checkpoints",
  planning: "planning",
  exclusions: "agent_exclusions",
  users: "users",
} as const;

function isSqliteDatabaseBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) return false;
  const header = new TextDecoder("utf-8").decode(bytes.subarray(0, 16));
  return header === SQLITE_MAGIC;
}

function isGeneratedColumn(column: SqliteColumnInfo): boolean {
  if (ALWAYS_SKIP_COLUMNS.has(column.name)) return true;
  return Number(column.hidden ?? 0) !== 0;
}

function intersectImportableColumns(
  targetColumns: SqliteColumnInfo[],
  sourceColumnNames: readonly string[],
): string[] {
  const source = new Set(sourceColumnNames);
  return targetColumns
    .filter((column) => !isGeneratedColumn(column) && source.has(column.name))
    .map((column) => column.name);
}

function missingRequiredSourceColumns(
  targetColumns: SqliteColumnInfo[],
  importableColumns: readonly string[],
): string[] {
  const available = new Set(importableColumns);
  return targetColumns
    .filter((column) => !isGeneratedColumn(column))
    .filter((column) => Number(column.notnull) === 1 && column.dflt_value == null)
    .filter((column) => !available.has(column.name))
    .map((column) => column.name);
}

export type PickSqliteDatabaseResult =
  | { canceled: true }
  | { canceled: false; fileName: string; fileSize: number };

type PendingSqlitePick = {
  filePath: string;
  fileName: string;
  fileSize: number;
};

let pendingSqlitePick: PendingSqlitePick | null = null;

function getParentWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused) return focused;
  return BrowserWindow.getAllWindows()[0] ?? null;
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function readColumns(database: Database.Database, table: string): SqliteColumnInfo[] {
  try {
    const rows = database
      .prepare(`PRAGMA table_xinfo(${quoteIdent(table)})`)
      .all() as SqliteColumnInfo[];
    if (rows.length > 0) return rows;
  } catch {
    // older SQLite
  }
  return database.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as SqliteColumnInfo[];
}

function listTables(database: Database.Database): string[] {
  const rows = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as { name: string }[];
  return rows
    .map((row) => String(row.name ?? ""))
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !SKIP_SOURCE_TABLES.has(name));
}

function tableCount(database: Database.Database, table: string): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`)
    .get() as { n: number };
  return Number(row?.n ?? 0);
}

function inspectSourceAgainstLive(
  sourcePath: string,
  fileName: string,
  fileSize: number,
): WindowsDbInspection {
  const live = getDatabase();
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const sourceTables = listTables(source);
    const targetTables = [...SCHEMA_TABLE_NAMES];
    const tableColumns: Record<string, string[]> = {};
    const recordCounts: Record<string, number> = {};
    const compatibleTables: string[] = [];
    const incompatibleTables: WindowsDbIncompatibleTable[] = [];

    for (const table of sourceTables) {
      tableColumns[table] = readColumns(source, table).map((column) => column.name);
      recordCounts[table] = tableCount(source, table);
    }

    for (const table of targetTables) {
      if (!sourceTables.includes(table)) {
        incompatibleTables.push({ name: table, reason: "missing_from_windows" });
        continue;
      }
      const targetColumns = readColumns(live, table);
      const importable = intersectImportableColumns(targetColumns, tableColumns[table] ?? []);
      const missing = missingRequiredSourceColumns(targetColumns, importable);
      if (importable.length === 0) {
        incompatibleTables.push({ name: table, reason: "no_compatible_columns" });
        continue;
      }
      if (missing.length > 0) {
        incompatibleTables.push({
          name: table,
          reason: `missing_required_columns:${missing.join(",")}`,
        });
        continue;
      }
      compatibleTables.push(table);
    }

    for (const table of sourceTables) {
      if (!targetTables.includes(table) && !incompatibleTables.some((item) => item.name === table)) {
        incompatibleTables.push({ name: table, reason: "unknown_to_android" });
      }
    }

    const confirmationCounts: WindowsDbConfirmationCounts = {
      agents: recordCounts[CONFIRMATION_TABLES.agents] ?? 0,
      dogs: recordCounts[CONFIRMATION_TABLES.dogs] ?? 0,
      checkpoints: recordCounts[CONFIRMATION_TABLES.checkpoints] ?? 0,
      planning: recordCounts[CONFIRMATION_TABLES.planning] ?? 0,
      exclusions: recordCounts[CONFIRMATION_TABLES.exclusions] ?? 0,
      users: recordCounts[CONFIRMATION_TABLES.users] ?? 0,
    };

    return {
      fileName,
      fileSize,
      sourceTables,
      tableColumns,
      recordCounts,
      confirmationCounts,
      compatibleTables,
      incompatibleTables,
      androidTables: targetTables,
    };
  } finally {
    source.close();
  }
}

function assertValidSqliteFile(filePath: string): void {
  const head = readFileSync(filePath).subarray(0, 16);
  if (!isSqliteDatabaseBytes(head)) {
    throw new Error("invalid_file");
  }
  const probe = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const integrity = probe.pragma("integrity_check", { simple: true }) as string;
    if (String(integrity).toLowerCase() !== "ok") {
      throw new Error("invalid_file");
    }
  } finally {
    probe.close();
  }
}

function databaseHasClearableData(database: Database.Database): boolean {
  for (const table of SCHEMA_TABLE_NAMES) {
    if (tableCount(database, table) > 0) return true;
  }
  return false;
}

function clearApplicationTables(database: Database.Database): Record<string, number> {
  const cleared: Record<string, number> = {};
  database.pragma("foreign_keys = OFF");
  try {
    for (const table of [...SCHEMA_TABLE_NAMES].reverse()) {
      const before = tableCount(database, table);
      database.prepare(`DELETE FROM ${quoteIdent(table)}`).run();
      cleared[table] = before;
    }
    try {
      database.prepare("DELETE FROM sqlite_sequence").run();
    } catch {
      // optional table
    }
  } finally {
    database.pragma("foreign_keys = ON");
  }
  return cleared;
}

function verifyClearedDatabase(database: Database.Database): { integrity: string; tablesVerified: string[] } {
  const integrity = String(database.pragma("integrity_check", { simple: true })).toLowerCase();
  if (integrity && integrity !== "ok") {
    throw new Error(`integrity:${integrity}`);
  }
  for (const table of SCHEMA_TABLE_NAMES) {
    if (tableCount(database, table) > 0) {
      throw new Error(`leftover:${table}`);
    }
  }
  const migrations = tableCount(database, SCHEMA_MIGRATIONS_TABLE);
  if (migrations < 0) {
    throw new Error("missing_migrations_table");
  }
  return {
    integrity: integrity || "ok",
    tablesVerified: [...SCHEMA_TABLE_NAMES, SCHEMA_MIGRATIONS_TABLE],
  };
}

export function pickSqliteDatabaseFile(app: App): PickSqliteDatabaseResult {
  const parent = getParentWindow();
  const result = dialog.showOpenDialogSync(parent ?? undefined, {
    title: "Importer une base SQLite",
    properties: ["openFile"],
    filters: [
      { name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] },
      { name: "Tous les fichiers", extensions: ["*"] },
    ],
  });

  if (!result || result.length === 0) {
    pendingSqlitePick = null;
    return { canceled: true };
  }

  const filePath = result[0]!;
  try {
    assertValidSqliteFile(filePath);
  } catch {
    pendingSqlitePick = null;
    throw new Error("invalid_file");
  }

  const fileName = basename(filePath);
  const fileSize = statSync(filePath).size;
  pendingSqlitePick = { filePath, fileName, fileSize };
  return { canceled: false, fileName, fileSize };
}

export function inspectPickedSqliteDatabase(app: App): WindowsDbInspection {
  initializeDatabase(app);
  if (!pendingSqlitePick) {
    throw new Error("no_pick");
  }
  return inspectSourceAgainstLive(
    pendingSqlitePick.filePath,
    pendingSqlitePick.fileName,
    pendingSqlitePick.fileSize,
  );
}

export function restorePickedSqliteDatabase(app: App): WindowsDbImportResult {
  initializeDatabase(app);
  if (!pendingSqlitePick) {
    throw new Error("no_pick");
  }

  const pick = pendingSqlitePick;
  const dbPath = getDatabasePath(app);
  const userDataPath = getUserDataPath(app);
  const live = getDatabase();
  let backupPath: string | null = null;

  try {
    assertValidSqliteFile(pick.filePath);
    try {
      backupPath = createPreMigrationBackup(live, userDataPath, dbPath);
    } catch {
      throw new Error("backup_failed");
    }
    closeDatabase();

    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${dbPath}${suffix}`;
      if (existsSync(sidecar)) unlinkSync(sidecar);
    }
    copyFileSync(pick.filePath, dbPath);

    initializeDatabase(app);
    const reopened = getDatabase();
    const integrity = String(reopened.pragma("integrity_check", { simple: true })).toLowerCase();
    if (integrity && integrity !== "ok") {
      throw new Error(`integrity:${integrity}`);
    }

    const inspection = inspectSourceAgainstLive(pick.filePath, pick.fileName, pick.fileSize);
    const imported = Object.values(inspection.recordCounts).reduce((sum, count) => sum + count, 0);

    pendingSqlitePick = null;

    return {
      backupPath,
      imported,
      skipped: 0,
      conflicts: 0,
      importedByTable: { ...inspection.recordCounts },
      skippedByTable: {},
      conflictReports: [],
    };
  } catch (error) {
    pendingSqlitePick = null;
    if (backupPath && existsSync(backupPath)) {
      try {
        closeDatabase();
        copyFileSync(backupPath, dbPath);
        for (const suffix of ["-wal", "-shm"]) {
          const sidecar = `${dbPath}${suffix}`;
          if (existsSync(sidecar)) unlinkSync(sidecar);
        }
        initializeDatabase(app);
      } catch {
        // backup restore failed — surface original error
      }
    }
    throw error;
  }
}

export function clearElectronLocalData(app: App): ClearLocalDataResult {
  initializeDatabase(app);
  const database = getDatabase();
  const userDataPath = getUserDataPath(app);
  const dbPath = getDatabasePath(app);

  const hasData = databaseHasClearableData(database);
  let backupPath: string | null = null;
  let backupCreated = false;

  if (hasData) {
    try {
      backupPath = createPreMigrationBackup(database, userDataPath, dbPath);
      backupCreated = true;
    } catch {
      throw new Error("backup_failed");
    }
  }

  try {
    const tablesCleared = clearApplicationTables(database);
    const verified = verifyClearedDatabase(database);
    return {
      backupPath,
      backupCreated,
      tablesCleared,
      integrity: verified.integrity,
      tablesVerified: verified.tablesVerified,
    };
  } catch (error) {
    if (backupPath && existsSync(backupPath)) {
      try {
        closeDatabase();
        copyFileSync(backupPath, dbPath);
        for (const suffix of ["-wal", "-shm"]) {
          const sidecar = `${dbPath}${suffix}`;
          if (existsSync(sidecar)) unlinkSync(sidecar);
        }
        initializeDatabase(app);
      } catch {
        // ignore
      }
    }
    throw error;
  }
}

export function clearPendingSqlitePick(): void {
  pendingSqlitePick = null;
}
