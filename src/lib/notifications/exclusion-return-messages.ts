import { format, parseISO } from "date-fns";
import type { ExclusionNotificationRecord } from "@/lib/notifications/exclusion-return-types";
import { daysFromMilestone } from "@/lib/notifications/exclusion-return-types";

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

/**
 * Build the human-readable notification line (without emoji prefix).
 * Matches the product copy style from the alert center brief.
 */
export function formatExclusionReturnMessage(
  notification: Pick<
    ExclusionNotificationRecord,
    "subject_kind" | "subject_name" | "exclusion_type" | "return_date" | "milestone" | "notification_type"
  >,
  t: NotificationTranslate,
  locale = "fr",
): string {
  const name = notification.subject_name;
  const days = daysFromMilestone(notification.milestone);
  const dateLabel = formatDisplayDate(notification.return_date, locale);
  const typeLabel = exclusionTypeLabel(t, notification.exclusion_type);

  if (notification.subject_kind === "dog") {
    if (days === 0) {
      return t("notifications.message.dog.today", { name, type: typeLabel });
    }
    if (days === 1) {
      return t("notifications.message.dog.tomorrow", { name, type: typeLabel });
    }
    return t("notifications.message.dog.inDays", {
      name,
      type: typeLabel,
      count: days,
      date: dateLabel,
    });
  }

  if (days === 0) {
    return t("notifications.message.personnel.today", { name });
  }
  if (days === 1) {
    return t("notifications.message.personnel.tomorrow", { name });
  }
  return t("notifications.message.personnel.inDays", {
    name,
    count: days,
    date: dateLabel,
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
