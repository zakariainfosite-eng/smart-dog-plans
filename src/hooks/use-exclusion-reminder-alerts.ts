import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/integrations/database/client";
import {
  EXCLUSION_REMINDER_ALERTS_QUERY_KEY,
  fetchUnshownExclusionReminderAlerts,
  markExclusionReminderShown,
  type ExclusionReminderAlert,
} from "@/lib/notifications/exclusion-reminder-alerts";
import { runExclusionNotificationSync } from "@/lib/notifications/run-exclusion-notification-sync";

/** Popup reminders on app start and when the window becomes active again. */
export function useExclusionReminderAlerts() {
  const alertsQuery = useQuery({
    queryKey: EXCLUSION_REMINDER_ALERTS_QUERY_KEY,
    queryFn: async () => {
      await runExclusionNotificationSync(db);
      return fetchUnshownExclusionReminderAlerts(db);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const queue = alertsQuery.data ?? [];
  const currentAlert: ExclusionReminderAlert | null = queue[0] ?? null;
  const open = currentAlert !== null;

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void alertsQuery.refetch();
    };
    const onFocus = () => {
      void alertsQuery.refetch();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [alertsQuery]);

  const dismissCurrent = useCallback(() => {
    const alert = queue[0];
    if (alert) {
      markExclusionReminderShown(alert.alertKey);
    }
    void alertsQuery.refetch();
  }, [alertsQuery, queue]);

  return {
    open,
    currentAlert,
    pendingCount: queue.length,
    dismissCurrent,
    markReminderShown: markExclusionReminderShown,
    refresh: alertsQuery.refetch,
  };
}
