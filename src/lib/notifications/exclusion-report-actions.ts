import type { DbClient } from "@/integrations/database/client";
import { format } from "date-fns";
import { exclusionApplyTarget } from "@/lib/agent-exclusions";
import {
  buildDefaultPayload,
  createRoleDocument,
} from "@/lib/reports-messages/documents-store";
import type { RoleCategory } from "@/lib/reports-messages/types";
import type { ExclusionNotificationRecord } from "@/lib/notifications/exclusion-return-types";

type ExclusionRow = {
  id: string;
  agent_id: string | null;
  dog_id: string | null;
  exclusion_type: string;
  start_date: string;
  end_date: string;
  notes: string | null;
};

type ReportDocumentKind = "report" | "message";

type ResolvedReportRoute = {
  roleCategory: RoleCategory;
  templateId: string;
};

function resolveReportRoute(
  exclusionType: string,
  subjectKind: "personnel" | "dog",
  documentKind: ReportDocumentKind,
): ResolvedReportRoute {
  if (subjectKind === "dog") {
    if (documentKind === "message") {
      return { roleCategory: "veterinary", templateId: "veterinary_message" };
    }
    switch (exclusionType) {
      case "female_dog_heat":
        return { roleCategory: "veterinary", templateId: "injured_dog_report" };
      case "dog_sick":
        return { roleCategory: "veterinary", templateId: "sick_dog_report" };
      case "dog_injured":
        return { roleCategory: "veterinary", templateId: "care_report" };
      case "dog_vet_visit":
        return { roleCategory: "veterinary", templateId: "vet_visit_report" };
      default:
        return { roleCategory: "veterinary", templateId: "dog_follow_up_report" };
    }
  }

  if (documentKind === "message") {
    return { roleCategory: "secretary", templateId: "administrative_message" };
  }
  switch (exclusionType) {
    case "annual_leave":
    case "administrative_leave":
    case "special_leave":
    case "absence":
      return { roleCategory: "secretary", templateId: "administrative_request" };
    default:
      return { roleCategory: "secretary", templateId: "administrative_report" };
  }
}

function buildPrefillDescription(exclusion: ExclusionRow, typeLabel: string): string {
  const start = exclusion.start_date.slice(0, 10);
  const end = exclusion.end_date.slice(0, 10);
  const notes = exclusion.notes?.trim();
  const base = `Exclusion (${typeLabel}) du ${start} au ${end}.`;
  return notes ? `${base}\n\n${notes}` : base;
}

export async function createExclusionLinkedDocument(
  db: DbClient,
  notification: ExclusionNotificationRecord,
  documentKind: ReportDocumentKind,
  context: {
    title: string;
    typeLabel: string;
    userId?: string;
    userEmail?: string;
    userName?: string;
  },
): Promise<{ roleCategory: RoleCategory; documentId: string }> {
  const { data: exclusion, error } = await db
    .from("agent_exclusions")
    .select("id, agent_id, dog_id, exclusion_type, start_date, end_date, notes")
    .eq("id", notification.exclusion_id)
    .maybeSingle();

  if (error) throw error;
  if (!exclusion) throw new Error("Exclusion introuvable");

  const row = exclusion as ExclusionRow;
  const subjectKind =
    exclusionApplyTarget(row.exclusion_type, row.dog_id) === "dog" ? "dog" : "personnel";
  const route = resolveReportRoute(row.exclusion_type, subjectKind, documentKind);
  const payload = buildDefaultPayload(route.templateId, {
    userName: context.userName,
    userEmail: context.userEmail,
  });

  payload.report_date = format(new Date(), "yyyy-MM-dd");
  payload.subject = context.title;
  payload.motif = context.typeLabel;
  payload.description = buildPrefillDescription(row, context.typeLabel);
  if (row.agent_id) payload.agent_id = row.agent_id;
  if (row.dog_id) payload.dog_id = row.dog_id;

  if (row.agent_id) {
    const { data: agent } = await db
      .from("agents")
      .select("section_id")
      .eq("id", row.agent_id)
      .maybeSingle();
    if (agent?.section_id) payload.section_id = agent.section_id as string;
  }

  const document = await createRoleDocument(db, {
    roleCategory: route.roleCategory,
    templateId: route.templateId,
    title: context.title,
    payload,
    agentId: row.agent_id,
    dogId: row.dog_id,
    sectionId: payload.section_id || null,
    createdByUserId: context.userId,
    createdByEmail: context.userEmail,
    createdByName: context.userName ?? "Utilisateur",
  });

  return { roleCategory: route.roleCategory, documentId: document.id };
}
