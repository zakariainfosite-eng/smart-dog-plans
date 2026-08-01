import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { App } from "electron";

import type { AuthRole, LocalAuthUser } from "./users-store";

export type PersistedAuthSession = {
  accessToken: string;
  user: LocalAuthUser;
  expiresAt: string;
};

const SESSION_FILE_NAME = "auth-session.json";
/** Local sessions last 30 days unless the user signs out. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sessionPath(app: App): string {
  return join(app.getPath("userData"), SESSION_FILE_NAME);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function writeAuthSession(app: App, user: LocalAuthUser): PersistedAuthSession {
  const session: PersistedAuthSession = {
    accessToken: createSessionToken(),
    user: {
      id: user.id,
      email: user.email,
      role: user.role === "admin" ? "admin" : ("user" as AuthRole),
    },
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };

  const path = sessionPath(app);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(session), { encoding: "utf8", mode: 0o600 });
  return session;
}

export function readAuthSession(app: App): PersistedAuthSession | null {
  const path = sessionPath(app);
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as PersistedAuthSession;
    if (!parsed?.accessToken || !parsed?.user?.id || !parsed?.user?.email || !parsed?.expiresAt) {
      clearAuthSession(app);
      return null;
    }
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      clearAuthSession(app);
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      user: {
        id: parsed.user.id,
        email: parsed.user.email,
        role: parsed.user.role === "admin" ? "admin" : "user",
      },
    };
  } catch {
    clearAuthSession(app);
    return null;
  }
}

export function clearAuthSession(app: App): void {
  const path = sessionPath(app);
  if (!existsSync(path)) return;
  try {
    unlinkSync(path);
  } catch {
    // Ignore missing/locked file on logout.
  }
}
