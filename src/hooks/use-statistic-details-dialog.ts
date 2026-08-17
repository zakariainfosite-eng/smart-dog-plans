import { useCallback, useState } from "react";

import type { StatisticDetailsPayload } from "@/lib/statistics/statistic-details";

export function useStatisticDetailsDialog() {
  const [payload, setPayload] = useState<StatisticDetailsPayload | null>(null);

  const showDetails = useCallback((next: StatisticDetailsPayload) => {
    setPayload(next);
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    if (!open) setPayload(null);
  }, []);

  return {
    payload,
    open: payload !== null,
    showDetails,
    onOpenChange,
  };
}
