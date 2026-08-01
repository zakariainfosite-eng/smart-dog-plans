import {
  addYears,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
  parseISO,
} from "date-fns";

export function formatDogAgeLabel(
  dateOfBirth: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!dateOfBirth?.trim()) return t("common.none");

  let dob: Date;
  try {
    dob = parseISO(dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) return t("common.none");
  } catch {
    return t("common.none");
  }

  const now = new Date();
  const totalDays = differenceInDays(now, dob);

  if (totalDays < 30) {
    return t("dogs.age.days", { count: totalDays });
  }

  const totalMonths = differenceInMonths(now, dob);
  if (totalMonths < 12) {
    return t("dogs.age.months", { count: totalMonths });
  }

  const years = differenceInYears(now, dob);
  const months = differenceInMonths(now, addYears(dob, years));

  if (months === 0) {
    return t("dogs.age.years", { count: years });
  }

  return t("dogs.age.yearsAndMonths", { count: years, years, months });
}
