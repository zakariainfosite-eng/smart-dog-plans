import type { Database } from "@/integrations/database/schema-types";

export type Shift = Database["public"]["Enums"]["shift_type"];
export type CheckpointSpecialty = "narcotics" | "explosives";
export type FemalePolicy = Database["public"]["Enums"]["checkpoint_female_policy"];

/** Planning assignment priority: 1=Critical, 2=High, 3=Normal, 4=Low */
export type CheckpointPriority = 1 | 2 | 3 | 4;

export const CHECKPOINT_PRIORITIES: CheckpointPriority[] = [1, 2, 3, 4];

export const DEFAULT_CHECKPOINT_PRIORITY: CheckpointPriority = 3;

export function normalizeCheckpointPriority(value: unknown): CheckpointPriority {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return DEFAULT_CHECKPOINT_PRIORITY;
}

/**
 * Stored on checkpoints for UI / DB compatibility.
 * The Rotation Engine does NOT use this field — Priority alone drives ordering.
 */
export const DEFAULT_CHECKPOINT_MANDATORY = true;

export function normalizeCheckpointMandatory(value: unknown): boolean {
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "no" || normalized === "false" || normalized === "optional") {
      return false;
    }
  }
  return DEFAULT_CHECKPOINT_MANDATORY;
}

/** ISO weekday: 1 = Monday … 7 = Sunday */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type ShiftTeamCounts = {
  explosives: number;
  narcotics: number;
};

export type CheckpointOperationalConfig = {
  name: string;
  active: boolean;
  operating_days: Weekday[];
  day_shift_enabled: boolean;
  night_shift_enabled: boolean;
  day: ShiftTeamCounts;
  night: ShiftTeamCounts;
  female_policy: FemalePolicy;
  priority: CheckpointPriority;
  /** Persisted for UI/DB compatibility; ignored by the Rotation Engine. */
  mandatory: boolean;
};

export const DEFAULT_OPERATING_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const EMPTY_SHIFT_COUNTS: ShiftTeamCounts = {
  explosives: 0,
  narcotics: 0,
};

export function defaultOperationalConfig(): CheckpointOperationalConfig {
  return {
    name: "",
    active: true,
    operating_days: [...DEFAULT_OPERATING_DAYS],
    day_shift_enabled: true,
    night_shift_enabled: false,
    day: { ...EMPTY_SHIFT_COUNTS },
    night: { ...EMPTY_SHIFT_COUNTS },
    female_policy: "allowed",
    priority: DEFAULT_CHECKPOINT_PRIORITY,
    mandatory: DEFAULT_CHECKPOINT_MANDATORY,
  };
}

export function shiftHasRequirements(counts: ShiftTeamCounts): boolean {
  return counts.explosives + counts.narcotics > 0;
}

export function checkpointHasPlanningConfig(config: Pick<
  CheckpointOperationalConfig,
  "active" | "day_shift_enabled" | "night_shift_enabled" | "day" | "night"
>): boolean {
  if (!config.active) return false;
  const dayOk = config.day_shift_enabled && shiftHasRequirements(config.day);
  const nightOk = config.night_shift_enabled && shiftHasRequirements(config.night);
  return dayOk || nightOk;
}

/** ISO weekday from JS Date (convert Sunday=0 to ISO 7). */
export function isoWeekdayFromDate(date: Date): Weekday {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as Weekday;
}

export function isCheckpointOpenOnDate(operatingDays: Weekday[], date: Date): boolean {
  return operatingDays.includes(isoWeekdayFromDate(date));
}

export type CheckpointRowOperational = Pick<
  Database["public"]["Tables"]["checkpoints"]["Row"],
  | "name"
  | "active"
  | "operating_days"
  | "day_shift_enabled"
  | "night_shift_enabled"
  | "day_explosives"
  | "day_narcotics"
  | "night_explosives"
  | "night_narcotics"
  | "female_policy"
  | "priority"
  | "mandatory"
>;

export function operationalConfigFromRow(
  row: Partial<CheckpointRowOperational> | null | undefined,
): CheckpointOperationalConfig {
  if (!row) return defaultOperationalConfig();
  return {
    name: row.name ?? "",
    active: row.active ?? true,
    operating_days: normalizeOperatingDays(row.operating_days),
    day_shift_enabled: row.day_shift_enabled ?? true,
    night_shift_enabled: row.night_shift_enabled ?? false,
    day: {
      explosives: row.day_explosives ?? 0,
      narcotics: row.day_narcotics ?? 0,
    },
    night: {
      explosives: row.night_explosives ?? 0,
      narcotics: row.night_narcotics ?? 0,
    },
    female_policy: row.female_policy ?? "allowed",
    priority: normalizeCheckpointPriority(row.priority),
    mandatory: normalizeCheckpointMandatory(row.mandatory),
  };
}

export function normalizeOperatingDays(days: number[] | null | undefined): Weekday[] {
  if (!days?.length) return [...DEFAULT_OPERATING_DAYS];
  const valid = days.filter((d): d is Weekday => d >= 1 && d <= 7);
  return valid.length ? [...new Set(valid)].sort((a, b) => a - b) : [...DEFAULT_OPERATING_DAYS];
}

export function operationalConfigToRowPayload(config: CheckpointOperationalConfig) {
  const staffing = computeCheckpointStaffingCounts(config);
  return {
    name: config.name.trim(),
    active: config.active,
    operating_days: config.operating_days,
    day_shift_enabled: config.day_shift_enabled,
    night_shift_enabled: config.night_shift_enabled,
    day_explosives: config.day.explosives,
    day_narcotics: config.day.narcotics,
    night_explosives: config.night.explosives,
    night_narcotics: config.night.narcotics,
    female_policy: config.female_policy,
    priority: normalizeCheckpointPriority(config.priority),
    mandatory: normalizeCheckpointMandatory(config.mandatory),
    // Legacy columns kept in sync for statistics badges
    night_only: !config.day_shift_enabled && config.night_shift_enabled,
    required_drugs: staffing.narcotics,
    required_explosives: staffing.explosives,
    allowed_gender: femalePolicyToAllowedGender(config.female_policy),
  };
}

export function femalePolicyToAllowedGender(
  policy: FemalePolicy,
): Database["public"]["Enums"]["checkpoint_allowed_gender"] {
  if (policy === "not_allowed") return "male";
  if (policy === "preferred") return "female";
  return "all";
}

export function getShiftCounts(
  config: CheckpointOperationalConfig,
  shift: Shift,
): ShiftTeamCounts {
  return shift === "day" ? config.day : config.night;
}

export function isShiftEnabled(config: CheckpointOperationalConfig, shift: Shift): boolean {
  return shift === "day" ? config.day_shift_enabled : config.night_shift_enabled;
}

/**
 * Staffing counters for a checkpoint — enabled shifts only.
 * Peak concurrent need per specialty (max across open shifts), never residual
 * counts from a disabled shift, posts, or assigned dogs.
 */
export type CheckpointStaffingCounts = {
  narcotics: number;
  explosives: number;
  /** Narcotics + explosives (+ currency when supported). */
  total: number;
};

export function computeCheckpointStaffingCounts(
  config: Pick<
    CheckpointOperationalConfig,
    "day_shift_enabled" | "night_shift_enabled" | "day" | "night"
  >,
): CheckpointStaffingCounts {
  const dayNarcotics = config.day_shift_enabled ? config.day.narcotics : 0;
  const nightNarcotics = config.night_shift_enabled ? config.night.narcotics : 0;
  const dayExplosives = config.day_shift_enabled ? config.day.explosives : 0;
  const nightExplosives = config.night_shift_enabled ? config.night.explosives : 0;

  const narcotics = Math.max(dayNarcotics, nightNarcotics);
  const explosives = Math.max(dayExplosives, nightExplosives);

  return {
    narcotics,
    explosives,
    total: narcotics + explosives,
  };
}

/** Derive display/staffing counts from a checkpoint row (config columns = source of truth). */
export function staffingCountsFromCheckpointRow(
  row: Pick<
    CheckpointRowOperational,
    | "day_shift_enabled"
    | "night_shift_enabled"
    | "day_explosives"
    | "day_narcotics"
    | "night_explosives"
    | "night_narcotics"
  >,
): CheckpointStaffingCounts {
  return computeCheckpointStaffingCounts(operationalConfigFromRow(row));
}

export type CheckpointRequiredK9Row = Pick<
  CheckpointRowOperational,
  | "active"
  | "day_shift_enabled"
  | "night_shift_enabled"
  | "day_explosives"
  | "day_narcotics"
  | "night_explosives"
  | "night_narcotics"
>;

/**
 * K9 dogs required by configuration of every active checkpoint.
 * Reuses staffingCountsFromCheckpointRow (enabled shifts, peak concurrent need).
 * Total always equals narcotics + explosives.
 */
export function sumRequiredK9FromActiveCheckpoints(
  rows: ReadonlyArray<CheckpointRequiredK9Row>,
): CheckpointStaffingCounts {
  return rows.reduce(
    (acc, row) => {
      if (!row.active) return acc;
      const staffing = staffingCountsFromCheckpointRow(row);
      acc.narcotics += staffing.narcotics;
      acc.explosives += staffing.explosives;
      acc.total += staffing.total;
      return acc;
    },
    { narcotics: 0, explosives: 0, total: 0 },
  );
}

export type RequiredK9Unit<T extends CheckpointRequiredK9Row = CheckpointRequiredK9Row> = {
  source: T;
  specialty: CheckpointSpecialty;
  index: number;
};

/**
 * One unit per required K9 team from {@link sumRequiredK9FromActiveCheckpoints}.
 * `listRequiredK9Units(rows).length` equals `sumRequiredK9FromActiveCheckpoints(rows).total`.
 */
export function listRequiredK9Units<T extends CheckpointRequiredK9Row>(
  rows: ReadonlyArray<T>,
  specialty: "all" | CheckpointSpecialty = "all",
): RequiredK9Unit<T>[] {
  const units: RequiredK9Unit<T>[] = [];

  for (const row of rows) {
    if (!row.active) continue;
    const staffing = staffingCountsFromCheckpointRow(row);

    if (specialty === "all" || specialty === "narcotics") {
      for (let index = 0; index < staffing.narcotics; index += 1) {
        units.push({ source: row, specialty: "narcotics", index });
      }
    }
    if (specialty === "all" || specialty === "explosives") {
      for (let index = 0; index < staffing.explosives; index += 1) {
        units.push({ source: row, specialty: "explosives", index });
      }
    }
  }

  return units;
}
