/**
 * Platform-aware binary file delivery for exports (PDF, DOCX, …).
 *
 * Capacitor/iOS → Cache write + native Share Sheet (Save to Files / open in Word).
 * Browser/Electron download paths stay with their callers (doc.save, <a download>, IPC).
 */
import { uint8ArrayToBase64 } from "@/lib/documents/docx-binary";
import { wrapExportError } from "@/lib/documents/export-error";
import { isNativeCapacitorRuntime } from "@/lib/runtime-platform";

export type ExportBinaryInput = Uint8Array | ArrayBuffer | Blob;

export type ExportBinaryFile = {
  data: ExportBinaryInput;
  filename: string;
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

async function writeExportFileToCache(
  bytes: Uint8Array,
  filename: string,
): Promise<{ filename: string; uri: string }> {
  const { Directory, Filesystem } = await import("@capacitor/filesystem");
  const safeName = sanitizeFilename(filename);
  const path = `exports/${safeName}`;

  const written = await Filesystem.writeFile({
    path,
    data: uint8ArrayToBase64(bytes),
    directory: Directory.Cache,
    recursive: true,
  });

  let fileUri = written.uri;
  if (!fileUri) {
    const resolved = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });
    fileUri = resolved.uri;
  }

  if (!fileUri) {
    throw new Error(`Unable to resolve export file URI for ${safeName}`);
  }

  return { filename: safeName, uri: fileUri };
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

  // iOS/Android: share multiple file:// URLs in one sheet when supported.
  await Share.share({
    title,
    files: uris,
    dialogTitle: title,
  });
}

/**
 * Write export bytes to Capacitor Cache and open the native Share Sheet.
 * Prefer a single share for multiple files; fall back to sequential shares if needed.
 * Returns the filenames that were written/shared, or null if the user canceled.
 */
export async function shareExportFilesOnCapacitor(
  files: ExportBinaryFile[],
): Promise<string[] | null> {
  if (files.length === 0) return [];

  try {
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

      // Multi-file share failed — deliver sequentially so neither file is lost.
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
    throw wrapExportError("filesystem", error);
  }
}

/** True when exports should use Capacitor Share instead of browser download. */
export function shouldShareExportsOnCapacitor(): boolean {
  return isNativeCapacitorRuntime();
}
