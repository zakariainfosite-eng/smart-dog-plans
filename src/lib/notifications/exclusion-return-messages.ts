import { format, parseISO } from "date-fns";
import type { ExclusionNotificationRecord } from "@/lib/notifications/exclusion-return-types";
import {
  daysFromMilestone,
  isExclusionLifecycleNotificationType,
} from "@/lib/notifications/exclusion-return-types";
import { daysUntilEnd } from "@/lib/notifications/exclusion-return-dates";
import { isValidPlanningDayISO, planningDayISO } from "@/lib/agent-exclusions";

export type NotificationTranslate = (key: string, params?: Record<string, string | number>) => string;

function formatDisplayDate(iso: string, locale: string): string {
  try {
    return format(parseISO(iso.slice(0, 10)), locale.startsWith("fr") ? "dd/MM/yyyy" : "MM/dd/yyyy");
  } catch {
    return iso.slice(0, 10);
  }
}

function exclusionTypeLabel(
  t: NotificationTranslate,
  exclusionType: string,
): string {
  const key = `exclusions.type.${exclusionType}`;
  const label = t(key);
  return label === key ? exclusionType : label;
}

function dogArticlePhrase(exclusionType: string, t: NotificationTranslate): string {
  if (exclusionType === "female_dog_heat") {
    return t("notifications.message.dog.articleFemale");
  }
  return t("notifications.message.dog.articleMale");
}

/** Short subject line for the notification center card header. */
export function formatExclusionEndingSubject(
  notification: Pick<
    ExclusionNotificationRecord,
    "exclusion_type" | "subject_kind" | "notification_type" | "milestone"
  >,
  t: NotificationTranslate,
): string {
  if (
    notification.notification_type === "exclusion_started" ||
    notification.milestone === "start"
  ) {
    return notification.subject_kind === "dog"
      ? t("notifications.lifecycle.started.dog.title")
      : t("notifications.lifecycle.started.personnel.title");
  }
  if (
    notification.notification_type === "exclusion_ended" ||
    notification.milestone === "ended"
  ) {
    return notification.subject_kind === "dog"
      ? t("notifications.lifecycle.ended.dog.title")
      : t("notifications.lifecycle.ended.personnel.title");
  }
  if (
    notification.notification_type === "exclusion_ending_soon" ||
    notification.milestone === "d2"
  ) {
    return t("notifications.lifecycle.endingSoon.title");
  }
  const typeLabel = exclusionTypeLabel(t, notification.exclusion_type);
  return t("notifications.ending.subject", { type: typeLabel });
}

export function formatExclusionRemainingDays(
  endDateISO: string,
  t: NotificationTranslate,
  reference: Date | string = new Date(),
): string {
  if (!isValidPlanningDayISO(endDateISO)) return "—";
  const days = daysUntilEnd(endDateISO, reference);
  if (!Number.isFinite(days)) return "—";
  if (days <= 0) return t("notifications.ending.remainingToday");
  if (days === 1) return t("notifications.ending.remainingOneDay");
  return t("notifications.ending.remainingDays", { count: days });
}

/**
 * Build the human-readable notification body (Attention: … se termine dans X jours).
 */
export function formatExclusionReturnMessage(
  notification: Pick<
    ExclusionNotificationRecord,
    | "subject_kind"
    | "subject_name"
    | "exclusion_type"
    | "end_date"
    | "return_date"
    | "milestone"
    | "notification_type"
  >,
  t: NotificationTranslate,
  locale = "fr",
  reference: Date | string = new Date(),
): string {
  const name = notification.subject_name;
  const typeLabel = exclusionTypeLabel(t, notification.exclusion_type);

  if (isExclusionLifecycleNotificationType(notification.notification_type)) {
    const startDateLabel = formatDisplayDate(notification.return_date, locale);
    if (notification.notification_type === "exclusion_started") {
      const startIsToday =
        startDateLabel === formatDisplayDate(planningDayISO(reference), locale);
      return notification.subject_kind === "dog"
        ? t(
            startIsToday
              ? "notifications.lifecycle.started.dog.bodyToday"
              : "notifications.lifecycle.started.dog.bodyCatchUp",
            { name, type: typeLabel, date: startDateLabel },
          )
        : t(
            startIsToday
              ? "notifications.lifecycle.started.personnel.bodyToday"
              : "notifications.lifecycle.started.personnel.bodyCatchUp",
            { name, type: typeLabel, date: startDateLabel },
          );
    }
    if (notification.notification_type === "exclusion_ending_soon") {
      return notification.subject_kind === "dog"
        ? t("notifications.lifecycle.endingSoon.dog.body", { name, type: typeLabel })
        : t("notifications.lifecycle.endingSoon.personnel.body", { name, type: typeLabel });
    }
    return notification.subject_kind === "dog"
      ? t("notifications.lifecycle.ended.dog.body", { name, type: typeLabel })
      : t("notifications.lifecycle.ended.personnel.body", { name, type: typeLabel });
  }

  const days = daysFromMilestone(notification.milestone);
  const endDateLabel = formatDisplayDate(notification.end_date, locale);

  if (notification.subject_kind === "dog") {
    const article = dogArticlePhrase(notification.exclusion_type, t);
    if (days === 0) {
      return t("notifications.message.dog.endsToday", { name, type: typeLabel, article });
    }
    if (days === 1) {
      return t("notifications.message.dog.endsTomorrow", { name, type: typeLabel, article });
    }
    return t("notifications.message.dog.endsInDays", {
      name,
      type: typeLabel,
      article,
      count: days,
      date: endDateLabel,
    });
  }

  if (days === 0) {
    return t("notifications.message.personnel.endsToday", { name, type: typeLabel });
  }
  if (days === 1) {
    return t("notifications.message.personnel.endsTomorrow", { name, type: typeLabel });
  }
  return t("notifications.message.personnel.endsInDays", {
    name,
    type: typeLabel,
    count: days,
    date: endDateLabel,
  });
}

/** Compact line for the dashboard “Retours imminents” card. */
export function formatImminentReturnLine(
  item: {
    subject_kind: "personnel" | "dog";
    subject_name: string;
    exclusion_type: string;
    return_date: string;
    days_until: number;
  },
  t: NotificationTranslate,
): string {
  const name = item.subject_name;
  const typeLabel = exclusionTypeLabel(t, item.exclusion_type);

  if (item.days_until <= 0) {
    return t("notifications.imminent.availableToday", { name });
  }
  if (item.days_until === 1) {
    if (item.subject_kind === "dog" && item.exclusion_type === "female_dog_heat") {
      return t("notifications.imminent.heatEndsTomorrow", { name });
    }
    return t("notifications.imminent.tomorrow", { name, type: typeLabel });
  }
  return t("notifications.imminent.inDays", {
    name,
    count: item.days_until,
  });
}

export function isUpcomingExclusionNotification(
  notification: Pick<ExclusionNotificationRecord, "end_date">,
  reference: Date | string = new Date(),
): boolean {
  if (!isValidPlanningDayISO(notification.end_date)) return false;
  const today = planningDayISO(reference);
  return notification.end_date.slice(0, 10) >= today;
}

export function isRenderableExclusionNotification(
  notification: Pick<ExclusionNotificationRecord, "end_date">,
): boolean {
  return isValidPlanningDayISO(notification.end_date);
}
