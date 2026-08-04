import type { TFunction } from "i18next";

export type DogSexValue = "male" | "female" | null | undefined | string;

/** Normalize DB gender for display — unknown/missing → null. */
export function normalizeDogSex(gender: DogSexValue): "male" | "female" | null {
  if (gender === "male" || gender === "female") return gender;
  return null;
}

/** Table / details label: ♂ Mâle · ♀ Femelle · Non renseigné */
export function formatDogSexLabel(gender: DogSexValue, t: TFunction): string {
  const sex = normalizeDogSex(gender);
  if (sex === "male") return t("dogs.sex.maleDisplay");
  if (sex === "female") return t("dogs.sex.femaleDisplay");
  return t("dogs.sex.unspecified");
}

/** Compact PDF / official list label. */
export function formatDogSexPdfLabel(gender: DogSexValue): string {
  const sex = normalizeDogSex(gender);
  if (sex === "male") return "MÂLE";
  if (sex === "female") return "FEMELLE";
  return "NON RENSEIGNÉ";
}

/** Search haystack tokens for a dog's sex (locale + symbols). */
export function dogSexSearchTokens(gender: DogSexValue, t: TFunction): string {
  const sex = normalizeDogSex(gender);
  if (sex === "male") {
    return `male mâle males mâles ♂ ${t("dogs.gender.male")} ${t("dogs.sex.maleDisplay")}`.toLowerCase();
  }
  if (sex === "female") {
    return `female femelle females femelles ♀ ${t("dogs.gender.female")} ${t("dogs.sex.femaleDisplay")}`.toLowerCase();
  }
  return `non renseigné unspecified ${t("dogs.sex.unspecified")}`.toLowerCase();
}
