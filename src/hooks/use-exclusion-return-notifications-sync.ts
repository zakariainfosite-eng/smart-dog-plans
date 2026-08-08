import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/integrations/database/client";
import {
  EXCLUSION_NOTIFICATIONS_QUERY_KEY,
  IMMINENT_RETURNS_QUERY_KEY,
} from "@/lib/notifications/exclusion-return-types";
import { syncExclusionReturnNotifications } from "@/lib/notifications/sync-exclusion-return-notifications";

/** Run once on authenticated shell mount (app start / session). */
export function useExclusionReturnNotificationsSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await syncExclusionReturnNotifications(db);
        if (cancelled) return;
        void queryClient.invalidateQueries({
          queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY,
        });
        void queryClient.invalidateQueries({
          queryKey: IMMINENT_RETURNS_QUERY_KEY,
        });
      } catch (error) {
        console.warn("[notifications] sync failed", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);
}
