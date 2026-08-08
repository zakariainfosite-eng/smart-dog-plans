import { BrowserWindow, dialog, type App } from "electron";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

export type ExportFilePayload = {
  filename: string;
  /** @deprecated Prefer dataBase64 — large number[] payloads can fail IPC cloning. */
  data?: number[];
  /** Preferred: base64-encoded file bytes from the renderer. */
  dataBase64?: string;
  /** Optional integrity check from renderer (byte length before base64). */
  byteLength?: number;
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

function isDocxFilename(filename: string): boolean {
  return extname(filename).toLowerCase() === ".docx";
}

/** ZIP local magic + EOCD/central-directory consistency (catches truncated IPC payloads). */
function assertDocxZipArchive(buf: Buffer, context: string): void {
  if (buf.length < 22 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
    const head = Buffer.from(buf.subarray(0, Math.min(8, buf.length))).toString("hex");
    throw new Error(
      `${context}: decoded DOCX missing ZIP magic PK\\x03\\x04 (head=${head}, len=${buf.length})`,
    );
  }

  const maxScan = Math.min(buf.length - 22, 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= buf.length - 22 - maxScan; i -= 1) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error(`${context}: missing ZIP EOCD (PK\\x05\\x06) — truncated/corrupt after IPC`);
  }
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset + cdSize !== eocd) {
    throw new Error(
      `${context}: ZIP central-directory mismatch (offset=${cdOffset}, size=${cdSize}, eocd=${eocd})`,
    );
  }
}

function payloadToBuffer(file: ExportFilePayload): Buffer {
  if (typeof file.dataBase64 === "string" && file.dataBase64.length > 0) {
    // Strip whitespace / data-URL prefix that can appear after IPC string cloning.
    let b64 = file.dataBase64.replace(/\s+/g, "");
    const comma = b64.indexOf(",");
    if (b64.startsWith("data:") && comma !== -1) {
      b64 = b64.slice(comma + 1);
    }
    const buf = Buffer.from(b64, "base64");
    if (typeof file.byteLength === "number" && file.byteLength > 0 && buf.length !== file.byteLength) {
      throw new Error(
        `Export file "${file.filename}" base64 length mismatch: expected ${file.byteLength} bytes, got ${buf.length}`,
      );
    }
    if (isDocxFilename(file.filename)) {
      assertDocxZipArchive(buf, `IPC decode ${file.filename}`);
    }
    return buf;
  }
  if (Array.isArray(file.data)) {
    // Large number[] IPC is the confirmed Windows corruption vector for DOCX.
    if (isDocxFilename(file.filename)) {
      throw new Error(
        `Export file "${file.filename}" must use dataBase64 (number[] IPC corrupts DOCX on Windows).`,
      );
    }
    return Buffer.from(file.data);
  }
  throw new Error(
    `Export file "${file.filename}" has no dataBase64/data payload (ipc-save / filesystem).`,
  );
}

/**
 * Fully flush bytes to disk (important on Windows before Word opens the file).
 * Write to a temp file, fsync, then rename over the destination.
 */
async function writeFileAtomic(outPath: string, data: Buffer): Promise<void> {
  const tmpPath = `${outPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmpPath, data);
    const handle = await open(tmpPath, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await rename(tmpPath, outPath);
    } catch {
      // Windows cannot rename over an existing file — replace explicitly.
      try {
        await unlink(outPath);
      } catch {
        // destination may not exist
      }
      await rename(tmpPath, outPath);
    }
  } catch (error) {
    try {
      await unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw error;
  }
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

    // Ensure Windows save dialog always keeps the intended extension for single-file saves.
    let chosenPath = result.filePath;
    if (!isMulti) {
      const wantedExt = extname(files[0].filename);
      if (wantedExt && extname(chosenPath).toLowerCase() !== wantedExt.toLowerCase()) {
        chosenPath = `${chosenPath}${wantedExt}`;
      }
    }

    const chosenBase = basename(chosenPath, extname(chosenPath)) || defaultBasename;
    const paths: string[] = [];

    for (const file of files) {
      const ext = extname(file.filename) || `.${primaryExt}`;
      const outPath = isMulti ? join(targetDir, `${chosenBase}${ext}`) : chosenPath;
      const buf = payloadToBuffer(file);
      await writeFileAtomic(outPath, buf);

      // Post-write integrity — ensures Word never sees a truncated Windows write.
      const onDisk = await readFile(outPath);
      if (onDisk.length !== buf.length) {
        throw new Error(
          `filesystem: wrote ${onDisk.length} bytes for "${file.filename}", expected ${buf.length}`,
        );
      }
      if (isDocxFilename(file.filename)) {
        assertDocxZipArchive(onDisk, `filesystem ${file.filename}`);
      }
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
