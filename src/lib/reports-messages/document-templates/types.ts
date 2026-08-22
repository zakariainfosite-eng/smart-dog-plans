/**
 * Document Template System — configuration types.
 * Separates: DB data → Document data → Template config → Renderer → Preview/PDF.
 *
 * Prepared for a future "Gestion des modèles" admin editor (activate, reorder sections,
 * toggle fields) without rebuilding the engine.
 */

import type { DocumentKind, RoleCategory } from "@/lib/reports-messages/types";
import type { OfficialDocumentKind } from "@/lib/reports-messages/official-document/types";

/** Reusable A4 section ids — templates pick an ordered subset. */
export type TemplateSectionId =
  | "official_header"
  | "radio_depart_table"
  | "sender"
  | "recipient"
  | "priority"
  | "subject"
  | "introduction"
  | "dog_information"
  | "veterinary"
  | "treatment"
  | "observation"
  | "rest_period"
  | "user_message"
  | "signatures"
  | "attachments";

export type TemplateFieldType =
  | "text"
  | "textarea"
  | "date"
  | "datetime"
  | "select"
  | "dog"
  | "agent"
  | "priority"
  | "signatories"
  | "string_list"
  | "attachments";

/** Paths resolved from CynoPlanning DB rows — never invent values. */
export type DatabaseBinding =
  | "dog.name"
  | "dog.specialty"
  | "dog.handler"
  | "dog.breed"
  | "dog.microchip"
  | "dog.section"
  | "dog.status"
  | "agent.firstName"
  | "agent.lastName"
  | "agent.fullName"
  | "agent.function"
  | "agent.section"
  | "exclusion.type"
  | "exclusion.startDate"
  | "exclusion.endDate"
  | "exclusion.status";

export type TemplateFieldDefinition = {
  id: string;
  type: TemplateFieldType;
  /** i18n key under reportsMessages.documentTemplates.fields.* or absolute */
  labelKey: string;
  required?: boolean;
  /** When true (default if not required), empty values are omitted from PDF */
  optional?: boolean;
  source?: "manual" | "database" | "hybrid";
  /** Auto-fill from DB when dog/agent selected; never writes back to DB */
  binding?: DatabaseBinding;
  /** Which template section this field feeds */
  section: TemplateSectionId;
  rows?: number;
  options?: Array<{ value: string; labelKey: string }>;
  /** Form → section mapping hint for documentation / future editor */
  mapsTo?: string;
};

export type TemplateBuilderId =
  | "sick_dog"
  | "message_demande"
  | "heat_dog"
  | "generic_radio"
  | "stub";

/**
 * Central template configuration.
 * `id` must match ReportTemplateDefinition.id used by role_documents.template_id.
 */
export type DocumentTemplateConfig = {
  id: string;
  templateKey: string;
  officialKind: OfficialDocumentKind;
  roleCategory: RoleCategory;
  kind: DocumentKind;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  /** Future admin editor: activate/deactivate without deleting config */
  active: boolean;
  /** When true, DocumentWorkspace + official PDF engine are used */
  engineEnabled: boolean;
  builder: TemplateBuilderId;
  sections: TemplateSectionId[];
  fields: TemplateFieldDefinition[];
  /** Default subject line for the PDF (i18n key) */
  subjectKey: string;
  /** Payload JSON blob key for structured form data (inside role_documents.payload) */
  payloadBlobKey: string;
  /**
   * Objectif (= introduction section). Per-template visibility.
   * When false, Objectif is excluded from form / preview / PDF even if an override
   * still lists the introduction section (Message / Demande).
   * Defaults to true when omitted (other document types keep Objectif available).
   */
  showObjectif?: boolean;
};

/** Workflow display status — DB keeps draft|finalized; "exported" is payload metadata. */
export type DocumentWorkflowStatus = "draft" | "finalized" | "exported";

export type DocumentMetaV1 = {
  exportedAt?: string | null;
};

export const DOCUMENT_META_PAYLOAD_KEY = "document_meta_v1";
