import { format } from "date-fns";
import { randomId } from "@/lib/random-id";
import type { RoleDocumentPayload } from "@/lib/reports-messages/types";

/** Shared blob shape for heat / visit / care / follow-up until dedicated wizards exist. */
export type GenericRadioReportFormData = {
  origin: string;
  number: string;
  departureDateTime: string;
  senderUnit: string;
  recipient: string;
  city: string;
  diffusion: string[];
  priority: "URGENT" | "NORMAL";
  dogId: string;
  examDate: string;
  veterinarianName: string;
  examReason: string;
  clinicalObservations: string;
  treatment: string;
  messageBody: string;
  signatories: Array<{
    id: string;
    name: string;
    functionTitle: string;
    order: number;
    enabled: boolean;
  }>;
  attachments: string[];
};

function emptySignatory(order = 1) {
  return {
    id: randomId(),
    name: "",
    functionTitle: "",
    order,
    enabled: true,
  };
}

export function createDefaultGenericRadioFormData(context?: {
  userName?: string;
}): GenericRadioReportFormData {
  const now = new Date();
  return {
    origin: "",
    number: "",
    departureDateTime: format(now, "yyyy-MM-dd'T'HH:mm"),
    senderUnit: context?.userName?.trim() || "",
    recipient: "",
    city: "",
    diffusion: [""],
    priority: "NORMAL",
    dogId: "",
    examDate: format(now, "yyyy-MM-dd"),
    veterinarianName: "",
    examReason: "",
    clinicalObservations: "",
    treatment: "",
    messageBody: "",
    signatories: [emptySignatory(1)],
    attachments: [""],
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function parseGenericRadioFormData(
  payload: RoleDocumentPayload | null | undefined,
  blobKey: string,
): GenericRadioReportFormData {
  const defaults = createDefaultGenericRadioFormData();
  if (!payload) return defaults;

  const rawBlob = payload[blobKey];
  if (typeof rawBlob === "string" && rawBlob.trim()) {
    try {
      const parsed = JSON.parse(rawBlob) as Partial<GenericRadioReportFormData>;
      return {
        ...defaults,
        ...parsed,
        diffusion: Array.isArray(parsed.diffusion)
          ? parsed.diffusion.map(asString)
          : defaults.diffusion,
        attachments: Array.isArray(parsed.attachments)
          ? parsed.attachments.map(asString)
          : defaults.attachments,
        signatories:
          Array.isArray(parsed.signatories) && parsed.signatories.length > 0
            ? parsed.signatories.map((row, index) => ({
                id: asString(row.id) || randomId(),
                name: asString(row.name),
                functionTitle: asString(row.functionTitle),
                order: typeof row.order === "number" ? row.order : index + 1,
                enabled: Boolean(row.enabled ?? true),
              }))
            : defaults.signatories,
        priority: parsed.priority === "URGENT" ? "URGENT" : "NORMAL",
        dogId: asString(parsed.dogId) || asString(payload.dog_id),
      };
    } catch {
      /* fall through */
    }
  }

  return {
    ...defaults,
    dogId: asString(payload.dog_id),
    examDate: asString(payload.report_date) || defaults.examDate,
    examReason: asString(payload.motif),
    messageBody: asString(payload.description),
    clinicalObservations: asString(payload.observations),
    treatment: asString(payload.actions_taken),
    senderUnit: asString(payload.author_name) || defaults.senderUnit,
    recipient: asString(payload.recipient),
    signatories: [
      {
        ...emptySignatory(1),
        name: asString(payload.responsible_signature),
      },
    ],
  };
}

export function serializeGenericRadioFormData(
  data: GenericRadioReportFormData,
  blobKey: string,
  extras?: { agentId?: string | null; sectionId?: string | null },
): RoleDocumentPayload {
  const cleanDiffusion = data.diffusion.map((item) => item.trim()).filter(Boolean);
  const cleanAttachments = data.attachments.map((item) => item.trim()).filter(Boolean);
  const payloadData: GenericRadioReportFormData = {
    ...data,
    diffusion: cleanDiffusion.length > 0 ? cleanDiffusion : [""],
    attachments: cleanAttachments.length > 0 ? cleanAttachments : [""],
    signatories: data.signatories.map((row, index) => ({ ...row, order: index + 1 })),
  };

  return {
    [blobKey]: JSON.stringify(payloadData),
    dog_id: data.dogId,
    agent_id: extras?.agentId ?? "",
    section_id: extras?.sectionId ?? "",
    report_date: data.examDate || data.departureDateTime.slice(0, 10),
    motif: data.examReason,
    description: data.messageBody,
    observations: data.clinicalObservations,
    actions_taken: data.treatment,
    recipient: data.recipient,
    responsible_signature:
      data.signatories.find((row) => row.enabled && row.name.trim())?.name ?? "",
    author_name: data.senderUnit,
    priority: data.priority,
  };
}

export function genericRadioValuesForValidation(
  data: GenericRadioReportFormData,
): Record<string, unknown> {
  return { ...data };
}
