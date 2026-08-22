import { format, isValid, parseISO } from "date-fns";
import type { RoleDocumentPayload } from "@/lib/reports-messages/types";

export const HEAT_DOG_REPORT_TEMPLATE_ID = "injured_dog_report";
export const HEAT_DOG_REPORT_PAYLOAD_BLOB_KEY = "heat_dog_report_v1";

/**
 * Official fixed radio body — ONE continuous paragraph (Message / Demande style).
 * Line breaks in the PDF come only from A4 wrapping / justification, never from
 * stored newlines between fields.
 */
export const DEFAULT_HEAT_DOG_REPORT_BODY_TEMPLATE =
  "VOUS INFORME QUE L'AIDE SOIGNANT VETERINAIRE {{AIDE_SOIGNANT_NOM}} GRADE {{AIDE_SOIGNANT_GRADE}} MLE {{AIDE_SOIGNANT_MATRICULE}} RELEVANT CETTE BPCYN A ETABLI CE JOUR LE {{DATE}} UN RAPPORT (DONT COPIE CI-JOINTE) STOP PAR LEQUEL IL NOUS INFORME QUE LA CHIENNE DE POLICE NOMMEE ({{NOM_CHIENNE}}) SPECIALISTE EN {{SPECIALITE}} STOP PEUT REPRENDRE SES ACTIVITES NORMALES APRES FIN DE SA PERIODE DE FERTILITE (CHALLEURS) STOP SON MAITRE LE CYNOTECHNICIEN NOMME {{MAITRE_NOM}} GRADE {{MAITRE_GRADE}} MLE {{MAITRE_MATRICULE}} STOP ET FIN.";

/**
 * Collapse manual line breaks / multi-block spacing into a single paragraph.
 * Placeholders stay inline; wrapping is left to the PDF engine.
 */
export function normalizeHeatDogBodyToSingleParagraph(template: string): string {
  return template
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export type HeatDogReportFormData = {
  reportDate: string;
  referenceNumber: string;
  wordCount: string;
  departureDateTime: string;
  serviceMention: string;
  /** Radio Départ "Origine" — empty by default (same as current PDF). */
  origin: string;
  priority: "URGENT" | "NORMAL";
  /** Aide-soignant vétérinaire (agents table). */
  aideSoignantId: string;
  aideSoignantName: string;
  aideSoignantGrade: string;
  aideSoignantMatricule: string;
  dogId: string;
  dogName: string;
  specialty: string;
  breed: string;
  microchip: string;
  dogBirthDate: string;
  gender: string;
  trainingLevel: string;
  assignmentDate: string;
  healthStatus: string;
  handlerId: string;
  handlerName: string;
  handlerGrade: string;
  handlerMatricule: string;
  handlerSection: string;
  hasMaster: boolean;
  heatStartDate: string;
  heatEndDate: string;
  exclusionId: string;
};

export function createDefaultHeatDogReportFormData(context?: {
  userName?: string;
}): HeatDogReportFormData {
  const now = new Date();
  return {
    reportDate: format(now, "yyyy-MM-dd"),
    referenceNumber: "",
    wordCount: "",
    departureDateTime: format(now, "yyyy-MM-dd'T'HH:mm"),
    serviceMention: context?.userName?.trim() || "",
    origin: "",
    priority: "NORMAL",
    aideSoignantId: "",
    aideSoignantName: "",
    aideSoignantGrade: "",
    aideSoignantMatricule: "",
    dogId: "",
    dogName: "",
    specialty: "",
    breed: "",
    microchip: "",
    dogBirthDate: "",
    gender: "",
    trainingLevel: "",
    assignmentDate: "",
    healthStatus: "",
    handlerId: "",
    handlerName: "",
    handlerGrade: "",
    handlerMatricule: "",
    handlerSection: "",
    hasMaster: false,
    heatStartDate: "",
    heatEndDate: "",
    exclusionId: "",
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** Format ISO / yyyy-MM-dd dates for official prose (DD/MM/YYYY). */
export function formatHeatDogDisplayDate(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const isoDay = raw.includes("T") ? raw.slice(0, 10) : raw;
  try {
    const parsed = parseISO(isoDay);
    if (isValid(parsed) && /^\d{4}-\d{2}-\d{2}/.test(isoDay)) {
      return format(parsed, "dd/MM/yyyy");
    }
  } catch {
    /* keep raw */
  }
  return raw;
}

function upperOfficial(value: string): string {
  return value.trim().toLocaleUpperCase("fr-FR");
}

export function buildHeatDogPlaceholderValues(
  data: HeatDogReportFormData,
): Record<string, string> {
  const hasMaster = data.hasMaster && data.handlerName.trim().length > 0;
  const maitreNom = hasMaster
    ? upperOfficial(data.handlerName)
    : "CHIENNE SANS MAITRE";
  const maitreGrade = hasMaster
    ? upperOfficial(data.handlerGrade) || "-"
    : "-";
  const maitreMatricule = hasMaster
    ? upperOfficial(data.handlerMatricule) || "-"
    : "-";

  return {
    DATE: formatHeatDogDisplayDate(data.reportDate),
    AIDE_SOIGNANT_NOM: upperOfficial(data.aideSoignantName),
    AIDE_SOIGNANT_GRADE: upperOfficial(data.aideSoignantGrade),
    AIDE_SOIGNANT_MATRICULE: upperOfficial(data.aideSoignantMatricule),
    NOM_CHIENNE: upperOfficial(data.dogName),
    SPECIALITE: upperOfficial(data.specialty),
    MAITRE_NOM: maitreNom,
    MAITRE_GRADE: maitreGrade,
    MAITRE_MATRICULE: maitreMatricule,
    NOM_MAITRE: maitreNom,
    DATE_DEBUT_CHALEUR: formatHeatDogDisplayDate(data.heatStartDate),
    DATE_FIN_CHALEUR: formatHeatDogDisplayDate(data.heatEndDate),
    DATE_FIN_PREVUE: formatHeatDogDisplayDate(data.heatEndDate),
    DATE_EXAMEN: formatHeatDogDisplayDate(data.reportDate),
  };
}

/**
 * Replace {{PLACEHOLDER}} tokens. Unknown keys become empty strings.
 * Never leaves `{{…}}` in the output.
 */
export function expandTemplatePlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = values[key] ?? values[key.toUpperCase()];
    return value != null ? String(value) : "";
  });
}

export function countHeatDogReportWords(text: string): number {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return 0;
  return normalized.split(" ").filter(Boolean).length;
}

export function parseHeatDogReportFormData(
  payload: RoleDocumentPayload | null | undefined,
): HeatDogReportFormData {
  const defaults = createDefaultHeatDogReportFormData();
  if (!payload) return defaults;

  const rawBlob = payload[HEAT_DOG_REPORT_PAYLOAD_BLOB_KEY];
  if (typeof rawBlob === "string" && rawBlob.trim()) {
    try {
      const parsed = JSON.parse(rawBlob) as Record<string, unknown>;
      if (
        "aideSoignantId" in parsed ||
        "handlerMatricule" in parsed ||
        "dogName" in parsed ||
        "heatStartDate" in parsed
      ) {
        return {
          ...defaults,
          reportDate: asString(parsed.reportDate) || defaults.reportDate,
          referenceNumber: asString(parsed.referenceNumber),
          wordCount: asString(parsed.wordCount),
          departureDateTime: asString(parsed.departureDateTime) || defaults.departureDateTime,
          serviceMention: asString(parsed.serviceMention),
          origin: asString(parsed.origin),
          priority: parsed.priority === "URGENT" ? "URGENT" : "NORMAL",
          aideSoignantId: asString(parsed.aideSoignantId),
          aideSoignantName: asString(parsed.aideSoignantName),
          aideSoignantGrade: asString(parsed.aideSoignantGrade),
          aideSoignantMatricule: asString(parsed.aideSoignantMatricule),
          dogId: asString(parsed.dogId) || asString(payload.dog_id),
          dogName: asString(parsed.dogName),
          specialty: asString(parsed.specialty),
          breed: asString(parsed.breed),
          microchip: asString(parsed.microchip),
          dogBirthDate: asString(parsed.dogBirthDate),
          gender: asString(parsed.gender),
          trainingLevel: asString(parsed.trainingLevel),
          assignmentDate: asString(parsed.assignmentDate),
          healthStatus: asString(parsed.healthStatus),
          handlerId: asString(parsed.handlerId),
          handlerName: asString(parsed.handlerName),
          handlerGrade: asString(parsed.handlerGrade),
          handlerMatricule: asString(parsed.handlerMatricule),
          handlerSection: asString(parsed.handlerSection),
          hasMaster: Boolean(parsed.hasMaster ?? asString(parsed.handlerName).trim()),
          heatStartDate: asString(parsed.heatStartDate),
          heatEndDate: asString(parsed.heatEndDate),
          exclusionId: asString(parsed.exclusionId),
        };
      }
      // Legacy shapes → best-effort map
      return {
        ...defaults,
        referenceNumber: asString(parsed.number) || asString(parsed.referenceNumber),
        departureDateTime: asString(parsed.departureDateTime) || defaults.departureDateTime,
        serviceMention: asString(parsed.senderUnit) || asString(parsed.serviceMention),
        origin: asString(parsed.origin),
        priority: parsed.priority === "URGENT" ? "URGENT" : "NORMAL",
        dogId: asString(parsed.dogId) || asString(payload.dog_id),
        dogName: asString(parsed.dogName),
        specialty: asString(parsed.specialty),
        breed: asString(parsed.breed),
        microchip: asString(parsed.microchip) || asString(parsed.microchip_number),
        dogBirthDate: asString(parsed.dogBirthDate) || asString(parsed.date_of_birth),
        gender: asString(parsed.gender),
        trainingLevel: asString(parsed.trainingLevel) || asString(parsed.training_level),
        assignmentDate: asString(parsed.assignmentDate) || asString(parsed.assignment_date),
        healthStatus: asString(parsed.healthStatus) || asString(parsed.health_status),
        handlerName: asString(parsed.handlerName),
        heatStartDate: asString(parsed.heatStartDate),
        heatEndDate: asString(parsed.heatEndDate),
        reportDate: asString(parsed.examDate) || asString(parsed.reportDate) || defaults.reportDate,
      };
    } catch {
      /* fall through */
    }
  }

  return {
    ...defaults,
    dogId: asString(payload.dog_id),
    reportDate: asString(payload.report_date) || defaults.reportDate,
    serviceMention: asString(payload.author_name) || defaults.serviceMention,
  };
}

export function serializeHeatDogReportFormData(
  data: HeatDogReportFormData,
  extras?: { agentId?: string | null; sectionId?: string | null },
): RoleDocumentPayload {
  const dogId = data.dogId.trim();
  const agentId = (extras?.agentId ?? data.handlerId ?? "").trim();
  const sectionId = (extras?.sectionId ?? "").trim();
  return {
    [HEAT_DOG_REPORT_PAYLOAD_BLOB_KEY]: JSON.stringify(data),
    ...(dogId ? { dog_id: dogId } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(sectionId ? { section_id: sectionId } : {}),
    report_date: data.reportDate || data.heatEndDate || data.departureDateTime.slice(0, 10),
    author_name: data.serviceMention || data.aideSoignantName,
    priority: data.priority,
  };
}

export function heatDogValuesForValidation(
  data: HeatDogReportFormData,
): Record<string, unknown> {
  return { ...data };
}
