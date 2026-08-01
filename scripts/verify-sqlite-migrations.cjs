/**
 * Verifies SQLite migration runner: applies pending migrations, records versions,
 * creates a pre-migration backup, and restores on failure.
 *
 * Usage: npm run electron:build:main && npm run electron:verify-migrations
 */
const { app } = require("electron");
const { mkdtempSync, readdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");

const tempRoot = mkdtempSync(join(tmpdir(), "cyno-migration-verify-"));
const tempUserData = join(tempRoot, "userData");

app.setName("CynoPlanning");
app.setPath("userData", tempUserData);

function fail(message) {
  console.error("FAIL", message);
  process.exit(1);
}

function ok(message) {
  console.log("OK", message);
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
      createPreMigrationBackup,
      restoreDatabaseFromBackup,
    } = sqlite;

    const mockApp = {
      getPath: (name) => {
        if (name === "userData") return tempUserData;
        throw new Error(`unexpected getPath(${name})`);
      },
    };

    initializeDatabase(mockApp);
    const database = getDatabase();
    const applied = database
      .prepare(`SELECT id FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY id`)
      .all()
      .map((row) => row.id);

    if (applied.length !== SQLITE_MIGRATIONS.length) {
      fail(`expected ${SQLITE_MIGRATIONS.length} migrations, got ${applied.length}`);
    }
    for (const migration of SQLITE_MIGRATIONS) {
      if (!applied.includes(migration.id)) {
        fail(`missing migration record: ${migration.id}`);
      }
    }
    ok("fresh database — all migrations recorded");

    const backupsAfterFirst = readdirSync(tempUserData).filter((name) =>
      name.startsWith("cynoplanning.db.pre-migration."),
    );
    if (backupsAfterFirst.length !== 1) {
      fail(`expected 1 pre-migration backup, found ${backupsAfterFirst.length}`);
    }
    ok("pre-migration backup created");

    closeDatabase();
    initializeDatabase(mockApp);
    const backupsAfterSecond = readdirSync(tempUserData).filter((name) =>
      name.startsWith("cynoplanning.db.pre-migration."),
    );
    if (backupsAfterSecond.length !== 1) {
      fail(`expected 1 backup after re-init, found ${backupsAfterSecond.length}`);
    }
    ok("re-init is idempotent — no duplicate backups");

    closeDatabase();
    const dbPath = getDatabasePath(mockApp);
    const Database = require("better-sqlite3");
    const connection = new Database(dbPath);
    connection.pragma("journal_mode = WAL");
    const backupPath = createPreMigrationBackup(connection, tempUserData, dbPath);
    connection.prepare(
      `DELETE FROM ${SCHEMA_MIGRATIONS_TABLE} WHERE id = ?`,
    ).run("004_female_agents_clear_section");
    connection.exec("ALTER TABLE dogs ADD COLUMN __migration_test_fail__ TEXT");
    connection.close();
    const connectionForRestore = new Database(dbPath);
    restoreDatabaseFromBackup(connectionForRestore, dbPath, backupPath);

    const reopened = new Database(dbPath);
    const restoredApplied = reopened
      .prepare(`SELECT COUNT(*) AS c FROM ${SCHEMA_MIGRATIONS_TABLE}`)
      .get().c;
    if (restoredApplied !== SQLITE_MIGRATIONS.length) {
      fail(`after restore expected ${SQLITE_MIGRATIONS.length} migrations, got ${restoredApplied}`);
    }
    const dogColumns = reopened
      .prepare("PRAGMA table_info(dogs)")
      .all()
      .map((column) => column.name);
    if (dogColumns.includes("__migration_test_fail__")) {
      fail("restored database still has failed migration column");
    }
    reopened.close();
    ok("restoreDatabaseFromBackup reverts failed schema change");

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
