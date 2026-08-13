import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/integrations/database/client";
import {
  EXCLUSION_REMINDER_ALERTS_QUERY_KEY,
  fetchUnshownExclusionReminderAlerts,
  markExclusionReminderShown,
  type ExclusionReminderAlert,
} from "@/lib/notifications/exclusion-reminder-alerts";

/** Popup reminders on app start and when the window becomes active again. */
export function useExclusionReminderAlerts() {
  const markedKeysRef = useRef<Set<string>>(new Set());

  const alertsQuery = useQuery({
    queryKey: EXCLUSION_REMINDER_ALERTS_QUERY_KEY,
    queryFn: () => fetchUnshownExclusionReminderAlerts(db),
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
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [alertsQuery]);

  useEffect(() => {
    if (!currentAlert) return;
    if (markedKeysRef.current.has(currentAlert.alertKey)) return;
    markExclusionReminderShown(currentAlert.alertKey);
    markedKeysRef.current.add(currentAlert.alertKey);
  }, [currentAlert]);

  const dismissCurrent = useCallback(() => {
    void alertsQuery.refetch();
  }, [alertsQuery]);

  return {
    open,
    currentAlert,
    pendingCount: queue.length,
    dismissCurrent,
    refresh: alertsQuery.refetch,
  };
}
