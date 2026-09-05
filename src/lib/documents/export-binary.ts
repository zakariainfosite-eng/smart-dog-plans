/**
 * Platform-aware binary file delivery for exports (PDF, DOCX, …).
 *
 * Android → user-visible Documents/Downloads, then Open / Share confirmation.
 * iOS → Cache write + native Share Sheet (Save to Files).
 * Browser/Electron download paths stay with their callers (doc.save, <a download>, IPC).
 */
import { uint8ArrayToBase64 } from "@/lib/documents/docx-binary";
import { wrapExportError } from "@/lib/documents/export-error";
import {
  logPdfExport,
  logPdfExportError,
  presentPdfExportResult,
} from "@/lib/documents/pdf-export-result";
import { isAndroidCapacitorRuntime, isNativeCapacitorRuntime } from "@/lib/runtime-platform";

export type ExportBinaryInput = Uint8Array | ArrayBuffer | Blob;

export type ExportBinaryFile = {
  data: ExportBinaryInput;
  filename: string;
};

type WrittenExportFile = {
  filename: string;
  uri: string;
  directoryLabel: string;
};

function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\?%*:|"<>]/g, "_");
}

export async function toExportBytes(data: ExportBinaryInput): Promise<Uint8Array> {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(await data.arrayBuffer());
}

function isShareCanceled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel/i.test(message);
}

function isPdfFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".pdf");
}

async function requestPublicStoragePermission(): Promise<void> {
  const { Filesystem } = await import("@capacitor/filesystem");
  try {
    const current = await Filesystem.checkPermissions();
    if (current.publicStorage === "granted") return;
    await Filesystem.requestPermissions();
  } catch {
    // Android 13+ often does not require this for app-created Documents files.
  }
}

async function writeExportFile(
  bytes: Uint8Array,
  filename: string,
  directory: import("@capacitor/filesystem").Directory,
  path: string,
): Promise<WrittenExportFile> {
  const { Filesystem } = await import("@capacitor/filesystem");
  const written = await Filesystem.writeFile({
    path,
    data: uint8ArrayToBase64(bytes),
    directory,
    recursive: true,
  });

  let fileUri = written.uri;
  if (!fileUri) {
    const resolved = await Filesystem.getUri({ path, directory });
    fileUri = resolved.uri;
  }
  if (!fileUri) {
    throw new Error(`Unable to resolve export file URI for ${filename}`);
  }
  return { filename, uri: fileUri, directoryLabel: String(directory) };
}

async function writeExportFileToCache(
  bytes: Uint8Array,
  filename: string,
): Promise<WrittenExportFile> {
  const { Directory } = await import("@capacitor/filesystem");
  const safeName = sanitizeFilename(filename);
  return writeExportFile(bytes, safeName, Directory.Cache, `exports/${safeName}`);
}

async function shareUrisOnCapacitor(uris: string[], title: string): Promise<void> {
  const { Share } = await import("@capacitor/share");

  if (uris.length === 1) {
    await Share.share({
      title,
      url: uris[0],
      dialogTitle: title,
    });
    return;
  }

  await Share.share({
    title,
    files: uris,
    dialogTitle: title,
  });
}

async function saveExportFileOnAndroid(
  bytes: Uint8Array,
  filename: string,
): Promise<WrittenExportFile | null> {
  const { Directory } = await import("@capacitor/filesystem");
  const safeName = sanitizeFilename(filename);

  logPdfExport("Generating PDF...");
  logPdfExport("File name:", safeName);

  await requestPublicStoragePermission();

  const attempts: { directory: typeof Directory.Documents; path: string; label: string }[] = [
    { directory: Directory.ExternalStorage, path: `Download/${safeName}`, label: "Download" },
    { directory: Directory.Documents, path: safeName, label: "Documents" },
  ];

  for (const attempt of attempts) {
    logPdfExport("Target directory:", attempt.label);
    try {
      const written = await writeExportFile(bytes, safeName, attempt.directory, attempt.path);
      logPdfExport("Generated URI:", written.uri);
      logPdfExport("Saved successfully:", attempt.label);
      return { ...written, directoryLabel: attempt.label };
    } catch (error) {
      logPdfExportError(
        `Save to ${attempt.label} failed`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  logPdfExport("Target directory:", "Cache + Enregistrer dans...");
  const cached = await writeExportFileToCache(bytes, safeName);
  logPdfExport("Generated URI:", cached.uri);
  try {
    await shareUrisOnCapacitor([cached.uri], "Enregistrer dans...");
    logPdfExport("Saved successfully:", "share-sheet");
    return { ...cached, directoryLabel: "Enregistrer dans..." };
  } catch (error) {
    if (isShareCanceled(error)) {
      logPdfExport("Saved successfully:", "canceled");
      return null;
    }
    throw error;
  }
}

/**
 * Write export bytes to Capacitor storage and deliver them.
 * Android: public Downloads/Documents + confirmation dialog.
 * iOS: Cache + Share Sheet.
 * Returns the filenames that were written/shared, or null if the user canceled.
 */
export async function shareExportFilesOnCapacitor(
  files: ExportBinaryFile[],
): Promise<string[] | null> {
  if (files.length === 0) return [];

  try {
    if (isAndroidCapacitorRuntime()) {
      const prepared: WrittenExportFile[] = [];
      for (const file of files) {
        const bytes = await toExportBytes(file.data);
        const written = await saveExportFileOnAndroid(bytes, file.filename);
        if (!written) return null;
        prepared.push(written);
      }

      const pdf = prepared.find((file) => isPdfFilename(file.filename)) ?? prepared[0];
      if (pdf && isPdfFilename(pdf.filename)) {
        presentPdfExportResult({
          filename: pdf.filename,
          uri: pdf.uri,
          directoryLabel: pdf.directoryLabel,
        });
      }

      return prepared.map((file) => file.filename);
    }

    const prepared = [];
    for (const file of files) {
      const bytes = await toExportBytes(file.data);
      prepared.push(await writeExportFileToCache(bytes, file.filename));
    }

    const uris = prepared.map((file) => file.uri);
    const title =
      prepared.length === 1
        ? prepared[0].filename
        : prepared.map((file) => file.filename).join(", ");

    try {
      await shareUrisOnCapacitor(uris, title);
      return prepared.map((file) => file.filename);
    } catch (error) {
      if (isShareCanceled(error)) return null;
      if (uris.length <= 1) throw error;

      for (const file of prepared) {
        try {
          await shareUrisOnCapacitor([file.uri], file.filename);
        } catch (inner) {
          if (isShareCanceled(inner)) return null;
          throw inner;
        }
      }
      return prepared.map((file) => file.filename);
    }
  } catch (error) {
    if (isShareCanceled(error)) return null;
    logPdfExportError(
      "Impossible d'enregistrer le PDF",
      error instanceof Error ? error.message : String(error),
    );
    throw wrapExportError("filesystem", error);
  }
}

/** True when exports should use Capacitor Share / Android file delivery instead of browser download. */
export function shouldShareExportsOnCapacitor(): boolean {
  return isNativeCapacitorRuntime();
}

/** True when the native Android confirmation already replaced the generic “downloaded” toast. */
export function shouldAnnounceBrowserPdfExport(): boolean {
  return !isAndroidCapacitorRuntime();
}
