import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/database/client";
import {
  invalidateExclusionNotificationQueries,
  runExclusionNotificationSync,
} from "@/lib/notifications/run-exclusion-notification-sync";

async function syncAndInvalidate(queryClient: ReturnType<typeof useQueryClient>) {
  try {
    await runExclusionNotificationSync(db);
    invalidateExclusionNotificationQueries(queryClient);
  } catch (error) {
    console.warn("[notifications] sync failed", error);
  }
}

/** Sync exclusion reminders on app start and when the window becomes active again. */
export function useExclusionReturnNotificationsSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (cancelled) return;
      await syncAndInvalidate(queryClient);
    })();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void syncAndInvalidate(queryClient);
    };
    const onFocus = () => {
      void syncAndInvalidate(queryClient);
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [queryClient]);
}
