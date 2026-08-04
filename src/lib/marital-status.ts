import type { TFunction } from "i18next";

export const MARITAL_STATUSES = [
  "single",
  "married",
  "divorced",
  "widowed",
] as const;

export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export type MaritalStatusValue = MaritalStatus | null | undefined | string;

export function isMaritalStatus(value: unknown): value is MaritalStatus {
  return (
    typeof value === "string" &&
    (MARITAL_STATUSES as readonly string[]).includes(value)
  );
}

export function normalizeMaritalStatus(
  value: MaritalStatusValue,
): MaritalStatus | null {
  return isMaritalStatus(value) ? value : null;
}

/** Table / details label — missing → Non renseignée. */
export function formatMaritalStatusLabel(
  value: MaritalStatusValue,
  t: TFunction,
): string {
  const status = normalizeMaritalStatus(value);
  if (!status) return t("employees.maritalStatus.unspecified");
  return t(`employees.maritalStatus.${status}`);
}

/** Official PDF / CSV uppercase French labels. */
export function formatMaritalStatusPdfLabel(value: MaritalStatusValue): string {
  const status = normalizeMaritalStatus(value);
  switch (status) {
    case "single":
      return "CÉLIBATAIRE";
    case "married":
      return "MARIÉ(E)";
    case "divorced":
      return "DIVORCÉ(E)";
    case "widowed":
      return "VEUF / VEUVE";
    default:
      return "NON RENSEIGNÉ";
  }
}

/** Search haystack tokens for marital status. */
export function maritalStatusSearchTokens(
  value: MaritalStatusValue,
  t: TFunction,
): string {
  const status = normalizeMaritalStatus(value);
  if (!status) {
    return `non renseigné unspecified ${t("employees.maritalStatus.unspecified")}`.toLowerCase();
  }
  return `${status} ${t(`employees.maritalStatus.${status}`)}`.toLowerCase();
}

/** Sort rank — unspecified last. */
export function maritalStatusSortRank(value: MaritalStatusValue): number {
  const status = normalizeMaritalStatus(value);
  if (status === "single") return 0;
  if (status === "married") return 1;
  if (status === "divorced") return 2;
  if (status === "widowed") return 3;
  return 4;
}
