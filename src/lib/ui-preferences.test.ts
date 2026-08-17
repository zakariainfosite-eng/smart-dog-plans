import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  DEFAULT_UI_PREFERENCES,
  UI_DENSITY_STORAGE_KEY,
  UI_NOTIFICATIONS_STORAGE_KEY,
  parseNotificationsEnabled,
  parseUiDensity,
  readUiPreferences,
  writeNotificationsEnabled,
  writeUiDensity,
} from "@/lib/ui-preferences";

describe("ui preferences", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
      key: () => null,
      length: 0,
    });
  });

  it("parses density with Normal as the default", () => {
    expect(parseUiDensity(null)).toBe("normal");
    expect(parseUiDensity("compact")).toBe("compact");
    expect(parseUiDensity("comfortable")).toBe("comfortable");
    expect(parseUiDensity("unknown")).toBe("normal");
  });

  it("parses notification display as enabled by default", () => {
    expect(parseNotificationsEnabled(null)).toBe(true);
    expect(parseNotificationsEnabled("1")).toBe(true);
    expect(parseNotificationsEnabled("0")).toBe(false);
    expect(parseNotificationsEnabled("false")).toBe(false);
  });

  it("persists density and notification display in localStorage", () => {
    writeUiDensity("compact");
    writeNotificationsEnabled(false);
    expect(localStorage.getItem(UI_DENSITY_STORAGE_KEY)).toBe("compact");
    expect(localStorage.getItem(UI_NOTIFICATIONS_STORAGE_KEY)).toBe("0");
    expect(readUiPreferences()).toEqual({
      density: "compact",
      notificationsEnabled: false,
    });
  });

  it("returns current-interface defaults when nothing is stored", () => {
    expect(readUiPreferences()).toEqual(DEFAULT_UI_PREFERENCES);
  });
});
