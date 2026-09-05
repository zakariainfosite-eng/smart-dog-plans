/**
 * Platform-aware jsPDF delivery.
 * Android → Documents/Downloads + Open / Share confirmation.
 * iOS → Cache + Share Sheet.
 * Electron + browser → existing doc.save(filename) download behavior.
 */
import type { jsPDF } from "jspdf";
import { toast } from "sonner";
import {
  shareExportFilesOnCapacitor,
  shouldShareExportsOnCapacitor,
} from "@/lib/documents/export-binary";
import { logPdfExportError } from "@/lib/documents/pdf-export-result";

/**
 * Deliver a generated jsPDF without changing its content.
 * Do not call doc.save() on Capacitor — WKWebView does not persist to Files reliably.
 */
export async function exportJsPdf(doc: jsPDF, filename: string): Promise<void> {
  if (shouldShareExportsOnCapacitor()) {
    try {
      const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;
      const shared = await shareExportFilesOnCapacitor([
        { data: arrayBuffer, filename },
      ]);
      if (shared === null) {
        // User dismissed the share / save sheet — treat as a soft cancel (no error toast).
        return;
      }
      return;
    } catch (error) {
      logPdfExportError(
        "Impossible d'enregistrer le PDF",
        error instanceof Error ? error.message : String(error),
      );
      toast.error("Impossible d'enregistrer le PDF");
      throw error;
    }
  }

  // Electron desktop and browser: keep the historical jsPDF download path.
  doc.save(filename);
}
