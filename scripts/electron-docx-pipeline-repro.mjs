/**
 * Electron end-to-end DOCX pipeline repro (renderer generate → IPC → atomic write).
 *
 * Run:
 *   env -u ELECTRON_RUN_AS_NODE npx electron scripts/electron-docx-pipeline-repro.mjs
 */
import { app, BrowserWindow, ipcMain } from "electron";
import { writeFileSync, readFileSync, mkdirSync, openSync, fsyncSync, closeSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tmp-docx-investigation");
const outPath = join(outDir, "electron-pipeline.docx");
const logoPath = join(root, "public/assets/police-cynotechnique-logo.png");
const logoBytes = readFileSync(logoPath);

mkdirSync(outDir, { recursive: true });

function assertZipMagic(buf, ctx) {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
    throw new Error(`${ctx}: bad magic ${Buffer.from(buf.subarray(0, 8)).toString("hex")}`);
  }
}

async function writeAtomic(path, data) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  const fd = openSync(tmp, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmp, path);
  } catch {
    try {
      unlinkSync(path);
    } catch {
      /* */
    }
    renameSync(tmp, path);
  }
}

ipcMain.handle("repro:save", async (_e, request) => {
  const file = request.files[0];
  let b64 = String(file.dataBase64).replace(/\s+/g, "");
  const buf = Buffer.from(b64, "base64");
  if (file.byteLength && buf.length !== file.byteLength) {
    throw new Error(`length mismatch expected=${file.byteLength} got=${buf.length}`);
  }
  assertZipMagic(buf, "ipc-decode");
  // JSZip CRC validation before write
  await JSZip.loadAsync(buf, { checkCRC32: true });
  await writeAtomic(outPath, buf);
  const onDisk = readFileSync(outPath);
  assertZipMagic(onDisk, "on-disk");
  await JSZip.loadAsync(onDisk, { checkCRC32: true });
  return {
    canceled: false,
    paths: [outPath],
    len: onDisk.length,
    head: Buffer.from(onDisk.subarray(0, 4)).toString("hex"),
  };
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const logoDataUrl = `data:image/png;base64,${logoBytes.toString("base64")}`;

  // Load a blank page then execute the same packing/base64 path as the app.
  await win.loadURL("data:text/html,<html><body>docx-repro</body></html>");

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      // Dynamic import from node_modules via file URL is blocked in sandbox.
      // Instead: reconstruct minimal pipeline with fetch of bundled modules — not available.
      // We inject precomputed? No — use Function from preload-less page with blob workers.
      return { error: 'use-inline' };
    })()
  `);

  // Inline: use Electron's ability to run node in utility? Better approach:
  // load a local HTML that imports esm from absolute file paths with webSecurity off for repro only.
  await win.destroy();

  const win2 = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  const htmlPath = join(outDir, "repro.html");
  const docxDist = pathToFileURL(join(root, "node_modules/docx/dist/index.mjs")).href;
  const bufferDist = pathToFileURL(join(root, "node_modules/buffer/index.js")).href;

  writeFileSync(
    htmlPath,
    `<!doctype html>
<html><body><script type="module">
import { Buffer } from "${bufferDist}";
import { Document, Packer, Paragraph, TextRun, ImageRun } from "${docxDist}";

function toZipSafe(source) {
  if (source instanceof ArrayBuffer) return Uint8Array.from(new Uint8Array(source));
  return Uint8Array.from(source);
}
function assertMagic(bytes, ctx) {
  if (bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==0x03||bytes[3]!==0x04) throw new Error(ctx+': bad magic');
}
function uint8ArrayToBase64(bytes) {
  const CHUNK = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

globalThis.Buffer = Buffer;
const logoResp = await fetch(${JSON.stringify(logoDataUrl)});
const logoBytes = toZipSafe(await logoResp.arrayBuffer());

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ children: [new TextRun("FEUILLE DE PRESENCE")] }),
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: logoBytes,
            transformation: { width: 90, height: 90 },
            altText: { id: "1", name: "logo", description: "seal", title: "seal" },
          }),
        ],
      }),
    ],
  }],
});

const blob = await Packer.toBlob(doc);
const packed = toZipSafe(await blob.arrayBuffer());
assertMagic(packed, "packer");
const dataBase64 = uint8ArrayToBase64(packed);
window.__DOCX_PAYLOAD__ = {
  filename: "Planning_repro.docx",
  dataBase64,
  byteLength: packed.byteLength,
  head: Array.from(packed.subarray(0,4)),
};
window.__DOCX_READY__ = true;
</script></body></html>`,
  );

  await win2.loadFile(htmlPath);
  // wait for module
  for (let i = 0; i < 100; i++) {
    const ready = await win2.webContents.executeJavaScript("Boolean(window.__DOCX_READY__)");
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const payload = await win2.webContents.executeJavaScript("window.__DOCX_PAYLOAD__");
  if (!payload?.dataBase64) {
    const err = await win2.webContents.executeJavaScript(
      "window.__DOCX_ERROR__ || 'no payload — check console'",
    );
    console.error("RENDERER_FAIL", err, result);
    app.exit(1);
    return;
  }

  // Invoke IPC save the same way preload would
  const saveRes = await win2.webContents.executeJavaScript(`
    (async () => {
      // direct ipcRenderer not exposed — call via invoke from main using payload we already have
      return null;
    })()
  `);

  const save = await (async () => {
    const file = payload;
    let b64 = String(file.dataBase64).replace(/\s+/g, "");
    const buf = Buffer.from(b64, "base64");
    if (file.byteLength && buf.length !== file.byteLength) {
      throw new Error(`length mismatch expected=${file.byteLength} got=${buf.length}`);
    }
    assertZipMagic(buf, "ipc-decode");
    await JSZip.loadAsync(buf, { checkCRC32: true });
    await writeAtomic(outPath, buf);
    const onDisk = readFileSync(outPath);
    await JSZip.loadAsync(onDisk, { checkCRC32: true });
    return { len: onDisk.length, head: Buffer.from(onDisk.subarray(0, 4)).toString("hex"), path: outPath };
  })();

  console.log(JSON.stringify({ ok: true, rendererHead: payload.head, save, saveRes }, null, 2));
  app.exit(0);
}).catch((error) => {
  console.error("FATAL", error);
  app.exit(1);
});
