import { format } from "date-fns";
import { randomId } from "@/lib/random-id";
import type { RoleDocumentPayload } from "@/lib/reports-messages/types";

/** Existing template id — do not invent a parallel document type. */
export const SICK_DOG_REPORT_TEMPLATE_ID = "sick_dog_report";

/** Structured workflow blob stored inside role_documents.payload (JSON text column). */
export const SICK_DOG_PAYLOAD_BLOB_KEY = "sick_dog_report_v1";

export type SickDogPriority = "URGENT" | "NORMAL";

export type SickDogSignatory = {
  id: string;
  name: string;
  functionTitle: string;
  order: number;
  enabled: boolean;
};

export type SickDogReportFormData = {
  origin: string;
  number: string;
  wordCount: string;
  departureDateTime: string;
  serviceMention: string;
  senderUnit: string;
  recipient: string;
  city: string;
  diffusion: string[];
  priority: SickDogPriority;
  dogId: string;
  examDate: string;
  veterinarianName: string;
  examReason: string;
  clinicalObservations: string;
  diagnosis: string;
  treatment: string;
  restPeriod: string;
  additionalObservations: string;
  medication: string;
  attachments: string[];
  messageBody: string;
  signatories: SickDogSignatory[];
};

export const SICK_DOG_WIZARD_STEPS = [
  "messageInfo",
  "dogVeterinary",
  "messageBody",
  "signatures",
  "preview",
] as const;

export type SickDogWizardStep = (typeof SICK_DOG_WIZARD_STEPS)[number];

export function createEmptySignatory(order = 1): SickDogSignatory {
  return {
    id: randomId(),
    name: "",
    functionTitle: "",
    order,
    enabled: true,
  };
}

export function createDefaultSickDogReportFormData(
  context?: { userName?: string },
): SickDogReportFormData {
  const now = new Date();
  const localDateTime = format(now, "yyyy-MM-dd'T'HH:mm");
  return {
    origin: "",
    number: "",
    wordCount: "",
    departureDateTime: localDateTime,
    serviceMention: "",
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
    diagnosis: "",
    treatment: "",
    restPeriod: "",
    additionalObservations: "",
    medication: "",
    attachments: [""],
    messageBody: "",
    signatories: [createEmptySignatory(1)],
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function parseSickDogReportFormData(
  payload: RoleDocumentPayload | null | undefined,
): SickDogReportFormData {
  const defaults = createDefaultSickDogReportFormData();
  if (!payload) return defaults;

  const rawBlob = payload[SICK_DOG_PAYLOAD_BLOB_KEY];
  if (typeof rawBlob === "string" && rawBlob.trim()) {
    try {
      const parsed = JSON.parse(rawBlob) as Partial<SickDogReportFormData>;
      const diffusion = Array.isArray(parsed.diffusion)
        ? parsed.diffusion.map((item) => asString(item))
        : defaults.diffusion;
      const attachments = Array.isArray(parsed.attachments)
        ? parsed.attachments.map((item) => asString(item))
        : defaults.attachments;
      const signatories = Array.isArray(parsed.signatories)
        ? parsed.signatories.map((row, index) => ({
            id: asString((row as SickDogSignatory).id) || randomId(),
            name: asString((row as SickDogSignatory).name),
            functionTitle: asString((row as SickDogSignatory).functionTitle),
            order:
              typeof (row as SickDogSignatory).order === "number"
                ? (row as SickDogSignatory).order
                : index + 1,
            enabled: Boolean((row as SickDogSignatory).enabled ?? true),
          }))
        : defaults.signatories;

      return {
        ...defaults,
        ...parsed,
        diffusion: diffusion.length > 0 ? diffusion : [""],
        attachments: attachments.length > 0 ? attachments : [""],
        medication: asString(parsed.medication),
        signatories: signatories.length > 0 ? signatories : [createEmptySignatory(1)],
        priority: parsed.priority === "URGENT" ? "URGENT" : "NORMAL",
        dogId: asString(parsed.dogId) || asString(payload.dog_id),
      };
    } catch {
      /* fall through to flat keys */
    }
  }

  // Legacy / partial payloads from the generic dog report fields.
  return {
    ...defaults,
    dogId: asString(payload.dog_id),
    examDate: asString(payload.report_date) || defaults.examDate,
    examReason: asString(payload.motif),
    messageBody: asString(payload.description),
    clinicalObservations: asString(payload.observations),
    treatment: asString(payload.actions_taken),
    additionalObservations: asString(payload.recommendations),
    senderUnit: asString(payload.author_name) || defaults.senderUnit,
    signatories: [
      {
        ...createEmptySignatory(1),
        name: asString(payload.responsible_signature),
      },
    ],
  };
}

/** Flatten into role_documents.payload (+ top-level dog/agent/section sync keys). */
export function serializeSickDogReportFormData(
  data: SickDogReportFormData,
  extras?: { agentId?: string | null; sectionId?: string | null },
): RoleDocumentPayload {
  const cleanDiffusion = data.diffusion.map((item) => item.trim()).filter(Boolean);
  const cleanAttachments = data.attachments.map((item) => item.trim()).filter(Boolean);
  const payloadData: SickDogReportFormData = {
    ...data,
    diffusion: cleanDiffusion.length > 0 ? cleanDiffusion : [""],
    attachments: cleanAttachments.length > 0 ? cleanAttachments : [""],
    signatories: data.signatories.map((row, index) => ({
      ...row,
      order: index + 1,
    })),
  };

  return {
    [SICK_DOG_PAYLOAD_BLOB_KEY]: JSON.stringify(payloadData),
    dog_id: data.dogId,
    agent_id: extras?.agentId ?? "",
    section_id: extras?.sectionId ?? "",
    report_date: data.examDate || data.departureDateTime.slice(0, 10),
    motif: data.examReason,
    description: data.messageBody,
    observations: data.clinicalObservations,
    actions_taken: data.treatment,
    recommendations: data.additionalObservations,
    responsible_signature:
      data.signatories.find((row) => row.enabled && row.name.trim())?.name ?? "",
    author_name: data.senderUnit,
    priority: data.priority,
  };
}

export function countMessageWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Explicit FORM FIELD → future A4 DOCUMENT slot mapping.
 * Used to keep the wizard and preview (and later PDF) aligned with Radio Départ.
 */
export const SICK_DOG_FORM_TO_DOCUMENT_MAP = [
  { form: "origin", document: "Radio Départ table — ORIGINE" },
  { form: "number", document: "Radio Départ table — NUMÉRO" },
  { form: "wordCount", document: "Radio Départ table — MOTS" },
  { form: "departureDateTime", document: "Radio Départ table — DATE ET HEURE DE DÉPART" },
  { form: "serviceMention", document: "Radio Départ table — MENTION DE SERVI" },
  { form: "senderUnit", document: "Block DE / Expéditeur" },
  { form: "recipient", document: "Block A / Destinataire" },
  { form: "city", document: "Ville / destination" },
  { form: "diffusion", document: "DIFFUSION / copies" },
  { form: "priority", document: "Priority stamp (URGENT | NORMAL)" },
  { form: "dogId", document: "Dog identity block (name/specialty/handler from DB)" },
  { form: "examDate", document: "Veterinary table — Date de l'examen" },
  { form: "veterinarianName", document: "Veterinary table — Vétérinaire" },
  { form: "examReason", document: "Veterinary table — Motif de l'examen" },
  { form: "clinicalObservations", document: "Veterinary table — État / observations" },
  { form: "diagnosis", document: "Veterinary table — Diagnostic / constat" },
  { form: "treatment", document: "Veterinary table — Traitement prescrit" },
  { form: "restPeriod", document: "Veterinary table — Durée de repos" },
  { form: "additionalObservations", document: "Veterinary table — Observations complémentaires" },
  { form: "messageBody", document: "Official message body" },
  { form: "signatories", document: "Signature area (ordered, enabled only)" },
] as const;
