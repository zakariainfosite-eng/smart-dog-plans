import type { AuthRole } from "@/integrations/auth/types";
import type { DbClient } from "@/integrations/database/client";
import { randomId } from "@/lib/random-id";

export const PLANNING_SETTINGS_KEY = "planning";
export const PLANNING_SETTINGS_QUERY_KEY = ["application-settings", "planning"] as const;

export type PlanningShiftHours = {
  dayStart: string;
  dayEnd: string;
  nightStart: string;
  nightEnd: string;
};

export type PlanningShiftField = keyof PlanningShiftHours;

export type PlanningValidationIssue = "format" | "same";

export type PlanningValidationErrors = Partial<Record<PlanningShiftField, PlanningValidationIssue>>;

/** Current operational windows used by the planning UI and dashboard. */
export const DEFAULT_PLANNING_SETTINGS: PlanningShiftHours = {
  dayStart: "09:00",
  dayEnd: "21:00",
  nightStart: "21:00",
  nightEnd: "09:00",
};

type PlanningSettingsRow = {
  id: string;
  key: string;
  value: unknown;
};

export function canEditPlanningSettings(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}

export function normalizeHhmm(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return value.trim();
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function isValidHhmm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalizeHhmm(value));
}

export function hhmmToMinutes(value: string): number | null {
  const normalized = normalizeHhmm(value);
  if (!isValidHhmm(normalized)) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") return value;
  }
  return "";
}

export function parsePlanningSettings(value: unknown): PlanningShiftHours {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_PLANNING_SETTINGS };
  }
  const source = value as Record<string, unknown>;
  const parsed: PlanningShiftHours = {
    dayStart: normalizeHhmm(pickString(source, "dayStart", "day_start") || DEFAULT_PLANNING_SETTINGS.dayStart),
    dayEnd: normalizeHhmm(pickString(source, "dayEnd", "day_end") || DEFAULT_PLANNING_SETTINGS.dayEnd),
    nightStart: normalizeHhmm(pickString(source, "nightStart", "night_start") || DEFAULT_PLANNING_SETTINGS.nightStart),
    nightEnd: normalizeHhmm(pickString(source, "nightEnd", "night_end") || DEFAULT_PLANNING_SETTINGS.nightEnd),
  };
  return isValidHhmm(parsed.dayStart) &&
    isValidHhmm(parsed.dayEnd) &&
    isValidHhmm(parsed.nightStart) &&
    isValidHhmm(parsed.nightEnd)
    ? parsed
    : { ...DEFAULT_PLANNING_SETTINGS };
}

export function normalizePlanningSettings(input: PlanningShiftHours): PlanningShiftHours {
  return {
    dayStart: normalizeHhmm(input.dayStart),
    dayEnd: normalizeHhmm(input.dayEnd),
    nightStart: normalizeHhmm(input.nightStart),
    nightEnd: normalizeHhmm(input.nightEnd),
  };
}

export function validatePlanningSettings(input: PlanningShiftHours): PlanningValidationErrors {
  const normalized = normalizePlanningSettings(input);
  const errors: PlanningValidationErrors = {};
  const fields: PlanningShiftField[] = ["dayStart", "dayEnd", "nightStart", "nightEnd"];
  for (const field of fields) {
    if (!normalized[field].trim()) continue;
    if (!isValidHhmm(normalized[field])) errors[field] = "format";
  }
  if (
    normalized.dayStart.trim() &&
    normalized.dayEnd.trim() &&
    !errors.dayStart &&
    !errors.dayEnd &&
    normalized.dayStart === normalized.dayEnd
  ) {
    errors.dayStart = "same";
    errors.dayEnd = "same";
  }
  if (
    normalized.nightStart.trim() &&
    normalized.nightEnd.trim() &&
    !errors.nightStart &&
    !errors.nightEnd &&
    normalized.nightStart === normalized.nightEnd
  ) {
    errors.nightStart = "same";
    errors.nightEnd = "same";
  }
  return errors;
}

function coalesceEmptyPlanningSettings(input: PlanningShiftHours): PlanningShiftHours {
  const normalized = normalizePlanningSettings(input);
  return {
    dayStart: normalized.dayStart.trim() ? normalized.dayStart : DEFAULT_PLANNING_SETTINGS.dayStart,
    dayEnd: normalized.dayEnd.trim() ? normalized.dayEnd : DEFAULT_PLANNING_SETTINGS.dayEnd,
    nightStart: normalized.nightStart.trim() ? normalized.nightStart : DEFAULT_PLANNING_SETTINGS.nightStart,
    nightEnd: normalized.nightEnd.trim() ? normalized.nightEnd : DEFAULT_PLANNING_SETTINGS.nightEnd,
  };
}

export function planningSettingsEqual(a: PlanningShiftHours, b: PlanningShiftHours): boolean {
  const left = normalizePlanningSettings(a);
  const right = normalizePlanningSettings(b);
  return (
    left.dayStart === right.dayStart &&
    left.dayEnd === right.dayEnd &&
    left.nightStart === right.nightStart &&
    left.nightEnd === right.nightEnd
  );
}

export function shiftHoursI18nParams(hours: PlanningShiftHours = DEFAULT_PLANNING_SETTINGS) {
  const normalized = normalizePlanningSettings(hours);
  return {
    start: normalized.dayStart,
    end: normalized.dayEnd,
    dayStart: normalized.dayStart,
    dayEnd: normalized.dayEnd,
    nightStart: normalized.nightStart,
    nightEnd: normalized.nightEnd,
  };
}

/**
 * Day window used to decide the current operational shift.
 * Night is the complement, including overnight windows such as 21:00 → 09:00.
 */
export function isWithinDayShiftWindow(
  now: Date,
  hours: PlanningShiftHours = DEFAULT_PLANNING_SETTINGS,
): boolean {
  const start = hhmmToMinutes(hours.dayStart);
  const end = hhmmToMinutes(hours.dayEnd);
  if (start == null || end == null || start === end) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function findPlanningSettingsRow(db: DbClient): Promise<PlanningSettingsRow | null> {
  const { data, error } = await db
    .from("application_settings")
    .select("id, key, value")
    .eq("key", PLANNING_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as PlanningSettingsRow) : null;
}

export async function fetchPlanningSettings(db: DbClient): Promise<PlanningShiftHours> {
  const row = await findPlanningSettingsRow(db);
  if (!row) return { ...DEFAULT_PLANNING_SETTINGS };
  return parsePlanningSettings(row.value);
}

export async function savePlanningSettings(
  db: DbClient,
  input: PlanningShiftHours,
): Promise<PlanningShiftHours> {
  const coalesced = coalesceEmptyPlanningSettings(input);
  const errors = validatePlanningSettings(coalesced);
  if (Object.keys(errors).length > 0) {
    throw new Error("Invalid planning settings");
  }

  const timestamp = nowIso();
  const existing = await findPlanningSettingsRow(db);

  if (existing) {
    const { error } = await db
      .from("application_settings")
      .update({
        value: coalesced,
        updated_at: timestamp,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return coalesced;
  }

  const { error } = await db.from("application_settings").insert({
    id: randomId(),
    key: PLANNING_SETTINGS_KEY,
    value: coalesced,
    description: "Future planning shift hours",
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (error) throw new Error(error.message);
  return coalesced;
}
