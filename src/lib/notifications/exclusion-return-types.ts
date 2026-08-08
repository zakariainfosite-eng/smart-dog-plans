import type { ExclusionType } from "@/lib/agent-exclusions";

/** Calendar milestones before the return-to-service day (end_date + 1). */
export const EXCLUSION_RETURN_MILESTONES = [7, 3, 1, 0] as const;

export type ExclusionReturnMilestoneDays = (typeof EXCLUSION_RETURN_MILESTONES)[number];

export type ExclusionReturnMilestone = "d7" | "d3" | "d1" | "d0";

export type ExclusionNotificationSubjectKind = "personnel" | "dog";

/**
 * Product notification categories for filtering / messaging.
 * Covers personnel/dog returns and specific exclusion endings.
 */
export type ExclusionNotificationType =
  | "personnel_return"
  | "dog_return"
  | "end_of_sickness"
  | "end_of_heat"
  | "end_of_leave"
  | "end_of_training"
  | "end_of_mission"
  | "exclusion_ending_soon";

export type ExclusionNotificationSeverity = "info" | "warning" | "success";

export type ExclusionNotificationRecord = {
  id: string;
  exclusion_id: string;
  agent_id: string | null;
  dog_id: string | null;
  subject_kind: ExclusionNotificationSubjectKind;
  notification_type: ExclusionNotificationType;
  milestone: ExclusionReturnMilestone;
  end_date: string;
  return_date: string;
  subject_name: string;
  exclusion_type: ExclusionType | string;
  is_read: boolean;
  created_at: string;
};

export type ExclusionNotificationFilter =
  | "all"
  | "personnel"
  | "dogs"
  | "unread"
  | "read";

export const EXCLUSION_NOTIFICATIONS_QUERY_KEY = ["exclusion-return-notifications"] as const;
export const IMMINENT_RETURNS_QUERY_KEY = ["imminent-exclusion-returns"] as const;

export const NOTIFICATION_HISTORY_DAYS = 30;

export function milestoneFromDays(days: ExclusionReturnMilestoneDays): ExclusionReturnMilestone {
  return `d${days}` as ExclusionReturnMilestone;
}

export function daysFromMilestone(milestone: ExclusionReturnMilestone): number {
  return Number(milestone.slice(1));
}

/** Map exclusion type → notification category (specific when possible). */
export function notificationTypeForExclusion(
  exclusionType: string,
  subjectKind: ExclusionNotificationSubjectKind,
): ExclusionNotificationType {
  switch (exclusionType) {
    case "sickness":
    case "dog_sick":
    case "dog_injured":
    case "dog_vet_visit":
      return "end_of_sickness";
    case "female_dog_heat":
      return "end_of_heat";
    case "annual_leave":
    case "administrative_leave":
    case "special_leave":
    case "absence":
      return "end_of_leave";
    case "training":
    case "dog_training":
      return "end_of_training";
    case "mission":
      return "end_of_mission";
    default:
      return subjectKind === "dog" ? "dog_return" : "personnel_return";
  }
}

/**
 * Color severity from days until return:
 * - green = available today
 * - orange = within 3 days
 * - blue = informational (further out)
 */
export function severityForDaysUntilReturn(daysUntil: number): ExclusionNotificationSeverity {
  if (daysUntil <= 0) return "success";
  if (daysUntil <= 3) return "warning";
  return "info";
}

export function severityForMilestone(
  milestone: ExclusionReturnMilestone,
): ExclusionNotificationSeverity {
  return severityForDaysUntilReturn(daysFromMilestone(milestone));
}
