import { differenceInYears, format, parseISO } from "date-fns";
import type { LabelCountWithPct, MonthBreakdown, MonthCount, LabelCount } from "@/lib/statistics/types";

export function countBy<T>(
  items: T[],
  keyFn: (item: T) => string | null | undefined,
  labelFn?: (key: string) => string,
): LabelCount[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item)?.trim() || "unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: labelFn ? labelFn(key) : key,
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

export function sumByMonth(
  items: Array<{ date: string }>,
  monthLabelFn: (monthKey: string) => string,
): MonthCount[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const month = item.date.slice(0, 7);
    map.set(month, (map.get(month) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      label: monthLabelFn(month),
      value,
    }));
}

export function topN(items: LabelCount[], n = 10): LabelCount[] {
  return items.slice(0, n);
}

export function dogAgeBucket(dateOfBirth: string | null | undefined): string {
  if (!dateOfBirth?.trim()) return "unknown";
  try {
    const dob = parseISO(dateOfBirth);
    if (Number.isNaN(dob.getTime())) return "unknown";
    const years = differenceInYears(new Date(), dob);
    if (years < 1) return "under1";
    if (years < 3) return "1to3";
    if (years < 5) return "3to5";
    return "5plus";
  } catch {
    return "unknown";
  }
}

export function formatMonthKey(monthKey: string, locale = "fr-FR"): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return format(date, "MMM yyyy", { locale: undefined });
}

export function breakdownByMonth<T>(
  items: T[],
  dateFn: (item: T) => string,
  groupFn: (item: T) => string,
  monthLabelFn: (monthKey: string) => string,
  groupLabelFn: (key: string) => string,
): MonthBreakdown[] {
  const monthMap = new Map<string, Map<string, number>>();

  for (const item of items) {
    const month = dateFn(item).slice(0, 7);
    const group = groupFn(item)?.trim() || "unknown";
    if (!monthMap.has(month)) monthMap.set(month, new Map());
    const inner = monthMap.get(month)!;
    inner.set(group, (inner.get(group) ?? 0) + 1);
  }

  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, groups]) => {
      const breakdownItems = [...groups.entries()]
        .map(([key, value]) => ({
          key,
          label: groupLabelFn(key),
          value,
        }))
        .sort((a, b) => b.value - a.value);
      const total = breakdownItems.reduce((sum, row) => sum + row.value, 0);
      return {
        month,
        label: monthLabelFn(month),
        total,
        items: breakdownItems,
      };
    });
}

export function withPercentages(items: LabelCount[], total?: number): LabelCountWithPct[] {
  const sum = total ?? items.reduce((acc, item) => acc + item.value, 0);
  return items.map((item) => ({
    ...item,
    pct: sum > 0 ? Math.round((item.value / sum) * 100) : 0,
  }));
}
