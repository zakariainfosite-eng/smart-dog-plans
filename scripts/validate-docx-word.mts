import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateFeuillePresenceDocx } from "../src/lib/documents/feuille-presence-docx.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tmp-word-validation");
const docxPath = join(outDir, "feuille-presence-word-validation.docx");
const inspectDir = join(outDir, "unzipped");
const logoPath = join(root, "public/assets/police-cynotechnique-logo.png");
const logoBytes = readFileSync(logoPath);

function installBrowserMocks(logoUrl: string): void {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (href === logoUrl) {
      return new Response(logoBytes, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }
    return nativeFetch(input, init);
  };

  globalThis.createImageBitmap = async (blob: Blob) => {
    const buffer = Buffer.from(await blob.arrayBuffer());
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      close: () => {},
    };
  };

  globalThis.document = {
    createElement: (tag: string) => {
      if (tag !== "canvas") throw new Error(`Unexpected element: ${tag}`);
      let width = 0;
      let height = 0;
      let pixels = new Uint8ClampedArray(0);

      return {
        get width() {
          return width;
        },
        set width(value: number) {
          width = value;
          pixels = new Uint8ClampedArray(width * height * 4);
        },
        get height() {
          return height;
        },
        set height(value: number) {
          height = value;
          pixels = new Uint8ClampedArray(width * height * 4);
        },
        getContext: () => ({
          drawImage: () => {
            pixels.fill(255);
          },
          getImageData: () => ({ data: pixels }),
          putImageData: (imageData: { data: Uint8ClampedArray }) => {
            pixels = imageData.data;
          },
        }),
        toBlob: (callback: (blob: Blob | null) => void) => {
          callback(new Blob([logoBytes], { type: "image/png" }));
        },
      };
    },
  } as unknown as Document;
}

const sample = {
  dateLine: "TANGER LE 28 / 07 / 2026",
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
const logoUrl = pathToFileURL(logoPath).href;
installBrowserMocks(logoUrl);

const bytes = await generateFeuillePresenceDocx(sample, logoUrl);
writeFileSync(docxPath, bytes);

rmSync(inspectDir, { recursive: true, force: true });
mkdirSync(inspectDir, { recursive: true });
execSync(`unzip -q "${docxPath}" -d "${inspectDir}"`);

const documentXml = readFileSync(join(inspectDir, "word/document.xml"), "utf8");
const relsXml = readFileSync(join(inspectDir, "word/_rels/document.xml.rels"), "utf8");
const docPrIds = [...documentXml.matchAll(/<wp:docPr[^>]*\bid="(\d+)"/g)].map((m) => m[1]);
const embeds = [...documentXml.matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]);
const behindDocAnchors = [...documentXml.matchAll(/<wp:anchor[^>]*behindDoc="1"/g)].length;
const imageRels = [
  ...relsXml.matchAll(
    /<Relationship[^>]*Id="(rId\d+)"[^>]*Type="[^"]*\/image"[^>]*Target="([^"]+)"/g,
  ),
].map((m) => ({ id: m[1], target: m[2] }));

const report = {
  docxPath,
  bytes: bytes.length,
  docPrIds,
  uniqueDocPrIds: new Set(docPrIds).size === docPrIds.length,
  embeds,
  imageRels,
  inlineCount: (documentXml.match(/<wp:inline/g) ?? []).length,
  anchorCount: (documentXml.match(/<wp:anchor/g) ?? []).length,
  behindDocAnchorCount: behindDocAnchors,
  hasNaN: documentXml.includes("NaN"),
};

writeFileSync(join(outDir, "drawing-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
