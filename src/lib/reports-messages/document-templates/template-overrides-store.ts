/**
 * Admin-editable template overrides — persisted in application_settings.
 * Code registry (DOCUMENT_TEMPLATES) remains the default; overrides never delete documents.
 */

import type { AuthRole } from "@/integrations/auth/types";
import type { DbClient } from "@/integrations/database/client";
import { randomId } from "@/lib/random-id";
import type {
  DatabaseBinding,
  TemplateFieldType,
  TemplateSectionId,
} from "@/lib/reports-messages/document-templates/types";
import type { HeatDogTableFieldConfig } from "@/lib/reports-messages/document-templates/heat-dog-table-fields";
import { isHeatDogTableFieldId } from "@/lib/reports-messages/document-templates/heat-dog-table-fields";

export const DOCUMENT_TEMPLATES_SETTINGS_KEY = "document_templates";
export const DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY = [
  "application-settings",
  "document_templates",
] as const;

export const TEMPLATE_SNAPSHOT_PAYLOAD_KEY = "template_snapshot_v1";

export type FieldSourceKind = "database" | "manual" | "fixed" | "calculated";

export type TemplateSectionOverride = {
  id: TemplateSectionId;
  visible: boolean;
  title: string;
  showTitle: boolean;
  defaultText: string;
  /** Hide section when all listed field ids are empty */
  hideWhenEmptyFieldIds: string[];
  /** Show section only when this field has a value (e.g. dogId) */
  showWhenFieldFilled?: string;
};

export type TemplateFieldOverride = {
  id: string;
  label?: string;
  required?: boolean;
  visible?: boolean;
  source?: FieldSourceKind;
  binding?: DatabaseBinding | string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  fixedText?: string;
  type?: TemplateFieldType;
  section?: TemplateSectionId;
};

export type TemplateHeaderOverride = {
  organizationName: string;
  department: string;
  radioTitle: string;
};

export type TemplateSignatureSlotOverride = {
  nameHint: string;
  functionHint: string;
};

/** Message / Demande Destinataire row — left text + optional right-aligned city. */
export type TemplateDestinataireLineOverride = {
  left: string;
  right: string;
};

/** Message / Demande Expéditeur line (text after the EXPÉDITEUR : label). */
export type TemplateExpediteurLineOverride = {
  text: string;
};

export type SingleTemplateOverride = {
  active: boolean;
  updatedAt: string | null;
  subjectOverride: string;
  header: TemplateHeaderOverride;
  sections: TemplateSectionOverride[];
  fields: TemplateFieldOverride[];
  signatureSlots: TemplateSignatureSlotOverride[];
  /** Message / Demande only — multiline Destinataire block */
  destinataireLines: TemplateDestinataireLineOverride[];
  /** Message / Demande only — Expéditeur lines after the fixed label */
  expediteurLines: TemplateExpediteurLineOverride[];
  /**
   * Fixed report body with {{PLACEHOLDERS}} (heat dog and similar templated reports).
   * Empty → code default template.
   */
  reportBodyTemplate: string;
  /**
   * Legacy leftover (heat dog). Ignored at render time — Radio Départ stays on the
   * default 5 columns. Chiens list columns live only on PDF_CHIEN_TEMPLATE.
   */
  heatDogTableFields: HeatDogTableFieldConfig[];
};

export type DocumentTemplatesSettings = {
  byId: Record<string, SingleTemplateOverride>;
};

export function canEditDocumentTemplates(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}

export function emptyDocumentTemplatesSettings(): DocumentTemplatesSettings {
  return { byId: {} };
}

export function parseDocumentTemplatesSettings(value: unknown): DocumentTemplatesSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyDocumentTemplatesSettings();
  }
  const source = value as Record<string, unknown>;
  const rawById = source.byId;
  if (!rawById || typeof rawById !== "object" || Array.isArray(rawById)) {
    return emptyDocumentTemplatesSettings();
  }
  const byId: Record<string, SingleTemplateOverride> = {};
  for (const [id, raw] of Object.entries(rawById as Record<string, unknown>)) {
    const parsed = parseSingleOverride(raw);
    if (parsed) byId[id] = parsed;
  }
  return { byId };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function parseSingleOverride(raw: unknown): SingleTemplateOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const headerRaw = (o.header && typeof o.header === "object" ? o.header : {}) as Record<
    string,
    unknown
  >;
  const sections = Array.isArray(o.sections)
    ? o.sections
        .map((row) => parseSectionOverride(row))
        .filter((row): row is TemplateSectionOverride => Boolean(row))
    : [];
  const fields = Array.isArray(o.fields)
    ? o.fields
        .map((row) => parseFieldOverride(row))
        .filter((row): row is TemplateFieldOverride => Boolean(row))
    : [];
  const signatureSlots = Array.isArray(o.signatureSlots)
    ? o.signatureSlots.map((row) => {
        const s = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return {
          nameHint: asString(s.nameHint),
          functionHint: asString(s.functionHint),
        };
      })
    : [];
  const destinataireLines = Array.isArray(o.destinataireLines)
    ? o.destinataireLines.map((row) => {
        const s = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return {
          left: asString(s.left),
          right: asString(s.right),
        };
      })
    : [];
  const expediteurLines = Array.isArray(o.expediteurLines)
    ? o.expediteurLines.map((row) => {
        if (typeof row === "string") return { text: asString(row) };
        const s = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return { text: asString(s.text) };
      })
    : [];
  const reportBodyTemplate = asString(o.reportBodyTemplate);
  const heatDogTableFields: HeatDogTableFieldConfig[] = Array.isArray(o.heatDogTableFields)
    ? o.heatDogTableFields.flatMap((row) => {
        const s = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        const id = asString(s.id);
        if (!isHeatDogTableFieldId(id)) return [];
        return [{ id, enabled: s.enabled !== false && s.enabled !== 0 }];
      })
    : [];

  return {
    active: o.active !== false,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null,
    subjectOverride: asString(o.subjectOverride),
    header: {
      organizationName: asString(headerRaw.organizationName),
      department: asString(headerRaw.department),
      radioTitle: asString(headerRaw.radioTitle),
    },
    sections,
    fields,
    signatureSlots,
    destinataireLines,
    expediteurLines,
    reportBodyTemplate,
    heatDogTableFields,
  };
}

function parseSectionOverride(raw: unknown): TemplateSectionOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = asString(o.id) as TemplateSectionId;
  if (!id) return null;
  return {
    id,
    visible: o.visible !== false,
    title: asString(o.title),
    showTitle: o.showTitle !== false,
    defaultText: asString(o.defaultText),
    hideWhenEmptyFieldIds: Array.isArray(o.hideWhenEmptyFieldIds)
      ? o.hideWhenEmptyFieldIds.map((item) => asString(item)).filter(Boolean)
      : [],
    showWhenFieldFilled: asString(o.showWhenFieldFilled) || undefined,
  };
}

function parseFieldOverride(raw: unknown): TemplateFieldOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = asString(o.id);
  if (!id) return null;
  return {
    id,
    label: o.label != null ? asString(o.label) : undefined,
    required: typeof o.required === "boolean" ? o.required : undefined,
    visible: typeof o.visible === "boolean" ? o.visible : undefined,
    source: parseSource(o.source),
    binding: o.binding != null ? asString(o.binding) : undefined,
    defaultValue: o.defaultValue != null ? asString(o.defaultValue) : undefined,
    placeholder: o.placeholder != null ? asString(o.placeholder) : undefined,
    multiline: typeof o.multiline === "boolean" ? o.multiline : undefined,
    fixedText: o.fixedText != null ? asString(o.fixedText) : undefined,
    type: o.type != null ? (asString(o.type) as TemplateFieldType) : undefined,
    section: o.section != null ? (asString(o.section) as TemplateSectionId) : undefined,
  };
}

function parseSource(value: unknown): FieldSourceKind | undefined {
  if (value === "database" || value === "manual" || value === "fixed" || value === "calculated") {
    return value;
  }
  return undefined;
}

type SettingsRow = { id: string; key: string; value: unknown };

async function findRow(db: DbClient): Promise<SettingsRow | null> {
  const { data, error } = await db
    .from("application_settings")
    .select("id, key, value")
    .eq("key", DOCUMENT_TEMPLATES_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SettingsRow | null) ?? null;
}

export async function fetchDocumentTemplatesSettings(
  db: DbClient,
): Promise<DocumentTemplatesSettings> {
  const row = await findRow(db);
  if (!row) return emptyDocumentTemplatesSettings();
  return parseDocumentTemplatesSettings(row.value);
}

export async function fetchDocumentTemplatesSettingsOrDefault(
  db: DbClient,
): Promise<DocumentTemplatesSettings> {
  try {
    return await fetchDocumentTemplatesSettings(db);
  } catch {
    return emptyDocumentTemplatesSettings();
  }
}

export async function saveDocumentTemplatesSettings(
  db: DbClient,
  input: DocumentTemplatesSettings,
): Promise<DocumentTemplatesSettings> {
  const normalized = parseDocumentTemplatesSettings(input);
  const timestamp = new Date().toISOString();
  const existing = await findRow(db);

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
    key: DOCUMENT_TEMPLATES_SETTINGS_KEY,
    value: normalized,
    description: "Rapports & Messages — document template overrides",
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (error) throw new Error(error.message);
  return normalized;
}

export async function upsertSingleTemplateOverride(
  db: DbClient,
  templateId: string,
  override: SingleTemplateOverride,
): Promise<DocumentTemplatesSettings> {
  const current = await fetchDocumentTemplatesSettingsOrDefault(db);
  const next: DocumentTemplatesSettings = {
    byId: {
      ...current.byId,
      [templateId]: {
        ...override,
        updatedAt: new Date().toISOString(),
      },
    },
  };
  return saveDocumentTemplatesSettings(db, next);
}

export async function clearSingleTemplateOverride(
  db: DbClient,
  templateId: string,
): Promise<DocumentTemplatesSettings> {
  const current = await fetchDocumentTemplatesSettingsOrDefault(db);
  const byId = { ...current.byId };
  delete byId[templateId];
  return saveDocumentTemplatesSettings(db, { byId });
}
