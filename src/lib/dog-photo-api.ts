import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import { randomId } from "@/lib/random-id";

export const DOG_PHOTOS_BUCKET = "dog-photos" as const;

export const DOG_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const DOG_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Db = DbClient;

export function validateDogPhotoFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return "invalidType";
  }
  if (file.size > DOG_PHOTO_MAX_BYTES) {
    return "tooLarge";
  }
  return null;
}

export function dogPhotoStoragePathFromUrl(photoUrl: string): string | null {
  const localMarker = `cynoplanning-media://${DOG_PHOTOS_BUCKET}/`;
  if (photoUrl.startsWith(localMarker)) {
    return decodeURIComponent(photoUrl.slice(localMarker.length));
  }
  const marker = `/storage/v1/object/public/${DOG_PHOTOS_BUCKET}/`;
  const idx = photoUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(photoUrl.slice(idx + marker.length));
}

export async function deleteDogPhotoByUrl(
  db: Db,
  photoUrl: string | null | undefined,
): Promise<void> {
  if (!photoUrl) return;
  const storagePath = dogPhotoStoragePathFromUrl(photoUrl);
  if (!storagePath) return;
  const { error } = await db.storage.from(DOG_PHOTOS_BUCKET).remove([storagePath]);
  if (error) throw error;
}

export async function uploadDogPhoto(
  db: Db,
  dogId: string,
  file: File,
): Promise<string> {
  const validationError = validateDogPhotoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const extension =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${dogId}/${randomId()}.${extension}`;

  const { error: uploadError } = await db.storage
    .from(DOG_PHOTOS_BUCKET)
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  const { data } = db.storage.from(DOG_PHOTOS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export function dogInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "?";
}
