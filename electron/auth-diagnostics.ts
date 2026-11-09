import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { App } from "electron";
import bcrypt from "bcryptjs";
import type Database from "better-sqlite3";

import { getDatabasePath } from "./database";
import { countUsers, findUserByEmail } from "./users-store";

const LOG_FILE_NAME = "auth-bootstrap.log";

let resolvedLogPath: string | null = null;

function packageVersion(): string {
  try {
    const pkgPath = join(process.cwd(), "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
      return pkg.version ?? "unknown";
    }
  } catch {
    // packaged app-server cwd may differ — fall back below
  }
  return process.env.npm_package_version?.trim() || "unknown";
}

export function getAuthDiagnosticsLogPath(app: App): string {
  if (!resolvedLogPath) {
    const userData = app.getPath("userData");
    if (!existsSync(userData)) {
      mkdirSync(userData, { recursive: true });
    }
    resolvedLogPath = join(userData, LOG_FILE_NAME);
  }
  return resolvedLogPath;
}

export type AuthSignInFailureReason =
  | "user_not_found"
  | "password_mismatch"
  | "invalid_login_credentials";

export function logAuthDiagnostic(
  app: App,
  event: string,
  details: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    event,
    appVersion: packageVersion(),
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath("userData"),
    ...details,
  });
  try {
    const path = getAuthDiagnosticsLogPath(app);
    appendFileSync(path, `${line}\n`, { encoding: "utf8" });
  } catch {
  }
}

export function listUserEmails(db: Database.Database): string[] {
  try {
    const rows = db.prepare(`SELECT email FROM users ORDER BY email`).all() as { email: string }[];
    return rows.map((row) => String(row.email ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

export function logAuthDatabaseSnapshot(
  app: App,
  db: Database.Database,
  label: string,
  extra: Record<string, unknown> = {},
): void {
  const dbPath = getDatabasePath(app);
  logAuthDiagnostic(app, label, {
    databasePath: dbPath,
    databaseFileExists: existsSync(dbPath),
    userCount: countUsers(db),
    userEmails: listUserEmails(db),
    ...extra,
  });
}

export function diagnoseSignInFailure(
  db: Database.Database,
  email: string,
  password: string,
): AuthSignInFailureReason {
  const row = findUserByEmail(db, email);
  if (!row) {
    return "user_not_found";
  }
  const ok = bcrypt.compareSync(password, row.password_hash);
  return ok ? "invalid_login_credentials" : "password_mismatch";
}
