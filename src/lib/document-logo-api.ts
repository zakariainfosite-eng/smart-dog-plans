import type { DbClient } from "@/integrations/database/client";
import { FP_OFFICIAL_LOGO_URL } from "@/lib/documents/feuille-presence-layout";
import {
  fetchDocumentSettingsOrDefault,
  type DocumentSettings,
} from "@/lib/document-settings";

export const DOCUMENT_LOGOS_BUCKET = "document-logos" as const;
export const DOCUMENT_LOGO_STORAGE_PATH = "header.png";
export const DOCUMENT_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_LOGO_ACCEPT = "image/png,image/jpeg,.png,.jpg,.jpeg";
export const DOCUMENT_LOGO_MAX_EDGE = 1024;

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

type Db = DbClient;

export function validateDocumentLogoFile(file: File): "invalidType" | "tooLarge" | null {
  if (!ALLOWED_MIME_TYPES.has(file.type)) return "invalidType";
  if (file.size > DOCUMENT_LOGO_MAX_BYTES) return "tooLarge";
  return null;
}

export function documentLogoStoragePathFromUrl(logoUrl: string): string | null {
  const localMarker = `cynoplanning-media://${DOCUMENT_LOGOS_BUCKET}/`;
  if (logoUrl.startsWith(localMarker)) {
    return decodeURIComponent(logoUrl.slice(localMarker.length));
  }
  return null;
}

export async function fileToDocumentLogoPng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, DOCUMENT_LOGO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("canvas");
  }
  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new Error("png");
  return blob;
}

export async function uploadDocumentLogo(db: Db, file: File): Promise<string> {
  const validation = validateDocumentLogoFile(file);
  if (validation) throw new Error(validation);
  const png = await fileToDocumentLogoPng(file);
  const { error } = await db.storage.from(DOCUMENT_LOGOS_BUCKET).upload(DOCUMENT_LOGO_STORAGE_PATH, png, {
    upsert: true,
    contentType: "image/png",
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);
  const { data } = db.storage.from(DOCUMENT_LOGOS_BUCKET).getPublicUrl(DOCUMENT_LOGO_STORAGE_PATH);
  return data.publicUrl;
}

export async function deleteDocumentLogo(db: Db, logoUrl: string | null | undefined): Promise<void> {
  if (!logoUrl) return;
  const path = documentLogoStoragePathFromUrl(logoUrl) ?? DOCUMENT_LOGO_STORAGE_PATH;
  const { error } = await db.storage.from(DOCUMENT_LOGOS_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function downloadDocumentLogoBytes(
  db: Db,
  logoUrl: string,
): Promise<Uint8Array | undefined> {
  const path = documentLogoStoragePathFromUrl(logoUrl);
  if (!path) return fetchLogoBytes(logoUrl);
  const { data, error } = await db.storage.from(DOCUMENT_LOGOS_BUCKET).download(path);
  if (error || !data) return undefined;
  return typeof data === "string" ? base64ToBytes(data) : undefined;
}

/** Custom document logo when configured, otherwise the official seal asset. */
export async function loadDocumentLogoBytes(
  db: Db,
  settings?: DocumentSettings,
): Promise<Uint8Array | undefined> {
  const resolved = settings ?? (await fetchDocumentSettingsOrDefault(db));
  if (resolved.logoUrl) {
    const custom = await downloadDocumentLogoBytes(db, resolved.logoUrl);
    if (custom && custom.byteLength > 0) return custom;
  }
  return fetchLogoBytes(FP_OFFICIAL_LOGO_URL);
}

export async function documentLogoPreviewSrc(
  db: Db,
  settings: DocumentSettings,
): Promise<string> {
  const bytes = await loadDocumentLogoBytes(db, settings);
  if (!bytes || bytes.byteLength === 0) return FP_OFFICIAL_LOGO_URL;
  const blob = new Blob([toArrayBuffer(bytes)], { type: "image/png" });
  return URL.createObjectURL(blob);
}

async function fetchLogoBytes(url: string): Promise<Uint8Array | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
