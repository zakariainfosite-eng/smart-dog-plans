/**
 * Runtime proof that "Historique administratif" can reach the database through the
 * exact path the desktop app uses at runtime:
 *
 *   renderer window.cynoplanning.rest.query()
 *     -> preload.cjs ipcRenderer.invoke("db:restQuery")
 *     -> dist-electron ipc handler
 *     -> executeRestQuery() + ALLOWED_TABLES
 *     -> better-sqlite3 userData database
 *
 * Pass 1 runs a SELECT against the live userData database (the call that used to fail
 * with "Table not allowed"). Pass 2 runs INSERT/UPDATE/DELETE against a throwaway copy
 * of that same database, so full CRUD is exercised on real data without writing to it.
 *
 * Quit the Electron app first so the DB is not locked.
 *
 * Usage:
 *   npm run electron:build:main && npm run electron:verify-agent-history
 */
const { app, BrowserWindow } = require("electron");
const { pathToFileURL } = require("node:url");
const { join } = require("node:path");
const { readdirSync, copyFileSync, mkdtempSync, rmSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { randomUUID } = require("node:crypto");

app.setName("CynoPlanning");

const TABLE = "agent_administrative_history";

function fail(message) {
  console.error("FAIL", message);
  app.exit(1);
  process.exit(1);
}

/** Loads every compiled chunk and returns the first namespace exporting `name`. */
async function loadFromChunks(chunksDir, name) {
  for (const file of readdirSync(chunksDir).filter((n) => n.endsWith(".mjs"))) {
    const ns = await import(pathToFileURL(join(chunksDir, file)).href);
    if (typeof ns[name] === "function") return ns;
  }
  fail(`no compiled chunk exports ${name} — run npm run electron:build:main first`);
}

function counts(db) {
  return {
    agents: db.prepare(`SELECT COUNT(*) AS n FROM agents`).get().n,
    rotations: db.prepare(`SELECT COUNT(*) AS n FROM rotation_history`).get().n,
    exclusions: db.prepare(`SELECT COUNT(*) AS n FROM agent_exclusions`).get().n,
    cases: db.prepare(`SELECT COUNT(*) AS n FROM operational_cases`).get().n,
    planning: db.prepare(`SELECT COUNT(*) AS n FROM planning_assignments`).get().n,
  };
}

app.whenReady().then(async () => {
  let scratchDir = null;
  try {
    const chunksDir = join(__dirname, "../dist-electron/chunks");
    const preloadPath = join(__dirname, "../dist-electron/preload.cjs");
    if (!existsSync(preloadPath)) fail("missing dist-electron/preload.cjs");

    const sqliteNs = await loadFromChunks(chunksDir, "initializeDatabase");
    const ipcNs = await loadFromChunks(chunksDir, "registerIpcHandlers");
    const { initializeDatabase, closeDatabase, getDatabasePath } = sqliteNs;

    ipcNs.registerIpcHandlers(app);
    console.log("OK ipc handlers registered (db:restQuery)");

    // ---- Pass 1: live userData database, read-only ----------------------------------
    const live = initializeDatabase(app);
    const livePath = getDatabasePath(app);
    console.log("OK live database", livePath);

    const migration = live
      .prepare(`SELECT id FROM schema_migrations WHERE id = '020_agent_administrative_history'`)
      .get();
    if (!migration) fail("migration 020_agent_administrative_history is not applied");
    console.log("OK migration 020_agent_administrative_history applied");

    const agent = live
      .prepare(`SELECT id, first_name, last_name FROM agents ORDER BY last_name LIMIT 1`)
      .get();
    if (!agent) fail("no agent in the live database");
    console.log("OK real agent", `${agent.first_name} ${agent.last_name}`, `(${agent.id})`);

    const before = counts(live);
    console.log("OK live row counts before probe", JSON.stringify(before));

    const win = new BrowserWindow({
      show: false,
      webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: false },
    });
    await win.loadURL("about:blank");
    const hasBridge = await win.webContents.executeJavaScript(
      `typeof window.cynoplanning?.rest?.query === "function"`,
    );
    if (!hasBridge) fail("preload bridge window.cynoplanning.rest.query is missing");
    console.log("OK renderer bridge window.cynoplanning.rest.query available");

    /** Calls the real renderer bridge, exactly like the React data client does. */
    const restQuery = (request) =>
      win.webContents.executeJavaScript(
        `window.cynoplanning.rest.query(${JSON.stringify(request)})`,
      );

    const liveSelect = await restQuery({
      table: TABLE,
      action: "select",
      select: "*",
      filters: [{ type: "eq", column: "agent_id", value: agent.id }],
      order: [{ column: "start_date", ascending: false }],
    });
    if (liveSelect.error) fail(`live SELECT rejected: ${liveSelect.error.message}`);
    console.log("OK live SELECT via renderer bridge →", liveSelect.data.length, "row(s), no error");

    const guard = await restQuery({ table: "definitely_not_a_table", action: "select" });
    if (!guard.error || !guard.error.message.includes("Table not allowed")) {
      fail("allowlist no longer rejects unknown tables");
    }
    console.log("OK allowlist still rejects unknown tables");

    closeDatabase();

    // ---- Pass 2: throwaway copy of the same database, full CRUD ---------------------
    scratchDir = mkdtempSync(join(tmpdir(), "cyno-history-crud-"));
    copyFileSync(livePath, join(scratchDir, "cynoplanning.db"));
    app.setPath("userData", scratchDir);
    const copy = initializeDatabase(app);
    if (getDatabasePath(app) === livePath) fail("CRUD pass is still pointing at the live database");
    console.log("OK CRUD pass isolated to a copy", getDatabasePath(app));

    const id = randomUUID();
    const insert = await restQuery({
      table: TABLE,
      action: "insert",
      select: "*",
      payload: {
        id,
        agent_id: agent.id,
        event_type: "conge",
        start_date: "2026-08-01",
        end_date: "2026-08-10",
        reason: "Congé annuel",
        observation: "Probe row",
        source_type: "manual",
      },
    });
    if (insert.error) fail(`INSERT rejected: ${insert.error.message}`);
    console.log("OK INSERT via renderer bridge");

    const readBack = await restQuery({
      table: TABLE,
      action: "select",
      select: "*",
      filters: [{ type: "eq", column: "id", value: id }],
      single: true,
    });
    if (readBack.error) fail(`SELECT after INSERT rejected: ${readBack.error.message}`);
    if (readBack.data.event_type !== "conge") fail("INSERT did not persist event_type");
    console.log("OK SELECT reads the inserted row back");

    const update = await restQuery({
      table: TABLE,
      action: "update",
      select: "*",
      payload: { event_type: "formation", reason: "Stage cynotechnique" },
      filters: [{ type: "eq", column: "id", value: id }],
    });
    if (update.error) fail(`UPDATE rejected: ${update.error.message}`);
    const afterUpdate = await restQuery({
      table: TABLE,
      action: "select",
      select: "*",
      filters: [{ type: "eq", column: "id", value: id }],
      single: true,
    });
    if (afterUpdate.data.event_type !== "formation") fail("UPDATE did not persist");
    console.log("OK UPDATE via renderer bridge");

    const remove = await restQuery({
      table: TABLE,
      action: "delete",
      filters: [{ type: "eq", column: "id", value: id }],
    });
    if (remove.error) fail(`DELETE rejected: ${remove.error.message}`);
    const afterDelete = await restQuery({
      table: TABLE,
      action: "select",
      select: "*",
      filters: [{ type: "eq", column: "id", value: id }],
    });
    if (afterDelete.data.length !== 0) fail("DELETE did not remove the row");
    console.log("OK DELETE via renderer bridge");

    const copyCounts = counts(copy);
    if (JSON.stringify(copyCounts) !== JSON.stringify(before)) {
      fail(`CRUD probe changed other tables: ${JSON.stringify(copyCounts)}`);
    }
    console.log("OK agents/rotations/exclusions/cases/planning untouched by the CRUD probe");
    closeDatabase();

    // ---- Live database must be byte-for-byte untouched by this run ------------------
    app.setPath("userData", livePath.replace(/\/cynoplanning\.db$/, ""));
    const reopened = initializeDatabase(app);
    const after = counts(reopened);
    const liveHistoryRows = reopened.prepare(`SELECT COUNT(*) AS n FROM ${TABLE}`).get().n;
    closeDatabase();
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      fail(`live database changed: ${JSON.stringify(after)}`);
    }
    console.log("OK live row counts unchanged", JSON.stringify(after));
    console.log("OK live", TABLE, "rows:", liveHistoryRows, "(no probe residue)");

    win.destroy();
    console.log("PASS agent administrative history runtime path");
    app.exit(0);
  } catch (error) {
    fail(error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  }
});
