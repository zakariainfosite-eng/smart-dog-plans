/**
 * Full DOCX export pipeline investigation.
 * Stages: generate → JSZip reopen → XML validate → media → IPC base64 → atomic write → compare.
 *
 * Run: npx --yes tsx scripts/investigate-docx-corruption.mjs
 */
import { createRequire } from "node:module";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
  existsSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { Buffer as PolyBuffer } from "buffer";
import {
  assertDocxZipMagic,
  toZipSafeUint8Array,
  uint8ArrayToBase64,
} from "../src/lib/documents/docx-binary.ts";
import { generateFeuillePresenceDocx } from "../src/lib/documents/feuille-presence-docx.ts";

const require = createRequire(import.meta.url);

/** Minimal well-formedness check without external XML deps. */
function assertWellFormedXml(text, name) {
  if (!text.trimStart().startsWith("<")) {
    throw new Error(`${name}: does not start with '<'`);
  }
  // Balanced tag heuristic + reject illegal control chars except tab/lf/cr.
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
    throw new Error(`${name}: illegal control characters`);
  }
  try {
    execFileSync("xmllint", ["--noout", "-"], {
      input: text,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    // xmllint may be missing — fall back to DOMParser via linkedom-less check
    if (error?.code === "ENOENT") {
      const open = (text.match(/<([A-Za-z_:][\w:.-]*)(\s[^>]*)?>/g) || []).length;
      const close = (text.match(/<\/([A-Za-z_:][\w:.-]*)>/g) || []).length;
      const self = (text.match(/<([A-Za-z_:][\w:.-]*)(\s[^>]*)?\/>/g) || []).length;
      if (open - self !== close) {
        throw new Error(
          `${name}: tag balance suspect (open=${open}, self=${self}, close=${close})`,
        );
      }
      return;
    }
    const stderr = error?.stderr?.toString?.() || error.message;
    throw new Error(`${name}: xmllint failed: ${stderr}`);
  }
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tmp-docx-investigation");
const logoPath = join(root, "public/assets/police-cynotechnique-logo.png");
const logoBytes = readFileSync(logoPath);

const report = {
  stages: {},
  failures: [],
  notes: [],
};

function stage(name, ok, detail = {}) {
  report.stages[name] = { ok, ...detail };
  if (!ok) report.failures.push({ stage: name, ...detail });
  console.log(`${ok ? "OK" : "FAIL"}  [${name}]`, detail.message ?? "");
}

function installBrowserMocks(logoUrl) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (href === logoUrl || href.endsWith("/assets/police-cynotechnique-logo.png")) {
      return new Response(logoBytes, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }
    return nativeFetch(input, init);
  };

  globalThis.createImageBitmap = async (blob) => {
    const buffer = Buffer.from(await blob.arrayBuffer());
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      close: () => {},
    };
  };

  globalThis.document = {
    createElement: (tag) => {
      if (tag !== "canvas") throw new Error(`Unexpected element: ${tag}`);
      let width = 0;
      let height = 0;
      let pixels = new Uint8ClampedArray(0);
      return {
        get width() {
          return width;
        },
        set width(v) {
          width = v;
          pixels = new Uint8ClampedArray(width * height * 4);
        },
        get height() {
          return height;
        },
        set height(v) {
          height = v;
          pixels = new Uint8ClampedArray(width * height * 4);
        },
        getContext: () => ({
          drawImage: () => {
            pixels.fill(200);
          },
          getImageData: () => ({ data: pixels }),
          putImageData: (imageData) => {
            pixels = imageData.data;
          },
        }),
        toBlob: (cb) => cb(new Blob([logoBytes], { type: "image/png" })),
      };
    },
  };
}

function isPng(bytes) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function sha256(buf) {
  return require("node:crypto").createHash("sha256").update(buf).digest("hex");
}

async function writeAtomic(outPath, data) {
  const tmpPath = `${outPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, data);
  const fd = openSync(tmpPath, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmpPath, outPath);
  } catch {
    try {
      unlinkSync(outPath);
    } catch {
      /* missing */
    }
    renameSync(tmpPath, outPath);
  }
}

/** Simulate main-process payloadToBuffer from electron/export-files.ts */
function decodeIpcPayload(file) {
  let b64 = file.dataBase64.replace(/\s+/g, "");
  const comma = b64.indexOf(",");
  if (b64.startsWith("data:") && comma !== -1) b64 = b64.slice(comma + 1);
  const buf = Buffer.from(b64, "base64");
  if (file.byteLength > 0 && buf.length !== file.byteLength) {
    throw new Error(`base64 length mismatch: expected ${file.byteLength}, got ${buf.length}`);
  }
  assertDocxZipMagic(buf, "IPC decode");
  return buf;
}

const sample = {
  dateLine: "TANGER LE 05 / 08 / 2026",
  sectionName: "1ère Section",
  chefName: "MOHAMED ALAMI",
  chefGrade: "BRIGADIER",
  chefMle: "12345",
  narcoticsRows: Array.from({ length: 4 }, (_, i) => ({
    fullName: `BENALI Youssef ${i + 1}`,
    grade: "GARDIEN",
    mle: `MLE-${1000 + i}`,
    dogName: `REX-${i}`,
    assignment: `Checkpoint ${20 + i}`,
    hour: "09:00",
    signature: "",
  })),
  explosivesRows: Array.from({ length: 2 }, (_, i) => ({
    fullName: `TAZI Omar ${i + 1}`,
    grade: "GARDIEN",
    mle: `MLE-${2000 + i}`,
    dogName: `ROCKY-${i}`,
    assignment: `Checkpoint 7${i}`,
    hour: "09:00",
    signature: "",
  })),
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// --- Stage 0: environment like Electron renderer ---
globalThis.Buffer = PolyBuffer;
const logoUrl = pathToFileURL(logoPath).href;
installBrowserMocks(logoUrl);

// --- Stage 1: generate (dev path with polyfill Buffer) ---
let generated;
try {
  generated = await generateFeuillePresenceDocx(sample, {
    logoUrl,
    logoBytes: toZipSafeUint8Array(logoBytes),
  });
  assertDocxZipMagic(generated, "generate");
  const genPath = join(outDir, "01-generated-dev.docx");
  writeFileSync(genPath, generated);
  stage("1-generate", true, {
    message: `${generated.byteLength} bytes`,
    path: genPath,
    sha256: sha256(generated),
    head: Buffer.from(generated.subarray(0, 4)).toString("hex"),
  });
} catch (error) {
  stage("1-generate", false, { message: String(error?.stack || error) });
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  process.exit(1);
}

// --- Stage 2: JSZip reopen BEFORE save (req 11) ---
let zip;
try {
  zip = await JSZip.loadAsync(generated, { checkCRC32: true });
  const names = Object.keys(zip.files).sort();
  stage("2-jszip-reopen", true, {
    message: `${names.length} entries, CRC32 OK`,
    entries: names,
  });
} catch (error) {
  stage("2-jszip-reopen", false, { message: String(error?.stack || error) });
}

// --- Stage 3: required OOXML parts ---
const required = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/_rels/document.xml.rels",
];
if (zip) {
  const missing = required.filter((n) => !zip.file(n));
  stage("3-required-parts", missing.length === 0, {
    message: missing.length ? `missing: ${missing.join(", ")}` : "all present",
    missing,
  });
}

// --- Stage 4: validate every XML ---
const xmlIssues = [];
if (zip) {
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    const text = await entry.async("string");
    if (text.includes("NaN")) xmlIssues.push({ name, issue: "contains NaN" });
    if (text.includes("\u0000")) xmlIssues.push({ name, issue: "contains NUL" });
    try {
      assertWellFormedXml(text, name);
    } catch (error) {
      xmlIssues.push({ name, issue: error.message });
    }
  }
  stage("4-xml-validate", xmlIssues.length === 0, {
    message: xmlIssues.length ? `${xmlIssues.length} issue(s)` : "all XML/rels parse",
    xmlIssues,
  });
}

// --- Stage 5: content types + rels + document drawings ---
if (zip) {
  const contentTypes = await zip.file("[Content_Types].xml").async("string");
  const rels = await zip.file("word/_rels/document.xml.rels").async("string");
  const documentXml = await zip.file("word/document.xml").async("string");
  const rootRels = await zip.file("_rels/.rels").async("string");

  const embeds = [...documentXml.matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]);
  const imageRels = [
    ...rels.matchAll(
      /Id="(rId\d+)"[^>]*Type="[^"]*\/image"[^>]*Target="([^"]+)"|Type="[^"]*\/image"[^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g,
    ),
  ].map((m) => ({ id: m[1] || m[3], target: m[2] || m[4] }));

  const missingEmbeds = embeds.filter((id) => !imageRels.some((r) => r.id === id));
  const docPrIds = [...documentXml.matchAll(/<wp:docPr[^>]*\bid="(\d+)"/g)].map((m) => m[1]);
  const uniqueDocPr = new Set(docPrIds).size === docPrIds.length;

  const hasPngOverride =
    contentTypes.includes('Extension="png"') || contentTypes.includes("image/png");

  stage("5-rels-content-types-document", missingEmbeds.length === 0 && uniqueDocPr && hasPngOverride, {
    message: `embeds=${embeds.length} imageRels=${imageRels.length} uniqueDocPr=${uniqueDocPr}`,
    embeds,
    imageRels,
    docPrIds,
    uniqueDocPr,
    hasPngOverride,
    missingEmbeds,
    rootRelsHasDocument: rootRels.includes("officeDocument"),
    hasNaN: documentXml.includes("NaN"),
  });
}

// --- Stage 6: media PNG validity ---
const mediaIssues = [];
if (zip) {
  const mediaFiles = Object.keys(zip.files).filter((n) => n.startsWith("word/media/") && !zip.files[n].dir);
  for (const name of mediaFiles) {
    const bytes = await zip.file(name).async("uint8array");
    if (!isPng(bytes)) {
      mediaIssues.push({ name, issue: "not PNG", head: Buffer.from(bytes.subarray(0, 8)).toString("hex") });
    } else if (bytes.byteLength < 100) {
      mediaIssues.push({ name, issue: "PNG too small", len: bytes.byteLength });
    }
  }
  stage("6-media-png", mediaIssues.length === 0 && mediaFiles.length > 0, {
    message: `${mediaFiles.length} media file(s)`,
    mediaFiles,
    mediaIssues,
  });
}

// --- Stage 7: IPC base64 encode (renderer chunked btoa path) ---
let ipcBuf;
try {
  globalThis.btoa = (bin) => Buffer.from(bin, "binary").toString("base64");
  const dataBase64 = uint8ArrayToBase64(generated);
  const payload = {
    filename: "Planning_2026-08-05.docx",
    dataBase64,
    byteLength: generated.byteLength,
  };
  ipcBuf = decodeIpcPayload(payload);
  const match = Buffer.compare(Buffer.from(generated), ipcBuf) === 0;
  stage("7-ipc-base64-roundtrip", match, {
    message: match ? "byte-identical after IPC encode/decode" : "MISMATCH after IPC",
    generatedLen: generated.byteLength,
    decodedLen: ipcBuf.length,
    generatedSha: sha256(generated),
    decodedSha: sha256(ipcBuf),
  });
} catch (error) {
  stage("7-ipc-base64-roundtrip", false, { message: String(error?.stack || error) });
}

// --- Stage 8: Buffer polyfill base64 (OLD path — known risk) ---
try {
  const polyB64 = PolyBuffer.from(generated).toString("base64");
  const decoded = Buffer.from(polyB64, "base64");
  const match = Buffer.compare(Buffer.from(generated), decoded) === 0;
  stage("8-polyfill-base64-roundtrip", match, {
    message: match
      ? "polyfill base64 still round-trips in Node (may differ in Chromium)"
      : "POLYFILL BASE64 CORRUPTS BYTES",
    match,
  });
} catch (error) {
  stage("8-polyfill-base64-roundtrip", false, { message: String(error) });
}

// --- Stage 9: atomic write + size check ---
try {
  const outPath = join(outDir, "09-after-atomic-write.docx");
  const data = ipcBuf ?? Buffer.from(generated);
  await writeAtomic(outPath, data);
  const onDisk = readFileSync(outPath);
  const match = Buffer.compare(data, onDisk) === 0;
  assertDocxZipMagic(onDisk, "on-disk");
  stage("9-atomic-write", match && onDisk.length === data.length, {
    message: `wrote ${onDisk.length} bytes`,
    path: outPath,
    match,
    sha256: sha256(onDisk),
  });
} catch (error) {
  stage("9-atomic-write", false, { message: String(error?.stack || error) });
}

// --- Stage 10: JSZip reopen AFTER write ---
try {
  const onDisk = readFileSync(join(outDir, "09-after-atomic-write.docx"));
  const zip2 = await JSZip.loadAsync(onDisk, { checkCRC32: true });
  stage("10-jszip-after-write", true, {
    message: `${Object.keys(zip2.files).length} entries CRC32 OK`,
  });
} catch (error) {
  stage("10-jszip-after-write", false, { message: String(error?.stack || error) });
}

// --- Stage 11: compare against prior validation sample if present ---
const priorPath = join(root, "tmp-word-validation/feuille-presence-word-validation.docx");
if (existsSync(priorPath)) {
  const prior = readFileSync(priorPath);
  stage("11-compare-prior-sample", true, {
    message: "sizes differ expected (content/date); both must be valid ZIP",
    priorLen: prior.length,
    currentLen: generated.byteLength,
    priorIsZip: prior[0] === 0x50 && prior[1] === 0x4b,
    currentIsZip: generated[0] === 0x50 && generated[1] === 0x4b,
    byteIdentical: Buffer.compare(prior, Buffer.from(generated)) === 0,
  });
}

// --- Stage 12: inspect corrupt artifact if present ---
const corruptPath = join(root, "tmp-export-ipc/Planning_2026-07-27.docx");
if (existsSync(corruptPath)) {
  const corrupt = readFileSync(corruptPath);
  const sequential = [...corrupt.subarray(0, 256)].every((b, i) => b === (i & 0xff));
  stage("12-corrupt-artifact-analysis", false, {
    message: sequential
      ? "tmp-export-ipc file is NOT a DOCX — sequential test pattern (i&0xff), not a real export"
      : "corrupt artifact present",
    len: corrupt.length,
    head: corrupt.subarray(0, 8).toString("hex"),
    sequential,
    isZip: corrupt[0] === 0x50 && corrupt[1] === 0x4b,
  });
  report.notes.push(
    "tmp-export-ipc/Planning_2026-07-27.docx is a synthetic sequential byte file from an IPC repro, not evidence of generation corruption.",
  );
}

// --- Stage 13: simulate cross-realm Uint8Array failure mode ---
try {
  // Detached-like: Uint8Array subclass that fails some instanceof checks when copied poorly
  const raw = toZipSafeUint8Array(logoBytes);
  const view = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const safe = toZipSafeUint8Array(view);
  const match = Buffer.compare(Buffer.from(raw), Buffer.from(safe)) === 0;
  stage("13-zip-safe-copy", match && safe instanceof Uint8Array, {
    message: match ? "toZipSafeUint8Array preserves PNG bytes" : "copy mismatch",
  });
} catch (error) {
  stage("13-zip-safe-copy", false, { message: String(error) });
}

// --- Stage 14: LibreOffice / Word availability ---
report.notes.push("LibreOffice/soffice not available in this environment for open-test.");
report.notes.push("Windows .exe cannot be executed on this macOS host; packaged path simulated via Buffer polyfill + IPC + atomic write.");

const failing = report.failures.filter((f) => f.stage !== "12-corrupt-artifact-analysis");
report.summary = {
  ok: failing.length === 0,
  failingStages: failing.map((f) => f.stage),
  generatedPath: join(outDir, "01-generated-dev.docx"),
  writtenPath: join(outDir, "09-after-atomic-write.docx"),
};

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(report.summary, null, 2));
if (!report.summary.ok) process.exit(1);
