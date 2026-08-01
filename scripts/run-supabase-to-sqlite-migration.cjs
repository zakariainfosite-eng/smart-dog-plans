/**
 * One-shot Electron runner: Phase 2 Supabase → SQLite migration.
 * Usage: npm run electron:build:main && env -u ELECTRON_RUN_AS_NODE electron scripts/run-supabase-to-sqlite-migration.cjs
 */
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const reportTxt = path.join(process.cwd(), "tmp-migration-report.txt");
const reportJson = path.join(process.cwd(), "tmp-migration-report.json");

function log(message) {
  const line = `[migration-runner] ${new Date().toISOString()} ${message}`;
  console.log(line);
  fs.appendFileSync(reportTxt, `${line}\n`);
}

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

fs.writeFileSync(reportTxt, "");
loadEnvFile();

// Use the same userData folder as the packaged / named app (not "Electron").
app.setName("CynoPlanning");
app.setPath("userData", path.join(app.getPath("appData"), "CynoPlanning"));

app.whenReady().then(async () => {
  try {
    const migrateEntry = path.join(process.cwd(), "dist-electron/migrate.mjs");
    if (!fs.existsSync(migrateEntry)) {
      throw new Error(`Missing ${migrateEntry}. Run: npm run electron:build:main`);
    }

    log(`userData=${app.getPath("userData")}`);
    const migrate = await import(pathToFileURL(migrateEntry).href);
    const result = await migrate.importDataFromSupabase(app);
    fs.writeFileSync(reportJson, JSON.stringify(result.report, null, 2));
    fs.writeFileSync(reportTxt, result.reportText);
    log("SUCCESS");
    console.log(result.reportText);
    app.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    log(`FAILED: ${message}`);
    fs.writeFileSync(reportTxt, message);
    app.exit(1);
  }
});
