/**
 * Bundles Electron main + preload to ESM (.mjs).
 * Main uses code splitting so dynamic import('./database') defers better-sqlite3
 * until after early startup logs (needed for SIGSEGV diagnosis).
 *
 * Builds into a staging folder then swaps into dist-electron so a running
 * Electron process does not briefly see a missing preload.cjs (ENOENT).
 */
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist-electron");
const stagingDir = join(root, "dist-electron-staging");
const previousDir = join(root, "dist-electron-previous");

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
mkdirSync(join(stagingDir, "chunks"), { recursive: true });

// CJS boot shim: logs before ESM main (catches crashes during electron named-import).
copyFileSync(join(root, "electron/boot.cjs"), join(stagingDir, "boot.cjs"));

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  external: ["electron", "better-sqlite3"],
  outExtension: { ".js": ".mjs" },
};

await esbuild.build({
  ...shared,
  entryPoints: [join(root, "electron/main.ts")],
  outdir: stagingDir,
  entryNames: "main",
  chunkNames: "chunks/[name]-[hash]",
  splitting: true,
});

await esbuild.build({
  ...shared,
  entryPoints: [join(root, "electron/import-from-supabase.ts")],
  outfile: join(stagingDir, "migrate.mjs"),
});

await esbuild.build({
  ...shared,
  entryPoints: [join(root, "electron/preload.ts")],
  // Sandboxed preload cannot load ESM (`import`); must be classic CJS.
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  outfile: join(stagingDir, "preload.cjs"),
});

// Atomic-ish swap: keep previous build briefly, then replace.
rmSync(previousDir, { recursive: true, force: true });
try {
  renameSync(outDir, previousDir);
} catch {
  // First build — outDir may not exist yet.
}
renameSync(stagingDir, outDir);
rmSync(previousDir, { recursive: true, force: true });

console.log(`[electron] Built ${outDir}/boot.cjs, main.mjs, migrate.mjs and preload.cjs`);
