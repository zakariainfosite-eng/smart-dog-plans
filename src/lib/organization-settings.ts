import type { AuthRole } from "@/integrations/auth/types";
import type { DbClient } from "@/integrations/database/client";
import { randomId } from "@/lib/random-id";

/** Stored in application_settings.key — do not collide with other setting keys. */
export const ORGANIZATION_SETTINGS_KEY = "organisation";
/** Legacy/English alias if a row was created under this key. */
export const ORGANIZATION_SETTINGS_KEY_ALIASES = ["organization"] as const;

export const ORGANIZATION_SETTINGS_QUERY_KEY = ["application-settings", "organisation"] as const;

export type OrganizationSettings = {
  unitName: string;
  serviceName: string;
  city: string;
  country: string;
  address: string;
  phone: string;
  email: string;
  notes: string;
};

export type OrganizationField = keyof OrganizationSettings;

export type OrganizationValidationIssue = "required" | "email" | "phone";

export type OrganizationValidationErrors = Partial<Record<OrganizationField, OrganizationValidationIssue>>;

/** Defaults aligned with the current CynoPlanning unit identity used in copy and documents. */
export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  unitName: "Brigade cynotechnique",
  serviceName: "Brigade cynotechnique",
  city: "Tanger",
  country: "Maroc",
  address: "",
  phone: "",
  email: "",
  notes: "",
};

type OrganizationSettingsRow = {
  id: string;
  key: string;
  value: unknown;
};

export function canEditOrganizationSettings(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") return value;
  }
  return "";
}

export function parseOrganizationSettings(value: unknown): OrganizationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_ORGANIZATION_SETTINGS };
  }
  const source = value as Record<string, unknown>;
  return {
    unitName:
      pickString(source, "unitName", "unit_name", "organisationName", "organizationName") ||
      DEFAULT_ORGANIZATION_SETTINGS.unitName,
    serviceName: pickString(source, "serviceName", "service_name") || DEFAULT_ORGANIZATION_SETTINGS.serviceName,
    city: pickString(source, "city") || DEFAULT_ORGANIZATION_SETTINGS.city,
    country: pickString(source, "country") || DEFAULT_ORGANIZATION_SETTINGS.country,
    address: pickString(source, "address"),
    phone: pickString(source, "phone", "phoneNumber", "phone_number"),
    email: pickString(source, "email"),
    notes: pickString(source, "notes", "additionalInformation", "additional_information"),
  };
}

export function normalizeOrganizationSettings(input: OrganizationSettings): OrganizationSettings {
  return {
    unitName: input.unitName.trim(),
    serviceName: input.serviceName.trim(),
    city: input.city.trim(),
    country: input.country.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    notes: input.notes.trim(),
  };
}

export function isValidOrganizationEmail(value: string): boolean {
  const email = value.trim();
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidOrganizationPhone(value: string): boolean {
  const phone = value.trim();
  if (!phone) return true;
  const compact = phone.replace(/[\s./()-]/g, "");
  if (/^00[0-9]{8,13}$/.test(compact)) return true;
  return /^\+?[0-9]{8,15}$/.test(compact);
}

export function validateOrganizationSettings(input: OrganizationSettings): OrganizationValidationErrors {
  const normalized = normalizeOrganizationSettings(input);
  const errors: OrganizationValidationErrors = {};
  if (!normalized.unitName) errors.unitName = "required";
  if (!normalized.serviceName) errors.serviceName = "required";
  if (!normalized.city) errors.city = "required";
  if (!normalized.country) errors.country = "required";
  if (!isValidOrganizationEmail(normalized.email)) errors.email = "email";
  if (!isValidOrganizationPhone(normalized.phone)) errors.phone = "phone";
  return errors;
}

export function organizationSettingsEqual(a: OrganizationSettings, b: OrganizationSettings): boolean {
  const left = normalizeOrganizationSettings(a);
  const right = normalizeOrganizationSettings(b);
  return (
    left.unitName === right.unitName &&
    left.serviceName === right.serviceName &&
    left.city === right.city &&
    left.country === right.country &&
    left.address === right.address &&
    left.phone === right.phone &&
    left.email === right.email &&
    left.notes === right.notes
  );
}

/**
 * Compact identity for future PDF/Word headers and footers.
 * Existing generators still use hardcoded official header lines and are not rewritten here.
 */
export function toOrganizationDocumentContext(settings: OrganizationSettings): OrganizationSettings {
  return normalizeOrganizationSettings(settings);
}

function nowIso(): string {
  return new Date().toISOString();
}

async function findOrganizationSettingsRow(db: DbClient): Promise<OrganizationSettingsRow | null> {
  const keys = [ORGANIZATION_SETTINGS_KEY, ...ORGANIZATION_SETTINGS_KEY_ALIASES];
  for (const key of keys) {
    const { data, error } = await db
      .from("application_settings")
      .select("id, key, value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as OrganizationSettingsRow;
  }
  return null;
}

export async function fetchOrganizationSettings(db: DbClient): Promise<OrganizationSettings> {
  const row = await findOrganizationSettingsRow(db);
  if (!row) return { ...DEFAULT_ORGANIZATION_SETTINGS };
  return parseOrganizationSettings(row.value);
}

export async function saveOrganizationSettings(
  db: DbClient,
  input: OrganizationSettings,
): Promise<OrganizationSettings> {
  const normalized = normalizeOrganizationSettings(input);
  const errors = validateOrganizationSettings(normalized);
  if (Object.keys(errors).length > 0) {
    throw new Error("Invalid organisation settings");
  }

  const timestamp = nowIso();
  const existing = await findOrganizationSettingsRow(db);

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
    key: ORGANIZATION_SETTINGS_KEY,
    value: normalized,
    description: "Organisation / unit identity",
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (error) throw new Error(error.message);
  return normalized;
}
