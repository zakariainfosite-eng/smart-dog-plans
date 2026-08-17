import {
  DEFAULT_PLANNING_SETTINGS,
  isWithinDayShiftWindow,
  type PlanningShiftHours,
} from "@/lib/planning-settings";

export type RotationShift = "day" | "night" | "rest";

const ROTATION_ANCHOR = new Date(Date.UTC(2024, 0, 1));
const ROTATION_MATRIX: RotationShift[][] = [
  ["day", "night", "rest"],
  ["night", "rest", "day"],
  ["rest", "day", "night"],
];

function rotationOffset(date: Date): number {
  const d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.floor((d - ROTATION_ANCHOR.getTime()) / 86_400_000);
  return ((days % 3) + 3) % 3;
}

export function shiftForSection(sectionIndex: number, date: Date): RotationShift {
  return ROTATION_MATRIX[sectionIndex][rotationOffset(date)];
}

/** Operational shift window from Settings → Planification (defaults 09:00–21:00). */
export function currentOperationalShift(
  now = new Date(),
  hours: PlanningShiftHours = DEFAULT_PLANNING_SETTINGS,
): "day" | "night" {
  return isWithinDayShiftWindow(now, hours) ? "day" : "night";
}

export type SectionRotationRow = {
  id: string;
  name: string;
  commander_full_name: string;
  commander_grade: string;
  commander_mle: string;
  index: number;
  rotationShift: RotationShift;
};

export function buildSectionRotationSchedule<
  T extends {
    id: string;
    name: string;
    commander_full_name?: string | null;
    commander_grade?: string | null;
    commander_mle?: string | null;
  },
>(sections: T[], date: Date) {
  // Rotation indices are positional (0/1/2). Always sort by name so
  // 1ème / 2ème / 3ème keep stable slots regardless of query ORDER BY.
  const ordered = [...sections].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  const list = ordered.slice(0, 3).map((section, index) => ({
    id: section.id,
    name: section.name,
    commander_full_name: section.commander_full_name ?? "",
    commander_grade: section.commander_grade ?? "",
    commander_mle: section.commander_mle ?? "",
    index,
    rotationShift: shiftForSection(index, date),
  })) satisfies SectionRotationRow[];

  return {
    list,
    day: list.find((row) => row.rotationShift === "day"),
    night: list.find((row) => row.rotationShift === "night"),
    rest: list.find((row) => row.rotationShift === "rest"),
  };
}

/** Active section for the UI shift choice (Jour / Nuit) on a given date. */
export function resolveActiveSectionForShift<
  T extends {
    id: string;
    name: string;
    commander_full_name?: string | null;
    commander_grade?: string | null;
    commander_mle?: string | null;
  },
>(sections: T[], date: Date, shift: "day" | "night") {
  const schedule = buildSectionRotationSchedule(sections, date);
  return {
    schedule,
    activeSection: shift === "day" ? schedule.day : schedule.night,
  };
}
