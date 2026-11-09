import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "os";
import type { App } from "electron";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDatabase, getDatabasePath, initializeDatabase } from "./database";
import { seedLocalAuthUserFromEnv, verifyUserCredentials } from "./users-store";

function mockApp(userDataPath: string): App {
  return {
    getPath: (name: string) => {
      if (name === "userData") return userDataPath;
      return userDataPath;
    },
    isReady: () => true,
  } as App;
}

describe("fresh install auth bootstrap", () => {
  let userData: string;
  let previousAllowEmpty: string | undefined;
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousAllowEmpty = process.env.CYNOPLANNING_ALLOW_EMPTY_DB;
    previousEnv = { ...process.env };
    delete process.env.LOCAL_AUTH_SEED_EMAIL;
    delete process.env.LOCAL_AUTH_SEED_PASSWORD;
    delete process.env.LOCAL_AUTH_SEED_ROLE;
    process.env.CYNOPLANNING_ALLOW_EMPTY_DB = "1";
    userData = mkdtempSync(join(tmpdir(), "cyno-fresh-auth-"));
  });

  afterEach(() => {
    closeDatabase();
    if (previousAllowEmpty === undefined) {
      delete process.env.CYNOPLANNING_ALLOW_EMPTY_DB;
    } else {
      process.env.CYNOPLANNING_ALLOW_EMPTY_DB = previousAllowEmpty;
    }
    process.env = previousEnv;
    if (existsSync(userData)) rmSync(userData, { recursive: true, force: true });
  });

  it("initializeDatabase + seed uses the same cynoplanning.db for login", () => {
    const app = mockApp(userData);
    const db = initializeDatabase(app);
    const seeded = seedLocalAuthUserFromEnv(db);
    expect(seeded?.email).toBe("karim@cynoplanning.local");
    expect(getDatabasePath(app)).toBe(join(userData, "cynoplanning.db"));
    expect(() => verifyUserCredentials(db, "karim@cynoplanning.local", "karim@123")).not.toThrow();
  });
});
