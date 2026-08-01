/**
 * Confirm ipcMain has db:restQuery after registerIpcHandlers.
 * Usage: env -u ELECTRON_RUN_AS_NODE electron scripts/verify-rest-query-ipc.cjs
 */
const { app, ipcMain, BrowserWindow } = require("electron");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

app.setName("CynoPlanning");
app.setPath("userData", join(app.getPath("appData"), "CynoPlanning"));

app.whenReady().then(async () => {
  try {
    const ipcPath = join(__dirname, "../dist-electron/chunks");
    const { readdirSync } = require("node:fs");
    const chunk = readdirSync(ipcPath).find((f) => f.startsWith("ipc-") && f.endsWith(".mjs"));
    if (!chunk) throw new Error("No ipc-*.mjs chunk in dist-electron/chunks");

    const mod = await import(pathToFileURL(join(ipcPath, chunk)).href);
    mod.registerIpcHandlers(app);

    // Probe: invoke the handler the same way preload does.
    const result = await ipcMain.emit; // placeholder to keep lint quiet
    void result;

    const listeners = ipcMain.listenerCount("db:restQuery");
    // ipcMain.handle uses internal map — invoke via a fake webContents is hard.
    // Instead call executeRestQuery path by simulating handle invocation:
    const { getDatabase, initializeDatabase } = await import(
      pathToFileURL(
        join(
          ipcPath,
          readdirSync(ipcPath).find((f) => f.startsWith("database-") && f.endsWith(".mjs")),
        ),
      ).href
    ).catch(() => ({ getDatabase: null, initializeDatabase: null }));

    // Direct invoke using Electron's handle registry via ipcRenderer in a hidden window
    const preload = join(__dirname, "../dist-electron/preload.cjs");
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    await win.loadURL(
      "data:text/html,<html><body>ipc-probe</body><script>window.probeDone=false</script></html>",
    );

    const probe = await win.webContents.executeJavaScript(`
      (async () => {
        if (!window.cynoplanning || !window.cynoplanning.rest) {
          return { ok: false, error: "preload missing cynoplanning.rest" };
        }
        try {
          const r = await window.cynoplanning.rest.query({
            table: "sections",
            action: "select",
            select: "id, name",
            filters: [],
          });
          return {
            ok: !r.error,
            error: r.error,
            count: Array.isArray(r.data) ? r.data.length : null,
            hasRestQueryHandler: true,
          };
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }
      })()
    `);

    console.log(JSON.stringify({ chunk, listenersHint: listeners, probe }, null, 2));

    if (!probe.ok) {
      console.error("[verify-rest-query-ipc] FAILED", probe.error);
      app.exit(1);
      return;
    }

    console.log(
      `[verify-rest-query-ipc] OK — db:restQuery registered; sections=${probe.count}`,
    );
    app.exit(0);
  } catch (error) {
    console.error("[verify-rest-query-ipc] FAILED", error);
    app.exit(1);
  }
});
