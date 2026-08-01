import { format } from "date-fns";
import { Buffer } from "buffer";
import {
  generateFeuillePresencePdfWithLogo,
  loadFeuillePresenceLogo,
} from "@/lib/documents/feuille-presence-pdf";
import { generateFeuillePresenceDocx } from "@/lib/documents/feuille-presence-docx";
import { FP_OFFICIAL_LOGO_URL } from "@/lib/documents/feuille-presence-layout";
import { wrapExportError } from "@/lib/documents/export-error";
import type { FeuillePresenceData } from "@/lib/documents/feuille-presence-types";
import type {
  PlanningExportFile,
  PlanningExportFormat,
  PlanningExportSaveResult,
} from "@/lib/documents/planning-export-types";

export type FeuillePresenceExportInput = {
  planningDate: Date;
  data: FeuillePresenceData;
  /** Basename without extension, e.g. Planning_2026-07-27 */
  basename?: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function downloadBrowserFile(file: PlanningExportFile): void {
  try {
    const copy = new Uint8Array(file.bytes);
    const blob = new Blob([copy], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    throw wrapExportError("browser-download", error);
  }
}

function hasElectronSave(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.cynoplanning?.files?.saveExportFiles === "function"
  );
}

async function saveViaElectron(files: PlanningExportFile[]): Promise<PlanningExportSaveResult> {
  const bridge = window.cynoplanning?.files;
  if (!bridge?.saveExportFiles) {
    return { canceled: true };
  }
  try {
    return await bridge.saveExportFiles({
      defaultBasename: files[0]?.filename.replace(/\.(pdf|docx)$/i, "") ?? "Planning",
      files: files.map((file) => ({
        filename: file.filename,
        // Base64 avoids Electron IPC failures with huge number[] payloads after DOCX packing.
        dataBase64: bytesToBase64(file.bytes),
      })),
    });
  } catch (error) {
    throw wrapExportError("ipc-save", error);
  }
}

export function planningExportBasename(planningDate: Date): string {
  return `Planning_${format(planningDate, "yyyy-MM-dd")}`;
}

/**
 * Generate Feuille de présence files from the approved template.
 * PDF uses the existing renderer unchanged; DOCX mirrors the same structure.
 */
export async function generateFeuillePresenceExportFiles(
  input: FeuillePresenceExportInput,
  format: PlanningExportFormat,
): Promise<PlanningExportFile[]> {
  const basename = input.basename ?? planningExportBasename(input.planningDate);
  const year = input.planningDate.getFullYear();
  const logoBytes = await loadFeuillePresenceLogo(FP_OFFICIAL_LOGO_URL);
  const files: PlanningExportFile[] = [];

  if (format === "pdf" || format === "both") {
    try {
      const doc = await generateFeuillePresencePdfWithLogo({
        year,
        data: input.data,
        logoDataUrl: logoBytes,
      });
      files.push({
        filename: `${basename}.pdf`,
        mimeType: "application/pdf",
        bytes: new Uint8Array(doc.output("arraybuffer")),
      });
    } catch (error) {
      throw wrapExportError("pdf-generate", error);
    }
  }

  if (format === "docx" || format === "both") {
    try {
      const bytes = await generateFeuillePresenceDocx(input.data, FP_OFFICIAL_LOGO_URL);
      files.push({
        filename: `${basename}.docx`,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes,
      });
    } catch (error) {
      throw wrapExportError("docx-generate", error);
    }
  }

  return files;
}

export async function savePlanningExportFiles(
  files: PlanningExportFile[],
): Promise<PlanningExportSaveResult> {
  if (files.length === 0) return { canceled: true };

  if (hasElectronSave()) {
    return saveViaElectron(files);
  }

  for (const file of files) {
    downloadBrowserFile(file);
  }
  return { canceled: false, paths: files.map((file) => file.filename) };
}

/** Export the approved Feuille de présence as PDF and/or Word. */
export async function exportFeuillePresencePlanning(
  input: FeuillePresenceExportInput,
  format: PlanningExportFormat,
): Promise<PlanningExportSaveResult> {
  const files = await generateFeuillePresenceExportFiles(input, format);
  return savePlanningExportFiles(files);
}
