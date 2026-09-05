/**
 * Local SQLite for Capacitor/iOS (native plugin) and browser (sql.js + IndexedDB).
 * Electron continues to use better-sqlite3 via IPC — this module is never loaded there.
 *
 * Persistence contract (NO DATA LOSS ON APP UPDATE):
 * - iOS DB file lives in Library/CapacitorDatabase (capacitor.config.ts).
 * - App binary updates / Xcode reinstalls of the SAME bundle id must keep that file.
 * - Never call deleteDatabase / wipe / replace the DB during normal startup.
 * - Open existing DB in place → CREATE TABLE IF NOT EXISTS for missing tables only
 *   → record only pending schema_migrations rows (never recreate the whole schema).
 * - Electron userData cynoplanning.db is independent — never sync/replace across platforms.
 */
import {
  APPLIED_MIGRATION_IDS,
  LOCAL_SQLITE_MIGRATIONS,
  SCHEMA_INDEX_STATEMENTS,
  SCHEMA_MIGRATIONS_TABLE,
  SCHEMA_TABLE_STATEMENTS,
} from "./schema-sql";
import type { SqlExecutor } from "./sql-executor";
import { localCalendarDayISO } from "@/lib/local-calendar-day";
import { isNativeCapacitorRuntime } from "@/lib/runtime-platform";

const DB_NAME = "cynoplanning";
/**
 * Capacitor plugin connection version. Keep stable across releases.
 * Bumping this without registered upgrade statements does NOT wipe the file,
 * but never use a version bump as a reason to call deleteDatabase().
 */
const CAPACITOR_DB_VERSION = 1;
const IDB_NAME = "cynoplanning-sqlite";
const IDB_STORE = "kv";
const IDB_KEY = "cynoplanning.db";

let executorPromise: Promise<SqlExecutor> | null = null;
/** Flush sql.js IndexedDB persistence before dropping the in-memory handle. */
let sqlJsPersistNow: (() => Promise<void>) | null = null;

/** Same local calendar day as renderer `planningDayISO()` / `todayISODate()`. */
function todayIsoDate(): string {
  return localCalendarDayISO();
}

async function localSqliteOpenEndedExclusionsReady(executor: SqlExecutor): Promise<boolean> {
  const columns = await executor.query<{ name: string; notnull: number }>(
    "PRAGMA table_info(agent_exclusions)",
  );
  const endDate = columns.find((column) => column.name === "end_date");
  if (!endDate || Number(endDate.notnull) !== 0) return false;

  const master = await executor.get<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_exclusions'",
  );
  return Boolean(master?.sql?.includes("dog_without_handler"));
}

async function idbGet(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, "readonly");
      const get = tx.objectStore(IDB_STORE).get(IDB_KEY);
      get.onsuccess = () => {
        const value = get.result;
        db.close();
        if (!value) {
          resolve(null);
          return;
        }
        resolve(value instanceof Uint8Array ? value : new Uint8Array(value));
      };
      get.onerror = () => {
        db.close();
        reject(get.error);
      };
    };
  });
}

async function idbSet(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

type SqlJsValue = string | number | null | Uint8Array;

function toSqlJsParams(params: unknown[]): SqlJsValue[] {
  return params.map((value) => {
    if (value == null) return null;
    if (typeof value === "string" || typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (value instanceof Uint8Array) return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return String(value);
  });
}

/**
 * Nestable transaction helper: nested `transaction()` calls join the outer tx.
 * Only the outermost owner issues BEGIN/COMMIT/ROLLBACK.
 * Top-level transactions are serialized so concurrent callers cannot interleave.
 */
function createNestableTransaction(handlers: {
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}): <T>(fn: () => Promise<T>) => Promise<T> {
  let depth = 0;
  let gate: Promise<void> = Promise.resolve();

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (depth > 0) {
      return fn();
    }

    const run = async (): Promise<T> => {
      await handlers.begin();
      depth = 1;
      try {
        const result = await fn();
        await handlers.commit();
        return result;
      } catch (error) {
        try {
          await handlers.rollback();
        } catch {
          // ignore rollback failures (connection may already be clean)
        }
        throw error;
      } finally {
        depth = 0;
      }
    };

    const next = gate.then(run, run);
    gate = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

async function createSqlJsExecutor(): Promise<SqlExecutor> {
  const initSqlJs = (await import("sql.js")).default;
  const wasmUrl = (await import("sql.js/dist/sql-wasm.wasm?url")).default;
  const SQL = await initSqlJs({
    locateFile: () => wasmUrl,
  });
  const saved = await idbGet();
  const database = saved ? new SQL.Database(saved) : new SQL.Database();

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const persist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void idbSet(database.export());
    }, 50);
  };
  sqlJsPersistNow = async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await idbSet(database.export());
  };

  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const stmt = database.prepare(sql);
    try {
      if (params.length > 0) stmt.bind(toSqlJsParams(params) as never);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  };

  const run = async (sql: string, params: unknown[] = []) => {
    database.run(sql, toSqlJsParams(params) as never);
    persist();
    const changesRow = database.exec("SELECT changes() AS changes");
    const changes = Number(changesRow[0]?.values?.[0]?.[0] ?? 0);
    return { changes };
  };

  const transaction = createNestableTransaction({
    async begin() {
      database.exec("BEGIN");
    },
    async commit() {
      database.exec("COMMIT");
      persist();
    },
    async rollback() {
      database.exec("ROLLBACK");
    },
  });

  return {
    query,
    async get<T>(sql: string, params: unknown[] = []) {
      const rows = await query<T>(sql, params);
      return rows[0];
    },
    run,
    async exec(sql: string) {
      database.exec(sql);
      persist();
    },
    transaction,
  };
}

/**
 * Open (or create once) the persistent Capacitor SQLite file.
 * createConnection opens an existing on-disk DB in place — it does not delete it.
 * This path intentionally never calls sqlite.deleteDatabase().
 */
async function openCapacitorDatabaseConnection() {
  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  const ensureConnection = async () => {
    const consistency = await sqlite.checkConnectionsConsistency();
    const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
    if (consistency.result && isConn) {
      return;
    }
    // Opens existing Library/CapacitorDatabase/cynoplanningSQLite.db, or creates if missing.
    await sqlite.createConnection(
      DB_NAME,
      false,
      "no-encryption",
      CAPACITOR_DB_VERSION,
      false,
    );
  };

  try {
    await ensureConnection();
  } catch {
    // Partial init can leave a live connection — retrieve it instead of wiping storage.
    const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
    if (!isConn) {
      await sqlite.createConnection(
        DB_NAME,
        false,
        "no-encryption",
        CAPACITOR_DB_VERSION,
        false,
      );
    }
  }

  return sqlite.retrieveConnection(DB_NAME, false);
}

function toCapacitorSqlParams(params: unknown[]): unknown[] {
  return params.map((value) => {
    if (value == null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number" || typeof value === "string") return value;
    return String(value);
  });
}

async function createCapacitorExecutor(): Promise<SqlExecutor> {
  const db = await openCapacitorDatabaseConnection();
  await db.open();
  // Serialize native SQLite calls. Concurrent query/run/transaction deadlocks
  // the iOS plugin and leaves the Notification Center on "Chargement...".
  await db.execute("PRAGMA foreign_keys = ON;", false);

  let gate: Promise<void> = Promise.resolve();
  let txDepth = 0;

  const enqueue = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (txDepth > 0) return fn();
    const next = gate.then(fn, fn);
    gate = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const nativeQuery = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const values = params.length ? toCapacitorSqlParams(params) : undefined;
    // query()'s 3rd argument is isSQL92, not transaction — never pass false here.
    const result = await db.query(sql, values as never);
    return (result.values ?? []) as T[];
  };

  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
    enqueue(() => nativeQuery<T>(sql, params));

  const transaction = createNestableTransaction({
    async begin() {
      await db.beginTransaction();
      txDepth += 1;
    },
    async commit() {
      try {
        await db.commitTransaction();
      } finally {
        txDepth = Math.max(0, txDepth - 1);
      }
    },
    async rollback() {
      try {
        await db.rollbackTransaction();
      } finally {
        txDepth = Math.max(0, txDepth - 1);
      }
    },
  });

  return {
    query,
    async get<T>(sql: string, params: unknown[] = []) {
      const rows = await query<T>(sql, params);
      return rows[0];
    },
    async run(sql: string, params: unknown[] = []) {
      return enqueue(async () => {
        const values = params.length ? toCapacitorSqlParams(params) : undefined;
        const result = await db.run(sql, values as never, false);
        return { changes: Number(result.changes?.changes ?? 0) };
      });
    },
    async exec(sql: string) {
      await enqueue(() => db.execute(sql, false));
    },
    transaction: (fn) => enqueue(() => transaction(fn)),
  };
}

/**
 * Idempotent schema bootstrap for Capacitor / sql.js.
 * Never DROP/TRUNCATE/recreate user tables. Existing rows are preserved.
 *
 * Capacitor ships the current full DDL in SCHEMA_TABLE_STATEMENTS (already includes
 * the effects of Electron migrations 001–014). We therefore only:
 * 1) CREATE TABLE IF NOT EXISTS for any missing tables
 * 2) Record baseline migration ids that are not yet in schema_migrations
 * 3) CREATE INDEX IF NOT EXISTS
 *
 * Future schema changes must append a new migration id AND additive SQL
 * (ALTER TABLE / CREATE TABLE IF NOT EXISTS) — never wipe the DB on app update.
 */
async function initializeSchema(executor: SqlExecutor): Promise<void> {
  await executor.exec("PRAGMA foreign_keys = ON;");
  for (const statement of SCHEMA_TABLE_STATEMENTS) {
    await executor.exec(statement);
  }

  await executor.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      success INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1))
    )
  `);

  const applied = await executor.query<{ id: string }>(
    `SELECT id FROM ${SCHEMA_MIGRATIONS_TABLE} WHERE COALESCE(success, 1) = 1`,
  );
  const appliedIds = new Set(applied.map((row) => row.id));
  for (const id of APPLIED_MIGRATION_IDS) {
    if (appliedIds.has(id)) continue;
    await executor.run(
      `INSERT OR IGNORE INTO ${SCHEMA_MIGRATIONS_TABLE} (id, name, applied_at, success)
       VALUES (?, ?, datetime('now'), 1)`,
      [id, id],
    );
  }

  const recordedAfterBaseline = await executor.query<{ id: string }>(
    `SELECT id FROM ${SCHEMA_MIGRATIONS_TABLE} WHERE COALESCE(success, 1) = 1`,
  );
  const recordedIds = new Set(recordedAfterBaseline.map((row) => row.id));
  for (const migration of LOCAL_SQLITE_MIGRATIONS) {
    if (recordedIds.has(migration.id)) continue;

    const alreadyOpenEnded =
      migration.id === "019_open_ended_dog_exclusions" &&
      (await localSqliteOpenEndedExclusionsReady(executor));

    const runStatements = async () => {
      if (alreadyOpenEnded) return;
      for (const statement of migration.statements) {
        // Migration 015 is additive and idempotent: skip ALTER when the column
        // is already present (e.g. a fresh DB created from the current schema).
        if (migration.id === "015_agents_origine_column") {
          const columns = await executor.query<{ name: string }>("PRAGMA table_info(agents)");
          if (columns.some((column) => column.name === "origine")) continue;
        }
        await executor.exec(statement);
      }
    };

    if (migration.noTransaction) {
      await runStatements();
      await executor.run(
        `INSERT OR IGNORE INTO ${SCHEMA_MIGRATIONS_TABLE} (id, name, applied_at, success)
         VALUES (?, ?, datetime('now'), 1)`,
        [migration.id, migration.name],
      );
    } else {
      await executor.transaction(async () => {
        await runStatements();
        await executor.run(
          `INSERT OR IGNORE INTO ${SCHEMA_MIGRATIONS_TABLE} (id, name, applied_at, success)
           VALUES (?, ?, datetime('now'), 1)`,
          [migration.id, migration.name],
        );
      });
    }
  }

  for (const statement of SCHEMA_INDEX_STATEMENTS) {
    await executor.exec(statement);
  }

  try {
    await executor.run(
      `UPDATE agent_exclusions
       SET active = 0, updated_at = datetime('now')
       WHERE active = 1
         AND end_date IS NOT NULL
         AND end_date < ?
         AND exclusion_type NOT IN ('dog_vet_visit', 'dog_without_handler')
         AND is_deleted = 0`,
      [todayIsoDate()],
    );
  } catch {
    // ignore if table/column not yet present
  }
}

export async function getLocalSqliteExecutor(): Promise<SqlExecutor> {
  if (!executorPromise) {
    executorPromise = (async () => {
      const executor = isNativeCapacitorRuntime()
        ? await createCapacitorExecutor()
        : await createSqlJsExecutor();
      await initializeSchema(executor);
      return executor;
    })();
  }
  return executorPromise;
}

/** Test-only: drop the in-memory executor handle. Never deletes the on-disk database. */
export function resetLocalSqliteExecutorForTests(): void {
  sqlJsPersistNow = null;
  executorPromise = null;
}

/**
 * Flush and close the current local SQLite handle.
 * Never deletes or replaces the on-disk database file.
 */
export async function closeLocalSqliteExecutor(): Promise<void> {
  if (sqlJsPersistNow) {
    try {
      await sqlJsPersistNow();
    } catch {
      // Persistence is best-effort; the next open still reads the last successful IDB write.
    }
    sqlJsPersistNow = null;
  }

  if (isNativeCapacitorRuntime()) {
    try {
      const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
      if (isConn) {
        await sqlite.closeConnection(DB_NAME, false);
      }
    } catch {
      // A failed close still drops the JS handle below so the next open is clean.
    }
  }

  executorPromise = null;
}

/**
 * Close the current local SQLite handle and open the existing file again.
 * Never deletes or replaces the on-disk database.
 */
export async function reopenLocalSqliteExecutor(): Promise<SqlExecutor> {
  await closeLocalSqliteExecutor();
  return getLocalSqliteExecutor();
}
