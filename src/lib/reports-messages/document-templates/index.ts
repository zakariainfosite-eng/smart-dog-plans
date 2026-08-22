export type {
  DatabaseBinding,
  DocumentMetaV1,
  DocumentTemplateConfig,
  DocumentWorkflowStatus,
  TemplateBuilderId,
  TemplateFieldDefinition,
  TemplateFieldType,
  TemplateSectionId,
} from "@/lib/reports-messages/document-templates/types";

export {
  DOCUMENT_META_PAYLOAD_KEY,
} from "@/lib/reports-messages/document-templates/types";

export {
  DOCUMENT_TEMPLATES,
  getActiveDocumentTemplates,
  getDocumentTemplateConfig,
  isEngineBackedTemplate,
} from "@/lib/reports-messages/document-templates/registry";

export {
  buildDatabaseLinkContext,
  resolveDatabaseBinding,
} from "@/lib/reports-messages/document-templates/resolve-bindings";

export {
  getDocumentWorkflowStatus,
  markPayloadExported,
  parseDocumentMeta,
  withDocumentMeta,
} from "@/lib/reports-messages/document-templates/status";

export {
  validateTemplateRequiredFields,
  type TemplateValidationIssue,
} from "@/lib/reports-messages/document-templates/validate";

export {
  buildOfficialDocumentFromTemplate,
  exportOfficialDocumentFromTemplate,
} from "@/lib/reports-messages/document-templates/engine";

export {
  MESSAGE_DEMANDE_PAYLOAD_BLOB_KEY,
  MESSAGE_DEMANDE_FIXED_EXPEDITEUR,
  MESSAGE_DEMANDE_FIXED_EXPEDITEUR_LINES,
  MESSAGE_DEMANDE_FIXED_RECIPIENT_LINES,
  createDefaultMessageDemandeFormData,
  createEmptyMessageSignatory,
  countMessageDemandeWords,
  messageDemandeValuesForValidation,
  parseMessageDemandeFormData,
  serializeMessageDemandeFormData,
  type MessageDemandeEndorsement,
  type MessageDemandeFormData,
} from "@/lib/reports-messages/document-templates/message-demande";

export {
  HEAT_DOG_REPORT_TEMPLATE_ID,
  HEAT_DOG_REPORT_PAYLOAD_BLOB_KEY,
  DEFAULT_HEAT_DOG_REPORT_BODY_TEMPLATE,
  createDefaultHeatDogReportFormData,
  parseHeatDogReportFormData,
  serializeHeatDogReportFormData,
  heatDogValuesForValidation,
  expandTemplatePlaceholders,
  buildHeatDogPlaceholderValues,
  countHeatDogReportWords,
  normalizeHeatDogBodyToSingleParagraph,
  type HeatDogReportFormData,
} from "@/lib/reports-messages/document-templates/heat-dog-report";

export {
  HEAT_DOG_TABLE_FIELD_CATALOG,
  buildHeatDogRadioTableCells,
  defaultHeatDogTableFields,
  normalizeHeatDogTableFieldConfigs,
  type HeatDogTableFieldConfig,
  type HeatDogTableFieldId,
} from "@/lib/reports-messages/document-templates/heat-dog-table-fields";

export {
  PDF_CHIEN_TEMPLATE_SETTINGS_KEY,
  PDF_FUNCTIONNAIRE_TEMPLATE_SETTINGS_KEY,
  ENTITY_PDF_TABLE_QUERY_KEY,
  canEditEntityPdfTable,
  fetchChienPdfTableFields,
  fetchChienPdfTemplate,
  fetchFonctionnairePdfTableFields,
  fetchFonctionnairePdfTemplate,
  fetchEntityPdfTableFields,
  saveEntityPdfTableFields,
  saveChienPdfTemplate,
  saveFonctionnairePdfTemplate,
  type EntityPdfTableKind,
} from "@/lib/reports-messages/entity-pdf-table-store";

export {
  createDefaultGenericRadioFormData,
  genericRadioValuesForValidation,
  parseGenericRadioFormData,
  serializeGenericRadioFormData,
  type GenericRadioReportFormData,
} from "@/lib/reports-messages/document-templates/generic-radio-form";

export {
  DOCUMENT_TEMPLATES_SETTINGS_KEY,
  DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY,
  TEMPLATE_SNAPSHOT_PAYLOAD_KEY,
  canEditDocumentTemplates,
  clearSingleTemplateOverride,
  fetchDocumentTemplatesSettings,
  fetchDocumentTemplatesSettingsOrDefault,
  saveDocumentTemplatesSettings,
  upsertSingleTemplateOverride,
  type DocumentTemplatesSettings,
  type SingleTemplateOverride,
} from "@/lib/reports-messages/document-templates/template-overrides-store";

export {
  buildDefaultOverrideFromConfig,
  filterSectionsByValues,
  getManagedTemplateIds,
  resolveEffectiveTemplate,
  validateTemplateOverride,
  type EffectiveTemplateConfig,
} from "@/lib/reports-messages/document-templates/merge-template";

export {
  parseTemplateSnapshot,
  useEffectiveDocumentTemplate,
  withTemplateSnapshot,
} from "@/lib/reports-messages/document-templates/use-effective-template";
