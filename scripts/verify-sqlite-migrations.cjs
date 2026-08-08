/**
 * Verifies SQLite migration runner: applies pending migrations, records versions,
 * creates a pre-migration backup, and restores on failure.
 *
 * Usage: npm run electron:build:main && npm run electron:verify-migrations
 */
const { app } = require("electron");
const { existsSync, mkdtempSync, readdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");

const tempRoot = mkdtempSync(join(tmpdir(), "cyno-migration-verify-"));
const tempUserData = join(tempRoot, "userData");

process.env.CYNOPLANNING_ALLOW_EMPTY_DB = "1";

app.setName("CynoPlanning");
app.setPath("userData", tempUserData);

function fail(message) {
  console.error("FAIL", message);
  process.exit(1);
}

function ok(message) {
  console.log("OK", message);
}

function listBackups(userData, isMigrationBackupFileName) {
  return readdirSync(userData).filter((name) => isMigrationBackupFileName(name));
}

app.whenReady().then(async () => {
  try {
    const chunksDir = join(__dirname, "../dist-electron/chunks");
    const databaseChunk = readdirSync(chunksDir).find(
      (name) => name.startsWith("database-") && name.endsWith(".mjs"),
    );
    if (!databaseChunk) {
      fail("missing dist-electron database chunk — run npm run electron:build:main first");
    }

    const sqlite = await import(pathToFileURL(join(chunksDir, databaseChunk)).href);
    const {
      initializeDatabase,
      closeDatabase,
      getDatabase,
      getDatabasePath,
      SCHEMA_MIGRATIONS_TABLE,
      SQLITE_MIGRATIONS,
      isMigrationBackupFileName,
    } = sqlite;

    const mockApp = {
      isReady: () => true,
      getPath: (name) => {
        if (name === "userData") return tempUserData;
        throw new Error(`unexpected getPath(${name})`);
      },
    };

    initializeDatabase(mockApp);
    const database = getDatabase();
    const history = database
      .prepare(`SELECT id, name, applied_at, success FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY id`)
      .all();

    if (history.length !== SQLITE_MIGRATIONS.length) {
      fail(`expected ${SQLITE_MIGRATIONS.length} migrations, got ${history.length}`);
    }
    for (const migration of SQLITE_MIGRATIONS) {
      const row = history.find((entry) => entry.id === migration.id);
      if (!row) {
        fail(`missing migration record: ${migration.id}`);
      }
      if (row.success !== 1) {
        fail(`migration ${migration.id} success=${row.success}, expected 1`);
      }
      if (!row.name || !String(row.name).trim()) {
        fail(`migration ${migration.id} missing name`);
      }
      if (!row.applied_at) {
        fail(`migration ${migration.id} missing applied_at`);
      }
    }
    ok("fresh database — all migrations recorded with name/date/success");

    const backupsAfterFirst = listBackups(tempUserData, isMigrationBackupFileName);
    if (backupsAfterFirst.length !== 1) {
      fail(`expected 1 pre-migration backup, found ${backupsAfterFirst.length}`);
    }
    if (!/^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.db$/.test(backupsAfterFirst[0])) {
      fail(`unexpected backup name: ${backupsAfterFirst[0]}`);
    }
    ok("pre-migration backup created (backup_YYYY-MM-DD_HH-MM-SS.db)");

    closeDatabase();
    initializeDatabase(mockApp);
    const backupsAfterSecond = listBackups(tempUserData, isMigrationBackupFileName);
    if (backupsAfterSecond.length !== 1) {
      fail(`expected 1 backup after re-init, found ${backupsAfterSecond.length}`);
    }
    ok("re-init is idempotent — no duplicate backups / migrations");

    const historyCount = getDatabase()
      .prepare(`SELECT COUNT(*) AS c FROM ${SCHEMA_MIGRATIONS_TABLE}`)
      .get().c;
    if (historyCount !== SQLITE_MIGRATIONS.length) {
      fail(`duplicate migration rows after re-init: ${historyCount}`);
    }
    ok("no duplicate migration executions");

    closeDatabase();
    const dbPath = getDatabasePath(mockApp);
    const Database = require("better-sqlite3");

    // Scenario D: make a real pending migration fail during production startup.
    // The marker row and failure trigger are part of the pre-migration state and
    // therefore must still exist after the automatic backup restore.
    const markerSectionId = "__migration_restore_section__";
    const markerAgentId = "__migration_restore_agent__";
    const failingMigrationId = "004_female_agents_clear_section";
    const connection = new Database(dbPath);
    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
    connection
      .prepare(`INSERT INTO sections (id, name, shift_type, active) VALUES (?, ?, 'day', 1)`)
      .run(markerSectionId, "Migration restore marker");
    connection
      .prepare(
        `INSERT INTO agents (
          id, first_name, last_name, professional_number, grade, gender,
          fonction, section_id, active
        ) VALUES (?, 'Restore', 'Marker', ?, 'Test', 'female',
          'cynotechnicien', ?, 1)`,
      )
      .run(markerAgentId, markerAgentId, markerSectionId);
    connection
      .prepare(`DELETE FROM ${SCHEMA_MIGRATIONS_TABLE} WHERE id = ?`)
      .run(failingMigrationId);
    connection.exec(`
      CREATE TRIGGER __force_pending_migration_failure__
      BEFORE UPDATE OF section_id ON agents
      WHEN OLD.id = '${markerAgentId}'
      BEGIN
        SELECT RAISE(ABORT, 'forced migration failure');
      END
    `);
    connection.close();

    let migrationFailure;
    try {
      initializeDatabase(mockApp);
      fail("forced pending migration unexpectedly succeeded");
    } catch (error) {
      migrationFailure = error;
    }

    if (!migrationFailure?.restored) {
      fail(`migration failure did not report a successful restore: ${migrationFailure}`);
    }
    if (!migrationFailure.backupPath || !existsSync(migrationFailure.backupPath)) {
      fail("migration failure did not retain a valid backup path");
    }

    const reopened = new Database(dbPath);
    reopened.pragma("foreign_keys = ON");
    const marker = reopened
      .prepare(`SELECT section_id FROM agents WHERE id = ?`)
      .get(markerAgentId);
    if (!marker || marker.section_id !== markerSectionId) {
      fail(`marker row was not restored: ${JSON.stringify(marker)}`);
    }
    const failedMigrationWasRestored = reopened
      .prepare(`SELECT COUNT(*) AS c FROM ${SCHEMA_MIGRATIONS_TABLE} WHERE id = ?`)
      .get(failingMigrationId).c;
    if (failedMigrationWasRestored !== 0) {
      fail("failed migration record survived automatic restore");
    }
    const triggerWasRestored = reopened
      .prepare(
        `SELECT COUNT(*) AS c FROM sqlite_master
         WHERE type = 'trigger' AND name = '__force_pending_migration_failure__'`,
      )
      .get().c;
    if (triggerWasRestored !== 1) {
      fail("pre-migration trigger was not restored with the database");
    }
    const integrity = reopened.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      fail(`restored database integrity_check=${integrity}`);
    }
    reopened.close();
    ok("forced startup migration failure restores the exact pre-migration database");

    console.log("ALL_MIGRATION_CHECKS_PASSED");
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});
