import type { TFunction } from "i18next";
import {
  FEMALE_NIGHT_EXCLUSION_REASON,
  NIGHT_SHIFT_FEMALE_EXCLUSION_REASON,
  POINT_653_NAME,
  type Point653ReasonCode,
} from "@/lib/planning/engine";

/** Translate planning engine exclusion/warning strings for display. */
export function translatePlanningReason(reason: string, t: TFunction): string {
  const map: Record<string, string> = {
    Inactive: t("planning.reason.inactive"),
    "No assigned dog": t("planning.reason.noAssignedDog"),
    "Dog inactive": t("planning.reason.dogInactive"),
    "Dog sick": t("planning.reason.dogSick"),
    "Female dog in heat": t("planning.reason.femaleDogHeat"),
    Absent: t("planning.reason.absent"),
    Sick: t("planning.reason.sick"),
    "On leave": t("planning.reason.onLeave"),
    "On special leave": t("planning.reason.onSpecialLeave"),
    "Administrative leave": t("planning.reason.administrativeLeave"),
    "On mission": t("planning.reason.onMission"),
    "In training": t("planning.reason.inTraining"),
    Excluded: t("planning.reason.excluded"),
    [FEMALE_NIGHT_EXCLUSION_REASON]: t("planning.reason.femaleDayShiftOnly"),
    [NIGHT_SHIFT_FEMALE_EXCLUSION_REASON]: t("planning.reason.femaleDayShiftOnly"),
  };

  if (map[reason]) return map[reason];
  if (reason.startsWith("CRITICAL:")) {
    const body = reason.slice("CRITICAL:".length).trim();
    if (body.match(/^Checkpoint .+?: No eligible cynotechnician available\.$/)) {
      const name = body.replace(/^Checkpoint /, "").replace(/: No eligible cynotechnician available\.$/, "");
      return t("planning.warning.criticalNoAgent", { name });
    }
    return `${t("planning.warning.criticalPrefix")} ${translatePlanningReason(body, t)}`;
  }
  if (reason.startsWith("INFO:")) {
    const optionalMatch = reason.match(
      /^INFO: Checkpoint (.+) not covered\. Optional checkpoint\.$/,
    );
    if (optionalMatch) {
      return t("planning.warning.optionalNotCovered", { name: optionalMatch[1] });
    }
    return reason.slice("INFO:".length).trim();
  }
  if (reason.startsWith("Dog status:")) {
    const status = reason.replace("Dog status:", "").trim();
    return t("planning.reason.dogStatus", { status });
  }
  if (reason.includes("UNDERSTAFFED")) {
    return translateUnderstaffedWarning(reason, t);
  }
  if (reason.includes(POINT_653_NAME)) {
    const match = reason.match(/^(\d+)/);
    const count = match ? Number(match[1]) : 1;
    return t("planning.warning.point653Assigned", { count, point: POINT_653_NAME });
  }
  if (reason.includes("marked REST")) {
    const match = reason.match(/^(\d+)/);
    const count = match ? Number(match[1]) : 1;
    return t("planning.warning.femaleRest", { count });
  }
  if (reason.includes("INVALID:") && reason.includes(POINT_653_NAME)) {
    return reason.replace(POINT_653_NAME, t("dailyPlanning.point653.name"));
  }
  return reason;
}

/** Translate Point 653 assignment reason codes for display. */
export function translatePoint653Reason(reason: Point653ReasonCode, t: TFunction): string {
  return t(`planning.point653.reason.${reason}`);
}

/** Informational notices about Point 653 assignments (not operational failures). */
export function isReserveWarning(reason: string): boolean {
  return reason.includes(POINT_653_NAME) && reason.includes("assigned to");
}

/** Informational notices about inactive female group REST status. */
export function isRestWarning(reason: string): boolean {
  return reason.includes("marked REST");
}

function translateUnderstaffedWarning(reason: string, t: TFunction): string {
  const match = reason.match(
    /Checkpoint (.+) is UNDERSTAFFED \((\d+)\/(\d+), (\d+) position(s?) unfilled\)\./,
  );
  if (!match) return reason;
  const [, name, staffed, required, missing, pluralSuffix] = match;
  return t(`planning.warning.understaffed${pluralSuffix === "s" ? "_plural" : ""}`, {
    name,
    staffed,
    required,
    missing,
  });
}
