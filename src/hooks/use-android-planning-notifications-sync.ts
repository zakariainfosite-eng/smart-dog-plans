import { useEffect } from "react";
import { db } from "@/integrations/database/client";
import { isAndroidCapacitorRuntime } from "@/lib/runtime-platform";
import { syncAndroidPlanningNotificationsSafe } from "@/lib/notifications/sync-android-planning-notifications";

/** Resynchronize Android planning reminders from SQLite on startup and when the app returns. */
export function useAndroidPlanningNotificationsSync() {
  useEffect(() => {
    if (!isAndroidCapacitorRuntime()) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void syncAndroidPlanningNotificationsSafe(db);
    };

    run();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      run();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    window.addEventListener("pageshow", run);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
      window.removeEventListener("pageshow", run);
    };
  }, []);
}
