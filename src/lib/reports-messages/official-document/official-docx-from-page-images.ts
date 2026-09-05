import { Buffer } from "buffer";
import {
  Document,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  convertMillimetersToTwip,
} from "docx";
import { applyWord2007DocxCompatibility } from "@/lib/documents/docx-word2007-compat";
import { assertDocxZipIntegrity, toZipSafeUint8Array } from "@/lib/documents/docx-binary";
import { A4 } from "@/lib/reports-messages/official-document/layout";

export type OfficialPdfPageImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

const PAGE_W = convertMillimetersToTwip(A4.width);
const PAGE_H = convertMillimetersToTwip(A4.height);
const A4_DISPLAY_PX_W = Math.round((A4.width / 25.4) * 96);
const A4_DISPLAY_PX_H = Math.round((A4.height / 25.4) * 96);

function ensureDocxBuffer(): void {
  const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
  if (typeof g.Buffer === "undefined") {
    g.Buffer = Buffer;
  }
}

function fullPageImageParagraph(page: OfficialPdfPageImage, index: number): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 0 },
    children: [
      new ImageRun({
        type: "png",
        data: toZipSafeUint8Array(page.bytes),
        transformation: {
          width: A4_DISPLAY_PX_W,
          height: A4_DISPLAY_PX_H,
        },
        altText: {
          id: String(index + 1),
          name: `page-${index + 1}`,
          description: "Official Radio Depart page",
        },
        floating: {
          behindDocument: false,
          allowOverlap: true,
          lockAnchor: true,
          layoutInCell: false,
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.PAGE,
            offset: 0,
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PAGE,
            offset: 0,
          },
          wrap: {
            type: TextWrappingType.NONE,
          },
        },
      }),
    ],
  });
}

async function packDocx(doc: Document): Promise<Uint8Array> {
  ensureDocxBuffer();
  if (
    typeof (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer?.isBuffer !==
    "function"
  ) {
    throw new Error(
      "DOCX export: Buffer.isBuffer is missing after polyfill (document generation).",
    );
  }
  try {
    let packed: Uint8Array;
    if (typeof Blob !== "undefined") {
      const blob = await Packer.toBlob(doc);
      packed = toZipSafeUint8Array(await blob.arrayBuffer());
    } else {
      packed = toZipSafeUint8Array(await Packer.toArrayBuffer(doc));
    }
    packed = await applyWord2007DocxCompatibility(packed);
    await assertDocxZipIntegrity(packed, "official-pdf-visual-docx");
    return packed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(`DOCX Packer failed: ${message}`);
    if (error instanceof Error && error.stack) {
      wrapped.stack = `${wrapped.message}\n${error.stack}`;
    }
    throw wrapped;
  }
}

/**
 * Build a Word file whose pages are the official PDF pages (one A4 image per page).
 * Display size is physical A4 so Word print layout matches the PDF.
 */
export async function packOfficialPdfVisualDocx(
  pages: OfficialPdfPageImage[],
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("DOCX export: no PDF pages to copy.");
  }

  const doc = new Document({
    compatibilityModeVersion: 12,
    compatibility: { version: 12 },
    sections: pages.map((page, index) => ({
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          },
        },
      },
      children: [fullPageImageParagraph(page, index)],
    })),
  });

  return packDocx(doc);
}
