import { renderOfficialDocumentPdf } from "@/lib/reports-messages/official-document/render-official-pdf";
import type { OfficialPdfRenderOptions } from "@/lib/reports-messages/official-document/render-official-pdf";
import { packOfficialPdfVisualDocx } from "@/lib/reports-messages/official-document/official-docx-from-page-images";
import type {
  OfficialDocumentBuildContext,
  OfficialDocumentModel,
} from "@/lib/reports-messages/official-document/types";

type UiLabels = OfficialDocumentBuildContext["labels"];

export type OfficialDocxRenderOptions = OfficialPdfRenderOptions;

/**
 * Word export is a visual copy of the official PDF:
 * the same jsPDF renderer, then each A4 page is placed into the .docx.
 */
export async function renderOfficialDocumentDocx(
  model: OfficialDocumentModel,
  labels: UiLabels,
  options?: OfficialDocxRenderOptions,
): Promise<Uint8Array> {
  const pdf = renderOfficialDocumentPdf(model, labels, options);
  const { rasterizeJsPdfPages } = await import(
    "@/lib/reports-messages/official-document/rasterize-jspdf-pages"
  );
  const pages = await rasterizeJsPdfPages(pdf);
  return packOfficialPdfVisualDocx(pages);
}
