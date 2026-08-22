import type { DogRow } from "@/integrations/database";
import {
  countMessageWords,
  type SickDogReportFormData,
} from "@/lib/reports-messages/sick-dog-report";
import type {
  OfficialDocumentBuildContext,
  OfficialDocumentModel,
  OfficialFactRow,
} from "@/lib/reports-messages/official-document/types";

function trim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function fact(
  labels: OfficialDocumentBuildContext["labels"]["factLabels"],
  key: string,
  value: string | null | undefined,
): OfficialFactRow | null {
  const text = trim(value);
  if (!text) return null;
  const label = labels[key] ?? key;
  return { label, value: text };
}

/**
 * Build the official document model for « Rapport de chien malade ».
 * Empty optional fields are omitted from the facts table.
 * The user message is copied verbatim (line breaks preserved).
 */
export function buildSickDogOfficialDocument(input: {
  data: SickDogReportFormData;
  dog: DogRow | null;
  specialtyLabel: string;
  handlerLabel: string;
  sectionLabel?: string;
  labels: OfficialDocumentBuildContext["labels"];
}): OfficialDocumentModel {
  const { data, dog, specialtyLabel, handlerLabel, sectionLabel, labels } = input;

  const words =
    trim(data.wordCount) ||
    (countMessageWords(data.messageBody) > 0
      ? String(countMessageWords(data.messageBody))
      : "");

  const departure = trim(data.departureDateTime).replace("T", " ");

  const facts = [
    fact(labels.factLabels, "dogName", dog?.name),
    fact(labels.factLabels, "specialty", specialtyLabel),
    fact(labels.factLabels, "handler", handlerLabel),
    fact(labels.factLabels, "section", sectionLabel),
    fact(labels.factLabels, "breed", dog?.breed),
    fact(labels.factLabels, "microchip", dog?.microchip_number),
    fact(labels.factLabels, "examDate", data.examDate),
    fact(labels.factLabels, "veterinarianName", data.veterinarianName),
    fact(labels.factLabels, "examReason", data.examReason),
    fact(labels.factLabels, "clinicalObservations", data.clinicalObservations),
    fact(labels.factLabels, "diagnosis", data.diagnosis),
    fact(labels.factLabels, "treatment", data.treatment),
    fact(labels.factLabels, "restPeriod", data.restPeriod),
    fact(labels.factLabels, "additionalObservations", data.additionalObservations),
  ].filter((row): row is OfficialFactRow => Boolean(row));

  const signatories = [...data.signatories]
    .filter((row) => row.enabled && (trim(row.name) || trim(row.functionTitle)))
    .sort((a, b) => a.order - b.order)
    .map((row) => ({
      fullName: trim(row.name),
      functionTitle: trim(row.functionTitle),
    }));

  return {
    kind: "sick_dog_report",
    header: {
      agencyLines: [labels.agencyLine1, labels.agencyLine2],
      radioTitle: labels.radioTitle,
    },
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
      subject: labels.subject,
      facts,
      messageBody: data.messageBody, // exact user text
    },
    signatories,
  };
}

export function sickDogOfficialLabelsFromT(
  t: (key: string) => string,
): OfficialDocumentBuildContext["labels"] {
  return {
    agencyLine1: t("reportsMessages.sickDogReport.preview.agencyLine1"),
    agencyLine2: t("reportsMessages.sickDogReport.preview.agencyLine2"),
    radioTitle: t("reportsMessages.sickDogReport.preview.radioDepart"),
    subject: t("reportsMessages.sickDogReport.preview.documentTitle"),
    de: t("reportsMessages.sickDogReport.preview.expediteur"),
    a: t("reportsMessages.sickDogReport.preview.a"),
    destinataire: t("reportsMessages.sickDogReport.preview.destinataire"),
    diffusion: t("reportsMessages.sickDogReport.preview.diffusion"),
    factLabels: {
      dogName: t("reportsMessages.sickDogReport.fields.dogName"),
      specialty: t("reportsMessages.sickDogReport.fields.specialty"),
      handler: t("reportsMessages.sickDogReport.fields.handler"),
      section: t("reportsMessages.sickDogReport.fields.section"),
      breed: t("reportsMessages.sickDogReport.fields.breed"),
      microchip: t("reportsMessages.sickDogReport.fields.microchip"),
      examDate: t("reportsMessages.sickDogReport.fields.examDate"),
      veterinarianName: t("reportsMessages.sickDogReport.fields.veterinarianName"),
      examReason: t("reportsMessages.sickDogReport.fields.examReason"),
      clinicalObservations: t("reportsMessages.sickDogReport.fields.clinicalObservations"),
      diagnosis: t("reportsMessages.sickDogReport.fields.diagnosis"),
      treatment: t("reportsMessages.sickDogReport.fields.treatment"),
      restPeriod: t("reportsMessages.sickDogReport.fields.restPeriod"),
      additionalObservations: t(
        "reportsMessages.sickDogReport.fields.additionalObservations",
      ),
    },
  };
}
