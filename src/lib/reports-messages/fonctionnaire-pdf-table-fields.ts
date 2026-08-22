import type {
  OfficialDocumentModel,
  OfficialRadioTableCell,
} from "@/lib/reports-messages/official-document/types";

/**
 * PDF_FUNCTIONNAIRE_TEMPLATE — column selection + order for fonctionnaire PDFs
 * (liste des fonctionnaires, fiche individuelle). Independent from PDF_CHIEN_TEMPLATE.
 */

export type FonctionnairePdfTableFieldId =
  | "lastName"
  | "firstName"
  | "fullName"
  | "grade"
  | "matricule"
  | "dogName"
  | "specialty"
  | "section"
  | "fonction"
  | "gender"
  | "dateOfBirth"
  | "origine"
  | "phone"
  | "maritalStatus"
  | "address";

export type FonctionnairePdfTableFieldConfig = {
  id: FonctionnairePdfTableFieldId;
  enabled: boolean;
};

export type FonctionnairePdfTableFieldCatalogItem = {
  id: FonctionnairePdfTableFieldId;
  pdfLabel: string;
  labelKey: string;
  defaultEnabled: boolean;
};

export type FonctionnairePdfTableSource = {
  lastName: string;
  firstName: string;
  grade: string;
  matricule: string;
  dogName: string;
  specialty: string;
  section: string;
  fonction: string;
  gender: string;
  dateOfBirth: string;
  origine: string;
  phone: string;
  maritalStatus: string;
  address: string;
};

export const FONCTIONNAIRE_PDF_TABLE_FIELD_CATALOG: readonly FonctionnairePdfTableFieldCatalogItem[] =
  [
    { id: "lastName", pdfLabel: "Nom", labelKey: "lastName", defaultEnabled: true },
    { id: "firstName", pdfLabel: "Prénom", labelKey: "firstName", defaultEnabled: true },
    { id: "fullName", pdfLabel: "Nom / Prénom", labelKey: "fullName", defaultEnabled: false },
    { id: "grade", pdfLabel: "Grade", labelKey: "grade", defaultEnabled: true },
    { id: "matricule", pdfLabel: "Matricule", labelKey: "matricule", defaultEnabled: true },
    { id: "dogName", pdfLabel: "Chien", labelKey: "dogName", defaultEnabled: true },
    { id: "specialty", pdfLabel: "Spécialité", labelKey: "specialty", defaultEnabled: true },
    { id: "section", pdfLabel: "Section", labelKey: "section", defaultEnabled: true },
    { id: "fonction", pdfLabel: "Fonction", labelKey: "fonction", defaultEnabled: false },
    { id: "gender", pdfLabel: "Sexe", labelKey: "gender", defaultEnabled: false },
    {
      id: "dateOfBirth",
      pdfLabel: "Date de naissance",
      labelKey: "dateOfBirth",
      defaultEnabled: false,
    },
    { id: "origine", pdfLabel: "Origine", labelKey: "origine", defaultEnabled: false },
    { id: "phone", pdfLabel: "Téléphone", labelKey: "phone", defaultEnabled: false },
    {
      id: "maritalStatus",
      pdfLabel: "Situation familiale",
      labelKey: "maritalStatus",
      defaultEnabled: false,
    },
    { id: "address", pdfLabel: "Adresse", labelKey: "address", defaultEnabled: false },
  ];

export type FonctionnaireListPdfColumn = {
  key: FonctionnairePdfTableFieldId;
  label: string;
  w: number;
};

/** Relative widths used when spreading selected columns across the page. */
const LIST_COLUMN_WEIGHT: Record<FonctionnairePdfTableFieldId, number> = {
  lastName: 24,
  firstName: 22,
  fullName: 36,
  grade: 14,
  matricule: 18,
  dogName: 24,
  specialty: 26,
  section: 28,
  fonction: 28,
  gender: 14,
  dateOfBirth: 22,
  origine: 20,
  phone: 20,
  maritalStatus: 24,
  address: 28,
};

const CATALOG_BY_ID = new Map(
  FONCTIONNAIRE_PDF_TABLE_FIELD_CATALOG.map((item) => [item.id, item]),
);

export function defaultFonctionnairePdfTableFields(): FonctionnairePdfTableFieldConfig[] {
  return FONCTIONNAIRE_PDF_TABLE_FIELD_CATALOG.map((item) => ({
    id: item.id,
    enabled: item.defaultEnabled,
  }));
}

export function isFonctionnairePdfTableFieldId(
  value: string,
): value is FonctionnairePdfTableFieldId {
  return CATALOG_BY_ID.has(value as FonctionnairePdfTableFieldId);
}

/** Row filter for the fonctionnaires list PDF — stored on PDF_FUNCTIONNAIRE_TEMPLATE. */
export const FONCTIONNAIRE_PDF_LIST_SCOPES = [
  "all",
  "administrative",
  "cynotechniciens",
] as const;

export type FonctionnairePdfListScope = (typeof FONCTIONNAIRE_PDF_LIST_SCOPES)[number];

export const DEFAULT_FONCTIONNAIRE_PDF_LIST_SCOPE: FonctionnairePdfListScope = "all";

export function isFonctionnairePdfListScope(value: unknown): value is FonctionnairePdfListScope {
  return (
    typeof value === "string" &&
    (FONCTIONNAIRE_PDF_LIST_SCOPES as readonly string[]).includes(value)
  );
}

export function normalizeFonctionnairePdfListScope(
  value: unknown,
): FonctionnairePdfListScope {
  return isFonctionnairePdfListScope(value) ? value : DEFAULT_FONCTIONNAIRE_PDF_LIST_SCOPE;
}

/**
 * Single list-scope filter: which personnel groups appear as PDF rows.
 * Does not change columns, order, or table chrome.
 */
export function applyFonctionnairePdfListScope<T>(
  groups: { administrative: T[]; operational: T[] },
  listScope: FonctionnairePdfListScope | null | undefined,
): { administrative: T[]; operational: T[] } {
  switch (normalizeFonctionnairePdfListScope(listScope)) {
    case "administrative":
      return { administrative: groups.administrative, operational: [] };
    case "cynotechniciens":
      return { administrative: [], operational: groups.operational };
    default:
      return groups;
  }
}

export function normalizeFonctionnairePdfTableFieldConfigs(
  stored: FonctionnairePdfTableFieldConfig[] | null | undefined,
): FonctionnairePdfTableFieldConfig[] {
  const defaults = defaultFonctionnairePdfTableFields();
  if (!stored || stored.length === 0) return defaults;

  const seen = new Set<FonctionnairePdfTableFieldId>();
  const next: FonctionnairePdfTableFieldConfig[] = [];
  for (const row of stored) {
    if (!isFonctionnairePdfTableFieldId(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    next.push({ id: row.id, enabled: Boolean(row.enabled) });
  }
  for (const item of defaults) {
    if (seen.has(item.id)) continue;
    next.push(item);
  }
  return next.length > 0 ? next : defaults;
}

function cellValue(
  id: FonctionnairePdfTableFieldId,
  data: FonctionnairePdfTableSource,
): string {
  switch (id) {
    case "lastName":
      return data.lastName.trim();
    case "firstName":
      return data.firstName.trim();
    case "fullName":
      return `${data.lastName} ${data.firstName}`.trim();
    case "grade":
      return data.grade.trim();
    case "matricule":
      return data.matricule.trim();
    case "dogName":
      return data.dogName.trim();
    case "specialty":
      return data.specialty.trim();
    case "section":
      return data.section.trim();
    case "fonction":
      return data.fonction.trim();
    case "gender":
      return data.gender.trim();
    case "dateOfBirth":
      return data.dateOfBirth.trim();
    case "origine":
      return data.origine.trim();
    case "phone":
      return data.phone.trim();
    case "maritalStatus":
      return data.maritalStatus.trim();
    case "address":
      return data.address.trim();
    default:
      return "";
  }
}

export function sampleFonctionnairePdfTableSource(): FonctionnairePdfTableSource {
  return {
    lastName: "EL KASSMI",
    firstName: "RAJA",
    grade: "GDPX",
    matricule: "133398",
    dogName: "CHERRY",
    specialty: "Explosifs et armes à feu",
    section: "Section Explosifs",
    fonction: "Cynotechnicien",
    gender: "Homme",
    dateOfBirth: "15/04/1990",
    origine: "Tanger",
    phone: "06 00 00 00 00",
    maritalStatus: "Marié",
    address: "Tanger",
  };
}

export function buildFonctionnaireOfficialPreviewModel(
  fields: FonctionnairePdfTableFieldConfig[] | null | undefined,
  t: (key: string) => string,
): OfficialDocumentModel {
  const cells = buildFonctionnaireRadioTableCells(
    sampleFonctionnairePdfTableSource(),
    fields,
  );
  return {
    kind: "generic_message",
    header: {
      agencyLines: [
        t("reportsMessages.sickDogReport.preview.agencyLine1"),
        t("reportsMessages.sickDogReport.preview.agencyLine2"),
      ],
      radioTitle: t("reportsMessages.sickDogReport.preview.radioDepart"),
    },
    table: {
      origin: "",
      number: "",
      words: "",
      departureDateTime: "",
      serviceMention: "",
      cells,
    },
    correspondence: {
      sender: "",
      to: "",
      recipient: "",
      city: "",
      diffusion: [],
    },
    priority: "NORMAL",
    body: {
      subject: "",
      facts: [],
      messageBody: "",
    },
    signatories: [],
  };
}

export function enabledFonctionnairePdfTableFields(
  fields: FonctionnairePdfTableFieldConfig[] | null | undefined,
): FonctionnairePdfTableFieldConfig[] {
  const normalized = normalizeFonctionnairePdfTableFieldConfigs(fields);
  const selected = normalized.filter((row) => row.enabled);
  if (selected.length > 0) return selected;
  return normalized.filter((row) => CATALOG_BY_ID.get(row.id)?.defaultEnabled);
}

export function fonctionnairePdfTableFieldLabel(id: FonctionnairePdfTableFieldId): string {
  return CATALOG_BY_ID.get(id)?.pdfLabel ?? id;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function distributeColumnWidths(weights: number[], total: number): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const widths = weights.map((weight) => round1((weight / sum) * total));
  const drift = round1(total - widths.reduce((acc, width) => acc + width, 0));
  widths[widths.length - 1] = round1((widths[widths.length - 1] ?? 0) + drift);
  return widths;
}

/**
 * List-PDF columns from the saved Fonctionnaires template.
 * Order = enabled fields in catalog/storage order. Widths sum to `contentWidth`.
 */
export function buildFonctionnaireListTableCols(
  fields: FonctionnairePdfTableFieldConfig[] | null | undefined,
  contentWidth: number,
): FonctionnaireListPdfColumn[] {
  const source = enabledFonctionnairePdfTableFields(fields);
  const widths = distributeColumnWidths(
    source.map((row) => LIST_COLUMN_WEIGHT[row.id] ?? 20),
    contentWidth,
  );
  return source.map((row, index) => ({
    key: row.id,
    label: fonctionnairePdfTableFieldLabel(row.id).toUpperCase(),
    w: widths[index] ?? 0,
  }));
}

export function buildFonctionnaireRadioTableCells(
  data: FonctionnairePdfTableSource,
  fields: FonctionnairePdfTableFieldConfig[] | null | undefined,
): OfficialRadioTableCell[] {
  return enabledFonctionnairePdfTableFields(fields).map((row) => ({
    label: fonctionnairePdfTableFieldLabel(row.id),
    value: cellValue(row.id, data),
  }));
}
