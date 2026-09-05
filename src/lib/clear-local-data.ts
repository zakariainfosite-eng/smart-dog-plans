/**
 * Admin-only wipe of LOCAL Android / browser SQLite application rows.
 *
 * Does not change schema, planning logic, or the Windows Electron database.
 * schema_migrations is kept so the current schema stays recorded.
 */
import {
  SCHEMA_MIGRATIONS_TABLE,
  SCHEMA_TABLE_NAMES,
} from "@/integrations/database/schema-sql";
import type { SqlExecutor } from "@/integrations/database/sql-executor";
import { isElectronDesktopRuntime, isNativeCapacitorRuntime } from "@/lib/runtime-platform";

export const CLEAR_LOCAL_DATA_LOG = "[clear-local-data]";

export class ClearLocalDataError extends Error {
  readonly code: "unavailable" | "backup_failed" | "clear_failed";

  constructor(code: ClearLocalDataError["code"], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClearLocalDataError";
    this.code = code;
  }
}

export type ClearLocalDataResult = {
  backupPath: string | null;
  backupCreated: boolean;
  tablesCleared: Record<string, number>;
  integrity: string;
  tablesVerified: string[];
};

type LocalDbBackup = {
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  counts: Record<string, number>;
};

export function canClearLocalData(role: string | null | undefined): boolean {
  return role === "admin" && !isElectronDesktopRuntime();
}

/** Application tables that may be emptied. Never includes schema_migrations. */
export function applicationTablesToClear(): readonly string[] {
  return SCHEMA_TABLE_NAMES;
}

export function databaseHasClearableData(counts: Record<string, number>): boolean {
  return applicationTablesToClear().some((table) => Number(counts[table] ?? 0) > 0);
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new ClearLocalDataError("clear_failed", `Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function logInfo(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.info(CLEAR_LOCAL_DATA_LOG, message, extra);
    return;
  }
  console.info(CLEAR_LOCAL_DATA_LOG, message);
}

function logError(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.error(CLEAR_LOCAL_DATA_LOG, message, extra);
    return;
  }
  console.error(CLEAR_LOCAL_DATA_LOG, message);
}

function backupLooksComplete(backup: LocalDbBackup, tables: readonly string[]): boolean {
  return tables.every(
    (table) => Array.isArray(backup.tables[table]) && backup.counts[table] === backup.tables[table].length,
  );
}

export async function countApplicationRows(executor: SqlExecutor): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of applicationTablesToClear()) {
    const row = await executor.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`);
    counts[table] = Number(row?.n ?? 0);
  }
  return counts;
}

async function dumpLocalBackup(executor: SqlExecutor): Promise<LocalDbBackup> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  for (const table of applicationTablesToClear()) {
    const rows = await executor.query<Record<string, unknown>>(`SELECT * FROM ${quoteIdent(table)}`);
    tables[table] = rows;
    counts[table] = rows.length;
  }
  const backup: LocalDbBackup = {
    createdAt: new Date().toISOString(),
    tables,
    counts,
  };
  if (!backupLooksComplete(backup, applicationTablesToClear())) {
    throw new ClearLocalDataError("backup_failed", "Local database backup is incomplete.");
  }
  return backup;
}

async function persistLocalBackup(backup: LocalDbBackup): Promise<string | null> {
  if (!isNativeCapacitorRuntime()) {
    logInfo("backup created", {
      persisted: false,
      verified: true,
      runtime: "in-memory",
      tables: Object.keys(backup.counts).length,
      totalRows: Object.values(backup.counts).reduce((sum, count) => sum + count, 0),
    });
    return null;
  }

  const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
  const stamp = backup.createdAt.replace(/[:.]/g, "-");
  const path = `backups/cynoplanning-pre-clear-${stamp}.json`;
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
  let parsed: LocalDbBackup;
  try {
    parsed = JSON.parse(raw) as LocalDbBackup;
  } catch (error) {
    throw new ClearLocalDataError("backup_failed", "Local database backup could not be verified.", {
      cause: error,
    });
  }
  if (!backupLooksComplete(parsed, applicationTablesToClear())) {
    throw new ClearLocalDataError("backup_failed", "Local database backup verification failed.");
  }
  logInfo("backup created", {
    persisted: true,
    verified: true,
    path,
    tables: Object.keys(backup.counts).length,
    totalRows: Object.values(backup.counts).reduce((sum, count) => sum + count, 0),
  });
  return path;
}

export async function clearApplicationTables(executor: SqlExecutor): Promise<Record<string, number>> {
  const cleared: Record<string, number> = {};
  await executor.exec("PRAGMA foreign_keys = OFF;");
  try {
    for (const table of [...applicationTablesToClear()].reverse()) {
      const before = await executor.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`);
      await executor.run(`DELETE FROM ${quoteIdent(table)}`);
      cleared[table] = Number(before?.n ?? 0);
    }
    try {
      await executor.run("DELETE FROM sqlite_sequence");
    } catch {
      // sqlite_sequence exists only after AUTOINCREMENT use.
    }
  } finally {
    await executor.exec("PRAGMA foreign_keys = ON;");
  }
  logInfo("tables cleared", {
    tables: Object.keys(cleared).length,
    totalRows: Object.values(cleared).reduce((sum, count) => sum + count, 0),
  });
  return cleared;
}

export async function verifyClearedLocalDatabase(executor: SqlExecutor): Promise<{
  integrity: string;
  tablesVerified: string[];
}> {
  await executor.get("SELECT COUNT(*) AS n FROM sqlite_master");

  const present = await executor.query<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  );
  const presentNames = new Set(present.map((row) => String(row.name ?? "")));

  const missing = applicationTablesToClear().filter((table) => !presentNames.has(table));
  if (!presentNames.has(SCHEMA_MIGRATIONS_TABLE)) {
    missing.push(SCHEMA_MIGRATIONS_TABLE);
  }
  if (missing.length > 0) {
    throw new ClearLocalDataError(
      "clear_failed",
      `Required tables missing after clear: ${missing.join(", ")}`,
    );
  }

  const leftover = await countApplicationRows(executor);
  const leftoverTables = Object.entries(leftover)
    .filter(([, count]) => count > 0)
    .map(([table]) => table);
  if (leftoverTables.length > 0) {
    throw new ClearLocalDataError(
      "clear_failed",
      `Application tables were not empty after clear: ${leftoverTables.join(", ")}`,
    );
  }

  const integrityRow = await executor.get<Record<string, unknown>>("PRAGMA integrity_check");
  const integrity = String(Object.values(integrityRow ?? {})[0] ?? "").toLowerCase();
  logInfo("integrity check", { integrity: integrity || "unknown" });
  if (integrity && integrity !== "ok") {
    throw new ClearLocalDataError("clear_failed", `SQLite integrity check failed: ${integrity}`);
  }

  return {
    integrity: integrity || "ok",
    tablesVerified: [...applicationTablesToClear(), SCHEMA_MIGRATIONS_TABLE],
  };
}

export async function clearLocalAndroidData(): Promise<ClearLocalDataResult> {
  if (isElectronDesktopRuntime()) {
    throw new ClearLocalDataError(
      "unavailable",
      "Clearing local data is not available on the Windows Electron application.",
    );
  }

  const { closeLocalSqliteExecutor, getLocalSqliteExecutor } = await import(
    "@/integrations/database/local-sqlite"
  );

  logInfo("start");

  let executor = await getLocalSqliteExecutor();
  const counts = await countApplicationRows(executor);
  const hasData = databaseHasClearableData(counts);

  let backupPath: string | null = null;
  let backupCreated = false;
  if (hasData) {
    try {
      const backup = await dumpLocalBackup(executor);
      backupPath = await persistLocalBackup(backup);
      backupCreated = true;
    } catch (error) {
      logError("backup failed; clear cancelled", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error instanceof ClearLocalDataError
        ? error
        : new ClearLocalDataError("backup_failed", "Local database backup failed. Clear cancelled.", {
            cause: error,
          });
    }
  } else {
    logInfo("backup created", { skipped: true, reason: "empty" });
  }

  try {
    await closeLocalSqliteExecutor();
    executor = await getLocalSqliteExecutor();
    logInfo("database reopened", { phase: "before-clear" });

    const tablesCleared = await clearApplicationTables(executor);

    await closeLocalSqliteExecutor();
    executor = await getLocalSqliteExecutor();
    logInfo("database reopened", { phase: "after-clear" });

    const verified = await verifyClearedLocalDatabase(executor);
    const result: ClearLocalDataResult = {
      backupPath,
      backupCreated,
      tablesCleared,
      integrity: verified.integrity,
      tablesVerified: verified.tablesVerified,
    };
    logInfo("final result", {
      backupCreated,
      backupPath,
      tablesCleared: Object.keys(tablesCleared).length,
      integrity: verified.integrity,
    });
    return result;
  } catch (error) {
    logError("clear failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    try {
      await closeLocalSqliteExecutor();
      executor = await getLocalSqliteExecutor();
      logInfo("database reopened", { phase: "after-failure" });
    } catch (reopenError) {
      logError("database reopen after failure did not complete", {
        message: reopenError instanceof Error ? reopenError.message : String(reopenError),
      });
    }
    throw error instanceof ClearLocalDataError
      ? error
      : new ClearLocalDataError("clear_failed", "Local data could not be cleared.", { cause: error });
  }
}
