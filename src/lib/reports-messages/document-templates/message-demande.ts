import { format } from "date-fns";
import { randomId } from "@/lib/random-id";
import type { RoleDocumentPayload } from "@/lib/reports-messages/types";
import type { OfficialRecipientLine } from "@/lib/reports-messages/official-document/types";

export const MESSAGE_DEMANDE_PAYLOAD_BLOB_KEY = "message_demande_v1";

/**
 * Default Expéditeur lines for Message / Demande (Gestion des modèles).
 * Not editable on the form; PDF uses the saved template config.
 */
export const MESSAGE_DEMANDE_FIXED_EXPEDITEUR_LINES = [
  "PP/ DISTRICT DU PORT MARITIME DE TANGER MED",
  "BPJ/ NBPCYN NR",
] as const;

/** Joined default Expéditeur text (label EXPÉDITEUR : is drawn separately). */
export const MESSAGE_DEMANDE_FIXED_EXPEDITEUR =
  MESSAGE_DEMANDE_FIXED_EXPEDITEUR_LINES.join("\n");

/**
 * Default Destinataire block (multiline) for Message / Demande.
 * Editable from Gestion des modèles; PDF uses the saved template config.
 * `right` is city aligned to the right of the same row.
 */
export const MESSAGE_DEMANDE_FIXED_RECIPIENT_LINES: OfficialRecipientLine[] = [
  { left: "DESTINATAIRE : DGSN/DPJ/DPC/SSV", right: "RABAT" },
  { left: "PI" },
  { left: "DGSN/DPJ/SEC" },
  { left: "DGSN/DPJ/DPC/SEC" },
  { left: "PP SPPJ - SAP", right: "TANGER" },
  { left: "CHEF AA TANGER-VILLE." },
];

export type MessageDemandePriority = "URGENT" | "NORMAL";

export type MessageDemandeEndorsement = "SIGNÉ" | "VU";

export type MessageDemandeSignatory = {
  id: string;
  endorsement: MessageDemandeEndorsement;
  name: string;
  functionTitle: string;
  order: number;
  enabled: boolean;
};

/**
 * Variable Message / Demande fields only.
 * Expéditeur and Destinataire come from Gestion des modèles (not form fields).
 */
export type MessageDemandeFormData = {
  reportDate: string;
  referenceNumber: string;
  wordCount: string;
  departureDateTime: string;
  serviceMention: string;
  subject: string;
  priority: MessageDemandePriority;
  messageBody: string;
  signatories: MessageDemandeSignatory[];
};

export function createEmptyMessageSignatory(order = 1): MessageDemandeSignatory {
  return {
    id: randomId(),
    endorsement: order === 1 ? "SIGNÉ" : "VU",
    name: "",
    functionTitle: "",
    order,
    enabled: true,
  };
}

export function createDefaultMessageDemandeFormData(_context?: {
  userName?: string;
}): MessageDemandeFormData {
  const now = new Date();
  return {
    reportDate: format(now, "yyyy-MM-dd"),
    referenceNumber: "",
    wordCount: "",
    departureDateTime: format(now, "yyyy-MM-dd'T'HH:mm"),
    serviceMention: "",
    subject: "",
    priority: "NORMAL",
    messageBody: "",
    signatories: [createEmptyMessageSignatory(1)],
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function parseEndorsement(value: unknown): MessageDemandeEndorsement {
  const text = asString(value).toUpperCase();
  if (text === "VU" || text.startsWith("VU")) return "VU";
  return "SIGNÉ";
}

export function parseMessageDemandeFormData(
  payload: RoleDocumentPayload | null | undefined,
): MessageDemandeFormData {
  const defaults = createDefaultMessageDemandeFormData();
  if (!payload) return defaults;

  const rawBlob = payload[MESSAGE_DEMANDE_PAYLOAD_BLOB_KEY];
  if (typeof rawBlob === "string" && rawBlob.trim()) {
    try {
      const parsed = JSON.parse(rawBlob) as Partial<MessageDemandeFormData> & {
        senderUnit?: string;
        recipient?: string;
        diffusion?: string[];
        attachments?: string[];
      };
      const signatories = Array.isArray(parsed.signatories)
        ? parsed.signatories.map((row, index) => ({
            id: asString((row as MessageDemandeSignatory).id) || randomId(),
            endorsement: parseEndorsement((row as MessageDemandeSignatory).endorsement),
            name: asString((row as MessageDemandeSignatory).name),
            functionTitle: asString((row as MessageDemandeSignatory).functionTitle),
            order:
              typeof (row as MessageDemandeSignatory).order === "number"
                ? (row as MessageDemandeSignatory).order
                : index + 1,
            enabled: Boolean((row as MessageDemandeSignatory).enabled ?? true),
          }))
        : defaults.signatories;

      return {
        ...defaults,
        reportDate: asString(parsed.reportDate) || defaults.reportDate,
        referenceNumber: asString(parsed.referenceNumber),
        wordCount: asString(parsed.wordCount),
        departureDateTime:
          asString(parsed.departureDateTime) || defaults.departureDateTime,
        serviceMention: asString(parsed.serviceMention),
        subject: asString(parsed.subject),
        messageBody: asString(parsed.messageBody),
        signatories: signatories.length > 0 ? signatories : [createEmptyMessageSignatory(1)],
        priority: parsed.priority === "URGENT" ? "URGENT" : "NORMAL",
      };
    } catch {
      /* fall through */
    }
  }

  return {
    ...defaults,
    reportDate: asString(payload.report_date) || defaults.reportDate,
    subject: asString(payload.subject),
    referenceNumber: asString(payload.reference_number),
    messageBody: asString(payload.description),
    departureDateTime: asString(payload.departure_datetime) || defaults.departureDateTime,
    serviceMention: asString(payload.service_mention),
    wordCount: asString(payload.word_count),
    signatories: [
      {
        ...createEmptyMessageSignatory(1),
        name: asString(payload.responsible_signature),
      },
    ],
  };
}

export function serializeMessageDemandeFormData(
  data: MessageDemandeFormData,
): RoleDocumentPayload {
  const payloadData: MessageDemandeFormData = {
    ...data,
    signatories: data.signatories.map((row, index) => ({ ...row, order: index + 1 })),
  };

  return {
    [MESSAGE_DEMANDE_PAYLOAD_BLOB_KEY]: JSON.stringify(payloadData),
    report_date: data.reportDate,
    subject: data.subject,
    description: data.messageBody,
    responsible_signature:
      data.signatories.find((row) => row.enabled && row.name.trim())?.name ?? "",
    author_name: MESSAGE_DEMANDE_FIXED_EXPEDITEUR,
    priority: data.priority,
    reference_number: data.referenceNumber,
    word_count: data.wordCount,
    departure_datetime: data.departureDateTime,
    service_mention: data.serviceMention,
  };
}

export function messageDemandeValuesForValidation(
  data: MessageDemandeFormData,
): Record<string, unknown> {
  return {
    reportDate: data.reportDate,
    referenceNumber: data.referenceNumber,
    wordCount: data.wordCount,
    departureDateTime: data.departureDateTime,
    serviceMention: data.serviceMention,
    subject: data.subject,
    priority: data.priority,
    messageBody: data.messageBody,
    signatories: data.signatories,
  };
}

export function countMessageDemandeWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
