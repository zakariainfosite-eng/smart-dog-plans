import type { AuthRole } from "@/integrations/auth/types";
import type { DbClient } from "@/integrations/database/client";
import { randomId } from "@/lib/random-id";

export const DOCUMENT_SETTINGS_KEY = "documents";
export const DOCUMENT_SETTINGS_QUERY_KEY = ["application-settings", "documents"] as const;

export type DocumentPageFormat = "a4";
export type DocumentOrientation = "portrait" | "landscape";
export type DocumentLocale = "fr" | "ar";

export type DocumentSettings = {
  pageFormat: DocumentPageFormat;
  orientation: DocumentOrientation;
  footerText: string;
  pageNumbers: boolean;
  documentLocale: DocumentLocale;
  /** Custom document logo (`cynoplanning-media://…`). Null = official seal. */
  logoUrl: string | null;
};

type DocumentSettingsRow = {
  id: string;
  key: string;
  value: unknown;
};

/** Matches current generic report PDFs (A4 portrait, no extra footer, no page numbers). */
export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  pageFormat: "a4",
  orientation: "portrait",
  footerText: "",
  pageNumbers: false,
  documentLocale: "fr",
  logoUrl: null,
};

export function canEditDocumentSettings(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}

export function parseDocumentSettings(value: unknown): DocumentSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return cloneDocumentSettings(DEFAULT_DOCUMENT_SETTINGS);
  }
  const source = value as Record<string, unknown>;
  return normalizeDocumentSettings({
    pageFormat: "a4",
    orientation: parseOrientation(source),
    footerText: pickString(source, "footerText", "footer_text", "footer"),
    pageNumbers: parseBoolean(source.pageNumbers ?? source.page_numbers, false),
    documentLocale: parseDocumentLocale(source),
    logoUrl: parseLogoUrl(source),
  });
}

export function normalizeDocumentSettings(input: DocumentSettings): DocumentSettings {
  const footerText = input.footerText.trim();
  return {
    pageFormat: "a4",
    orientation: input.orientation === "landscape" ? "landscape" : "portrait",
    footerText,
    pageNumbers: Boolean(input.pageNumbers),
    documentLocale: input.documentLocale === "ar" ? "ar" : "fr",
    logoUrl: input.logoUrl?.trim() ? input.logoUrl.trim() : null,
  };
}

export function documentSettingsEqual(a: DocumentSettings, b: DocumentSettings): boolean {
  const left = normalizeDocumentSettings(a);
  const right = normalizeDocumentSettings(b);
  return (
    left.pageFormat === right.pageFormat &&
    left.orientation === right.orientation &&
    left.footerText === right.footerText &&
    left.pageNumbers === right.pageNumbers &&
    left.documentLocale === right.documentLocale &&
    left.logoUrl === right.logoUrl
  );
}

export async function fetchDocumentSettings(db: DbClient): Promise<DocumentSettings> {
  const row = await findDocumentSettingsRow(db);
  if (!row) return cloneDocumentSettings(DEFAULT_DOCUMENT_SETTINGS);
  return parseDocumentSettings(row.value);
}

export async function fetchDocumentSettingsOrDefault(db: DbClient): Promise<DocumentSettings> {
  try {
    return await fetchDocumentSettings(db);
  } catch {
    return cloneDocumentSettings(DEFAULT_DOCUMENT_SETTINGS);
  }
}

export async function saveDocumentSettings(
  db: DbClient,
  input: DocumentSettings,
): Promise<DocumentSettings> {
  const normalized = normalizeDocumentSettings(input);
  const timestamp = nowIso();
  const existing = await findDocumentSettingsRow(db);

  if (existing) {
    const { error } = await db
      .from("application_settings")
      .update({
        value: normalized,
        updated_at: timestamp,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return normalized;
  }

  const { error } = await db.from("application_settings").insert({
    id: randomId(),
    key: DOCUMENT_SETTINGS_KEY,
    value: normalized,
    description: "Document and PDF presentation settings",
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (error) throw new Error(error.message);
  return normalized;
}

async function findDocumentSettingsRow(db: DbClient): Promise<DocumentSettingsRow | null> {
  const { data, error } = await db
    .from("application_settings")
    .select("id, key, value")
    .eq("key", DOCUMENT_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as DocumentSettingsRow) : null;
}

function parseOrientation(source: Record<string, unknown>): DocumentOrientation {
  const value = pickString(source, "orientation");
  return value === "landscape" ? "landscape" : "portrait";
}

function parseDocumentLocale(source: Record<string, unknown>): DocumentLocale {
  const value = pickString(source, "documentLocale", "document_locale", "locale");
  return value === "ar" ? "ar" : "fr";
}

function parseLogoUrl(source: Record<string, unknown>): string | null {
  const value = pickString(source, "logoUrl", "logo_url");
  return value || null;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function cloneDocumentSettings(settings: DocumentSettings): DocumentSettings {
  return { ...settings };
}

function nowIso(): string {
  return new Date().toISOString();
}
