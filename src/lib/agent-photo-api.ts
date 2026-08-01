import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import { randomId } from "@/lib/random-id";

export const AGENT_PHOTOS_BUCKET = "agent-photos" as const;

export const AGENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const AGENT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Db = DbClient;

export function validateAgentPhotoFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return "invalidType";
  }
  if (file.size > AGENT_PHOTO_MAX_BYTES) {
    return "tooLarge";
  }
  return null;
}

export function agentPhotoStoragePathFromUrl(photoUrl: string): string | null {
  const localMarker = `cynoplanning-media://${AGENT_PHOTOS_BUCKET}/`;
  if (photoUrl.startsWith(localMarker)) {
    return decodeURIComponent(photoUrl.slice(localMarker.length));
  }
  const marker = `/storage/v1/object/public/${AGENT_PHOTOS_BUCKET}/`;
  const idx = photoUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(photoUrl.slice(idx + marker.length));
}

export async function deleteAgentPhotoByUrl(db: Db, photoUrl: string | null | undefined): Promise<void> {
  if (!photoUrl) return;
  const storagePath = agentPhotoStoragePathFromUrl(photoUrl);
  if (!storagePath) return;
  const { error } = await db.storage.from(AGENT_PHOTOS_BUCKET).remove([storagePath]);
  if (error) throw error;
}

export async function uploadAgentPhoto(
  db: Db,
  agentId: string,
  file: File,
): Promise<string> {
  const validationError = validateAgentPhotoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const extension = file.type === "image/png"
    ? "png"
    : file.type === "image/webp"
      ? "webp"
      : "jpg";
  const storagePath = `${agentId}/${randomId()}.${extension}`;

  const { error: uploadError } = await db.storage
    .from(AGENT_PHOTOS_BUCKET)
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  const { data } = db.storage.from(AGENT_PHOTOS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export function agentInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}
