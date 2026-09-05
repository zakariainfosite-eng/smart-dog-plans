import { describe, expect, it } from "vitest";
import { SCHEMA_MIGRATIONS_TABLE, SCHEMA_TABLE_NAMES } from "@/integrations/database/schema-sql";
import type { SqlExecutor } from "@/integrations/database/sql-executor";
import {
  applicationTablesToClear,
  canClearLocalData,
  clearApplicationTables,
  databaseHasClearableData,
  verifyClearedLocalDatabase,
} from "@/lib/clear-local-data";

function createMemoryExecutor(seed: Record<string, Record<string, unknown>[]>): SqlExecutor {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const name of SCHEMA_TABLE_NAMES) {
    tables[name] = [...(seed[name] ?? [])];
  }
  tables[SCHEMA_MIGRATIONS_TABLE] = [{ id: "001_sections_commander_columns" }];

  const countSql = /^SELECT COUNT\(\*\) AS n FROM "([A-Za-z_][A-Za-z0-9_]*)"$/;
  const deleteSql = /^DELETE FROM "([A-Za-z_][A-Za-z0-9_]*)"$/;

  return {
    async query<T>(sql: string) {
      if (sql.includes("sqlite_master")) {
        return Object.keys(tables).map((name) => ({ name })) as T[];
      }
      return [] as T[];
    },
    async get<T>(sql: string) {
      if (sql === "PRAGMA integrity_check") {
        return { integrity_check: "ok" } as T;
      }
      if (sql.includes("sqlite_master")) {
        return { n: Object.keys(tables).length } as T;
      }
      const count = countSql.exec(sql);
      if (count) {
        return { n: (tables[count[1]] ?? []).length } as T;
      }
      return undefined;
    },
    async run(sql: string) {
      const deleted = deleteSql.exec(sql);
      if (deleted && tables[deleted[1]]) {
        tables[deleted[1]] = [];
        return { changes: 1 };
      }
      if (sql === "DELETE FROM sqlite_sequence") {
        return { changes: 0 };
      }
      return { changes: 0 };
    },
    async exec() {},
    async transaction<T>(fn: () => Promise<T>) {
      return fn();
    },
  };
}

describe("clear-local-data guards", () => {
  it("rejects non-admin roles", () => {
    expect(canClearLocalData("user")).toBe(false);
    expect(canClearLocalData(null)).toBe(false);
  });

  it("clears application tables without dropping schema_migrations", () => {
    const tables = applicationTablesToClear();
    expect(tables).toEqual(SCHEMA_TABLE_NAMES);
    expect(tables).toContain("agents");
    expect(tables).toContain("dogs");
    expect(tables).toContain("users");
    expect(tables).not.toContain(SCHEMA_MIGRATIONS_TABLE);
  });

  it("creates a backup only when application tables contain rows", () => {
    expect(databaseHasClearableData({ agents: 0, dogs: 0 })).toBe(false);
    expect(databaseHasClearableData({ agents: 2, dogs: 0 })).toBe(true);
  });
});

describe("clear-local-data table wipe", () => {
  it("deletes application rows and keeps required tables", async () => {
    const executor = createMemoryExecutor({
      agents: [{ id: "a1" }],
      dogs: [{ id: "d1" }],
      users: [{ id: "u1" }],
    });

    const cleared = await clearApplicationTables(executor);
    expect(cleared.agents).toBe(1);
    expect(cleared.dogs).toBe(1);
    expect(cleared.users).toBe(1);

    const verified = await verifyClearedLocalDatabase(executor);
    expect(verified.integrity).toBe("ok");
    expect(verified.tablesVerified).toContain("agents");
    expect(verified.tablesVerified).toContain(SCHEMA_MIGRATIONS_TABLE);
  });
});
