/**
 * Binary helpers for Electron DOCX export.
 * Avoids Buffer-polyfill / cross-realm Uint8Array pitfalls that corrupt OOXML on Windows.
 */

/** ZIP local-file header — every valid .docx starts with these bytes. */
export const DOCX_ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

/** ZIP end-of-central-directory signature. */
export const DOCX_ZIP_EOCD = [0x50, 0x4b, 0x05, 0x06] as const;

/**
 * Copy into a fresh same-realm Uint8Array.
 * JSZip (bundled inside `docx`) uses `instanceof Uint8Array`; bytes from fetch/canvas
 * ArrayBuffers can fail that check in packaged Electron and corrupt media entries.
 */
export function toZipSafeUint8Array(source: Uint8Array | ArrayBuffer): Uint8Array {
  if (source instanceof ArrayBuffer) {
    return Uint8Array.from(new Uint8Array(source));
  }
  return Uint8Array.from(source);
}

export function assertDocxZipMagic(bytes: Uint8Array, context: string): void {
  if (bytes.byteLength < 4) {
    throw new Error(`${context}: DOCX too short (${bytes.byteLength} bytes)`);
  }
  const ok =
    bytes[0] === DOCX_ZIP_MAGIC[0]
    && bytes[1] === DOCX_ZIP_MAGIC[1]
    && bytes[2] === DOCX_ZIP_MAGIC[2]
    && bytes[3] === DOCX_ZIP_MAGIC[3];
  if (!ok) {
    const head = Array.from(bytes.subarray(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    throw new Error(
      `${context}: invalid DOCX/ZIP magic (got [${head}], len=${bytes.byteLength}). `
        + "File would be rejected by Microsoft Word as a corrupt Office Open XML package.",
    );
  }
}

/**
 * Structural ZIP checks beyond the local-file magic.
 * Catches truncated IPC payloads that still begin with PK\\x03\\x04.
 */
export function assertDocxZipArchive(bytes: Uint8Array, context: string): void {
  assertDocxZipMagic(bytes, context);
  if (bytes.byteLength < 22) {
    throw new Error(`${context}: DOCX shorter than ZIP EOCD minimum (${bytes.byteLength} bytes)`);
  }

  // Scan backwards for EOCD (comment may follow; max comment 65535).
  const maxScan = Math.min(bytes.byteLength - 22, 0xffff);
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= bytes.byteLength - 22 - maxScan; i -= 1) {
    if (
      bytes[i] === DOCX_ZIP_EOCD[0]
      && bytes[i + 1] === DOCX_ZIP_EOCD[1]
      && bytes[i + 2] === DOCX_ZIP_EOCD[2]
      && bytes[i + 3] === DOCX_ZIP_EOCD[3]
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error(
      `${context}: missing ZIP end-of-central-directory (PK\\x05\\x06). Archive is truncated or corrupt.`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (cdOffset + cdSize !== eocd) {
    throw new Error(
      `${context}: ZIP central-directory mismatch `
        + `(offset=${cdOffset}, size=${cdSize}, eocd=${eocd}, len=${bytes.byteLength}). `
        + "Archive is truncated or corrupt.",
    );
  }
  if (cdOffset < 4 || bytes[cdOffset] !== 0x50 || bytes[cdOffset + 1] !== 0x4b) {
    throw new Error(`${context}: ZIP central-directory offset does not point at a PK signature`);
  }
}

function findZipEocdOffset(bytes: Uint8Array): number {
  const maxScan = Math.min(bytes.byteLength - 22, 0xffff);
  for (let i = bytes.byteLength - 22; i >= bytes.byteLength - 22 - maxScan; i -= 1) {
    if (
      bytes[i] === DOCX_ZIP_EOCD[0]
      && bytes[i + 1] === DOCX_ZIP_EOCD[1]
      && bytes[i + 2] === DOCX_ZIP_EOCD[2]
      && bytes[i + 3] === DOCX_ZIP_EOCD[3]
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Real ZIP central-directory names (not JSZip's synthesized folders).
 * Word Android rejects packages that store directory-only entries (`word/`).
 */
export function listZipCentralDirectoryNames(bytes: Uint8Array): string[] {
  assertDocxZipArchive(bytes, "zip-cd");
  const eocd = findZipEocdOffset(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const names: string[] = [];
  const decoder = new TextDecoder("utf-8");
  for (let i = 0; i < entryCount; i += 1) {
    if (
      bytes[offset] !== 0x50
      || bytes[offset + 1] !== 0x4b
      || bytes[offset + 2] !== 0x01
      || bytes[offset + 3] !== 0x02
    ) {
      throw new Error(`zip-cd: central-directory entry ${i} is not PK\\x01\\x02`);
    }
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen)));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/**
 * Full integrity check: structural ZIP + CRC32 of every entry via JSZip.
 * Call before IPC save (renderer) and after IPC decode (main).
 */
export async function assertDocxZipIntegrity(
  bytes: Uint8Array,
  context: string,
): Promise<void> {
  assertDocxZipArchive(bytes, context);
  const { default: JSZip } = await import("jszip");
  try {
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const names = Object.keys(zip.files);
    if (names.length === 0) {
      throw new Error(`${context}: ZIP has no entries`);
    }
    const required = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
    for (const name of required) {
      if (!zip.file(name)) {
        throw new Error(`${context}: missing required OOXML part ${name}`);
      }
    }
    const storedNames = listZipCentralDirectoryNames(bytes);
    const directoryEntries = storedNames.filter((name) => name.endsWith("/"));
    if (directoryEntries.length > 0) {
      throw new Error(
        `${context}: ZIP stores directory entries (${directoryEntries.join(", ")}). `
          + "Microsoft Word Android rejects these packages.",
      );
    }
    for (const name of required) {
      if (!storedNames.includes(name)) {
        throw new Error(`${context}: central directory missing ${name}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(context)) throw error;
    throw new Error(`${context}: JSZip CRC/load failed — ${message}`);
  }
}

/**
 * Base64 encode without the npm `buffer` polyfill.
 * Chunked to avoid call-stack limits on large DOCX payloads in Chromium.
 *
 * Root cause note: transferring ~600k DOCX bytes as `number[]` over Electron IPC
 * corrupts the payload on Windows packaged builds. Always use this + dataBase64.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  // 8 KiB chunks — larger spreads can exceed Chromium's apply/arg limits.
  const CHUNK = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    // Real Array — `apply` on TypedArray is unreliable across Chromium/Electron builds.
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  // Node / vitest fallback (no DOM btoa)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeBuffer = (globalThis as { Buffer?: { from: (s: string, enc: string) => { toString: (e: string) => string } } }).Buffer;
  if (nodeBuffer) {
    return nodeBuffer.from(binary, "binary").toString("base64");
  }
  throw new Error("uint8ArrayToBase64: no btoa/Buffer available");
}
