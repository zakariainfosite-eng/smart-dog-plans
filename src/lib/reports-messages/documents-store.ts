import { format } from "date-fns";
import type { DbClient } from "@/integrations/database/client";
import { randomId } from "@/lib/random-id";
import { allocateDocumentReference } from "@/lib/reports-messages/reference-numbers";
import {
  SICK_DOG_REPORT_TEMPLATE_ID,
  createDefaultSickDogReportFormData,
  serializeSickDogReportFormData,
} from "@/lib/reports-messages/sick-dog-report";
import {
  createDefaultGenericRadioFormData,
  createDefaultHeatDogReportFormData,
  createDefaultMessageDemandeFormData,
  getDocumentTemplateConfig,
  serializeGenericRadioFormData,
  serializeHeatDogReportFormData,
  serializeMessageDemandeFormData,
} from "@/lib/reports-messages/document-templates";
import { getReportTemplate } from "@/lib/reports-messages/templates";
import type {
  CreateRoleDocumentInput,
  RoleDocumentFilters,
  RoleDocumentPayload,
  RoleDocumentRow,
  UpdateRoleDocumentInput,
} from "@/lib/reports-messages/types";

type RoleDocumentDbRow = {
  id: string;
  reference_number: string | null;
  role_category: RoleDocumentRow["role_category"];
  template_id: string;
  document_kind: RoleDocumentRow["document_kind"];
  status: RoleDocumentRow["status"];
  title: string;
  report_month: number | null;
  report_year: number | null;
  agent_id: string | null;
  dog_id: string | null;
  section_id: string | null;
  payload: string;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_by_name: string;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function parsePayload(raw: string): RoleDocumentPayload {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as RoleDocumentPayload;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function mapRow(row: RoleDocumentDbRow): RoleDocumentRow {
  return {
    id: row.id,
    reference_number: row.reference_number,
    role_category: row.role_category,
    template_id: row.template_id,
    document_kind: row.document_kind,
    status: row.status,
    title: row.title,
    report_month: row.report_month,
    report_year: row.report_year,
    agent_id: row.agent_id,
    dog_id: row.dog_id,
    section_id: row.section_id,
    payload: parsePayload(row.payload),
    created_by_user_id: row.created_by_user_id,
    created_by_email: row.created_by_email,
    created_by_name: row.created_by_name,
    finalized_at: row.finalized_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function buildDefaultPayload(
  templateId: string,
  context?: { userName?: string; userEmail?: string },
): RoleDocumentPayload {
  if (templateId === SICK_DOG_REPORT_TEMPLATE_ID) {
    const data = createDefaultSickDogReportFormData({ userName: context?.userName });
    const payload = serializeSickDogReportFormData(data);
    if (context?.userName) payload.author_name = context.userName;
    if (context?.userEmail) payload.author_email = context.userEmail;
    return payload;
  }

  const engineConfig = getDocumentTemplateConfig(templateId);
  if (engineConfig?.engineEnabled && engineConfig.builder === "message_demande") {
    const data = createDefaultMessageDemandeFormData({ userName: context?.userName });
    const payload = serializeMessageDemandeFormData(data);
    if (context?.userName) payload.author_name = context.userName;
    if (context?.userEmail) payload.author_email = context.userEmail;
    return payload;
  }

  if (engineConfig?.engineEnabled && engineConfig.builder === "heat_dog") {
    const data = createDefaultHeatDogReportFormData({ userName: context?.userName });
    const payload = serializeHeatDogReportFormData(data);
    if (context?.userName) payload.author_name = context.userName;
    if (context?.userEmail) payload.author_email = context.userEmail;
    return payload;
  }

  if (engineConfig?.engineEnabled && engineConfig.builder === "generic_radio") {
    const data = createDefaultGenericRadioFormData({ userName: context?.userName });
    const payload = serializeGenericRadioFormData(data, engineConfig.payloadBlobKey);
    if (context?.userName) payload.author_name = context.userName;
    if (context?.userEmail) payload.author_email = context.userEmail;
    return payload;
  }

  const template = getReportTemplate(templateId);
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();
  const payload: RoleDocumentPayload = {
    report_date: today,
    report_month: String(now.getMonth() + 1),
    report_year: String(now.getFullYear()),
  };
  if (context?.userName) payload.author_name = context.userName;
  if (context?.userEmail) payload.author_email = context.userEmail;
  if (!template) return payload;

  for (const field of template.fields) {
    if (!(field.id in payload)) payload[field.id] = "";
  }
  return payload;
}

export async function fetchRoleDocuments(
  db: DbClient,
  filters: RoleDocumentFilters,
): Promise<RoleDocumentRow[]> {
  let query = db
    .from("role_documents")
    .select("*")
    .eq("role_category", filters.roleCategory)
    .order("updated_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.documentKind && filters.documentKind !== "all") {
    query = query.eq("document_kind", filters.documentKind);
  }
  if (filters.templateId && filters.templateId !== "all") {
    query = query.eq("template_id", filters.templateId);
  }
  if (filters.agentId && filters.agentId !== "all") {
    query = query.eq("agent_id", filters.agentId);
  }
  if (filters.dogId && filters.dogId !== "all") {
    query = query.eq("dog_id", filters.dogId);
  }
  if (filters.year && filters.year !== "all") {
    query = query.eq("report_year", filters.year);
  }
  if (filters.month && filters.month !== "all") {
    query = query.eq("report_month", filters.month);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = ((data ?? []) as RoleDocumentDbRow[]).map(mapRow);

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter((row) => {
      const hay = [
        row.title,
        row.reference_number ?? "",
        row.template_id,
        JSON.stringify(row.payload),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return rows;
}

export async function fetchRoleDocumentById(
  db: DbClient,
  id: string,
): Promise<RoleDocumentRow | null> {
  const { data, error } = await db.from("role_documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow(data as RoleDocumentDbRow);
}

export async function createRoleDocument(
  db: DbClient,
  input: CreateRoleDocumentInput,
): Promise<RoleDocumentRow> {
  const template = getReportTemplate(input.templateId);
  if (!template) throw new Error("Unknown report template");
  if (template.roleCategory !== input.roleCategory) {
    throw new Error("Template does not belong to this role category");
  }

  const id = randomId();
  const timestamp = nowIso();
  const reportMonth =
    input.reportMonth ?? (input.payload.report_month ? Number(input.payload.report_month) : null);
  const reportYear =
    input.reportYear ?? (input.payload.report_year ? Number(input.payload.report_year) : null);

  const asFk = (value: unknown): string | null => {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  };

  const row = {
    id,
    reference_number: null,
    role_category: input.roleCategory,
    template_id: input.templateId,
    document_kind: template.kind,
    status: "draft" as const,
    title: input.title.trim(),
    report_month: Number.isFinite(reportMonth) ? reportMonth : null,
    report_year: Number.isFinite(reportYear) ? reportYear : null,
    agent_id: asFk(input.agentId ?? input.payload.agent_id),
    dog_id: asFk(input.dogId ?? input.payload.dog_id),
    section_id: asFk(input.sectionId ?? input.payload.section_id),
    payload: JSON.stringify(input.payload),
    created_by_user_id: input.createdByUserId ?? null,
    created_by_email: input.createdByEmail ?? null,
    created_by_name: input.createdByName?.trim() || "—",
    finalized_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const { data, error } = await db.from("role_documents").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return mapRow(data as RoleDocumentDbRow);
}

export async function updateRoleDocument(
  db: DbClient,
  id: string,
  input: UpdateRoleDocumentInput,
): Promise<RoleDocumentRow> {
  const existing = await fetchRoleDocumentById(db, id);
  if (!existing) throw new Error("Document not found");
  if (existing.status === "finalized") {
    throw new Error("Finalized documents cannot be edited");
  }

  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.payload !== undefined) patch.payload = JSON.stringify(input.payload);
  if (input.agentId !== undefined) patch.agent_id = input.agentId;
  if (input.dogId !== undefined) patch.dog_id = input.dogId;
  if (input.sectionId !== undefined) patch.section_id = input.sectionId;
  if (input.reportMonth !== undefined) patch.report_month = input.reportMonth;
  if (input.reportYear !== undefined) patch.report_year = input.reportYear;

  const { data, error } = await db
    .from("role_documents")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as RoleDocumentDbRow);
}

export async function finalizeRoleDocument(db: DbClient, id: string): Promise<RoleDocumentRow> {
  const existing = await fetchRoleDocumentById(db, id);
  if (!existing) throw new Error("Document not found");
  if (existing.status === "finalized") return existing;

  const referenceNumber = await allocateDocumentReference(db, existing.document_kind);
  const timestamp = nowIso();

  const { data, error } = await db
    .from("role_documents")
    .update({
      status: "finalized",
      reference_number: referenceNumber,
      finalized_at: timestamp,
      updated_at: timestamp,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as RoleDocumentDbRow);
}

export async function duplicateRoleDocument(
  db: DbClient,
  id: string,
  createdBy?: { userId?: string; email?: string; name?: string },
): Promise<RoleDocumentRow> {
  const existing = await fetchRoleDocumentById(db, id);
  if (!existing) throw new Error("Document not found");

  return createRoleDocument(db, {
    roleCategory: existing.role_category,
    templateId: existing.template_id,
    title: `${existing.title} (copie)`,
    payload: { ...existing.payload },
    agentId: existing.agent_id,
    dogId: existing.dog_id,
    sectionId: existing.section_id,
    reportMonth: existing.report_month,
    reportYear: existing.report_year,
    createdByUserId: createdBy?.userId ?? existing.created_by_user_id,
    createdByEmail: createdBy?.email ?? existing.created_by_email ?? undefined,
    createdByName: createdBy?.name ?? existing.created_by_name,
  });
}

export async function deleteRoleDocument(db: DbClient, id: string): Promise<void> {
  const existing = await fetchRoleDocumentById(db, id);
  if (!existing) return;
  if (existing.status === "finalized") {
    throw new Error("Finalized documents cannot be deleted");
  }
  const { error } = await db.from("role_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
