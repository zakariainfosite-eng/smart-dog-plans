import bcrypt from "bcryptjs";
import { randomId } from "@/lib/random-id";
import type { AuthRole, AuthSession, AuthUser } from "@/integrations/auth/types";
import type { SqlExecutor } from "./sql-executor";

const SESSION_KEY = "cynoplanning.local-auth-session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

const SEED_EMAIL = (import.meta.env.VITE_LOCAL_AUTH_SEED_EMAIL as string | undefined)?.trim()
  || "karim@cynoplanning.local";
const SEED_PASSWORD = (import.meta.env.VITE_LOCAL_AUTH_SEED_PASSWORD as string | undefined)
  || "karim@123";
const SEED_ROLE: AuthRole =
  (import.meta.env.VITE_LOCAL_AUTH_SEED_ROLE as string | undefined)?.trim().toLowerCase() === "user"
    ? "user"
    : "admin";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: AuthRole;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function readStoredSession(): AuthSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.accessToken || !parsed?.user?.id || !parsed?.user?.email) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt ?? null,
      user: {
        id: parsed.user.id,
        email: parsed.user.email,
        role: parsed.user.role === "admin" ? "admin" : "user",
      },
    };
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function writeStoredSession(user: AuthUser): AuthSession {
  const session: AuthSession = {
    accessToken: createSessionToken(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    user: {
      id: user.id,
      email: user.email,
      role: user.role === "admin" ? "admin" : "user",
    },
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearLocalAuthSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

export async function seedLocalAuthUser(db: SqlExecutor): Promise<AuthUser | null> {
  const email = normalizeEmail(SEED_EMAIL);
  const existing = await db.get<UserRow>(
    `SELECT id, email, password_hash, role FROM users WHERE email = ?`,
    [email],
  );

  if (!existing) {
    const id = randomId();
    const passwordHash = bcrypt.hashSync(SEED_PASSWORD, BCRYPT_ROUNDS);
    await db.run(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, email, passwordHash, SEED_ROLE],
    );
    return { id, email, role: SEED_ROLE };
  }

  const passwordMatches = bcrypt.compareSync(SEED_PASSWORD, existing.password_hash);
  if (passwordMatches && existing.role === SEED_ROLE) {
    return { id: existing.id, email: existing.email, role: existing.role === "admin" ? "admin" : "user" };
  }

  const passwordHash = bcrypt.hashSync(SEED_PASSWORD, BCRYPT_ROUNDS);
  await db.run(
    `UPDATE users SET password_hash = ?, role = ?, updated_at = datetime('now') WHERE id = ?`,
    [passwordHash, SEED_ROLE, existing.id],
  );
  return { id: existing.id, email, role: SEED_ROLE };
}

export async function verifyLocalCredentials(
  db: SqlExecutor,
  email: string,
  password: string,
): Promise<AuthUser> {
  const row = await db.get<UserRow>(
    `SELECT id, email, password_hash, role FROM users WHERE email = ?`,
    [normalizeEmail(email)],
  );
  if (!row) throw new Error("Invalid login credentials");
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) throw new Error("Invalid login credentials");
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
  };
}

export async function findLocalUserById(db: SqlExecutor, id: string): Promise<AuthUser | null> {
  const row = await db.get<{ id: string; email: string; role: AuthRole }>(
    `SELECT id, email, role FROM users WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
  };
}

export async function signInLocal(
  db: SqlExecutor,
  email: string,
  password: string,
): Promise<AuthSession> {
  await seedLocalAuthUser(db);
  const user = await verifyLocalCredentials(db, email, password);
  return writeStoredSession(user);
}

export async function getLocalSession(db: SqlExecutor): Promise<AuthSession | null> {
  await seedLocalAuthUser(db);
  const session = readStoredSession();
  if (!session) return null;
  const user = await findLocalUserById(db, session.user.id);
  if (!user) {
    clearLocalAuthSession();
    return null;
  }
  return { ...session, user };
}
