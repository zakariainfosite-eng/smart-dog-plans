import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type Database from "better-sqlite3";

export type AuthRole = "admin" | "user";

export type LocalAuthUser = {
  id: string;
  email: string;
  role: AuthRole;
};

export type CreateLocalUserInput = {
  email: string;
  password: string;
  role: AuthRole;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: AuthRole;
};

const BCRYPT_ROUNDS = 12;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapUser(row: UserRow): LocalAuthUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
  };
}

export function countUsers(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM users`).get() as { count: number };
  return Number(row.count);
}

export function findUserByEmail(db: Database.Database, email: string): UserRow | null {
  const row = db
    .prepare(`SELECT id, email, password_hash, role FROM users WHERE email = ?`)
    .get(normalizeEmail(email)) as UserRow | undefined;
  return row ?? null;
}

export function findUserById(db: Database.Database, id: string): LocalAuthUser | null {
  const row = db
    .prepare(`SELECT id, email, role FROM users WHERE id = ?`)
    .get(id) as Omit<UserRow, "password_hash"> | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
  };
}

export function createUser(db: Database.Database, input: CreateLocalUserInput): LocalAuthUser {
  const email = normalizeEmail(input.email);
  if (!email || !input.password) {
    throw new Error("Email and password are required.");
  }
  if (input.password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const existing = findUserByEmail(db, email);
  if (existing) {
    throw new Error("A user with this email already exists.");
  }

  const id = randomUUID();
  const passwordHash = bcrypt.hashSync(input.password, BCRYPT_ROUNDS);
  const role: AuthRole = input.role === "admin" ? "admin" : "user";

  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
  ).run(id, email, passwordHash, role);

  return { id, email, role };
}

export function verifyUserCredentials(
  db: Database.Database,
  email: string,
  password: string,
): LocalAuthUser {
  const row = findUserByEmail(db, email);
  if (!row) {
    throw new Error("Invalid login credentials");
  }

  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) {
    throw new Error("Invalid login credentials");
  }

  return mapUser(row);
}

/**
 * Ensures the LOCAL_AUTH_SEED_* user exists with the configured password/role.
 * Creates on first run; updates hash/role when env credentials change.
 */
export function seedLocalAuthUserFromEnv(db: Database.Database): LocalAuthUser | null {
  const emailRaw = process.env.LOCAL_AUTH_SEED_EMAIL?.trim();
  const password = process.env.LOCAL_AUTH_SEED_PASSWORD;
  if (!emailRaw || !password) {
    console.warn(
      "[electron][auth] LOCAL_AUTH_SEED_EMAIL / LOCAL_AUTH_SEED_PASSWORD not set — users table not seeded",
    );
    return null;
  }

  const email = normalizeEmail(emailRaw);
  const roleEnv = process.env.LOCAL_AUTH_SEED_ROLE?.trim().toLowerCase();
  const role: AuthRole = roleEnv === "user" ? "user" : "admin";

  const existing = findUserByEmail(db, email);
  if (!existing) {
    const user = createUser(db, { email, password, role });
    console.log(`[electron][auth] Seeded local ${role} user: ${user.email}`);
    return user;
  }

  const passwordMatches = bcrypt.compareSync(password, existing.password_hash);
  if (passwordMatches && existing.role === role) {
    return mapUser(existing);
  }

  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  db.prepare(
    `UPDATE users
     SET password_hash = ?, role = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(passwordHash, role, existing.id);

  console.log(`[electron][auth] Updated local ${role} user credentials: ${email}`);
  return { id: existing.id, email, role };
}
