export const UI_DENSITY_STORAGE_KEY = "cynoplanning.ui.density";
export const UI_NOTIFICATIONS_STORAGE_KEY = "cynoplanning.ui.notificationsEnabled";

export type UiDensity = "compact" | "normal" | "comfortable";

export type UiPreferences = {
  density: UiDensity;
  notificationsEnabled: boolean;
};

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  density: "normal",
  notificationsEnabled: true,
};

function getLocalStorage(): Storage | null {
  if (typeof globalThis === "undefined") return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function parseUiDensity(value: string | null | undefined): UiDensity {
  if (value === "compact" || value === "comfortable" || value === "normal") return value;
  return DEFAULT_UI_PREFERENCES.density;
}

export function parseNotificationsEnabled(value: string | null | undefined): boolean {
  if (value === "0" || value === "false") return false;
  if (value === "1" || value === "true") return true;
  return DEFAULT_UI_PREFERENCES.notificationsEnabled;
}

export function readUiPreferences(): UiPreferences {
  const storage = getLocalStorage();
  if (!storage) return { ...DEFAULT_UI_PREFERENCES };
  try {
    return {
      density: parseUiDensity(storage.getItem(UI_DENSITY_STORAGE_KEY)),
      notificationsEnabled: parseNotificationsEnabled(storage.getItem(UI_NOTIFICATIONS_STORAGE_KEY)),
    };
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function writeUiDensity(density: UiDensity): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(UI_DENSITY_STORAGE_KEY, density);
  } catch {
    /* private mode / storage quota */
  }
}

export function writeNotificationsEnabled(enabled: boolean): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(UI_NOTIFICATIONS_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode / storage quota */
  }
}

export function applyDocumentDensity(density: UiDensity): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = density;
}

applyDocumentDensity(readUiPreferences().density);
