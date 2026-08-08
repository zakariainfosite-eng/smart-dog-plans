/**
 * Regression: updating Adjoint Chef de section must NEVER clear the permanent
 * Chef's agents.section_id (interim replacement is display-only).
 *
 * Uses an isolated empty temp DB — never touches CynoPlanning userData.
 *
 * Usage: npm run electron:build:main && npm run electron:verify-section-chief-link
 */
const { app } = require("electron");
const { mkdtempSync, mkdirSync, rmSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");
const esbuild = require("esbuild");

const repo = join(__dirname, "..");

process.env.CYNOPLANNING_ALLOW_EMPTY_DB = "1";

function fail(message) {
  console.error("FAIL", message);
  process.exit(1);
}

function ok(message) {
  console.log("OK", message);
}

// Isolate from the running CynoPlanning singleton / userData.
const tempRoot = mkdtempSync(join(tmpdir(), "cyno-chef-section-id-"));
const userData = join(tempRoot, "userData");
const bundlePath = join(tempRoot, "agents-store.mjs");
mkdirSync(userData);
app.setName("CynoPlanningVerifyChiefLink");
app.setPath("userData", userData);

app.whenReady().then(async () => {

  try {
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
    const databaseChunk = readdirSync(chunksDir).find(
      (name) => name.startsWith("database-") && name.endsWith(".mjs"),
    );
    if (!databaseChunk) fail("missing dist-electron database chunk — run electron:build:main");

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

    const sectionId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO sections (
         id, name, shift_type, active,
         commander_full_name, commander_grade, commander_mle,
         created_at, updated_at
       ) VALUES (?, ?, 'day', 1, '', '', '', ?, ?)`,
    ).run(sectionId, "Verify Section", now, now);

    const suffix = Date.now();
    const chef = store.createAgent(db, {
      first_name: "Chef",
      last_name: "Verify",
      professional_number: `__mle_chef_${suffix}__`,
      grade: "IP",
      gender: "male",
      fonction: "chef_de_section",
      marital_status: "single",
      date_naissance: "1985-03-12",
      section_id: sectionId,
      dog_id: null,
      phone: null,
      address: null,
      observations: null,
      active: true,
    });
    if (chef.section_id !== sectionId) {
      fail(`chef create section_id=${JSON.stringify(chef.section_id)}`);
    }
    ok("permanent Chef keeps section_id on create");

    const adjoint = store.createAgent(db, {
      first_name: "Adjoint",
      last_name: "Verify",
      professional_number: `__mle_adjoint_${suffix}__`,
      grade: "BRIG",
      gender: "male",
      fonction: "chef_de_section_pi",
      marital_status: "single",
      date_naissance: "1988-07-20",
      section_id: sectionId,
      dog_id: null,
      phone: null,
      address: null,
      observations: null,
      active: true,
    });
    if (adjoint.section_id !== sectionId) {
      fail(`adjoint create section_id=${JSON.stringify(adjoint.section_id)}`);
    }
    ok("Adjoint keeps section_id on create");

    const chefAfterAdjointCreate = db
      .prepare(`SELECT section_id, is_section_chief FROM agents WHERE id = ?`)
      .get(chef.id);
    if (chefAfterAdjointCreate.section_id !== sectionId) {
      fail("creating Adjoint cleared permanent Chef section_id");
    }
    if (chefAfterAdjointCreate.is_section_chief !== 1) {
      fail("creating Adjoint cleared permanent Chef is_section_chief");
    }
    ok("creating Adjoint does not touch Chef section_id");

    store.updateAgent(db, adjoint.id, {
      first_name: adjoint.first_name,
      last_name: adjoint.last_name,
      professional_number: adjoint.professional_number,
      grade: adjoint.grade,
      gender: adjoint.gender,
      fonction: "chef_de_section_pi",
      marital_status: "married",
      section_id: sectionId,
      dog_id: null,
      phone: "0600000000",
      address: null,
      observations: null,
      active: true,
      photo_url: null,
    });

    const chefAfterAdjointUpdate = db
      .prepare(`SELECT section_id, is_section_chief, fonction FROM agents WHERE id = ?`)
      .get(chef.id);
    if (chefAfterAdjointUpdate.section_id !== sectionId) {
      fail("updating Adjoint cleared permanent Chef section_id — interim must be display-only");
    }
    if (chefAfterAdjointUpdate.is_section_chief !== 1) {
      fail("updating Adjoint cleared permanent Chef is_section_chief");
    }
    if (chefAfterAdjointUpdate.fonction !== "chef_de_section") {
      fail("updating Adjoint changed Chef fonction");
    }
    ok("updating Adjoint preserves Chef section_id / fonction / hierarchy");

    const adjointRow = db
      .prepare(`SELECT section_id, is_section_chief FROM agents WHERE id = ?`)
      .get(adjoint.id);
    if (adjointRow.section_id !== sectionId) {
      fail("Adjoint lost its own section_id");
    }
    if (adjointRow.is_section_chief !== 0) {
      fail("Adjoint must not receive is_section_chief=1 (interim is display-only)");
    }
    ok("Adjoint keeps section_id and is not flagged as permanent chief");

    const commander = db
      .prepare(`SELECT commander_mle FROM sections WHERE id = ?`)
      .get(sectionId);
    if (commander.commander_mle !== chef.professional_number) {
      fail(
        `sections.commander_mle should stay permanent Chef (got ${JSON.stringify(commander.commander_mle)})`,
      );
    }
    ok("sections.commander_* stays linked to permanent Chef, not Adjoint");

    // Ensure rebuilt dist-electron ipc chunk no longer contains the demote SQL.
    const ipcChunk = readdirSync(chunksDir).find(
      (name) => name.startsWith("ipc-") && name.endsWith(".mjs"),
    );
    if (!ipcChunk) fail("missing ipc chunk");
    const ipcSource = require("node:fs").readFileSync(join(chunksDir, ipcChunk), "utf8");
    if (
      /fonction IN \('chef_de_section',\s*'chef_de_section_pi'\)\s*AND section_id = \?\s*AND id != \?/.test(
        ipcSource,
      )
    ) {
      fail("dist-electron still contains old syncSectionChiefLink demote SQL — rebuild failed");
    }
    ok("dist-electron bundle no longer demotes other chefs");

    store.deleteAgent(db, adjoint.id);
    store.deleteAgent(db, chef.id);
    sqlite.closeDatabase();
    rmSync(tempRoot, { recursive: true, force: true });
    console.log("\nAll section-chief section_id checks passed.");
    app.exit(0);
  } catch (error) {
    fail(error instanceof Error ? error.stack || error.message : String(error));
  }
});
