export type RoleCategory = "veterinary" | "assistant" | "secretary" | "equipment_chief";

export type DocumentKind = "report" | "message" | "monthly";

export type DocumentStatus = "draft" | "finalized";

export type ReferencePrefix = "RAP" | "MSG";

export type ReportFieldType =
  "text" | "textarea" | "date" | "agent" | "dog" | "section" | "month" | "year";

export type ReportFieldDefinition = {
  id: string;
  type: ReportFieldType;
  required?: boolean;
  /** i18n key under reportsMessages.fields */
  labelKey: string;
  rows?: number;
};

export type ReportTemplateDefinition = {
  id: string;
  roleCategory: RoleCategory;
  kind: DocumentKind;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  fields: ReportFieldDefinition[];
};

export type RoleDocumentPayload = Record<string, string>;

export type RoleDocumentRow = {
  id: string;
  reference_number: string | null;
  role_category: RoleCategory;
  template_id: string;
  document_kind: DocumentKind;
  status: DocumentStatus;
  title: string;
  report_month: number | null;
  report_year: number | null;
  agent_id: string | null;
  dog_id: string | null;
  section_id: string | null;
  payload: RoleDocumentPayload;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_by_name: string;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoleDocumentFilters = {
  roleCategory: RoleCategory;
  status?: DocumentStatus | "all";
  documentKind?: DocumentKind | "all";
  templateId?: string | "all";
  agentId?: string | "all";
  dogId?: string | "all";
  month?: number | "all";
  year?: number | "all";
  search?: string;
};

export type CreateRoleDocumentInput = {
  roleCategory: RoleCategory;
  templateId: string;
  title: string;
  payload: RoleDocumentPayload;
  agentId?: string | null;
  dogId?: string | null;
  sectionId?: string | null;
  reportMonth?: number | null;
  reportYear?: number | null;
  createdByUserId?: string | null;
  createdByEmail?: string | null;
  createdByName?: string;
};

export type UpdateRoleDocumentInput = Partial<
  Pick<
    CreateRoleDocumentInput,
    "title" | "payload" | "agentId" | "dogId" | "sectionId" | "reportMonth" | "reportYear"
  >
>;
