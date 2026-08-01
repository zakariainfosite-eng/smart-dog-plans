import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { StatisticsDateRange, StatisticsPeriod } from "@/lib/statistics/types";

export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function resolveStatisticsDateRange(
  period: StatisticsPeriod,
  custom?: Partial<StatisticsDateRange>,
): StatisticsDateRange {
  const now = new Date();

  if (period === "custom" && custom?.from && custom?.to) {
    return { from: custom.from, to: custom.to };
  }

  switch (period) {
    case "today":
      return { from: toISODate(startOfDay(now)), to: toISODate(endOfDay(now)) };
    case "week":
      return {
        from: toISODate(startOfWeek(now, { weekStartsOn: 1 })),
        to: toISODate(endOfWeek(now, { weekStartsOn: 1 })),
      };
    case "month":
      return {
        from: toISODate(startOfMonth(now)),
        to: toISODate(endOfMonth(now)),
      };
    case "year":
      return {
        from: toISODate(startOfYear(now)),
        to: toISODate(endOfYear(now)),
      };
    default:
      return {
        from: toISODate(startOfMonth(now)),
        to: toISODate(endOfMonth(now)),
      };
  }
}

export function isDateInRange(date: string, range: StatisticsDateRange): boolean {
  return date >= range.from && date <= range.to;
}

export function rangesOverlap(
  start: string,
  end: string,
  range: StatisticsDateRange,
): boolean {
  return start <= range.to && end >= range.from;
}
