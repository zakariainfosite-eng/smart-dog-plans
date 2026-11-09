import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "os";
import type { App } from "electron";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDatabase } from "./database";
import {
  readCoreTableCounts,
  verifyActiveDatabaseAfterImport,
} from "./desktop-data";

function mockApp(userDataPath: string): App {
  return {
    getPath: (name: string) => {
      if (name === "userData") return userDataPath;
      return userDataPath;
    },
    isReady: () => true,
  } as App;
}

describe("desktop database import verification", () => {
  let userData: string;
  let previousAllowEmpty: string | undefined;

  beforeEach(() => {
    previousAllowEmpty = process.env.CYNOPLANNING_ALLOW_EMPTY_DB;
    process.env.CYNOPLANNING_ALLOW_EMPTY_DB = "1";
    userData = mkdtempSync(join(tmpdir(), "cyno-import-verify-"));
  });

  afterEach(() => {
    closeDatabase();
    if (previousAllowEmpty === undefined) {
      delete process.env.CYNOPLANNING_ALLOW_EMPTY_DB;
    } else {
      process.env.CYNOPLANNING_ALLOW_EMPTY_DB = previousAllowEmpty;
    }
    if (existsSync(userData)) rmSync(userData, { recursive: true, force: true });
  });

  it("replace flow activates imported 67-dog database at userData path", async () => {
    const app = mockApp(userData);
    const sourcePath = join(process.cwd(), "test-data/cynoplanning_67chiens.db");
    const pickPath = join(userData, "picked.db");
    copyFileSync(sourcePath, pickPath);

    const { initializeDatabase, getDatabasePath } = await import("./database");
    const { stagePendingSqliteDatabasePick, restorePickedSqliteDatabase } = await import(
      "./desktop-data"
    );

    initializeDatabase(app);
    closeDatabase();

    stagePendingSqliteDatabasePick(pickPath, "cynoplanning_67chiens.db", 446464);
    const result = restorePickedSqliteDatabase(app);

    expect(result.verification?.users).toBe(4);
    expect(result.verification?.agents).toBe(79);
    expect(result.verification?.dogs).toBe(67);
    expect(result.verification?.activeDatabasePath).toBe(getDatabasePath(app));

    const active = getDatabasePath(app);
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(active, { readonly: true });
    expect(readCoreTableCounts(db)).toEqual({ users: 4, agents: 79, dogs: 67 });
    db.close();
  });

  it("verifyActiveDatabaseAfterImport rejects mismatched row counts", async () => {
    const { default: Database } = await import("better-sqlite3");
    const dbPath = join(userData, "probe.db");
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('1');`);
    db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY);`);
    db.exec(`CREATE TABLE dogs (id TEXT PRIMARY KEY);`);
    expect(() =>
      verifyActiveDatabaseAfterImport(db, dbPath, { users: 4, agents: 79, dogs: 67 }),
    ).toThrow(/import_verify_failed/);
    db.close();
  });
});
