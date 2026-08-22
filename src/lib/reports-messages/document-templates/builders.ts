import type { DogRow } from "@/integrations/database";
import type { DocumentTemplateConfig } from "@/lib/reports-messages/document-templates/types";
import type { EffectiveTemplateConfig } from "@/lib/reports-messages/document-templates/merge-template";
import { collectFixedTexts } from "@/lib/reports-messages/document-templates/merge-template";
import type { DatabaseLinkContext } from "@/lib/reports-messages/document-templates/resolve-bindings";
import type { MessageDemandeFormData } from "@/lib/reports-messages/document-templates/message-demande";
import {
  MESSAGE_DEMANDE_FIXED_EXPEDITEUR,
  MESSAGE_DEMANDE_FIXED_RECIPIENT_LINES,
  countMessageDemandeWords,
} from "@/lib/reports-messages/document-templates/message-demande";
import {
  DEFAULT_HEAT_DOG_REPORT_BODY_TEMPLATE,
  buildHeatDogPlaceholderValues,
  countHeatDogReportWords,
  expandTemplatePlaceholders,
  normalizeHeatDogBodyToSingleParagraph,
  type HeatDogReportFormData,
} from "@/lib/reports-messages/document-templates/heat-dog-report";
import { buildHeatDogRadioTableCells } from "@/lib/reports-messages/document-templates/heat-dog-table-fields";
import type { GenericRadioReportFormData } from "@/lib/reports-messages/document-templates/generic-radio-form";
import type { SickDogReportFormData } from "@/lib/reports-messages/sick-dog-report";
import { countMessageWords } from "@/lib/reports-messages/sick-dog-report";
import type {
  OfficialDocumentModel,
  OfficialFactRow,
  OfficialRecipientLine,
  OfficialSignatory,
} from "@/lib/reports-messages/official-document/types";

function trim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function fact(label: string, value: string | null | undefined): OfficialFactRow | null {
  const text = trim(value);
  if (!text) return null;
  return { label, value: text };
}

function mapSignatories(
  rows: Array<{
    name: string;
    functionTitle: string;
    order: number;
    enabled: boolean;
    endorsement?: "SIGNÉ" | "VU";
  }>,
): OfficialSignatory[] {
  return [...rows]
    .filter((row) => row.enabled && (trim(row.name) || trim(row.functionTitle)))
    .sort((a, b) => a.order - b.order)
    .map((row) => ({
      fullName: trim(row.name),
      functionTitle: trim(row.functionTitle),
      endorsement: row.endorsement,
    }));
}

/** Message / Demande — signatures come only from Gestion des modèles (signatureSlots). */
function mapTemplateSignatureSlots(
  effective: EffectiveTemplateConfig | null | undefined,
): OfficialSignatory[] {
  const slots = effective?.signatureSlots ?? [];
  return slots
    .map((slot) => ({
      fullName: trim(slot.nameHint),
      functionTitle: trim(slot.functionHint),
    }))
    .filter((row) => row.fullName || row.functionTitle);
}

function agencyHeader(
  t: (key: string) => string,
  effective?: EffectiveTemplateConfig | null,
) {
  if (effective?.header) {
    const lines = [
      effective.header.organizationName.trim(),
      effective.header.department.trim(),
    ].filter(Boolean);
    return {
      agencyLines:
        lines.length > 0
          ? lines
          : [
              t("reportsMessages.sickDogReport.preview.agencyLine1"),
              t("reportsMessages.sickDogReport.preview.agencyLine2"),
            ],
      radioTitle:
        effective.header.radioTitle.trim() ||
        t("reportsMessages.sickDogReport.preview.radioDepart"),
    };
  }
  return {
    agencyLines: [
      t("reportsMessages.sickDogReport.preview.agencyLine1"),
      t("reportsMessages.sickDogReport.preview.agencyLine2"),
    ],
    radioTitle: t("reportsMessages.sickDogReport.preview.radioDepart"),
  };
}

function resolveSubject(
  config: DocumentTemplateConfig,
  t: (key: string) => string,
  effective?: EffectiveTemplateConfig | null,
  userSubject?: string,
): string {
  if (trim(userSubject)) return trim(userSubject);
  if (effective?.subjectOverride.trim()) return effective.subjectOverride.trim();
  return t(config.subjectKey);
}

function fieldLabel(t: (key: string) => string, key: string): string {
  const full = `reportsMessages.documentTemplates.fields.${key}`;
  const translated = t(full);
  return translated === full ? key : translated;
}

function applyFixedIntroduction(
  effective: EffectiveTemplateConfig | null | undefined,
  messageBody: string,
): { introduction?: string; messageBody: string } {
  if (!effective) return { messageBody };
  const { introduction, sectionDefaults } = collectFixedTexts(effective);
  const intro = introduction || sectionDefaults.user_message || "";
  return {
    introduction: intro || undefined,
    messageBody,
  };
}

/** Message / Demande — Destinataire from Gestion des modèles (fallback to code defaults). */
function mapTemplateDestinataireLines(
  effective: EffectiveTemplateConfig | null | undefined,
): OfficialRecipientLine[] {
  const slots = effective?.destinataireLines ?? [];
  if (slots.length === 0) {
    return MESSAGE_DEMANDE_FIXED_RECIPIENT_LINES;
  }
  return slots
    .map((row) => ({
      left: trim(row.left),
      right: trim(row.right) || undefined,
    }))
    .filter((row) => row.left || row.right);
}

/** Message / Demande — Expéditeur from Gestion des modèles (fallback to code defaults). */
function mapTemplateExpediteur(
  effective: EffectiveTemplateConfig | null | undefined,
): string {
  const slots = effective?.expediteurLines ?? [];
  if (slots.length === 0) {
    return MESSAGE_DEMANDE_FIXED_EXPEDITEUR;
  }
  const lines = slots.map((row) => trim(row.text)).filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : MESSAGE_DEMANDE_FIXED_EXPEDITEUR;
}

export function buildMessageDemandeOfficialDocument(input: {
  config: DocumentTemplateConfig;
  data: MessageDemandeFormData;
  t: (key: string) => string;
  effective?: EffectiveTemplateConfig | null;
}): OfficialDocumentModel {
  const { config, data, t, effective } = input;
  const autoWords = countMessageDemandeWords(data.messageBody);
  const words =
    trim(data.wordCount) || (autoWords > 0 ? String(autoWords) : "");
  const departure = trim(data.departureDateTime).replace("T", " ");
  // Message / Demande: Objet is not used (Reports only). Never emit a subject line.
  const messageBody = trim(data.messageBody) ? data.messageBody : "";
  const recipientLines = mapTemplateDestinataireLines(effective);
  const sender = mapTemplateExpediteur(effective);

  return {
    kind: config.officialKind,
    header: agencyHeader(t, effective),
    table: {
      origin: "",
      number: trim(data.referenceNumber),
      words,
      departureDateTime: departure,
      serviceMention: trim(data.serviceMention),
    },
    correspondence: {
      sender,
      to: "",
      recipient: "",
      city: "",
      diffusion: [],
      layout: "message_demande",
      recipientLines,
    },
    priority: data.priority === "URGENT" ? "URGENT" : "NORMAL",
    body: {
      subject: "",
      introduction: undefined,
      facts: [],
      messageBody,
    },
    signatories: mapTemplateSignatureSlots(effective),
    signatureLayout: "vertical",
  };
}

export function buildHeatDogOfficialDocument(input: {
  config: DocumentTemplateConfig;
  data: HeatDogReportFormData;
  t: (key: string) => string;
  effective?: EffectiveTemplateConfig | null;
}): OfficialDocumentModel {
  const { config, data, t, effective } = input;
  const resolvedTemplate = normalizeHeatDogBodyToSingleParagraph(
    effective?.reportBodyTemplate?.trim() || DEFAULT_HEAT_DOG_REPORT_BODY_TEMPLATE,
  );
  const messageBody = expandTemplatePlaceholders(
    resolvedTemplate,
    buildHeatDogPlaceholderValues(data),
  );
  const autoWords = countHeatDogReportWords(messageBody);
  const words =
    trim(data.wordCount) || (autoWords > 0 ? String(autoWords) : "");
  const departure = trim(data.departureDateTime).replace("T", " ");
  const recipientLines = mapTemplateDestinataireLines(effective);
  const sender = mapTemplateExpediteur(effective);
  const tableData: HeatDogReportFormData = {
    ...data,
    origin: trim(data.origin),
    wordCount: words,
    departureDateTime: departure,
    serviceMention: trim(data.serviceMention),
    referenceNumber: trim(data.referenceNumber),
  };

  return {
    kind: config.officialKind,
    header: agencyHeader(t, effective),
    table: {
      origin: tableData.origin,
      number: tableData.referenceNumber,
      words,
      departureDateTime: departure,
      serviceMention: tableData.serviceMention,
      cells: buildHeatDogRadioTableCells(tableData, null),
    },
    correspondence: {
      sender,
      to: "",
      recipient: "",
      city: "",
      diffusion: [],
      layout: "message_demande",
      recipientLines,
    },
    priority: data.priority === "URGENT" ? "URGENT" : "NORMAL",
    body: {
      // Rapport de chienne en chaleur: Objet / document title stays empty (like Message / Demande).
      subject: "",
      introduction: undefined,
      facts: [],
      messageBody,
    },
    signatories: mapTemplateSignatureSlots(effective),
    signatureLayout: "vertical",
  };
}

export function buildSickDogOfficialDocumentFromEngine(input: {
  config: DocumentTemplateConfig;
  data: SickDogReportFormData;
  dog: DogRow | null;
  db: DatabaseLinkContext;
  t: (key: string) => string;
  effective?: EffectiveTemplateConfig | null;
}): OfficialDocumentModel {
  const { config, data, dog, db, t, effective } = input;
  const words =
    trim(data.wordCount) ||
    (countMessageWords(data.messageBody) > 0
      ? String(countMessageWords(data.messageBody))
      : "");
  const departure = trim(data.departureDateTime).replace("T", " ");
  const medication = trim(data.medication);
  const { introduction, messageBody } = applyFixedIntroduction(effective, data.messageBody);

  const facts = [
    fact(fieldLabel(t, "dogName"), dog?.name),
    fact(fieldLabel(t, "specialty"), db.specialtyLabel),
    fact(fieldLabel(t, "handler"), db.handlerLabel),
    fact(fieldLabel(t, "section"), db.sectionLabel),
    fact(fieldLabel(t, "breed"), dog?.breed),
    fact(fieldLabel(t, "microchip"), dog?.microchip_number),
    fact(fieldLabel(t, "examDate"), data.examDate),
    fact(fieldLabel(t, "veterinarianName"), data.veterinarianName),
    fact(fieldLabel(t, "examReason"), data.examReason),
    fact(fieldLabel(t, "clinicalObservations"), data.clinicalObservations),
    fact(fieldLabel(t, "diagnosis"), data.diagnosis),
    fact(fieldLabel(t, "treatment"), data.treatment),
    fact(fieldLabel(t, "medication"), medication),
    fact(fieldLabel(t, "restPeriod"), data.restPeriod),
    fact(fieldLabel(t, "additionalObservations"), data.additionalObservations),
  ].filter((row): row is OfficialFactRow => Boolean(row));

  const attachments = data.attachments.map(trim).filter(Boolean);

  return {
    kind: config.officialKind,
    header: agencyHeader(t, effective),
    table: {
      origin: trim(data.origin),
      number: trim(data.number),
      words,
      departureDateTime: departure,
      serviceMention: trim(data.serviceMention),
    },
    correspondence: {
      sender: trim(data.senderUnit),
      to: trim(data.recipient),
      recipient: trim(data.recipient),
      city: trim(data.city),
      diffusion: data.diffusion.map(trim).filter(Boolean),
    },
    priority: data.priority === "URGENT" ? "URGENT" : "NORMAL",
    body: {
      subject: resolveSubject(config, t, effective),
      introduction,
      facts,
      messageBody,
      attachments: attachments.length > 0 ? attachments : undefined,
    },
    signatories: mapSignatories(data.signatories),
  };
}

export function buildGenericRadioOfficialDocument(input: {
  config: DocumentTemplateConfig;
  data: GenericRadioReportFormData;
  dog: DogRow | null;
  db: DatabaseLinkContext;
  t: (key: string) => string;
  effective?: EffectiveTemplateConfig | null;
}): OfficialDocumentModel {
  const { config, data, dog, db, t, effective } = input;
  const words =
    countMessageWords(data.messageBody) > 0
      ? String(countMessageWords(data.messageBody))
      : "";
  const departure = trim(data.departureDateTime).replace("T", " ");
  const { introduction, messageBody } = applyFixedIntroduction(effective, data.messageBody);

  const facts = [
    fact(fieldLabel(t, "dogName"), dog?.name),
    fact(fieldLabel(t, "specialty"), db.specialtyLabel),
    fact(fieldLabel(t, "handler"), db.handlerLabel),
    fact(fieldLabel(t, "section"), db.sectionLabel),
    fact(fieldLabel(t, "examDate"), data.examDate),
    fact(fieldLabel(t, "veterinarianName"), data.veterinarianName),
    fact(fieldLabel(t, "examReason"), data.examReason),
    fact(fieldLabel(t, "clinicalObservations"), data.clinicalObservations),
    fact(fieldLabel(t, "treatment"), data.treatment),
  ].filter((row): row is OfficialFactRow => Boolean(row));

  const attachments = data.attachments.map(trim).filter(Boolean);

  return {
    kind: config.officialKind,
    header: agencyHeader(t, effective),
    table: {
      origin: trim(data.origin),
      number: trim(data.number),
      words,
      departureDateTime: departure,
      serviceMention: "",
    },
    correspondence: {
      sender: trim(data.senderUnit),
      to: trim(data.recipient),
      recipient: trim(data.recipient),
      city: trim(data.city),
      diffusion: data.diffusion.map(trim).filter(Boolean),
    },
    priority: data.priority === "URGENT" ? "URGENT" : "NORMAL",
    body: {
      subject: resolveSubject(config, t, effective),
      introduction,
      facts,
      messageBody,
      attachments: attachments.length > 0 ? attachments : undefined,
    },
    signatories: mapSignatories(data.signatories),
  };
}
