import type { DocumentTemplateConfig } from "@/lib/reports-messages/document-templates/types";

export type TemplateValidationIssue = {
  fieldId: string;
  messageKey: string;
  /** Optional params for i18n */
  params?: Record<string, string | number>;
};

export function validateTemplateRequiredFields(
  config: DocumentTemplateConfig,
  values: Record<string, unknown>,
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];

  for (const field of config.fields) {
    if (!field.required) continue;
    const value = values[field.id];

    if (field.type === "signatories") {
      const list = Array.isArray(value) ? value : [];
      const hasEnabled = list.some((row) => {
        if (!row || typeof row !== "object") return false;
        const item = row as { enabled?: boolean; name?: string };
        return item.enabled !== false && Boolean(String(item.name ?? "").trim());
      });
      if (!hasEnabled) {
        issues.push({
          fieldId: field.id,
          messageKey: "reportsMessages.documentTemplates.validation.signatoryRequired",
        });
      }
      continue;
    }

    if (field.type === "string_list" || field.type === "attachments") {
      const list = Array.isArray(value)
        ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
        : [];
      if (list.length === 0) {
        issues.push({
          fieldId: field.id,
          messageKey: "reportsMessages.documentTemplates.validation.required",
          params: { field: field.id },
        });
      }
      continue;
    }

    const text = value == null ? "" : String(value).trim();
    if (!text) {
      if (field.id === "dogId" || field.type === "dog") {
        issues.push({
          fieldId: field.id,
          messageKey: "reportsMessages.documentTemplates.validation.dogRequired",
        });
      } else {
        issues.push({
          fieldId: field.id,
          messageKey: "reportsMessages.documentTemplates.validation.required",
          params: { field: field.id },
        });
      }
    }
  }

  return issues;
}
