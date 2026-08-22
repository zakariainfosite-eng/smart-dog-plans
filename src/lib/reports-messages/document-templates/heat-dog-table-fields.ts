import type { OfficialRadioTableCell } from "@/lib/reports-messages/official-document/types";
import {
  formatHeatDogDisplayDate,
  type HeatDogReportFormData,
} from "@/lib/reports-messages/document-templates/heat-dog-report";

/**
 * Radio Départ table cells for the heat-dog official PDF.
 * Independent from PDF_CHIEN_TEMPLATE (Chiens list PDF).
 * The Rapport de chienne en chaleur always uses the default 5 Radio Départ columns.
 */

export type HeatDogTableFieldId =
  | "origin"
  | "number"
  | "words"
  | "departureDateTime"
  | "serviceMention"
  | "dogName"
  | "handler"
  | "handlerName"
  | "handlerGrade"
  | "handlerMatricule"
  | "specialty"
  | "breed"
  | "microchip"
  | "gender"
  | "dogBirthDate"
  | "heatStartDate"
  | "heatEndDate"
  | "handlerSection"
  | "trainingLevel"
  | "assignmentDate"
  | "healthStatus"
  | "aideSoignantName"
  | "aideSoignantGrade"
  | "aideSoignantMatricule"
  | "reportDate";

/** Alias: heat-dog reports consume the CHIEN entity table template. */
export type ChienPdfTableFieldId = HeatDogTableFieldId;

export type HeatDogTableFieldConfig = {
  id: HeatDogTableFieldId;
  enabled: boolean;
};

export type HeatDogTableFieldCatalogItem = {
  id: HeatDogTableFieldId;
  /** Exact PDF header — same language as the current Radio Départ labels. */
  pdfLabel: string;
  /** i18n key under entityPdfTable.chien.fields.* */
  labelKey: string;
  defaultEnabled: boolean;
};

export const HEAT_DOG_TABLE_FIELD_CATALOG: readonly HeatDogTableFieldCatalogItem[] = [
  { id: "origin", pdfLabel: "Origine", labelKey: "origin", defaultEnabled: true },
  { id: "number", pdfLabel: "Numéro", labelKey: "number", defaultEnabled: true },
  { id: "words", pdfLabel: "Mots", labelKey: "words", defaultEnabled: true },
  {
    id: "departureDateTime",
    pdfLabel: "Date et heure de départ",
    labelKey: "departureDateTime",
    defaultEnabled: true,
  },
  {
    id: "serviceMention",
    pdfLabel: "Mention de servi",
    labelKey: "serviceMention",
    defaultEnabled: true,
  },
  { id: "dogName", pdfLabel: "Nom du chien", labelKey: "dogName", defaultEnabled: false },
  { id: "handler", pdfLabel: "Maître", labelKey: "handler", defaultEnabled: false },
  {
    id: "handlerName",
    pdfLabel: "Nom / Prénom du maître",
    labelKey: "handlerName",
    defaultEnabled: false,
  },
  { id: "handlerGrade", pdfLabel: "Grade du maître", labelKey: "handlerGrade", defaultEnabled: false },
  {
    id: "handlerMatricule",
    pdfLabel: "Matricule du maître",
    labelKey: "handlerMatricule",
    defaultEnabled: false,
  },
  { id: "specialty", pdfLabel: "Spécialité", labelKey: "specialty", defaultEnabled: false },
  { id: "breed", pdfLabel: "Race", labelKey: "breed", defaultEnabled: false },
  {
    id: "microchip",
    pdfLabel: "Identification du chien",
    labelKey: "microchip",
    defaultEnabled: false,
  },
  { id: "gender", pdfLabel: "Sexe", labelKey: "gender", defaultEnabled: false },
  {
    id: "dogBirthDate",
    pdfLabel: "Date de naissance du chien",
    labelKey: "dogBirthDate",
    defaultEnabled: false,
  },
  {
    id: "heatStartDate",
    pdfLabel: "Date début des chaleurs",
    labelKey: "heatStartDate",
    defaultEnabled: false,
  },
  {
    id: "heatEndDate",
    pdfLabel: "Date fin des chaleurs",
    labelKey: "heatEndDate",
    defaultEnabled: false,
  },
  {
    id: "handlerSection",
    pdfLabel: "Section du maître",
    labelKey: "handlerSection",
    defaultEnabled: false,
  },
  {
    id: "trainingLevel",
    pdfLabel: "Niveau de dressage",
    labelKey: "trainingLevel",
    defaultEnabled: false,
  },
  {
    id: "assignmentDate",
    pdfLabel: "Date d'affectation",
    labelKey: "assignmentDate",
    defaultEnabled: false,
  },
  {
    id: "healthStatus",
    pdfLabel: "État de santé",
    labelKey: "healthStatus",
    defaultEnabled: false,
  },
  {
    id: "aideSoignantName",
    pdfLabel: "Nom / Prénom de l'aide-soignant vétérinaire",
    labelKey: "aideSoignantName",
    defaultEnabled: false,
  },
  {
    id: "aideSoignantGrade",
    pdfLabel: "Grade de l'aide-soignant",
    labelKey: "aideSoignantGrade",
    defaultEnabled: false,
  },
  {
    id: "aideSoignantMatricule",
    pdfLabel: "Matricule de l'aide-soignant",
    labelKey: "aideSoignantMatricule",
    defaultEnabled: false,
  },
  { id: "reportDate", pdfLabel: "Date du rapport", labelKey: "reportDate", defaultEnabled: false },
];

const CATALOG_BY_ID = new Map(HEAT_DOG_TABLE_FIELD_CATALOG.map((item) => [item.id, item]));

export function defaultHeatDogTableFields(): HeatDogTableFieldConfig[] {
  return HEAT_DOG_TABLE_FIELD_CATALOG.map((item) => ({
    id: item.id,
    enabled: item.defaultEnabled,
  }));
}

export function isHeatDogTableFieldId(value: string): value is HeatDogTableFieldId {
  return CATALOG_BY_ID.has(value as HeatDogTableFieldId);
}

/** Keep stored order; append any new catalog fields (disabled). */
export function normalizeHeatDogTableFieldConfigs(
  stored: HeatDogTableFieldConfig[] | null | undefined,
): HeatDogTableFieldConfig[] {
  const defaults = defaultHeatDogTableFields();
  if (!stored || stored.length === 0) return defaults;

  const seen = new Set<HeatDogTableFieldId>();
  const next: HeatDogTableFieldConfig[] = [];
  for (const row of stored) {
    if (!isHeatDogTableFieldId(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    next.push({ id: row.id, enabled: Boolean(row.enabled) });
  }
  for (const item of defaults) {
    if (seen.has(item.id)) continue;
    next.push(item);
  }
  return next.length > 0 ? next : defaults;
}

function cellValue(id: HeatDogTableFieldId, data: HeatDogReportFormData): string {
  switch (id) {
    case "origin":
      return data.origin.trim();
    case "number":
      return data.referenceNumber.trim();
    case "words":
      return data.wordCount.trim();
    case "departureDateTime":
      return data.departureDateTime.trim().replace("T", " ");
    case "serviceMention":
      return data.serviceMention.trim();
    case "dogName":
      return data.dogName.trim();
    case "handler":
      return data.hasMaster ? "Oui" : "Non";
    case "handlerName":
      return data.handlerName.trim();
    case "handlerGrade":
      return data.handlerGrade.trim();
    case "handlerMatricule":
      return data.handlerMatricule.trim();
    case "specialty":
      return data.specialty.trim();
    case "breed":
      return data.breed.trim();
    case "microchip":
      return data.microchip.trim();
    case "gender": {
      const sex = data.gender.trim();
      if (sex === "male") return "Mâle";
      if (sex === "female") return "Femelle";
      return "";
    }
    case "dogBirthDate":
      return formatHeatDogDisplayDate(data.dogBirthDate);
    case "heatStartDate":
      return formatHeatDogDisplayDate(data.heatStartDate);
    case "heatEndDate":
      return formatHeatDogDisplayDate(data.heatEndDate);
    case "handlerSection":
      return data.handlerSection.trim();
    case "trainingLevel":
      return data.trainingLevel.trim();
    case "assignmentDate":
      return formatHeatDogDisplayDate(data.assignmentDate);
    case "healthStatus":
      return data.healthStatus.trim();
    case "aideSoignantName":
      return data.aideSoignantName.trim();
    case "aideSoignantGrade":
      return data.aideSoignantGrade.trim();
    case "aideSoignantMatricule":
      return data.aideSoignantMatricule.trim();
    case "reportDate":
      return formatHeatDogDisplayDate(data.reportDate);
    default:
      return "";
  }
}

/**
 * Selected fields, in admin order. If none enabled, keep the current 5 Radio Départ cells.
 */
export function buildHeatDogRadioTableCells(
  data: HeatDogReportFormData,
  fields: HeatDogTableFieldConfig[] | null | undefined,
): OfficialRadioTableCell[] {
  const normalized = normalizeHeatDogTableFieldConfigs(fields);
  const selected = normalized.filter((row) => row.enabled);
  const source = selected.length > 0 ? selected : normalized.filter((row) => {
    const item = CATALOG_BY_ID.get(row.id);
    return item?.defaultEnabled;
  });
  return source.map((row) => {
    const item = CATALOG_BY_ID.get(row.id);
    return {
      label: item?.pdfLabel ?? row.id,
      value: cellValue(row.id, data),
    };
  });
}
