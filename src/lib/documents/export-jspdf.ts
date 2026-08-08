/**
 * Platform-aware jsPDF delivery.
 * Capacitor/iOS → shared binary helper (Cache + Share Sheet).
 * Electron + browser → existing doc.save(filename) download behavior.
 */
import type { jsPDF } from "jspdf";
import {
  shareExportFilesOnCapacitor,
  shouldShareExportsOnCapacitor,
} from "@/lib/documents/export-binary";

/**
 * Deliver a generated jsPDF without changing its content.
 * Do not call doc.save() on Capacitor — WKWebView does not persist to Files reliably.
 */
export async function exportJsPdf(doc: jsPDF, filename: string): Promise<void> {
  if (shouldShareExportsOnCapacitor()) {
    const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;
    const shared = await shareExportFilesOnCapacitor([
      { data: arrayBuffer, filename },
    ]);
    if (shared === null) {
      // User dismissed the share sheet — treat as a soft cancel (no error toast).
      return;
    }
    return;
  }

  // Electron desktop and browser: keep the historical jsPDF download path.
  doc.save(filename);
}
