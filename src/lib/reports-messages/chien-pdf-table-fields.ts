/**
 * PDF_CHIEN_TEMPLATE — column selection + order for the Chiens list PDF.
 * Independent from PDF_FUNCTIONNAIRE_TEMPLATE and from the heat-dog Radio Départ table.
 */

import { differenceInYears, parseISO } from "date-fns";

export type ChienPdfTableFieldId =
  | "dogName"
  | "microchip"
  | "handlerName"
  | "handlerMatricule"
  | "handlerGrade"
  | "specialty"
  | "breed"
  | "gender"
  | "age"
  | "dateOfBirth"
  | "section"
  | "status"
  | "assignmentDate"
  | "detectionType";

export type ChienPdfTableFieldConfig = {
  id: ChienPdfTableFieldId;
  enabled: boolean;
};

export type ChienPdfTableFieldCatalogItem = {
  id: ChienPdfTableFieldId;
  pdfLabel: string;
  labelKey: string;
  defaultEnabled: boolean;
};

export type ChienListPdfColumn = {
  key: ChienPdfTableFieldId;
  label: string;
  w: number;
};

export const CHIENS_PDF_TABLE_FIELD_CATALOG: readonly ChienPdfTableFieldCatalogItem[] = [
  { id: "dogName", pdfLabel: "Nom du chien", labelKey: "dogName", defaultEnabled: true },
  {
    id: "microchip",
    pdfLabel: "N° de puce / Identification",
    labelKey: "microchip",
    defaultEnabled: true,
  },
  { id: "handlerName", pdfLabel: "Nom du maître", labelKey: "handlerName", defaultEnabled: true },
  {
    id: "handlerMatricule",
    pdfLabel: "Matricule du maître",
    labelKey: "handlerMatricule",
    defaultEnabled: false,
  },
  {
    id: "handlerGrade",
    pdfLabel: "Grade du maître",
    labelKey: "handlerGrade",
    defaultEnabled: false,
  },
  { id: "specialty", pdfLabel: "Spécialité", labelKey: "specialty", defaultEnabled: true },
  { id: "breed", pdfLabel: "Race", labelKey: "breed", defaultEnabled: true },
  { id: "gender", pdfLabel: "Sexe", labelKey: "gender", defaultEnabled: true },
  { id: "age", pdfLabel: "Âge", labelKey: "age", defaultEnabled: false },
  {
    id: "dateOfBirth",
    pdfLabel: "Date de naissance",
    labelKey: "dateOfBirth",
    defaultEnabled: false,
  },
  { id: "section", pdfLabel: "Section", labelKey: "section", defaultEnabled: false },
  { id: "status", pdfLabel: "Statut", labelKey: "status", defaultEnabled: false },
  {
    id: "assignmentDate",
    pdfLabel: "Date d'affectation",
    labelKey: "assignmentDate",
    defaultEnabled: false,
  },
  {
    id: "detectionType",
    pdfLabel: "Type de détection / spécialité du chien",
    labelKey: "detectionType",
    defaultEnabled: false,
  },
];

const LIST_COLUMN_WEIGHT: Record<ChienPdfTableFieldId, number> = {
  dogName: 28,
  microchip: 26,
  handlerName: 32,
  handlerMatricule: 18,
  handlerGrade: 16,
  specialty: 22,
  breed: 22,
  gender: 14,
  age: 14,
  dateOfBirth: 20,
  section: 24,
  status: 18,
  assignmentDate: 20,
  detectionType: 26,
};

const CATALOG_BY_ID = new Map(CHIENS_PDF_TABLE_FIELD_CATALOG.map((item) => [item.id, item]));

export function defaultChienPdfTableFields(): ChienPdfTableFieldConfig[] {
  return CHIENS_PDF_TABLE_FIELD_CATALOG.map((item) => ({
    id: item.id,
    enabled: item.defaultEnabled,
  }));
}

export function isChienPdfTableFieldId(value: string): value is ChienPdfTableFieldId {
  return CATALOG_BY_ID.has(value as ChienPdfTableFieldId);
}

export function normalizeChienPdfTableFieldConfigs(
  stored: ChienPdfTableFieldConfig[] | null | undefined,
): ChienPdfTableFieldConfig[] {
  const defaults = defaultChienPdfTableFields();
  if (!stored || stored.length === 0) return defaults;

  const seen = new Set<ChienPdfTableFieldId>();
  const next: ChienPdfTableFieldConfig[] = [];
  for (const row of stored) {
    if (!isChienPdfTableFieldId(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    next.push({ id: row.id, enabled: Boolean(row.enabled) });
  }
  for (const item of defaults) {
    if (seen.has(item.id)) continue;
    next.push(item);
  }
  return next.length > 0 ? next : defaults;
}

export function enabledChienPdfTableFields(
  fields: ChienPdfTableFieldConfig[] | null | undefined,
): ChienPdfTableFieldConfig[] {
  const normalized = normalizeChienPdfTableFieldConfigs(fields);
  const selected = normalized.filter((row) => row.enabled);
  if (selected.length > 0) return selected;
  return normalized.filter((row) => CATALOG_BY_ID.get(row.id)?.defaultEnabled);
}

export function chienPdfTableFieldLabel(id: ChienPdfTableFieldId): string {
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

export function buildChienListTableCols(
  fields: ChienPdfTableFieldConfig[] | null | undefined,
  contentWidth: number,
): ChienListPdfColumn[] {
  const source = enabledChienPdfTableFields(fields);
  const widths = distributeColumnWidths(
    source.map((row) => LIST_COLUMN_WEIGHT[row.id] ?? 20),
    contentWidth,
  );
  return source.map((row, index) => ({
    key: row.id,
    label: chienPdfTableFieldLabel(row.id).toUpperCase(),
    w: widths[index] ?? 0,
  }));
}

/** PDF list row filters — stored on PDF_CHIEN_TEMPLATE, independent from page Chiens filters. */
export type ChienPdfSexFilter = "all" | "male" | "female";
export type ChienPdfMinAgeYears = "all" | number;

export const DEFAULT_CHIEN_PDF_SEX_FILTER: ChienPdfSexFilter = "all";
export const DEFAULT_CHIEN_PDF_MIN_AGE_YEARS: ChienPdfMinAgeYears = "all";
export const CHIENS_PDF_SEX_FILTERS = ["all", "male", "female"] as const;
export const CHIENS_PDF_MIN_AGE_YEARS_OPTIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
] as const;

export type ChienPdfListFilterableDog = {
  gender?: string | null;
  date_of_birth?: string | null;
};

export function normalizeChienPdfSexFilter(value: unknown): ChienPdfSexFilter {
  return value === "male" || value === "female" ? value : DEFAULT_CHIEN_PDF_SEX_FILTER;
}

export function normalizeChienPdfMinAgeYears(value: unknown): ChienPdfMinAgeYears {
  if (value === "all" || value === "" || value == null) return DEFAULT_CHIEN_PDF_MIN_AGE_YEARS;
  const years = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(years) || years < 1 || years > 30) return DEFAULT_CHIEN_PDF_MIN_AGE_YEARS;
  return years;
}

/** Whole years since birth, or null when the date of birth is missing/invalid. */
export function chienPdfDogAgeYears(
  dateOfBirth: string | null | undefined,
  now = new Date(),
): number | null {
  if (!dateOfBirth?.trim()) return null;
  try {
    const dob = parseISO(dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > now) return null;
    return differenceInYears(now, dob);
  } catch {
    return null;
  }
}

export function applyChienPdfListFilters<T extends ChienPdfListFilterableDog>(
  dogs: T[],
  sexFilter: ChienPdfSexFilter | null | undefined,
  minAgeYears: ChienPdfMinAgeYears | null | undefined,
  now = new Date(),
): T[] {
  const sex = normalizeChienPdfSexFilter(sexFilter);
  const minAge = normalizeChienPdfMinAgeYears(minAgeYears);
  if (sex === "all" && minAge === "all") return dogs;
  return dogs.filter((dog) => {
    if (sex !== "all" && dog.gender !== sex) return false;
    if (minAge !== "all") {
      const years = chienPdfDogAgeYears(dog.date_of_birth, now);
      if (years === null || years < minAge) return false;
    }
    return true;
  });
}
