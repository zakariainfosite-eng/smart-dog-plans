import { app, BrowserWindow, protocol, shell } from "electron";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspect } from "node:util";

// Schemes are registered in boot.cjs (before app ready). Keep a guarded
// fallback here for entry paths that load main.mjs without the boot shim.
try {
  protocol.registerSchemesAsPrivileged([
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
} catch {
  // Already registered by boot.cjs, or app is already ready.
}

const APP_NAME = "CynoPlanning";
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Dev UI is the TanStack Start Vite server (see npm run electron:dev). */
const DEFAULT_DEV_SERVER_URL = "http://127.0.0.1:8080";

/** Survives SIGSEGV better than stdout alone — last line = last step reached. */
const STARTUP_LOG_PATH = join(process.cwd(), "electron-startup.log");

let mainWindow: BrowserWindow | null = null;
let closeDatabaseFn: (() => void) | null = null;

function startupLog(message: string): void {
  const line = `[electron][startup] ${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    appendFileSync(STARTUP_LOG_PATH, `${line}\n`);
  } catch (error) {
    console.error("[electron][startup] Failed to write startup log:", error);
  }
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
  }
  return inspect(value, { depth: 5 });
}

try {
  writeFileSync(STARTUP_LOG_PATH, "", "utf8");
} catch {
  // Continue; console logs still help.
}

startupLog("1. Electron process starts (main entry after electron import; before SQLite/IPC imports)");
startupLog(`cwd=${process.cwd()} pid=${process.pid} electron=${process.versions.electron} node=${process.versions.node} packaged=${app.isPackaged}`);
startupLog(`startup log file: ${STARTUP_LOG_PATH}`);

process.on("uncaughtException", (error) => {
  startupLog(`uncaughtException: ${formatUnknown(error)}`);
});

process.on("unhandledRejection", (reason) => {
  startupLog(`unhandledRejection: ${formatUnknown(reason)}`);
});

app.on("render-process-gone", (_event, webContents, details) => {
  startupLog(
    `render-process-gone reason=${details.reason} exitCode=${details.exitCode} url=${webContents.getURL()}`,
  );
});

app.on("child-process-gone", (_event, details) => {
  startupLog(
    `child-process-gone type=${details.type} reason=${details.reason} exitCode=${details.exitCode} name=${details.name ?? "n/a"} serviceName=${details.serviceName ?? "n/a"}`,
  );
});

startupLog("crash handlers registered (uncaughtException, unhandledRejection, render-process-gone, child-process-gone)");

function loadEnvFile(): void {
  const candidates = [
    join(process.cwd(), ".env"),
    join(app.getAppPath(), ".env"),
    join(process.resourcesPath, ".env"),
  ];

    for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;

    const contents = readFileSync(envPath, "utf8");
    for (const line of contents.split("\n")) {
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

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    startupLog(`loadEnvFile: loaded ${envPath}`);
    break;
  }
}

async function getAvailablePort(preferred = 43123): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", () => resolve(getAvailablePort(preferred + 1)));
    server.listen(preferred, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to resolve an available port.")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function getServerRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "app-server");
  }
  return join(app.getAppPath(), ".output");
}

async function startProductionServer(): Promise<number> {
  loadEnvFile();

  const port = await getAvailablePort();
  const serverRoot = getServerRoot();
  const serverEntry = join(serverRoot, "server/index.mjs");

  if (!existsSync(serverEntry)) {
    throw new Error(
      `Missing Nitro server entry at ${serverEntry}. Run "npm run electron:build" to generate it.`,
    );
  }

  process.env.PORT = String(port);
  process.env.NITRO_PORT = String(port);
  process.env.NITRO_HOST = "127.0.0.1";
  process.env.HOST = "127.0.0.1";

  const previousCwd = process.cwd();
  process.chdir(serverRoot);

  try {
    // Absolute Windows paths (C:\...) are not valid ESM specifiers — use file:// URLs.
    const serverUrl = pathToFileURL(serverEntry).href;
    await import(serverUrl);
  } finally {
    process.chdir(previousCwd);
  }

  return port;
}

async function waitForUrl(url: string, timeoutMs = 120_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok || response.status === 302 || response.status === 307) {
        return;
      }
    } catch {
      // Server still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function createMainWindow(): void {
  const preloadPath = join(__dirname, "preload.cjs");
  startupLog(
    `5. BEFORE BrowserWindow creation (preload=${preloadPath} exists=${existsSync(preloadPath)})`,
  );
  startupLog("6. preload path configured on BrowserWindow (preload script loads with the window)");

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  startupLog(`5. AFTER BrowserWindow creation id=${mainWindow.id}`);

  mainWindow.webContents.on("preload-error", (_event, path, error) => {
    startupLog(`6. preload-error path=${path} error=${formatUnknown(error)}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    startupLog(`8. did-finish-load url=${mainWindow?.webContents.getURL() ?? "n/a"}`);
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      startupLog(
        `did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`,
      );
    },
  );

  mainWindow.once("ready-to-show", () => {
    startupLog("9. BEFORE ready-to-show (calling show())");
    mainWindow?.show();
    startupLog("9. AFTER ready-to-show (show() returned)");
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    startupLog("BrowserWindow closed");
    mainWindow = null;
  });
}

async function loadApplication(): Promise<void> {
  if (!mainWindow) return;

  // Development: load TanStack Start from Vite (never a local index.html).
  if (!app.isPackaged) {
    const devServerUrl =
      process.env.VITE_DEV_SERVER_URL?.trim() || DEFAULT_DEV_SERVER_URL;
    startupLog(`7. BEFORE loadURL (dev) url=${devServerUrl}`);
    await waitForUrl(devServerUrl);
    startupLog("7. waitForUrl resolved; calling loadURL()");
    await mainWindow.loadURL(devServerUrl);
    startupLog(`7. AFTER loadURL (dev) url=${devServerUrl}`);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    return;
  }

  // Production: Nitro node-server bundled under extraResources/app-server.
  const port = await startProductionServer();
  const appUrl = `http://127.0.0.1:${port}`;
  startupLog(`7. BEFORE loadURL (prod) url=${appUrl}`);
  await waitForUrl(appUrl);
  startupLog("7. waitForUrl resolved; calling loadURL()");
  await mainWindow.loadURL(appUrl);
  startupLog(`7. AFTER loadURL (prod) url=${appUrl}`);
}

async function bootstrap(): Promise<void> {
  loadEnvFile();

  startupLog("2. BEFORE app.whenReady()");
  await app.whenReady();
  startupLog("2. AFTER app.whenReady()");

  // Dynamic import so step 1 logs run before better-sqlite3 native load.
  startupLog("3. BEFORE import('./database') [native better-sqlite3 may load here]");
  const database = await import("./database");
  startupLog("3. AFTER import('./database')");
  closeDatabaseFn = database.closeDatabase;

  startupLog("3. BEFORE initializeDatabase()");
  database.initializeDatabase(app);
  startupLog("3. AFTER initializeDatabase()");
  startupLog(
    `[sqlite] SQLite initialized successfully (${join(app.getPath("userData"), "cynoplanning.db")})`,
  );
  startupLog(`[sqlite] ${database.SQLITE_SCHEMA_INIT_MESSAGE}`);

  startupLog("4. BEFORE import('./ipc')");
  const ipc = await import("./ipc");
  startupLog("4. AFTER import('./ipc')");

  startupLog("4. BEFORE bootstrapLocalAuthSeed()");
  ipc.bootstrapLocalAuthSeed(app);
  startupLog("4. AFTER bootstrapLocalAuthSeed()");

  startupLog("4. BEFORE IPC registration (registerIpcHandlers)");
  ipc.registerIpcHandlers(app);
  startupLog(
    "4. AFTER IPC registration (registerIpcHandlers) — includes db:restQuery + fs:saveExportFiles + media:*",
  );

  startupLog("4. BEFORE registerMediaProtocol");
  ipc.registerMediaProtocol(app);
  startupLog("4. AFTER registerMediaProtocol");

  createMainWindow();
  await loadApplication();
  startupLog("bootstrap() completed (waiting for did-finish-load / ready-to-show)");

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startupLog("activate: recreating window");
      createMainWindow();
      await loadApplication();
    }
  });
}

startupLog("BEFORE requestSingleInstanceLock()");
const gotLock = app.requestSingleInstanceLock();
startupLog(`AFTER requestSingleInstanceLock() gotLock=${gotLock}`);

if (!gotLock) {
  startupLog("second instance — quitting");
  app.quit();
} else {
  app.on("second-instance", () => {
    startupLog("second-instance event");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void bootstrap().catch((error) => {
    startupLog(`bootstrap() FAILED: ${formatUnknown(error)}`);
    console.error("[electron] Failed to start application:", error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  startupLog("window-all-closed");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  startupLog("will-quit — closing database");
  closeDatabaseFn?.();
});
