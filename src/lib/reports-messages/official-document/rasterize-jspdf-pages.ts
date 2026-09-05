import type { jsPDF } from "jspdf";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { toZipSafeUint8Array } from "@/lib/documents/docx-binary";
import type { OfficialPdfPageImage } from "@/lib/reports-messages/official-document/official-docx-from-page-images";

/** 150 dpi — sharp enough for Word print layout while staying lightweight. */
const RASTER_SCALE = 150 / 72;

function ensurePdfWorker(): void {
  if (GlobalWorkerOptions.workerSrc !== pdfjsWorker) {
    GlobalWorkerOptions.workerSrc = pdfjsWorker;
  }
}

function standardFontDataUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}pdfjs-standard-fonts/`;
}

async function canvasToPngBytes(
  canvas: HTMLCanvasElement,
): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("DOCX export: canvas.toBlob failed."));
    }, "image/png");
  });
  return toZipSafeUint8Array(await blob.arrayBuffer());
}

/**
 * Rasterize each jsPDF page to a PNG using the same PDF bytes the user would download.
 */
export async function rasterizeJsPdfPages(doc: jsPDF): Promise<OfficialPdfPageImage[]> {
  if (typeof document === "undefined") {
    throw new Error(
      "DOCX export: PDF page rasterization requires the Electron/browser renderer.",
    );
  }

  ensurePdfWorker();

  const data = toZipSafeUint8Array(doc.output("arraybuffer"));
  const pdf = await getDocument({
    data,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    isEvalSupported: false,
    useSystemFonts: true,
    standardFontDataUrl: standardFontDataUrl(),
  }).promise;

  const pages: OfficialPdfPageImage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RASTER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("DOCX export: 2D canvas is unavailable.");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx,
      viewport,
      intent: "print",
    }).promise;
    pages.push({
      bytes: await canvasToPngBytes(canvas),
      width: canvas.width,
      height: canvas.height,
    });
  }

  return pages;
}
