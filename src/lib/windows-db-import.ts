/**
 * Android-only import of a Windows Electron CynoPlanning SQLite file
 * into the existing local Android/browser database.
 *
 * Does not replace the Android DB file, does not change schema, and does
 * not touch planning-engine code. Rows are inserted only when columns
 * are compatible. Existing Android rows are preserved on id / unique conflicts.
 */
import { SCHEMA_TABLE_NAMES } from "@/integrations/database/schema-sql";
import type { SqlExecutor } from "@/integrations/database/sql-executor";
import { isElectronDesktopRuntime, isNativeCapacitorRuntime } from "@/lib/runtime-platform";

export const WINDOWS_DB_IMPORT_LOG = "[windows-db-import]";

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

const TABLE_IDENTITY_COLUMNS: Record<string, readonly string[]> = {
  document_reference_sequences: ["prefix", "year"],
};

const TABLE_UNIQUE_KEYS: Record<string, readonly (readonly string[])[]> = {
  users: [["email"]],
  agents: [["professional_number"], ["dog_id"]],
  operational_cases: [["case_number"]],
  planning: [["planning_date", "section_id", "shift"]],
  application_settings: [["key"]],
  role_documents: [["reference_number"]],
  exclusion_notifications: [["exclusion_id", "milestone"]],
};

const TABLE_FOREIGN_KEYS: Record<string, readonly { column: string; refTable: string }[]> = {
  agents: [
    { column: "section_id", refTable: "sections" },
    { column: "dog_id", refTable: "dogs" },
  ],
  checkpoint_posts: [{ column: "checkpoint_id", refTable: "checkpoints" }],
  agent_exclusions: [
    { column: "agent_id", refTable: "agents" },
    { column: "dog_id", refTable: "dogs" },
  ],
  exclusion_notifications: [
    { column: "exclusion_id", refTable: "agent_exclusions" },
    { column: "agent_id", refTable: "agents" },
    { column: "dog_id", refTable: "dogs" },
  ],
  planning: [
    { column: "section_id", refTable: "sections" },
    { column: "created_by", refTable: "users" },
  ],
  planning_assignments: [
    { column: "planning_id", refTable: "planning" },
    { column: "checkpoint_post_id", refTable: "checkpoint_posts" },
    { column: "agent_id", refTable: "agents" },
    { column: "dog_id", refTable: "dogs" },
  ],
  rotation_history: [
    { column: "agent_id", refTable: "agents" },
    { column: "checkpoint_post_id", refTable: "checkpoint_posts" },
  ],
  operational_cases: [
    { column: "agent_id", refTable: "agents" },
    { column: "dog_id", refTable: "dogs" },
    { column: "checkpoint_id", refTable: "checkpoints" },
  ],
  operational_case_attachments: [{ column: "case_id", refTable: "operational_cases" }],
  role_documents: [
    { column: "agent_id", refTable: "agents" },
    { column: "dog_id", refTable: "dogs" },
    { column: "section_id", refTable: "sections" },
  ],
  agent_administrative_history: [{ column: "agent_id", refTable: "agents" }],
};

export type SqliteColumnInfo = {
  name: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
  hidden?: number;
};

export type WindowsDbConfirmationCounts = {
  agents: number;
  dogs: number;
  checkpoints: number;
  planning: number;
  exclusions: number;
  users: number;
};

export type WindowsDbIncompatibleTable = {
  name: string;
  reason: string;
};

export type WindowsDbInspection = {
  fileName: string;
  fileSize: number;
  sourceTables: string[];
  tableColumns: Record<string, string[]>;
  recordCounts: Record<string, number>;
  confirmationCounts: WindowsDbConfirmationCounts;
  compatibleTables: string[];
  incompatibleTables: WindowsDbIncompatibleTable[];
  androidTables: string[];
};

export type WindowsDbImportConflict = {
  table: string;
  reason: "unique_key" | "missing_required" | "missing_fk" | "incompatible";
  detail: string;
};

export type WindowsDbImportResult = {
  backupPath: string | null;
  imported: number;
  skipped: number;
  conflicts: number;
  importedByTable: Record<string, number>;
  skippedByTable: Record<string, number>;
  conflictReports: WindowsDbImportConflict[];
};

export type PlannedImportRow =
  | { kind: "insert"; values: unknown[]; identityKey: string }
  | { kind: "skip"; reason: "duplicate_id"; identityKey: string }
  | { kind: "conflict"; reason: WindowsDbImportConflict["reason"]; identityKey: string; detail: string };

export class WindowsDbImportError extends Error {
  readonly code: "invalid_file" | "unreadable" | "backup_failed" | "import_failed";

  constructor(code: WindowsDbImportError["code"], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WindowsDbImportError";
    this.code = code;
  }
}

export function canImportWindowsDatabase(role: string | null | undefined): boolean {
  return role === "admin" && !isElectronDesktopRuntime();
}

export function isSqliteDatabaseBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) return false;
  const header = new TextDecoder("utf-8").decode(bytes.subarray(0, 16));
  return header === SQLITE_MAGIC;
}

export function isGeneratedColumn(column: SqliteColumnInfo): boolean {
  if (ALWAYS_SKIP_COLUMNS.has(column.name)) return true;
  return Number(column.hidden ?? 0) !== 0;
}

export function intersectImportableColumns(
  androidColumns: SqliteColumnInfo[],
  sourceColumnNames: readonly string[],
): string[] {
  const source = new Set(sourceColumnNames);
  return androidColumns
    .filter((column) => !isGeneratedColumn(column) && source.has(column.name))
    .map((column) => column.name);
}

export function missingRequiredSourceColumns(
  androidColumns: SqliteColumnInfo[],
  importableColumns: readonly string[],
): string[] {
  const available = new Set(importableColumns);
  return androidColumns
    .filter((column) => !isGeneratedColumn(column))
    .filter((column) => Number(column.notnull) === 1 && column.dflt_value == null)
    .filter((column) => !available.has(column.name))
    .map((column) => column.name);
}

export function identityColumnsFor(table: string): readonly string[] {
  return TABLE_IDENTITY_COLUMNS[table] ?? ["id"];
}

export function serializeIdentity(columns: readonly string[], row: Record<string, unknown>): string {
  return columns.map((column) => `${column}=${stringifyCell(row[column])}`).join("|");
}

function stringifyCell(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function isEmptyCell(value: unknown): boolean {
  return value == null || value === "";
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new WindowsDbImportError("import_failed", `Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function logInfo(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.info(WINDOWS_DB_IMPORT_LOG, message, extra);
    return;
  }
  console.info(WINDOWS_DB_IMPORT_LOG, message);
}

function logError(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.error(WINDOWS_DB_IMPORT_LOG, message, extra);
    return;
  }
  console.error(WINDOWS_DB_IMPORT_LOG, message);
}

type SourceDatabase = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  close(): void;
};

async function openSourceDatabase(bytes: Uint8Array): Promise<SourceDatabase> {
  const initSqlJs = (await import("sql.js")).default;
  const wasmUrl = (await import("sql.js/dist/sql-wasm.wasm?url")).default;
  const SQL = await initSqlJs({
    locateFile: () => wasmUrl,
  });
  const database = new SQL.Database(bytes);

  const query = <T>(sql: string, params: unknown[] = []): T[] => {
    const stmt = database.prepare(sql);
    try {
      if (params.length > 0) {
        stmt.bind(
          params.map((value) => {
            if (value == null) return null;
            if (typeof value === "string" || typeof value === "number") return value;
            if (typeof value === "boolean") return value ? 1 : 0;
            return String(value);
          }) as never,
        );
      }
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  };

  return {
    query,
    close() {
      database.close();
    },
  };
}

async function readAndroidColumns(
  executor: SqlExecutor,
  table: string,
): Promise<SqliteColumnInfo[]> {
  try {
    const rows = await executor.query<SqliteColumnInfo>(`PRAGMA table_xinfo(${quoteIdent(table)})`);
    if (rows.length > 0) return rows;
  } catch {
    // Older SQLite builds may only expose table_info.
  }
  return executor.query<SqliteColumnInfo>(`PRAGMA table_info(${quoteIdent(table)})`);
}

function listSourceTables(source: SourceDatabase): string[] {
  const rows = source.query<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  );
  return rows
    .map((row) => String(row.name ?? ""))
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !SKIP_SOURCE_TABLES.has(name));
}

function sourceColumns(source: SourceDatabase, table: string): SqliteColumnInfo[] {
  try {
    const rows = source.query<SqliteColumnInfo>(`PRAGMA table_xinfo(${quoteIdent(table)})`);
    if (rows.length > 0) return rows;
  } catch {
    // fall through
  }
  return source.query<SqliteColumnInfo>(`PRAGMA table_info(${quoteIdent(table)})`);
}

function sourceCount(source: SourceDatabase, table: string): number {
  const row = source.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`)[0];
  return Number(row?.n ?? 0);
}

export function planTableImport(input: {
  table: string;
  columns: readonly string[];
  androidColumns: SqliteColumnInfo[];
  rows: Record<string, unknown>[];
  existingIdentities: Set<string>;
  uniqueLookups: { columns: readonly string[]; occupied: Map<string, string> }[];
  fkLookups: { column: string; present: Set<string> }[];
}): PlannedImportRow[] {
  const identityColumns = identityColumnsFor(input.table);
  const required = input.androidColumns.filter(
    (column) =>
      !isGeneratedColumn(column) &&
      Number(column.notnull) === 1 &&
      column.dflt_value == null &&
      input.columns.includes(column.name),
  );
  const planned: PlannedImportRow[] = [];

  for (const row of input.rows) {
    const identityKey = serializeIdentity(identityColumns, row);
    if (!identityColumns.every((column) => !isEmptyCell(row[column]))) {
      planned.push({
        kind: "conflict",
        reason: "missing_required",
        identityKey,
        detail: `${input.table}: missing identity column`,
      });
      continue;
    }

    if (input.existingIdentities.has(identityKey)) {
      planned.push({ kind: "skip", reason: "duplicate_id", identityKey });
      continue;
    }

    const missingRequired = required.filter((column) => isEmptyCell(row[column.name]));
    if (missingRequired.length > 0) {
      planned.push({
        kind: "conflict",
        reason: "missing_required",
        identityKey,
        detail: `${input.table}: missing ${missingRequired.map((column) => column.name).join(", ")}`,
      });
      continue;
    }

    let uniqueConflict: string | null = null;
    for (const lookup of input.uniqueLookups) {
      if (lookup.columns.some((column) => isEmptyCell(row[column]))) continue;
      const uniqueKey = serializeIdentity(lookup.columns, row);
      const owner = lookup.occupied.get(uniqueKey);
      if (owner && owner !== identityKey) {
        uniqueConflict = `${input.table}.${lookup.columns.join("+")}`;
        break;
      }
    }
    if (uniqueConflict) {
      planned.push({
        kind: "conflict",
        reason: "unique_key",
        identityKey,
        detail: uniqueConflict,
      });
      continue;
    }

    let missingFk: string | null = null;
    for (const lookup of input.fkLookups) {
      const value = row[lookup.column];
      if (isEmptyCell(value)) continue;
      if (!lookup.present.has(stringifyCell(value))) {
        missingFk = `${input.table}.${lookup.column}`;
        break;
      }
    }
    if (missingFk) {
      planned.push({
        kind: "conflict",
        reason: "missing_fk",
        identityKey,
        detail: missingFk,
      });
      continue;
    }

    planned.push({
      kind: "insert",
      identityKey,
      values: input.columns.map((column) => (row[column] === undefined ? null : row[column])),
    });
    input.existingIdentities.add(identityKey);
    for (const lookup of input.uniqueLookups) {
      if (lookup.columns.some((column) => isEmptyCell(row[column]))) continue;
      lookup.occupied.set(serializeIdentity(lookup.columns, row), identityKey);
    }
  }

  return planned;
}

export async function inspectWindowsDatabase(input: {
  fileName: string;
  fileSize: number;
  bytes: Uint8Array;
  executor: SqlExecutor;
}): Promise<WindowsDbInspection> {
  if (!isSqliteDatabaseBytes(input.bytes)) {
    throw new WindowsDbImportError("invalid_file", "Selected file is not a valid SQLite database.");
  }

  logInfo("selected database file", {
    fileName: input.fileName,
    fileSize: input.fileSize,
  });

  const source = await openSourceDatabase(input.bytes);
  try {
    const sourceTables = listSourceTables(source);
    const androidTables = [...SCHEMA_TABLE_NAMES];
    const tableColumns: Record<string, string[]> = {};
    const recordCounts: Record<string, number> = {};
    const compatibleTables: string[] = [];
    const incompatibleTables: WindowsDbIncompatibleTable[] = [];

    for (const table of sourceTables) {
      const columns = sourceColumns(source, table).map((column) => column.name);
      tableColumns[table] = columns;
      recordCounts[table] = sourceCount(source, table);
      logInfo("detected source table", {
        table,
        columns,
        records: recordCounts[table],
      });
    }

    for (const table of androidTables) {
      if (!sourceTables.includes(table)) {
        incompatibleTables.push({ name: table, reason: "missing_from_windows" });
        continue;
      }
      const androidColumns = await readAndroidColumns(input.executor, table);
      const importable = intersectImportableColumns(androidColumns, tableColumns[table] ?? []);
      const missing = missingRequiredSourceColumns(androidColumns, importable);
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
      if (!androidTables.includes(table) && !incompatibleTables.some((item) => item.name === table)) {
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

    logInfo("schema comparison", {
      androidTables,
      compatibleTables,
      incompatibleTables,
      confirmationCounts,
    });

    return {
      fileName: input.fileName,
      fileSize: input.fileSize,
      sourceTables,
      tableColumns,
      recordCounts,
      confirmationCounts,
      compatibleTables,
      incompatibleTables,
      androidTables,
    };
  } finally {
    source.close();
  }
}

type AndroidDbBackup = {
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  counts: Record<string, number>;
};

function backupLooksComplete(backup: AndroidDbBackup, tables: readonly string[]): boolean {
  return tables.every((table) => Array.isArray(backup.tables[table]) && backup.counts[table] === backup.tables[table].length);
}

async function dumpAndroidBackup(executor: SqlExecutor): Promise<AndroidDbBackup> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  for (const table of SCHEMA_TABLE_NAMES) {
    const rows = await executor.query<Record<string, unknown>>(`SELECT * FROM ${quoteIdent(table)}`);
    tables[table] = rows;
    counts[table] = rows.length;
  }
  const backup: AndroidDbBackup = {
    createdAt: new Date().toISOString(),
    tables,
    counts,
  };
  if (!backupLooksComplete(backup, SCHEMA_TABLE_NAMES)) {
    throw new WindowsDbImportError("backup_failed", "Android database backup is incomplete.");
  }
  return backup;
}

async function persistAndroidBackup(backup: AndroidDbBackup): Promise<string | null> {
  if (!isNativeCapacitorRuntime()) {
    logInfo("backup status", { persisted: false, verified: true, runtime: "in-memory" });
    return null;
  }

  const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
  const stamp = backup.createdAt.replace(/[:.]/g, "-");
  const path = `backups/cynoplanning-pre-import-${stamp}.json`;
  const payload = JSON.stringify(backup);
  await Filesystem.writeFile({
    path,
    data: payload,
    directory: Directory.Data,
    recursive: true,
    encoding: Encoding.UTF8,
  });
  const read = await Filesystem.readFile({
    path,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
  });
  const raw = typeof read.data === "string" ? read.data : "";
  let parsed: AndroidDbBackup;
  try {
    parsed = JSON.parse(raw) as AndroidDbBackup;
  } catch (error) {
    throw new WindowsDbImportError("backup_failed", "Android database backup could not be verified.", {
      cause: error,
    });
  }
  if (!backupLooksComplete(parsed, SCHEMA_TABLE_NAMES)) {
    throw new WindowsDbImportError("backup_failed", "Android database backup verification failed.");
  }
  logInfo("backup status", { persisted: true, verified: true, path });
  return path;
}

async function loadIdentitySet(executor: SqlExecutor, table: string): Promise<Set<string>> {
  const columns = identityColumnsFor(table);
  const rows = await executor.query<Record<string, unknown>>(
    `SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`,
  );
  return new Set(rows.map((row) => serializeIdentity(columns, row)));
}

async function loadUniqueLookups(
  executor: SqlExecutor,
  table: string,
): Promise<{ columns: readonly string[]; occupied: Map<string, string> }[]> {
  const keys = TABLE_UNIQUE_KEYS[table] ?? [];
  const identityColumns = identityColumnsFor(table);
  const lookups = [];
  for (const columns of keys) {
    const select = [...new Set([...identityColumns, ...columns])].map(quoteIdent).join(", ");
    const rows = await executor.query<Record<string, unknown>>(`SELECT ${select} FROM ${quoteIdent(table)}`);
    const occupied = new Map<string, string>();
    for (const row of rows) {
      if (columns.some((column) => isEmptyCell(row[column]))) continue;
      occupied.set(serializeIdentity(columns, row), serializeIdentity(identityColumns, row));
    }
    lookups.push({ columns, occupied });
  }
  return lookups;
}

async function loadPresentIds(executor: SqlExecutor, table: string): Promise<Set<string>> {
  const columns = identityColumnsFor(table);
  if (columns.length !== 1 || columns[0] !== "id") return new Set();
  const rows = await executor.query<{ id: unknown }>(`SELECT id FROM ${quoteIdent(table)}`);
  return new Set(rows.map((row) => stringifyCell(row.id)).filter(Boolean));
}

async function identityStillPresent(
  executor: SqlExecutor,
  table: string,
  identityKey: string,
): Promise<boolean> {
  const columns = identityColumnsFor(table);
  const parts = identityKey.split("|");
  if (parts.length !== columns.length) return false;
  const values = parts.map((part) => part.slice(part.indexOf("=") + 1));
  const where = columns.map((column) => `${quoteIdent(column)} = ?`).join(" AND ");
  const row = await executor.get(
    `SELECT 1 AS ok FROM ${quoteIdent(table)} WHERE ${where} LIMIT 1`,
    values,
  );
  return Boolean(row);
}

async function deleteInsertedRows(
  executor: SqlExecutor,
  inserted: { table: string; identityKey: string }[],
): Promise<void> {
  for (const item of [...inserted].reverse()) {
    const columns = identityColumnsFor(item.table);
    const parts = item.identityKey.split("|");
    if (parts.length !== columns.length) continue;
    const values = parts.map((part) => part.slice(part.indexOf("=") + 1));
    const where = columns.map((column) => `${quoteIdent(column)} = ?`).join(" AND ");
    await executor.run(`DELETE FROM ${quoteIdent(item.table)} WHERE ${where}`, values);
  }
}

async function verifyDatabaseUsable(executor: SqlExecutor): Promise<void> {
  await executor.get("SELECT COUNT(*) AS n FROM sqlite_master");
  await executor.query(`SELECT ${quoteIdent("id")} FROM ${quoteIdent("users")} LIMIT 1`);
}

export async function importWindowsDatabase(input: {
  fileName: string;
  fileSize: number;
  bytes: Uint8Array;
  inspection: WindowsDbInspection;
}): Promise<WindowsDbImportResult> {
  if (isElectronDesktopRuntime()) {
    throw new WindowsDbImportError("import_failed", "Windows database import is not available on Electron.");
  }
  if (!isSqliteDatabaseBytes(input.bytes)) {
    throw new WindowsDbImportError("invalid_file", "Selected file is not a valid SQLite database.");
  }

  const { getLocalSqliteExecutor, reopenLocalSqliteExecutor } = await import(
    "@/integrations/database/local-sqlite"
  );

  let executor = await getLocalSqliteExecutor();
  let backup: AndroidDbBackup | null = null;
  let backupPath: string | null = null;

  try {
    backup = await dumpAndroidBackup(executor);
    backupPath = await persistAndroidBackup(backup);
    logInfo("backup created", {
      tables: Object.keys(backup.counts).length,
      totalRows: Object.values(backup.counts).reduce((sum, count) => sum + count, 0),
    });
  } catch (error) {
    logError("backup failed; import cancelled", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof WindowsDbImportError
      ? error
      : new WindowsDbImportError("backup_failed", "Android database backup failed. Import cancelled.", {
          cause: error,
        });
  }

  const source = await openSourceDatabase(input.bytes);
  const importedByTable: Record<string, number> = {};
  const skippedByTable: Record<string, number> = {};
  const conflictReports: WindowsDbImportConflict[] = [];
  const inserted: { table: string; identityKey: string }[] = [];
  let imported = 0;
  let skipped = 0;

  const presentIds = new Map<string, Set<string>>();
  for (const table of SCHEMA_TABLE_NAMES) {
    presentIds.set(table, await loadPresentIds(executor, table));
  }

  try {
    await executor.transaction(async () => {
      for (const table of SCHEMA_TABLE_NAMES) {
        if (!input.inspection.compatibleTables.includes(table)) continue;
        const androidColumns = await readAndroidColumns(executor, table);
        const columns = intersectImportableColumns(
          androidColumns,
          input.inspection.tableColumns[table] ?? [],
        );
        if (columns.length === 0) continue;

        const rows = source.query<Record<string, unknown>>(`SELECT * FROM ${quoteIdent(table)}`);
        const existingIdentities = await loadIdentitySet(executor, table);
        const uniqueLookups = await loadUniqueLookups(executor, table);
        const fkLookups = (TABLE_FOREIGN_KEYS[table] ?? []).map((fk) => ({
          column: fk.column,
          present: presentIds.get(fk.refTable) ?? new Set<string>(),
        }));

        const planned = planTableImport({
          table,
          columns,
          androidColumns,
          rows,
          existingIdentities,
          uniqueLookups,
          fkLookups,
        });

        let tableImported = 0;
        let tableSkipped = 0;
        const placeholders = columns.map(() => "?").join(", ");
        const insertSql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders})`;

        for (const item of planned) {
          if (item.kind === "skip") {
            tableSkipped += 1;
            skipped += 1;
            continue;
          }
          if (item.kind === "conflict") {
            conflictReports.push({
              table,
              reason: item.reason,
              detail: item.detail,
            });
            continue;
          }

          await executor.run(insertSql, item.values);
          inserted.push({ table, identityKey: item.identityKey });
          tableImported += 1;
          imported += 1;
          const idIndex = columns.indexOf("id");
          if (idIndex >= 0) {
            const idValue = item.values[idIndex];
            if (!isEmptyCell(idValue)) {
              presentIds.get(table)?.add(stringifyCell(idValue));
            }
          }
        }

        importedByTable[table] = tableImported;
        skippedByTable[table] = tableSkipped;
        logInfo("table import", {
          table,
          found: rows.length,
          imported: tableImported,
          skipped: tableSkipped,
          conflicts: planned.filter((item) => item.kind === "conflict").length,
        });
      }
    });
  } catch (error) {
    logError("import failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    try {
      executor = await reopenLocalSqliteExecutor();
      if (inserted.length > 0 && (await identityStillPresent(executor, inserted[0].table, inserted[0].identityKey))) {
        await deleteInsertedRows(executor, inserted);
        logInfo("restored inserted rows from backup tracking");
      }
      executor = await reopenLocalSqliteExecutor();
      await verifyDatabaseUsable(executor);
    } catch (restoreError) {
      logError("restore after failed import did not complete cleanly", {
        message: restoreError instanceof Error ? restoreError.message : String(restoreError),
      });
    }
    throw new WindowsDbImportError(
      "import_failed",
      "Windows database import failed. The Android database was left unchanged or restored.",
      { cause: error },
    );
  } finally {
    source.close();
  }

  try {
    executor = await reopenLocalSqliteExecutor();
    await verifyDatabaseUsable(executor);
  } catch (error) {
    throw new WindowsDbImportError("import_failed", "Android database could not be reopened after import.", {
      cause: error,
    });
  }

  logInfo("import result", {
    fileName: input.fileName,
    fileSize: input.fileSize,
    imported,
    skipped,
    conflicts: conflictReports.length,
    backupPath,
  });

  return {
    backupPath,
    imported,
    skipped,
    conflicts: conflictReports.length,
    importedByTable,
    skippedByTable,
    conflictReports,
  };
}

export async function readPickedDatabaseFile(file: File): Promise<Uint8Array> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength === 0) {
      throw new WindowsDbImportError("unreadable", "Selected file is empty.");
    }
    return bytes;
  } catch (error) {
    if (error instanceof WindowsDbImportError) throw error;
    throw new WindowsDbImportError("unreadable", "Selected file could not be read.", { cause: error });
  }
}

export { CONFIRMATION_TABLES };
