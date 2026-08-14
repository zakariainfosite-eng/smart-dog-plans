import type { QueryClient } from "@tanstack/react-query";

import type { DbClient } from "@/integrations/database/client";
import { EXCLUSION_REMINDER_ALERTS_QUERY_KEY } from "@/lib/notifications/exclusion-reminder-alerts";
import {
  EXCLUSION_NOTIFICATIONS_QUERY_KEY,
  IMMINENT_RETURNS_QUERY_KEY,
} from "@/lib/notifications/exclusion-return-types";
import {
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

/**
 * Scan all active exclusions in the reminder window and upsert bell notifications.
 * Idempotent — safe on app start, dashboard enter, focus, and after exclusion CRUD.
 * Retries briefly so startup sync succeeds once SQLite is ready (Electron / Capacitor).
 */
export async function runExclusionNotificationSync(
  db: DbClient,
  reference: Date | string = new Date(),
): Promise<SyncExclusionNotificationsResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SYNC_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await syncExclusionReturnNotifications(db, reference);

      if (import.meta.env.DEV) {
        console.log("[notifications] sync complete", { attempt, ...result });
      }

      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[notifications] sync attempt ${attempt}/${SYNC_RETRY_ATTEMPTS} failed`, error);
      if (attempt < SYNC_RETRY_ATTEMPTS) {
        await delay(SYNC_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError;
}

export function invalidateExclusionNotificationQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: IMMINENT_RETURNS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: EXCLUSION_REMINDER_ALERTS_QUERY_KEY });
}
