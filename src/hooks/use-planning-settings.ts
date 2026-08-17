import { useQuery } from "@tanstack/react-query";
import { db } from "@/integrations/database/client";
import {
  DEFAULT_PLANNING_SETTINGS,
  PLANNING_SETTINGS_QUERY_KEY,
  fetchPlanningSettings,
  type PlanningShiftHours,
} from "@/lib/planning-settings";

export function usePlanningSettings() {
  const query = useQuery({
    queryKey: PLANNING_SETTINGS_QUERY_KEY,
    queryFn: () => fetchPlanningSettings(db),
    staleTime: 30_000,
  });

  const hours: PlanningShiftHours = query.data ?? DEFAULT_PLANNING_SETTINGS;
  return { ...query, hours };
}
