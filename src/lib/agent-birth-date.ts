import { differenceInYears, format, isAfter, isValid, parseISO, startOfDay } from "date-fns";

export const AGENT_MIN_AGE = 18;
export const AGENT_MAX_AGE = 70;

/** Normalize stored / form values to `yyyy-MM-dd`, or null when empty/invalid. */
export function normalizeAgentBirthDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const iso = value.trim().slice(0, 10);
  const parsed = parseISO(iso);
  if (!isValid(parsed)) return null;
  return format(parsed, "yyyy-MM-dd");
}

/** French display: jj/mm/aaaa */
export function formatAgentBirthDateDisplay(value: string | null | undefined): string {
  const iso = normalizeAgentBirthDate(value);
  if (!iso) return "";
  return format(parseISO(iso), "dd/MM/yyyy");
}

export type AgentBirthDateValidationCode =
  | "required"
  | "invalid"
  | "future"
  | "tooYoung"
  | "tooOld";

/**
 * Validate a birth date for create/edit forms.
 * Empty is invalid when `required` (form always requires a value).
 */
export function validateAgentBirthDate(
  value: string | null | undefined,
  reference: Date = new Date(),
): AgentBirthDateValidationCode | null {
  if (!value?.trim()) return "required";
  const iso = normalizeAgentBirthDate(value);
  if (!iso) return "invalid";

  const birth = startOfDay(parseISO(iso));
  const today = startOfDay(reference);
  if (isAfter(birth, today)) return "future";

  const age = differenceInYears(today, birth);
  if (age < AGENT_MIN_AGE) return "tooYoung";
  if (age > AGENT_MAX_AGE) return "tooOld";
  return null;
}
