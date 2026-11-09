import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedLocalAuthUserFromEnv, verifyUserCredentials } from "./users-store";

const USERS_DDL = `CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

describe("seedLocalAuthUserFromEnv after import", () => {
  let dbPath: string;
  let db: Database.Database;
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnv = { ...process.env };
    dbPath = join(tmpdir(), `users-store-import-${Date.now()}.db`);
    db = new Database(dbPath);
    db.exec(USERS_DDL);

    const importedHash = bcrypt.hashSync("karim@123", 12);
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    ).run("usr-imported", "karim@cynoplanning.local", importedHash, "admin");

    process.env.LOCAL_AUTH_SEED_EMAIL = "karim@cynoplanning.local";
    process.env.LOCAL_AUTH_SEED_PASSWORD = "InstallerDefault@999";
    process.env.LOCAL_AUTH_SEED_ROLE = "admin";
  });

  afterEach(() => {
    process.env = previousEnv;
    db.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  it("does not touch users when the table is not empty", () => {
    expect(seedLocalAuthUserFromEnv(db)).toBeNull();
    expect(() => verifyUserCredentials(db, "karim@cynoplanning.local", "karim@123")).not.toThrow();
    expect(() =>
      verifyUserCredentials(db, "karim@cynoplanning.local", "InstallerDefault@999"),
    ).toThrow(/Invalid login credentials/);
  });
});

describe("seedLocalAuthUserFromEnv packaged defaults", () => {
  let dbPath: string;
  let db: Database.Database;
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnv = { ...process.env };
    delete process.env.LOCAL_AUTH_SEED_EMAIL;
    delete process.env.LOCAL_AUTH_SEED_PASSWORD;
    delete process.env.LOCAL_AUTH_SEED_ROLE;
    dbPath = join(tmpdir(), `users-store-packaged-${Date.now()}.db`);
    db = new Database(dbPath);
    db.exec(USERS_DDL);
  });

  afterEach(() => {
    process.env = previousEnv;
    db.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  it("creates karim@cynoplanning.local without .env on an empty users table", () => {
    const user = seedLocalAuthUserFromEnv(db);
    expect(user?.email).toBe("karim@cynoplanning.local");
    expect(() => verifyUserCredentials(db, "karim@cynoplanning.local", "karim@123")).not.toThrow();
    expect(seedLocalAuthUserFromEnv(db)).toBeNull();
  });
});

describe("seedLocalAuthUserFromEnv empty database", () => {
  let dbPath: string;
  let db: Database.Database;
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnv = { ...process.env };
    dbPath = join(tmpdir(), `users-store-empty-${Date.now()}.db`);
    db = new Database(dbPath);
    db.exec(USERS_DDL);
    process.env.LOCAL_AUTH_SEED_EMAIL = "karim@cynoplanning.local";
    process.env.LOCAL_AUTH_SEED_PASSWORD = "karim@123";
    process.env.LOCAL_AUTH_SEED_ROLE = "admin";
  });

  afterEach(() => {
    process.env = previousEnv;
    db.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  it("creates the seed user when users table is empty", () => {
    seedLocalAuthUserFromEnv(db);
    expect(() => verifyUserCredentials(db, "karim@cynoplanning.local", "karim@123")).not.toThrow();
  });
});
