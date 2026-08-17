import type { QueryClient } from "@tanstack/react-query";

import type { DbClient } from "@/integrations/database/client";
import { getRuntimePlatform } from "@/lib/runtime-platform";
import { formatUnknownError, stackUnknownError } from "@/lib/documents/export-error";
import { EXCLUSION_REMINDER_ALERTS_QUERY_KEY } from "@/lib/notifications/exclusion-reminder-alerts";
import {
  EXCLUSION_NOTIFICATIONS_QUERY_KEY,
  IMMINENT_RETURNS_QUERY_KEY,
  type ExclusionNotificationRecord,
} from "@/lib/notifications/exclusion-return-types";
import {
  fetchExclusionNotifications,
  syncExclusionReturnNotifications,
  type SyncExclusionNotificationsResult,
} from "@/lib/notifications/sync-exclusion-return-notifications";

/** Shared React Query key for background sync status (optional). */
export const EXCLUSION_NOTIFICATION_SYNC_QUERY_KEY = ["exclusion-notification-sync"] as const;

const SYNC_RETRY_ATTEMPTS = 3;
const SYNC_RETRY_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

let inFlightSync: Promise<SyncExclusionNotificationsResult> | null = null;

async function inspectExclusionNotificationStore(db: DbClient): Promise<void> {
  const platform = getRuntimePlatform();
  console.info("[notifications] inspect store", { platform });

  const { data, error } = await db
    .from("exclusion_notifications")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[notifications] exclusion_notifications table check failed", {
      platform,
      table: "exclusion_notifications",
      error,
      message: formatUnknownError(error),
    });
    throw error;
  }

  console.info("[notifications] exclusion_notifications ready", {
    platform,
    table: "exclusion_notifications",
    initialized: true,
    sampleRows: data?.length ?? 0,
  });
}

/**
 * Scan all active exclusions in the reminder window and upsert bell notifications.
 * Idempotent — safe on app start, dashboard enter, focus, and after exclusion CRUD.
 * Concurrent callers share one in-flight run (Capacitor SQLite cannot overlap well).
 */
export async function runExclusionNotificationSync(
  db: DbClient,
  reference: Date | string = new Date(),
): Promise<SyncExclusionNotificationsResult> {
  if (inFlightSync) {
    console.info("[notifications] sync join in-flight");
    return inFlightSync;
  }

  inFlightSync = (async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= SYNC_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const result = await syncExclusionReturnNotifications(db, reference);
        console.info("[notifications] sync complete", {
          attempt,
          platform: getRuntimePlatform(),
          ...result,
        });
        return result;
      } catch (error) {
        lastError = error;
        console.error(
          `[notifications] sync attempt ${attempt}/${SYNC_RETRY_ATTEMPTS} failed`,
          {
            platform: getRuntimePlatform(),
            message: formatUnknownError(error),
            stack: stackUnknownError(error),
            error,
          },
        );
        if (attempt < SYNC_RETRY_ATTEMPTS) {
          await delay(SYNC_RETRY_DELAY_MS * attempt);
        }
      }
    }

    throw lastError;
  })().finally(() => {
    inFlightSync = null;
  });

  return inFlightSync;
}

/**
 * Initialize/check the notification table, sync reminders, then load rows.
 * Sync failure is logged but does not block a successful empty/full fetch.
 */
export async function loadExclusionNotificationFeed(
  db: DbClient,
): Promise<ExclusionNotificationRecord[]> {
  const platform = getRuntimePlatform();
  console.info("[notifications] load start", { platform });

  await inspectExclusionNotificationStore(db);

  try {
    await runExclusionNotificationSync(db);
  } catch (error) {
    console.error("[notifications] sync error (continuing to fetch)", {
      platform,
      message: formatUnknownError(error),
      stack: stackUnknownError(error),
      error,
    });
  }

  const rows = await fetchExclusionNotifications(db);
  console.info("[notifications] fetch ok", {
    platform,
    table: "exclusion_notifications",
    count: rows.length,
  });
  return rows;
}

export function invalidateExclusionNotificationQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: IMMINENT_RETURNS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: EXCLUSION_REMINDER_ALERTS_QUERY_KEY });
}
