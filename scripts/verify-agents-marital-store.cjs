/**
 * End-to-end verify: agents-store create/update/getAgents persists marital_status.
 * Uses a temp copy of the live DB — never writes CynoPlanning userData.
 *
 * Usage: npm run electron:build:main && npm run electron:verify-marital-store
 */
const { app } = require("electron");
const { mkdtempSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const esbuild = require("esbuild");

const repo = join(__dirname, "..");
const liveDb = join(
  app.getPath("home"),
  "Library/Application Support/CynoPlanning/cynoplanning.db",
);

process.env.CYNOPLANNING_ALLOW_EMPTY_DB = "1";

function fail(message) {
  console.error("FAIL", message);
  process.exit(1);
}

function ok(message) {
  console.log("OK", message);
}

app.setName("CynoPlanning");

app.whenReady().then(async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "cyno-marital-store-"));
  const userData = join(tempRoot, "userData");
  const bundlePath = join(tempRoot, "agents-store.mjs");
  mkdirSync(userData);

  try {
    if (!existsSync(liveDb)) fail(`live DB missing: ${liveDb}`);
    copyFileSync(liveDb, join(userData, "cynoplanning.db"));
    for (const side of ["-wal", "-shm"]) {
      if (existsSync(liveDb + side)) {
        copyFileSync(liveDb + side, join(userData, "cynoplanning.db") + side);
      }
    }

    await esbuild.build({
      entryPoints: [join(repo, "electron/agents-store.ts")],
      outfile: bundlePath,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      external: ["better-sqlite3", "electron"],
    });

    const chunksDir = join(repo, "dist-electron/chunks");
    const { readdirSync } = require("node:fs");
    const databaseChunk = readdirSync(chunksDir).find(
      (name) => name.startsWith("database-") && name.endsWith(".mjs"),
    );
    if (!databaseChunk) fail("missing dist-electron database chunk");

    const sqlite = await import(pathToFileURL(join(chunksDir, databaseChunk)).href);
    const store = await import(pathToFileURL(bundlePath).href);

    const mockApp = {
      isReady: () => true,
      getPath: (name) => {
        if (name === "userData") return userData;
        throw new Error(`unexpected getPath(${name})`);
      },
    };

    sqlite.initializeDatabase(mockApp);
    const db = sqlite.getDatabase();

    const cols = db.prepare(`PRAGMA table_info(agents)`).all().map((c) => c.name);
    if (!cols.includes("marital_status")) fail("column marital_status missing");
    ok("schema column marital_status");

    const created = store.createAgent(db, {
      first_name: "Verify",
      last_name: "Marital",
      professional_number: `__mle_marital_${Date.now()}__`,
      grade: "BRIG",
      gender: "male",
      fonction: "aide_soignant_veterinaire",
      marital_status: "married",
      date_naissance: "1990-05-15",
      section_id: null,
      dog_id: null,
      phone: null,
      address: null,
      observations: null,
      active: true,
    });
    if (created.marital_status !== "married") {
      fail(`create returned marital_status=${JSON.stringify(created.marital_status)}`);
    }
    const rawCreate = db
      .prepare(`SELECT marital_status FROM agents WHERE id = ?`)
      .get(created.id);
    if (rawCreate?.marital_status !== "married") {
      fail(`SQLite after create=${JSON.stringify(rawCreate?.marital_status)}`);
    }
    ok("CREATE persists marital_status=married");

    const updated = store.updateAgent(db, created.id, {
      first_name: created.first_name,
      last_name: created.last_name,
      professional_number: created.professional_number,
      grade: created.grade,
      gender: created.gender,
      fonction: created.fonction,
      marital_status: "divorced",
      section_id: created.section_id,
      dog_id: created.dog_id,
      phone: created.phone,
      address: created.address,
      observations: created.observations,
      active: created.active,
      photo_url: created.photo_url,
    });
    if (updated.marital_status !== "divorced") {
      fail(`update returned marital_status=${JSON.stringify(updated.marital_status)}`);
    }
    const rawUpdate = db
      .prepare(`SELECT marital_status FROM agents WHERE id = ?`)
      .get(created.id);
    if (rawUpdate?.marital_status !== "divorced") {
      fail(`SQLite after update=${JSON.stringify(rawUpdate?.marital_status)}`);
    }
    ok("UPDATE persists marital_status=divorced");

    const listed = store.getAgents(db).find((row) => row.id === created.id);
    if (!listed || !Object.prototype.hasOwnProperty.call(listed, "marital_status")) {
      fail("getAgents() omitted marital_status key");
    }
    if (listed.marital_status !== "divorced") {
      fail(`getAgents marital_status=${JSON.stringify(listed.marital_status)}`);
    }
    ok("GET/List returns marital_status=divorced");

    store.deleteAgent(db, created.id);
    sqlite.closeDatabase();
    rmSync(tempRoot, { recursive: true, force: true });
    writeFileSync(join(repo, ".marital-store-verify.ok"), new Date().toISOString());
    app.exit(0);
  } catch (error) {
    fail(error instanceof Error ? error.stack || error.message : String(error));
  }
});
