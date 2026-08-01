import { BrowserWindow, dialog, type App } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

export type ExportFilePayload = {
  filename: string;
  /** @deprecated Prefer dataBase64 — large number[] payloads can fail IPC cloning. */
  data?: number[];
  /** Preferred: base64-encoded file bytes from the renderer. */
  dataBase64?: string;
};

export type SaveExportFilesRequest = {
  defaultBasename: string;
  files: ExportFilePayload[];
};

export type SaveExportFilesResult =
  | { canceled: true }
  | { canceled: false; paths: string[] };

function getParentWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused) return focused;
  const all = BrowserWindow.getAllWindows();
  return all[0] ?? null;
}

function payloadToBuffer(file: ExportFilePayload): Buffer {
  if (typeof file.dataBase64 === "string" && file.dataBase64.length > 0) {
    return Buffer.from(file.dataBase64, "base64");
  }
  if (Array.isArray(file.data)) {
    return Buffer.from(file.data);
  }
  throw new Error(
    `Export file "${file.filename}" has no dataBase64/data payload (ipc-save / filesystem).`,
  );
}

/**
 * Open a Save dialog and write one or more export files.
 * For multiple files, the chosen path's directory + basename are reused
 * with each file's original extension (e.g. Planning_2026-07-27.pdf/.docx).
 */
export async function saveExportFiles(
  _app: App,
  request: SaveExportFilesRequest,
): Promise<SaveExportFilesResult> {
  try {
    const files = request.files ?? [];
    if (files.length === 0) return { canceled: true };

    const win = getParentWindow();
    const defaultBasename =
      request.defaultBasename?.replace(/\.(pdf|docx)$/i, "") ||
      basename(files[0].filename, extname(files[0].filename)) ||
      "Planning";

    const isMulti = files.length > 1;
    const primaryExt = extname(files[0].filename).replace(/^\./, "") || "pdf";

    const dialogOptions = {
      title: isMulti ? "Save planning export" : "Save file",
      defaultPath: isMulti ? `${defaultBasename}.${primaryExt}` : files[0].filename,
      filters: isMulti
        ? [
            { name: "Planning export", extensions: ["pdf", "docx"] },
            { name: "All files", extensions: ["*"] },
          ]
        : [
            {
              name: primaryExt.toUpperCase(),
              extensions: [primaryExt],
            },
            { name: "All files", extensions: ["*"] },
          ],
    } as const;

    const result = win
      ? await dialog.showSaveDialog(win, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const targetDir = dirname(result.filePath);
    await mkdir(targetDir, { recursive: true });

    const chosenBase = basename(result.filePath, extname(result.filePath)) || defaultBasename;
    const paths: string[] = [];

    for (const file of files) {
      const ext = extname(file.filename) || `.${primaryExt}`;
      const outPath = isMulti ? join(targetDir, `${chosenBase}${ext}`) : result.filePath;
      await writeFile(outPath, payloadToBuffer(file));
      paths.push(outPath);
    }

    return { canceled: false, paths };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const wrapped = new Error(`[planning-export:filesystem] ${message}`);
    if (stack) wrapped.stack = `${wrapped.message}\n${stack}`;
    throw wrapped;
  }
}
