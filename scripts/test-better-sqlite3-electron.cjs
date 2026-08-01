"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const logPath = path.join(process.cwd(), "better-sqlite3-electron-test.log");

function log(msg) {
  const line = `[sqlite-test] ${new Date().toISOString()} ${msg}`;
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`);
}

fs.writeFileSync(logPath, "", "utf8");

log(
  `electron=${process.versions.electron} modules=${process.versions.modules} node=${process.versions.node}`,
);
log(`platform=${process.platform} arch=${process.arch}`);
log(`ELECTRON_RUN_AS_NODE=${process.env.ELECTRON_RUN_AS_NODE ?? "(unset)"}`);

app
  .whenReady()
  .then(() => {
    const release = path.join(
      process.cwd(),
      "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    );
    const prebuild = path.join(
      process.cwd(),
      "node_modules/better-sqlite3/prebuilds",
      `${process.platform}-${process.arch}.node`,
    );
    log(`Release exists=${fs.existsSync(release)} size=${fs.existsSync(release) ? fs.statSync(release).size : 0}`);
    log(`prebuild exists=${fs.existsSync(prebuild)} size=${fs.existsSync(prebuild) ? fs.statSync(prebuild).size : 0}`);

    log("BEFORE require('better-sqlite3')");
    const Database = require("better-sqlite3");
    log("AFTER require('better-sqlite3')");

    log("BEFORE new Database(':memory:')");
    const db = new Database(":memory:");
    log("AFTER new Database(':memory:')");

    const row = db.prepare("SELECT 1 AS ok").get();
    log(`PASS query=${JSON.stringify(row)}`);
    db.close();
    app.exit(0);
  })
  .catch((error) => {
    log(`FAIL ${error && error.stack ? error.stack : error}`);
    app.exit(1);
  });
