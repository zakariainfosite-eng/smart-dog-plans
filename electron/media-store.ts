/**
 * Local media files under Electron userData/media/{bucket}/...
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import type { App } from "electron";

function mediaRoot(app: App): string {
  return join(app.getPath("userData"), "media");
}

function resolveSafePath(app: App, bucket: string, path: string): string {
  const root = join(mediaRoot(app), bucket);
  const target = normalize(join(root, path));
  if (!target.startsWith(normalize(root))) {
    throw new Error("Invalid media path");
  }
  return target;
}

export function saveMediaFile(
  app: App,
  bucket: string,
  path: string,
  dataBase64: string,
  upsert: boolean,
): { error: { message: string } | null } {
  try {
    const filePath = resolveSafePath(app, bucket, path);
    if (!upsert && existsSync(filePath)) {
      return { error: { message: "The resource already exists" } };
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, Buffer.from(dataBase64, "base64"));
    return { error: null };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export function removeMediaFiles(
  app: App,
  bucket: string,
  paths: string[],
): { error: { message: string } | null } {
  try {
    for (const path of paths) {
      const filePath = resolveSafePath(app, bucket, path);
      if (existsSync(filePath)) unlinkSync(filePath);
    }
    return { error: null };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export function readMediaFile(
  app: App,
  bucket: string,
  path: string,
): { data: Uint8Array | null; error: { message: string } | null } {
  try {
    const filePath = resolveSafePath(app, bucket, path);
    if (!existsSync(filePath)) {
      return { data: null, error: { message: "Object not found" } };
    }
    return { data: new Uint8Array(readFileSync(filePath)), error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export function getMediaAbsolutePath(app: App, bucket: string, path: string): string {
  return resolveSafePath(app, bucket, path);
}
