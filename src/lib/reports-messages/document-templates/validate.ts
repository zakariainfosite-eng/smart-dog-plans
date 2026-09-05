import type { DocumentTemplateConfig } from "@/lib/reports-messages/document-templates/types";

export type TemplateValidationIssue = {
  fieldId: string;
  messageKey: string;
  /** Optional params for i18n */
  params?: Record<string, string | number>;
};

export function validateTemplateRequiredFields(
  _config: DocumentTemplateConfig,
  _values: Record<string, unknown>,
): TemplateValidationIssue[] {
  return [];
}
