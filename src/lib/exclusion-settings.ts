import type { AuthRole } from "@/integrations/auth/types";
import type { DbClient } from "@/integrations/database/client";
import {
  DOG_EXCLUSION_FORM_TYPES,
  PERSONNEL_EXCLUSION_FORM_TYPES,
  isOpenEndedExclusionType,
  type ExclusionType,
} from "@/lib/agent-exclusions";
import { randomId } from "@/lib/random-id";

/** Stored in application_settings.key — configuration only, never exclusion rows. */
export const EXCLUSION_SETTINGS_KEY = "exclusions";
export const EXCLUSION_SETTINGS_QUERY_KEY = ["application-settings", "exclusions"] as const;

export type ExclusionSettingsCategory = "personnel" | "dog";
export type ExclusionDurationKind = "dated" | "openEnded";
export type ExclusionReminderKey = "d2" | "d1" | "d0";

export type ExclusionReminderSettings = {
  d2: boolean;
  d1: boolean;
  d0: boolean;
};

/** Heures locales (HH:mm) pour les notifications natives Android du cycle d'exclusion. */
export type ExclusionAndroidNotificationTimes = {
  time1: string;
  time2: string;
};

export const DEFAULT_EXCLUSION_NATIVE_NOTIFICATION_TIMES: ExclusionAndroidNotificationTimes = {
  time1: "08:00",
  time2: "14:00",
};

const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeExclusionNativeTimes(
  input: ExclusionAndroidNotificationTimes,
): ExclusionAndroidNotificationTimes {
  const time1 = HHMM_PATTERN.test(input.time1.trim()) ? input.time1.trim() : DEFAULT_EXCLUSION_NATIVE_NOTIFICATION_TIMES.time1;
  const time2 = HHMM_PATTERN.test(input.time2.trim()) ? input.time2.trim() : DEFAULT_EXCLUSION_NATIVE_NOTIFICATION_TIMES.time2;
  return { time1, time2 };
}

export type ExclusionSettings = {
  disabledTypes: ExclusionType[];
  reminders: ExclusionReminderSettings;
  androidNotificationTimes: ExclusionAndroidNotificationTimes;
};

export type ExclusionSettingsCatalogRow = {
  type: ExclusionType;
  category: ExclusionSettingsCategory;
  duration: ExclusionDurationKind;
};

export const DEFAULT_EXCLUSION_REMINDERS: ExclusionReminderSettings = {
  d2: true,
  d1: true,
  d0: true,
};

/** Empty disabled list = every current creation type remains available. */
export const DEFAULT_EXCLUSION_SETTINGS: ExclusionSettings = {
  disabledTypes: [],
  reminders: { ...DEFAULT_EXCLUSION_REMINDERS },
  androidNotificationTimes: { ...DEFAULT_EXCLUSION_NATIVE_NOTIFICATION_TIMES },
};

export const EXCLUSION_REMINDER_KEYS: ExclusionReminderKey[] = ["d2", "d1", "d0"];

/**
 * Types offered when creating a new exclusion — the only catalog Settings can enable/disable.
 * History/filter types outside this list are left untouched.
 */
export const EXCLUSION_SETTINGS_CREATION_TYPES: ExclusionType[] = [
  ...PERSONNEL_EXCLUSION_FORM_TYPES,
  ...DOG_EXCLUSION_FORM_TYPES,
];

const CREATION_TYPE_SET = new Set<string>(EXCLUSION_SETTINGS_CREATION_TYPES);

export const EXCLUSION_SETTINGS_CATALOG: ExclusionSettingsCatalogRow[] =
  EXCLUSION_SETTINGS_CREATION_TYPES.map((type) => ({
    type,
    category: PERSONNEL_EXCLUSION_FORM_TYPES.includes(type) ? "personnel" : "dog",
    duration: exclusionTypeDurationKind(type),
  }));

type ExclusionSettingsRow = {
  id: string;
  key: string;
  value: unknown;
};

export function canEditExclusionSettings(role: AuthRole | null | undefined): boolean {
  return role === "admin";
}

export function exclusionTypeDurationKind(type: string): ExclusionDurationKind {
  return isOpenEndedExclusionType(type) ? "openEnded" : "dated";
}

export function isConfigurableExclusionType(type: string): type is ExclusionType {
  return CREATION_TYPE_SET.has(type);
}

export function isExclusionTypeEnabledForCreation(
  type: string,
  settings: ExclusionSettings = DEFAULT_EXCLUSION_SETTINGS,
): boolean {
  return !settings.disabledTypes.includes(type as ExclusionType);
}

export function availableExclusionFormTypes(
  catalog: readonly ExclusionType[],
  settings: ExclusionSettings = DEFAULT_EXCLUSION_SETTINGS,
  currentType?: string | null,
): ExclusionType[] {
  return catalog.filter(
    (type) => isExclusionTypeEnabledForCreation(type, settings) || type === currentType,
  );
}

export function defaultExclusionFormType(
  catalog: readonly ExclusionType[],
  settings: ExclusionSettings = DEFAULT_EXCLUSION_SETTINGS,
  fallback: ExclusionType,
): ExclusionType {
  return availableExclusionFormTypes(catalog, settings)[0] ?? fallback;
}

export function setExclusionTypeEnabled(
  settings: ExclusionSettings,
  type: ExclusionType,
  enabled: boolean,
): ExclusionSettings {
  if (!isConfigurableExclusionType(type)) return normalizeExclusionSettings(settings);
  const disabled = new Set(settings.disabledTypes);
  if (enabled) disabled.delete(type);
  else disabled.add(type);
  return normalizeExclusionSettings({
    ...settings,
    disabledTypes: [...disabled],
  });
}

export function isConfiguredReminderMilestone(
  milestone: string | null | undefined,
  settings: ExclusionSettings = DEFAULT_EXCLUSION_SETTINGS,
): milestone is ExclusionReminderKey {
  if (milestone !== "d2" && milestone !== "d1" && milestone !== "d0") return false;
  return settings.reminders[milestone] !== false;
}

export function parseExclusionSettings(value: unknown): ExclusionSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return cloneExclusionSettings(DEFAULT_EXCLUSION_SETTINGS);
  }
  const source = value as Record<string, unknown>;
  return normalizeExclusionSettings({
    disabledTypes: parseDisabledTypes(source),
    reminders: parseReminders(source),
    androidNotificationTimes: parseAndroidNotificationTimes(source),
  });
}

export function normalizeExclusionSettings(input: ExclusionSettings): ExclusionSettings {
  const seen = new Set<ExclusionType>();
  const disabledTypes: ExclusionType[] = [];
  for (const type of input.disabledTypes) {
    if (!isConfigurableExclusionType(type) || seen.has(type)) continue;
    seen.add(type);
    disabledTypes.push(type);
  }
  return {
    disabledTypes,
    reminders: {
      d2: input.reminders.d2 !== false,
      d1: input.reminders.d1 !== false,
      d0: input.reminders.d0 !== false,
    },
    androidNotificationTimes: normalizeExclusionNativeTimes(
      input.androidNotificationTimes ?? DEFAULT_EXCLUSION_NATIVE_NOTIFICATION_TIMES,
    ),
  };
}

export function exclusionSettingsEqual(a: ExclusionSettings, b: ExclusionSettings): boolean {
  const left = normalizeExclusionSettings(a);
  const right = normalizeExclusionSettings(b);
  if (
    left.reminders.d2 !== right.reminders.d2 ||
    left.reminders.d1 !== right.reminders.d1 ||
    left.reminders.d0 !== right.reminders.d0 ||
    left.androidNotificationTimes.time1 !== right.androidNotificationTimes.time1 ||
    left.androidNotificationTimes.time2 !== right.androidNotificationTimes.time2
  ) {
    return false;
  }
  if (left.disabledTypes.length !== right.disabledTypes.length) return false;
  const rightSet = new Set(right.disabledTypes);
  return left.disabledTypes.every((type) => rightSet.has(type));
}

async function findExclusionSettingsRow(db: DbClient): Promise<ExclusionSettingsRow | null> {
  const { data, error } = await db
    .from("application_settings")
    .select("id, key, value")
    .eq("key", EXCLUSION_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as ExclusionSettingsRow) : null;
}

export async function fetchExclusionSettings(db: DbClient): Promise<ExclusionSettings> {
  const row = await findExclusionSettingsRow(db);
  if (!row) return cloneExclusionSettings(DEFAULT_EXCLUSION_SETTINGS);
  return parseExclusionSettings(row.value);
}

/** Used by the notification engine: missing/unreadable settings keep current d2/d1/d0 behavior. */
export async function fetchExclusionSettingsOrDefault(db: DbClient): Promise<ExclusionSettings> {
  try {
    return await fetchExclusionSettings(db);
  } catch {
    return cloneExclusionSettings(DEFAULT_EXCLUSION_SETTINGS);
  }
}

export async function saveExclusionSettings(
  db: DbClient,
  input: ExclusionSettings,
): Promise<ExclusionSettings> {
  const normalized = normalizeExclusionSettings(input);
  const timestamp = nowIso();
  const existing = await findExclusionSettingsRow(db);

  if (existing) {
    const { error } = await db
      .from("application_settings")
      .update({
        value: normalized,
        updated_at: timestamp,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return normalized;
  }

  const { error } = await db.from("application_settings").insert({
    id: randomId(),
    key: EXCLUSION_SETTINGS_KEY,
    value: normalized,
    description: "Exclusion type availability and reminder milestones",
    created_at: timestamp,
    updated_at: timestamp,
  });
  if (error) throw new Error(error.message);
  return normalized;
}

function cloneExclusionSettings(settings: ExclusionSettings): ExclusionSettings {
  return {
    disabledTypes: [...settings.disabledTypes],
    reminders: { ...settings.reminders },
    androidNotificationTimes: { ...settings.androidNotificationTimes },
  };
}

function parseAndroidNotificationTimes(source: Record<string, unknown>): ExclusionAndroidNotificationTimes {
  const raw =
    source.androidNotificationTimes &&
    typeof source.androidNotificationTimes === "object" &&
    !Array.isArray(source.androidNotificationTimes)
      ? (source.androidNotificationTimes as Record<string, unknown>)
      : source;
  const time1 = typeof raw.time1 === "string" ? raw.time1 : DEFAULT_EXCLUSION_NATIVE_NOTIFICATION_TIMES.time1;
  const time2 = typeof raw.time2 === "string" ? raw.time2 : DEFAULT_EXCLUSION_NATIVE_NOTIFICATION_TIMES.time2;
  return normalizeExclusionNativeTimes({ time1, time2 });
}

function parseDisabledTypes(source: Record<string, unknown>): ExclusionType[] {
  const raw = source.disabledTypes ?? source.disabled_types;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is ExclusionType => typeof value === "string" && isConfigurableExclusionType(value));
}

function parseReminders(source: Record<string, unknown>): ExclusionReminderSettings {
  const raw =
    source.reminders && typeof source.reminders === "object" && !Array.isArray(source.reminders)
      ? (source.reminders as Record<string, unknown>)
      : source;
  return {
    d2: parseReminderFlag(raw, "d2", ["twoDaysBefore", "two_days_before"]),
    d1: parseReminderFlag(raw, "d1", ["oneDayBefore", "one_day_before"]),
    d0: parseReminderFlag(raw, "d0", ["sameDay", "same_day", "onTheDay"]),
  };
}

function parseReminderFlag(
  source: Record<string, unknown>,
  key: ExclusionReminderKey,
  aliases: string[],
): boolean {
  const value = source[key];
  if (typeof value === "boolean") return value;
  for (const alias of aliases) {
    const aliased = source[alias];
    if (typeof aliased === "boolean") return aliased;
  }
  return true;
}

function nowIso(): string {
  return new Date().toISOString();
}
