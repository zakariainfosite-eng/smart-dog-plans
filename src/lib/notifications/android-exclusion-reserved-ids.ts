/** Previously reserved test/probe notification IDs — production uses hashed IDs only. */
export const RESERVED_ANDROID_EXCLUSION_NOTIFICATION_IDS = new Set<number>();

export function isReservedAndroidExclusionNotificationId(id: number): boolean {
  return RESERVED_ANDROID_EXCLUSION_NOTIFICATION_IDS.has(id);
}

export function filterProtectedAndroidNotificationCancelIds(ids: number[]): number[] {
  return ids;
}
