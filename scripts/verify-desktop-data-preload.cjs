#!/usr/bin/env node
"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const preloadPath = join(__dirname, "../dist-electron/preload.cjs");
if (!existsSync(preloadPath)) {
  console.error("[verify-desktop-data] missing dist-electron/preload.cjs — run npm run electron:build:main");
  process.exit(1);
}

const source = readFileSync(preloadPath, "utf8");
const required = [
  "data:pickSqliteDatabase",
  "data:inspectPickedSqliteDatabase",
  "data:restorePickedSqliteDatabase",
  "data:clearLocalData",
  "desktopData: true",
];

const missing = required.filter((token) => !source.includes(token));
if (missing.length > 0) {
  console.error(
    `[verify-desktop-data] preload.cjs is missing packaged database import API: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.log("[verify-desktop-data] preload exposes desktop SQLite import/clear IPC");
