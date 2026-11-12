/** Parse Capacitor getPending() schedule payload into a local device Date (if possible). */
export function fireAtFromPendingSchedule(schedule: unknown): Date | null {
  if (!schedule || typeof schedule !== "object") return null;
  const source = schedule as Record<string, unknown>;

  const at = source.at;
  if (at instanceof Date) return new Date(at.getTime());
  if (typeof at === "number" && Number.isFinite(at)) return new Date(at);
  if (typeof at === "string" && at.trim()) {
    const parsed = new Date(at);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const on = source.on;
  if (!on || typeof on !== "object") return null;
  const fields = on as Record<string, unknown>;
  const year = fields.year;
  const month = fields.month;
  const day = fields.day;
  if (typeof year !== "number" || typeof month !== "number" || typeof day !== "number") {
    return null;
  }
  const hour = typeof fields.hour === "number" ? fields.hour : 0;
  const minute = typeof fields.minute === "number" ? fields.minute : 0;
  const second = typeof fields.second === "number" ? fields.second : 0;
  return new Date(year, month, day, hour, minute, second, 0);
}

const SCHEDULE_MATCH_TOLERANCE_MS = 60_000;

export function pendingScheduleMatchesFireAt(schedule: unknown, fireAt: Date): boolean {
  const pendingAt = fireAtFromPendingSchedule(schedule);
  if (!pendingAt) return false;
  return Math.abs(pendingAt.getTime() - fireAt.getTime()) <= SCHEDULE_MATCH_TOLERANCE_MS;
}
