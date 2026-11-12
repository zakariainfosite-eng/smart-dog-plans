import type { Schedule } from "@capacitor/local-notifications";

/**
 * Capacitor Android uses Calendar fields for `schedule.on` (device local timezone).
 * Prefer this over `schedule.at` ISO parsing (UTC) so fire times match exclusion HH:mm.
 */
export function buildCapacitorAndroidExactSchedule(fireAt: Date): Schedule {
  return {
    on: {
      year: fireAt.getFullYear(),
      month: fireAt.getMonth(),
      day: fireAt.getDate(),
      hour: fireAt.getHours(),
      minute: fireAt.getMinutes(),
      second: fireAt.getSeconds(),
    },
    allowWhileIdle: true,
  };
}

/** Reject invalid or past trigger times before calling LocalNotifications.schedule. */
export function coerceFutureCapacitorScheduleAt(
  fireAt: Date,
  now: Date = new Date(),
): Date | null {
  const at = new Date(fireAt.getTime());
  if (!Number.isFinite(at.getTime())) return null;
  if (at.getTime() <= now.getTime()) return null;
  return at;
}

export function describeDeviceLocalScheduleAt(at: Date): {
  epochMs: number;
  isoUtc: string;
  deviceLocal: string;
  offsetMinutes: number;
} {
  return {
    epochMs: at.getTime(),
    isoUtc: at.toISOString(),
    deviceLocal: at.toLocaleString(),
    offsetMinutes: -at.getTimezoneOffset(),
  };
}

type ExactAlarmAuditPlugin = {
  checkExactNotificationSetting?: () => Promise<{ exact?: string }>;
};

export async function auditAndroidExactAlarmSetting(
  plugin: ExactAlarmAuditPlugin,
): Promise<{ supported: boolean; exact: string; granted: boolean }> {
  if (typeof plugin.checkExactNotificationSetting !== "function") {
    return { supported: false, exact: "not_available", granted: true };
  }
  try {
    const result = await plugin.checkExactNotificationSetting();
    const exact = String(result?.exact ?? "unknown");
    return { supported: true, exact, granted: exact === "granted" };
  } catch (error) {
    console.warn("[EXCLUSION-NATIVE-TRACE] checkExactNotificationSetting failed", error);
    return { supported: true, exact: "error", granted: false };
  }
}
