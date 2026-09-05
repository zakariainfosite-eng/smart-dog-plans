/**
 * Android PDF export result — filename + URI for Open / Share.
 * Does not hold PDF bytes.
 */

export type PdfExportResult = {
  filename: string;
  uri: string;
  directoryLabel: string;
};

let current: PdfExportResult | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getPdfExportResult(): PdfExportResult | null {
  return current;
}

export function subscribePdfExportResult(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function presentPdfExportResult(result: PdfExportResult): void {
  current = result;
  emit();
}

export function dismissPdfExportResult(): void {
  current = null;
  emit();
}

const PDF_EXPORT_LOG = "[pdf-export]";

export function logPdfExport(message: string, extra?: string): void {
  if (extra) {
    console.info(PDF_EXPORT_LOG, message, extra);
    return;
  }
  console.info(PDF_EXPORT_LOG, message);
}

export function logPdfExportError(message: string, extra?: unknown): void {
  if (extra !== undefined) {
    console.error(PDF_EXPORT_LOG, message, extra);
    return;
  }
  console.error(PDF_EXPORT_LOG, message);
}

type PdfViewerPlugin = {
  open(options: { uri: string }): Promise<void>;
};

/** Open a saved PDF with the Android system viewer (`ACTION_VIEW`). */
export async function openPdfWithSystemViewer(uri: string): Promise<void> {
  const { registerPlugin } = await import("@capacitor/core");
  const PdfViewer = registerPlugin<PdfViewerPlugin>("PdfViewer");
  await PdfViewer.open({ uri });
}
