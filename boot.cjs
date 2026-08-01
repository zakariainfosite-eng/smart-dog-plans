"use strict";

/**
 * CJS boot shim — runs before ESM main so we can log if Electron dies
 * during `import from "electron"` (which happens before main.ts body).
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const STARTUP_LOG_PATH = path.join(process.cwd(), "electron-startup.log");

function bootLog(message) {
  const line = `[electron][boot] ${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(STARTUP_LOG_PATH, `${line}\n`);
  } catch {
    // ignore
  }
}

try {
  fs.writeFileSync(STARTUP_LOG_PATH, "", "utf8");
} catch {
  // ignore
}

bootLog("0. boot.cjs starts (CJS entry; before ESM main.mjs)");
bootLog(`cwd=${process.cwd()} pid=${process.pid} node=${process.version}`);

process.on("uncaughtException", (error) => {
  bootLog(`uncaughtException: ${error && error.stack ? error.stack : String(error)}`);
});

process.on("unhandledRejection", (reason) => {
  bootLog(
    `unhandledRejection: ${reason && reason.stack ? reason.stack : String(reason)}`,
  );
});

bootLog("0. BEFORE require('electron')");
let electron;
try {
  electron = require("electron");
  // Stable userData path across dev, test scripts, and installed builds.
  if (electron.app && typeof electron.app.setName === "function") {
    electron.app.setName("CynoPlanning");
    bootLog("0. app.setName(CynoPlanning)");
  }
  bootLog(
    `0. AFTER require('electron') type=${typeof electron} keys=${Object.keys(electron).slice(0, 15).join(",")}`,
  );
} catch (error) {
  bootLog(`0. FAIL require('electron'): ${error && error.stack ? error.stack : String(error)}`);
  process.exit(1);
}

// Must run before app is ready — boot.cjs loads electron before ESM main,
// so schemes cannot wait for main.mjs evaluation (async import).
try {
  electron.protocol.registerSchemesAsPrivileged([
    {
      scheme: "cynoplanning-media",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
  bootLog("0. AFTER protocol.registerSchemesAsPrivileged(cynoplanning-media)");
} catch (error) {
  bootLog(
    `0. FAIL registerSchemesAsPrivileged: ${error && error.stack ? error.stack : String(error)}`,
  );
}

try {
  electron.app.on("render-process-gone", (_event, webContents, details) => {
    bootLog(
      `render-process-gone reason=${details.reason} exitCode=${details.exitCode} url=${webContents.getURL()}`,
    );
  });
  electron.app.on("child-process-gone", (_event, details) => {
    bootLog(
      `child-process-gone type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`,
    );
  });
  bootLog("0. crash handlers registered on app from boot.cjs");
} catch (error) {
  bootLog(`0. FAIL registering app crash handlers: ${error && error.stack ? error.stack : String(error)}`);
}

const mainPath = path.join(__dirname, "main.mjs");
const moduleUrl = pathToFileURL(mainPath).href;
bootLog(
  `0. BEFORE import(main.mjs) exists=${fs.existsSync(mainPath)} path=${mainPath} url=${moduleUrl}`,
);

import(moduleUrl)
  .then(() => {
    bootLog("0. AFTER import(main.mjs) — ESM module evaluated successfully");
  })
  .catch((error) => {
    bootLog(`0. FAIL import(main.mjs): ${error && error.stack ? error.stack : String(error)}`);
    process.exit(1);
  });
