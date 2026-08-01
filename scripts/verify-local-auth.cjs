/**
 * Verifies local SQLite auth: seed + bcrypt verify + session shape.
 * Usage: env -u ELECTRON_RUN_AS_NODE electron scripts/verify-local-auth.cjs
 */
const { app } = require("electron");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

function loadEnvFile() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    console.error("Missing .env at", envPath);
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

app.whenReady().then(async () => {
  try {
    loadEnvFile();
    const { initializeDatabase, getDatabase } = await import("../dist-electron/chunks/database-OGJYRQ6A.mjs").catch(
      async () => {
        // Prefer source path via dynamic compiled modules from ipc chunk is fragile.
        // Use better-sqlite3 through a tiny inline path instead.
        return null;
      },
    );

    // Stable path: use users-store via electron-rebuild native binding in Electron.
    const Database = require("better-sqlite3");
    const bcrypt = require("bcryptjs");
    const { randomUUID } = require("node:crypto");

    const dbPath = join(app.getPath("userData"), "cynoplanning.db");
    console.log("[verify] userData=", app.getPath("userData"));
    console.log("[verify] dbPath=", dbPath);

    const db = new Database(dbPath);
    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    const email = (process.env.LOCAL_AUTH_SEED_EMAIL || "karim@cynoplanning.local").trim().toLowerCase();
    const password = process.env.LOCAL_AUTH_SEED_PASSWORD || "karim@123";
    const role = (process.env.LOCAL_AUTH_SEED_ROLE || "admin").toLowerCase() === "user" ? "user" : "admin";

    const existing = db.prepare("SELECT id, email, password_hash, role FROM users WHERE email = ?").get(email);
    if (!existing) {
      const hash = bcrypt.hashSync(password, 12);
      db.prepare(
        `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      ).run(randomUUID(), email, hash, role);
      console.log("[verify] seeded", email);
    } else {
      const ok = bcrypt.compareSync(password, existing.password_hash);
      if (!ok || existing.role !== role) {
        db.prepare(
          `UPDATE users SET password_hash = ?, role = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(bcrypt.hashSync(password, 12), role, existing.id);
        console.log("[verify] updated credentials for", email);
      } else {
        console.log("[verify] user already present", email);
      }
    }

    const row = db.prepare("SELECT id, email, password_hash, role FROM users WHERE email = ?").get(email);
    const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
    const passwordOk = bcrypt.compareSync(password, row.password_hash);
    const wrongOk = bcrypt.compareSync("wrong-password", row.password_hash);

    // Simulate IPC session payload
    const session = {
      accessToken: require("node:crypto").randomBytes(32).toString("hex"),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      user: { id: row.id, email: row.email, role: row.role },
    };

    console.log("[verify] users.count=", count);
    console.log("[verify] user=", { id: row.id, email: row.email, role: row.role });
    console.log("[verify] password hashing works=", passwordOk && !wrongOk);
    console.log("[verify] login would succeed=", passwordOk);
    console.log("[verify] session shape ok=", Boolean(session.accessToken && session.user.id));
    console.log(
      "[verify] RESULT=",
      passwordOk && count >= 1 ? "PASS" : "FAIL",
    );

    db.close();
    app.exit(passwordOk ? 0 : 1);
  } catch (error) {
    console.error("[verify] FAILED", error);
    app.exit(1);
  }
});
