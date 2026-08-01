import { format } from "date-fns";
import { ar, fr } from "date-fns/locale";

const LOCALES: Record<string, Locale> = { fr, ar };

type Locale = typeof fr;

export function formatPageLastUpdated(timestamp: number | undefined, language: string): string {
  if (!timestamp) return "—";
  const locale = LOCALES[language] ?? fr;
  return format(new Date(timestamp), "d MMMM yyyy, HH:mm", { locale });
}

export function pct(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize));
}
