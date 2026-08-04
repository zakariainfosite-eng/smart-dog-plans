/**
 * Binary helpers for Electron DOCX export.
 * Avoids Buffer-polyfill / cross-realm Uint8Array pitfalls that corrupt OOXML on Windows.
 */

/** ZIP local-file header — every valid .docx starts with these bytes. */
export const DOCX_ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;

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
 * Base64 encode without the npm `buffer` polyfill.
 * Chunked to avoid call-stack limits on large DOCX payloads in Chromium.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  // 8 KiB chunks — larger spreads can exceed Chromium's apply/arg limits.
  const CHUNK = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
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
