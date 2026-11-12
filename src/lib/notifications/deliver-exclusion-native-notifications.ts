import type { DbClient } from "@/integrations/database/client";
import { isAndroidCapacitorRuntime } from "@/lib/runtime-platform";
import { formatExclusionReturnMessage } from "@/lib/notifications/exclusion-return-messages";
import {
  EXCLUSION_NATIVE_CHANNEL_ID,
  EXCLUSION_NATIVE_EXTRA_TYPE,
  EXCLUSION_NATIVE_TITLE,
  notificationIdForExclusionMilestone,
} from "@/lib/notifications/android-exclusion-local-notifications";
import type { ExclusionNotificationRecord } from "@/lib/notifications/exclusion-return-types";

const DESKTOP_DELIVERED_KEY = "cynoplanning.exclusion-native-delivered.v1";
export { EXCLUSION_NATIVE_EXTRA_TYPE };

type LocalNotificationsApi = typeof import("@capacitor/local-notifications").LocalNotifications;

function readDeliveredKeys(): Set<string> {
  if (typeof globalThis === "undefined") return new Set();
  try {
    const raw = globalThis.localStorage?.getItem(DESKTOP_DELIVERED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { keys?: string[] };
    return new Set((parsed.keys ?? []).filter((key) => typeof key === "string"));
  } catch {
    return new Set();
  }
}

function writeDeliveredKeys(keys: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(
      DESKTOP_DELIVERED_KEY,
      JSON.stringify({ keys: [...keys] }),
    );
  } catch {
    /* ignore quota */
  }
}

function deliveryKey(notification: Pick<ExclusionNotificationRecord, "id">): string {
  return notification.id;
}

function nativeIdForRecord(notification: ExclusionNotificationRecord): number | null {
  const milestone = notification.milestone;
  if (!milestone) return null;
  return notificationIdForExclusionMilestone(notification.exclusion_id, milestone);
}

async function loadLocalNotifications(): Promise<LocalNotificationsApi | null> {
  if (!isAndroidCapacitorRuntime()) return null;
  try {
    const mod = await import("@capacitor/local-notifications");
    return mod.LocalNotifications;
  } catch {
    return null;
  }
}

const defaultTranslate = (key: string, params?: Record<string, string | number>) => {
  const fr: Record<string, string> = {
    "notifications.lifecycle.started.personnel.title": "Exclusion commencée",
    "notifications.lifecycle.started.dog.title": "Exclusion du chien commencée",
    "notifications.lifecycle.endingSoon.title": "Retour prochainement",
    "notifications.lifecycle.ended.personnel.title": "De nouveau disponible",
    "notifications.lifecycle.ended.dog.title": "Chien de nouveau disponible",
  };
  return fr[key] ?? key;
};

export async function deliverExclusionNativeNotifications(
  db: DbClient,
  createdIds: string[],
  t: (key: string, params?: Record<string, string | number>) => string = defaultTranslate,
): Promise<number> {
  if (createdIds.length === 0) return 0;

  const { data, error } = await db
    .from("exclusion_notifications")
    .select(
      "id, exclusion_id, agent_id, dog_id, subject_kind, notification_type, milestone, end_date, return_date, subject_name, exclusion_type, is_read, created_at",
    )
    .in("id", createdIds);

  if (error) throw error;
  const rows = (data ?? []) as ExclusionNotificationRecord[];
  if (rows.length === 0) return 0;

  const delivered = readDeliveredKeys();
  let shown = 0;

  const plugin = await loadLocalNotifications();
  const now = new Date();

  for (const notification of rows) {
    const key = deliveryKey(notification);
    if (delivered.has(key)) continue;

    const nativeId = nativeIdForRecord(notification);
    if (!nativeId) continue;

    const title = EXCLUSION_NATIVE_TITLE;
    const body = formatExclusionReturnMessage(notification, t, "fr");

    if (plugin) {
      // Android : les jalons futurs sont planifiés par syncAndroidExclusionNativeNotifications (vraies dates).
      // Ne pas reprogrammer ici en now+500ms (doublon / annulation du sens lifecycle).
      delivered.add(key);
      shown += 1;
      continue;
    } else if (typeof globalThis.Notification !== "undefined") {
      if (globalThis.Notification.permission === "default") {
        await globalThis.Notification.requestPermission();
      }
      if (globalThis.Notification.permission === "granted") {
        new globalThis.Notification(title || EXCLUSION_NATIVE_TITLE, { body });
      }
    }

    delivered.add(key);
    shown += 1;
  }

  writeDeliveredKeys(delivered);
  return shown;
}

export async function deliverExclusionNativeNotificationsSafe(
  db: DbClient,
  createdIds: string[],
): Promise<void> {
  try {
    await deliverExclusionNativeNotifications(db, createdIds);
  } catch (error) {
    console.warn("[notifications] native delivery failed", error);
  }
}
