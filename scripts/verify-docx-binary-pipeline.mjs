/**
 * Verify DOCX binary helpers used by Windows Electron export.
 * Run: npx --yes tsx scripts/verify-docx-binary-pipeline.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDocxZipMagic,
  assertDocxZipArchive,
  assertDocxZipIntegrity,
  toZipSafeUint8Array,
  uint8ArrayToBase64,
  DOCX_ZIP_MAGIC,
} from "../src/lib/documents/docx-binary.ts";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const png = readFileSync(join(root, "public/assets/police-cynotechnique-logo.png"));
const u8 = new Uint8Array(png);

const safe = toZipSafeUint8Array(u8);
assert(safe.length === u8.length, "zip-safe copy preserves length");
assert(safe !== u8, "zip-safe returns a new array");
assert(safe.every((b, i) => b === u8[i]), "zip-safe copy is byte-identical");

// Fake minimal ZIP/DOCX header
const fakeDocx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
assertDocxZipMagic(fakeDocx, "test");
assert(DOCX_ZIP_MAGIC[0] === 0x50, "magic constant");

let threw = false;
try {
  assertDocxZipMagic(u8, "png-as-docx");
} catch {
  threw = true;
}
assert(threw, "PNG is rejected as DOCX");

// Round-trip base64 (chunked btoa path needs DOM — skip if unavailable, use Buffer)
globalThis.btoa = (bin) => Buffer.from(bin, "binary").toString("base64");
const b64 = uint8ArrayToBase64(u8);
const decoded = Buffer.from(b64, "base64");
assert(decoded.length === u8.length, "base64 round-trip length");
assert(decoded.equals(Buffer.from(u8)), "base64 round-trip bytes");

// Large payload stress (2 MiB)
const big = new Uint8Array(2 * 1024 * 1024);
for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
big[0] = 0x50;
big[1] = 0x4b;
big[2] = 0x03;
big[3] = 0x04;
const bigB64 = uint8ArrayToBase64(big);
const bigDecoded = Buffer.from(bigB64, "base64");
assert(bigDecoded.length === big.length, "large base64 length");
assert(bigDecoded[0] === 0x50 && bigDecoded[3] === 0x04, "large base64 preserves ZIP magic");

// Truncated ZIP (magic OK, EOCD missing) must be rejected
const truncated = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3, 4, 5, 6, 7]);
let eocdThrew = false;
try {
  assertDocxZipArchive(truncated, "truncated");
} catch {
  eocdThrew = true;
}
assert(eocdThrew, "truncated ZIP without EOCD is rejected");

// Real DOCX sample if present
import { existsSync } from "node:fs";
const samplePath = join(root, "tmp-docx-investigation/01-generated-dev.docx");
if (existsSync(samplePath)) {
  const sample = new Uint8Array(readFileSync(samplePath));
  assertDocxZipArchive(sample, "sample-archive");
  await assertDocxZipIntegrity(sample, "sample-integrity");
  assert(true, "sample DOCX passes archive + JSZip CRC integrity");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nDOCX binary pipeline checks passed.");
