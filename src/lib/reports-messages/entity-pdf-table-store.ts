/**
 * Entity-scoped PDF list table templates.
 * Stored in application_settings — independent of Gestion des modèles document overrides.
 *
 *   PDF_CHIEN_TEMPLATE         → liste PDF des chiens (page Chiens)
 *   PDF_FUNCTIONNAIRE_TEMPLATE → liste PDF / fiche des fonctionnaires
 */

import type { AuthRole } from "@/integrations/auth/types";
import type { DbClient } from "@/integrations/database/client";
import { randomId } from "@/lib/random-id";
import { HEAT_DOG_REPORT_TEMPLATE_ID } from "@/lib/reports-messages/document-templates/heat-dog-report";
import {
  defaultChienPdfTableFields,
  DEFAULT_CHIEN_PDF_MIN_AGE_YEARS,
  DEFAULT_CHIEN_PDF_SEX_FILTER,
  isChienPdfTableFieldId,
  normalizeChienPdfMinAgeYears,
  normalizeChienPdfSexFilter,
  normalizeChienPdfTableFieldConfigs,
  type ChienPdfMinAgeYears,
  type ChienPdfSexFilter,
  type ChienPdfTableFieldConfig,
} from "@/lib/reports-messages/chien-pdf-table-fields";
import {
  DEFAULT_FONCTIONNAIRE_PDF_LIST_SCOPE,
  defaultFonctionnairePdfTableFields,
  isFonctionnairePdfTableFieldId,
  normalizeFonctionnairePdfListScope,
  normalizeFonctionnairePdfTableFieldConfigs,
  type FonctionnairePdfListScope,
  type FonctionnairePdfTableFieldConfig,
} from "@/lib/reports-messages/fonctionnaire-pdf-table-fields";
import {
  fetchDocumentTemplatesSettingsOrDefault,
  saveDocumentTemplatesSettings,
} from "@/lib/reports-messages/document-templates/template-overrides-store";

export const PDF_CHIEN_TEMPLATE_SETTINGS_KEY = "PDF_CHIEN_TEMPLATE";
export const PDF_FUNCTIONNAIRE_TEMPLATE_SETTINGS_KEY = "PDF_FUNCTIONNAIRE_TEMPLATE";

export type EntityPdfTableKind = "chien" | "fonctionnaire";

export type EntityPdfTableFieldConfig = {
  id: string;
  enabled: boolean;
};

export type EntityPdfTableTemplate = {
  fields: EntityPdfTableFieldConfig[];
  /** Fonctionnaires list PDF row filter. Ignored for Chiens. */
  listScope?: FonctionnairePdfListScope;
  /** Chiens list PDF sex filter. Ignored for Fonctionnaires. */
  sexFilter?: ChienPdfSexFilter;
  /** Chiens list PDF minimum age in years, or "all". Ignored for Fonctionnaires. */
  minAgeYears?: ChienPdfMinAgeYears;
  updatedAt: string | null;
};

export type FonctionnairePdfTemplate = {
  fields: FonctionnairePdfTableFieldConfig[];
  listScope: FonctionnairePdfListScope;
};

export type ChienPdfTemplate = {
  fields: ChienPdfTableFieldConfig[];
  sexFilter: ChienPdfSexFilter;
  minAgeYears: ChienPdfMinAgeYears;
};

type SettingsRow = { id: string; key: string; value: unknown };

export const ENTITY_PDF_TABLE_QUERY_KEY = {
  chien: ["application-settings", PDF_CHIEN_TEMPLATE_SETTINGS_KEY] as const,
  fonctionnaire: ["application-settings", PDF_FUNCTIONNAIRE_TEMPLATE_SETTINGS_KEY] as const,
};

export function canEditEntityPdfTable(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}

export function entityPdfTableSettingsKey(kind: EntityPdfTableKind): string {
  return kind === "chien"
    ? PDF_CHIEN_TEMPLATE_SETTINGS_KEY
    : PDF_FUNCTIONNAIRE_TEMPLATE_SETTINGS_KEY;
}

function parseFieldList(raw: unknown): EntityPdfTableFieldConfig[] {
  if (!Array.isArray(raw)) return [];
  const next: EntityPdfTableFieldConfig[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const s = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const id = typeof s.id === "string" ? s.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push({
      id,
      enabled: s.enabled !== false && s.enabled !== 0,
    });
  }
  return next;
}

export function parseEntityPdfTableTemplate(value: unknown): EntityPdfTableTemplate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { fields: [], listScope: DEFAULT_FONCTIONNAIRE_PDF_LIST_SCOPE, updatedAt: null };
  }
  const source = value as Record<string, unknown>;
  return {
    fields: parseFieldList(source.fields),
    listScope: normalizeFonctionnairePdfListScope(source.listScope),
    sexFilter: normalizeChienPdfSexFilter(source.sexFilter),
    minAgeYears: normalizeChienPdfMinAgeYears(source.minAgeYears),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

function asChienFields(rows: EntityPdfTableFieldConfig[]): ChienPdfTableFieldConfig[] {
  return rows.flatMap((row) =>
    isChienPdfTableFieldId(row.id) ? [{ id: row.id, enabled: Boolean(row.enabled) }] : [],
  );
}

function asFonctionnaireFields(
  rows: EntityPdfTableFieldConfig[],
): FonctionnairePdfTableFieldConfig[] {
  return rows.flatMap((row) =>
    isFonctionnairePdfTableFieldId(row.id)
      ? [{ id: row.id, enabled: Boolean(row.enabled) }]
      : [],
  );
}

async function findRow(db: DbClient, key: string): Promise<SettingsRow | null> {
  const { data, error } = await db
    .from("application_settings")
    .select("id, key, value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SettingsRow | null) ?? null;
}

async function upsertSettingsValue(
  db: DbClient,
  key: string,
  value: EntityPdfTableTemplate,
  description: string,
): Promise<EntityPdfTableTemplate> {
  const timestamp = new Date().toISOString();
  const payload: EntityPdfTableTemplate = { ...value, updatedAt: timestamp };
  const existing = await findRow(db, key);
  if (existing) {
    const { error } = await db
      .from("application_settings")
      .update({ value: payload, updated_at: timestamp })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return payload;
  }
  const { error } = await db.from("application_settings").insert({
    id: randomId(),
    key,
    value: payload,
    description,
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (error) throw new Error(error.message);
  return payload;
}

async function clearLegacyHeatDogTableFields(db: DbClient): Promise<void> {
  const settings = await fetchDocumentTemplatesSettingsOrDefault(db);
  const current = settings.byId[HEAT_DOG_REPORT_TEMPLATE_ID];
  if (!current || !current.heatDogTableFields || current.heatDogTableFields.length === 0) {
    return;
  }
  const next = {
    byId: {
      ...settings.byId,
      [HEAT_DOG_REPORT_TEMPLATE_ID]: {
        ...current,
        heatDogTableFields: [],
      },
    },
  };
  await saveDocumentTemplatesSettings(db, next);
}

async function migrateChienPdfTableTemplate(db: DbClient): Promise<ChienPdfTemplate> {
  const chienRow = await findRow(db, PDF_CHIEN_TEMPLATE_SETTINGS_KEY);
  const storedChien = parseEntityPdfTableTemplate(chienRow?.value ?? null);
  const fields = normalizeChienPdfTableFieldConfigs(asChienFields(storedChien.fields));
  const docs = await fetchDocumentTemplatesSettingsOrDefault(db);
  const legacy = docs.byId[HEAT_DOG_REPORT_TEMPLATE_ID]?.heatDogTableFields ?? [];
  if (legacy.length > 0) {
    await clearLegacyHeatDogTableFields(db);
  }
  return {
    fields,
    sexFilter: normalizeChienPdfSexFilter(storedChien.sexFilter),
    minAgeYears: normalizeChienPdfMinAgeYears(storedChien.minAgeYears),
  };
}

export async function fetchChienPdfTemplate(db: DbClient): Promise<ChienPdfTemplate> {
  try {
    return await migrateChienPdfTableTemplate(db);
  } catch {
    return {
      fields: defaultChienPdfTableFields(),
      sexFilter: DEFAULT_CHIEN_PDF_SEX_FILTER,
      minAgeYears: DEFAULT_CHIEN_PDF_MIN_AGE_YEARS,
    };
  }
}

export async function fetchChienPdfTableFields(db: DbClient): Promise<ChienPdfTableFieldConfig[]> {
  const template = await fetchChienPdfTemplate(db);
  return template.fields;
}

export async function fetchFonctionnairePdfTemplate(
  db: DbClient,
): Promise<FonctionnairePdfTemplate> {
  try {
    const row = await findRow(db, PDF_FUNCTIONNAIRE_TEMPLATE_SETTINGS_KEY);
    const parsed = parseEntityPdfTableTemplate(row?.value ?? null);
    return {
      fields: normalizeFonctionnairePdfTableFieldConfigs(asFonctionnaireFields(parsed.fields)),
      listScope: normalizeFonctionnairePdfListScope(parsed.listScope),
    };
  } catch {
    return {
      fields: defaultFonctionnairePdfTableFields(),
      listScope: DEFAULT_FONCTIONNAIRE_PDF_LIST_SCOPE,
    };
  }
}

export async function fetchFonctionnairePdfTableFields(
  db: DbClient,
): Promise<FonctionnairePdfTableFieldConfig[]> {
  const template = await fetchFonctionnairePdfTemplate(db);
  return template.fields;
}

export async function fetchEntityPdfTableFields(
  db: DbClient,
  kind: EntityPdfTableKind,
): Promise<EntityPdfTableFieldConfig[]> {
  if (kind === "chien") return fetchChienPdfTableFields(db);
  return fetchFonctionnairePdfTableFields(db);
}

export async function saveChienPdfTemplate(
  db: DbClient,
  input: {
    fields: EntityPdfTableFieldConfig[];
    sexFilter: ChienPdfSexFilter | null | undefined;
    minAgeYears: ChienPdfMinAgeYears | null | undefined;
  },
): Promise<ChienPdfTemplate> {
  const fields = normalizeChienPdfTableFieldConfigs(asChienFields(input.fields));
  const sexFilter = normalizeChienPdfSexFilter(input.sexFilter);
  const minAgeYears = normalizeChienPdfMinAgeYears(input.minAgeYears);
  await upsertSettingsValue(
    db,
    PDF_CHIEN_TEMPLATE_SETTINGS_KEY,
    { fields, sexFilter, minAgeYears, updatedAt: null },
    "PDF_CHIEN_TEMPLATE — columns and list filters for the chiens list PDF",
  );
  return { fields, sexFilter, minAgeYears };
}

export async function saveFonctionnairePdfTemplate(
  db: DbClient,
  input: {
    fields: EntityPdfTableFieldConfig[];
    listScope: FonctionnairePdfListScope | null | undefined;
  },
): Promise<FonctionnairePdfTemplate> {
  const fields = normalizeFonctionnairePdfTableFieldConfigs(asFonctionnaireFields(input.fields));
  const listScope = normalizeFonctionnairePdfListScope(input.listScope);
  await upsertSettingsValue(
    db,
    PDF_FUNCTIONNAIRE_TEMPLATE_SETTINGS_KEY,
    { fields, listScope, updatedAt: null },
    "PDF_FUNCTIONNAIRE_TEMPLATE — columns and list scope for the fonctionnaires list PDF",
  );
  return { fields, listScope };
}

export async function saveEntityPdfTableFields(
  db: DbClient,
  kind: EntityPdfTableKind,
  fields: EntityPdfTableFieldConfig[],
): Promise<EntityPdfTableFieldConfig[]> {
  if (kind === "chien") {
    const current = await fetchChienPdfTemplate(db);
    const saved = await saveChienPdfTemplate(db, {
      fields,
      sexFilter: current.sexFilter,
      minAgeYears: current.minAgeYears,
    });
    return saved.fields;
  }
  const current = await fetchFonctionnairePdfTemplate(db);
  const saved = await saveFonctionnairePdfTemplate(db, {
    fields,
    listScope: current.listScope,
  });
  return saved.fields;
}

export function defaultEntityPdfTableFields(kind: EntityPdfTableKind): EntityPdfTableFieldConfig[] {
  return kind === "chien" ? defaultChienPdfTableFields() : defaultFonctionnairePdfTableFields();
}
