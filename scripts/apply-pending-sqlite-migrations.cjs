/**
 * Apply pending SQLite migrations to the live CynoPlanning userData DB.
 *
 * Quit the Electron app first so the DB is not locked.
 *
 * Usage:
 *   npm run electron:build:main && npm run electron:apply-migrations
 */
const { app } = require("electron");
const { pathToFileURL } = require("node:url");
const { join } = require("node:path");
const { readdirSync } = require("node:fs");

app.setName("CynoPlanning");

function fail(message) {
  console.error("FAIL", message);
  process.exit(1);
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
    } = sqlite;

    const database = initializeDatabase(app);
    const dbPath = getDatabasePath(app);
    const applied = database
      .prepare(`SELECT id FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY id`)
      .all()
      .map((row) => row.id);

    console.log("OK database", dbPath);
    console.log("OK migrations", `${applied.length}/${SQLITE_MIGRATIONS.length}`);
    for (const id of applied) console.log("  -", id);

    const columns = database.prepare(`PRAGMA table_info(agents)`).all();
    const hasFonction = columns.some((column) => column.name === "fonction");
    if (!hasFonction) {
      fail("agents.fonction still missing after initializeDatabase()");
    }
    console.log("OK agents.fonction column present");

    const hasMaritalStatus = columns.some((column) => column.name === "marital_status");
    if (!hasMaritalStatus) {
      fail("agents.marital_status still missing after initializeDatabase()");
    }
    console.log("OK agents.marital_status column present");

    const checkpointColumns = database.prepare(`PRAGMA table_info(checkpoints)`).all();
    const hasMandatory = checkpointColumns.some((column) => column.name === "mandatory");
    if (!hasMandatory) {
      fail("checkpoints.mandatory still missing after initializeDatabase()");
    }
    console.log("OK checkpoints.mandatory column present");

    const mandatoryDefaults = database
      .prepare(
        `SELECT COUNT(*) AS n FROM checkpoints WHERE mandatory IS NULL OR mandatory NOT IN (0, 1)`,
      )
      .get().n;
    if (mandatoryDefaults !== 0) {
      fail(`checkpoints.mandatory has ${mandatoryDefaults} invalid values`);
    }
    const checkpointCount = database.prepare(`SELECT COUNT(*) AS n FROM checkpoints`).get().n;
    const mandatoryYes = database
      .prepare(`SELECT COUNT(*) AS n FROM checkpoints WHERE mandatory = 1`)
      .get().n;
    console.log(
      "OK checkpoints",
      checkpointCount,
      `(${mandatoryYes} mandatory=YES after migration default)`,
    );

    // Planning SELECT probe — same columns as CHECKPOINT_PLANNING_SELECT (flat fields).
    const planningProbe = database
      .prepare(
        `SELECT id, name, active, night_only, allowed_gender, female_policy, priority, mandatory,
                operating_days, day_shift_enabled, night_shift_enabled,
                day_explosives, day_narcotics, night_explosives, night_narcotics
         FROM checkpoints
         WHERE active = 1
         ORDER BY name COLLATE NOCASE
         LIMIT 3`,
      )
      .all();
    console.log("OK planning checkpoint SELECT", planningProbe.length, "active row(s)");

    const existingAgentCount = database.prepare(`SELECT COUNT(*) AS n FROM agents`).get().n;
    const nullMaritalCount = database
      .prepare(`SELECT COUNT(*) AS n FROM agents WHERE marital_status IS NULL`)
      .get().n;
    console.log("OK existing agents", existingAgentCount, `(${nullMaritalCount} without situation familiale)`);

    // Round-trip probe (rolled back)
    database.exec("SAVEPOINT fonction_probe");
    try {
      database
        .prepare(
          `INSERT INTO agents (
            id, first_name, last_name, professional_number, grade, gender, fonction, active
          ) VALUES (?, 'Probe', 'Fonction', ?, 'BRIG', 'male', 'chef_brigadier', 0)`,
        )
        .run("__probe_fonction_id__", "__probe_fonction_mle__");
      const row = database
        .prepare(`SELECT fonction, marital_status FROM agents WHERE id = ?`)
        .get("__probe_fonction_id__");
      if (row?.fonction !== "chef_brigadier") {
        fail(`probe read back fonction=${JSON.stringify(row?.fonction)}`);
      }
      if (row?.marital_status != null) {
        fail(`legacy insert should leave marital_status NULL, got ${JSON.stringify(row.marital_status)}`);
      }
      console.log("OK INSERT/SELECT chef_brigadier round-trip (marital_status NULL)");

      for (const role of [
        "chef_brigadier_pi",
        "chef_secretariat",
        "secretaire",
        "chef_de_section_pi",
      ]) {
        const id = `__probe_${role}__`;
        database
          .prepare(
            `INSERT INTO agents (
              id, first_name, last_name, professional_number, grade, gender, fonction, active
            ) VALUES (?, 'Probe', 'Role', ?, 'BRIG', 'male', ?, 0)`,
          )
          .run(id, id, role);
        const roleRow = database.prepare(`SELECT fonction FROM agents WHERE id = ?`).get(id);
        if (roleRow?.fonction !== role) {
          fail(`probe role ${role} read back ${JSON.stringify(roleRow?.fonction)}`);
        }
        database.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
      }
      console.log("OK hierarchy roles INSERT/SELECT (brigadier_pi, secretariat, secretaire, section_pi)");

      database
        .prepare(`UPDATE agents SET marital_status = ? WHERE id = ?`)
        .run("married", "__probe_fonction_id__");
      const updated = database
        .prepare(`SELECT marital_status FROM agents WHERE id = ?`)
        .get("__probe_fonction_id__");
      if (updated?.marital_status !== "married") {
        fail(`probe update marital_status=${JSON.stringify(updated?.marital_status)}`);
      }
      console.log("OK UPDATE marital_status=married round-trip");
    } finally {
      database.exec("ROLLBACK TO fonction_probe");
      database.exec("RELEASE fonction_probe");
    }

    const afterCount = database.prepare(`SELECT COUNT(*) AS n FROM agents`).get().n;
    if (afterCount !== existingAgentCount) {
      fail(`agent count changed after rolled-back probe: ${existingAgentCount} -> ${afterCount}`);
    }
    console.log("OK existing agents intact after probe rollback");

    closeDatabase();
    app.exit(0);
  } catch (error) {
    fail(error instanceof Error ? error.stack || error.message : String(error));
  }
});
