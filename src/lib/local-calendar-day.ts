/**
 * Local wall-clock calendar day as `yyyy-MM-dd`.
 *
 * Used by Electron startup expiration, Capacitor/iOS SQLite initialization,
 * and renderer `planningDayISO()` / `todayISODate()`.
 *
 * Never use `Date#toISOString().slice(0, 10)` for “today”: that is UTC and can
 * deactivate an exclusion ending today one calendar day early (US evenings) or
 * keep yesterday active / shift d0→d1 (Morocco/Europe mornings).
 */
export function localCalendarDayISO(reference: Date = new Date()): string {
  const date =
    reference instanceof Date && !Number.isNaN(reference.getTime())
      ? reference
      : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
