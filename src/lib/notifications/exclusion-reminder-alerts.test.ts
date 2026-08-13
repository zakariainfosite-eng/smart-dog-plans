import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  buildExclusionReminderAlertKey,
  filterUnshownExclusionReminderAlerts,
  formatExclusionReminderAlertMessage,
  markExclusionReminderShown,
  pruneShownExclusionReminderKeys,
  readShownExclusionReminderKeys,
  sortExclusionReminderAlerts,
  EXCLUSION_REMINDER_ALERTS_STORAGE_KEY,
  type ExclusionReminderAlert,
} from "@/lib/notifications/exclusion-reminder-alerts";

const sampleAlert = (
  overrides: Partial<ExclusionReminderAlert> = {},
): ExclusionReminderAlert => ({
  exclusionId: "ex-1",
  agentId: "agent-1",
  dogId: null,
  subjectKind: "personnel",
  subjectName: "Mohamed El Khazzar",
  exclusionType: "annual_leave",
  endDate: "2026-08-15",
  milestone: "d2",
  daysRemaining: 2,
  alertKey: buildExclusionReminderAlertKey("ex-1", "d2", "2026-08-15"),
  ...overrides,
});

describe("exclusion reminder alert keys", () => {
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
    });
  });

  it("builds stable alert keys from exclusion, milestone, and end date", () => {
    expect(buildExclusionReminderAlertKey("ex-1", "d1", "2026-08-15")).toBe(
      "ex-1::d1::2026-08-15",
    );
  });

  it("tracks shown alerts in localStorage without duplicates", () => {
    const key = buildExclusionReminderAlertKey("ex-1", "d2", "2026-08-15");
    markExclusionReminderShown(key);
    markExclusionReminderShown(key);
    expect(readShownExclusionReminderKeys().has(key)).toBe(true);
    expect(readShownExclusionReminderKeys().size).toBe(1);
  });

  it("prunes stale shown keys when exclusion dates change or alerts expire", () => {
    const stale = buildExclusionReminderAlertKey("ex-1", "d2", "2026-08-10");
    const current = buildExclusionReminderAlertKey("ex-1", "d2", "2026-08-15");
    markExclusionReminderShown(stale);
    markExclusionReminderShown(current);
    pruneShownExclusionReminderKeys(new Set([current]));
    expect(readShownExclusionReminderKeys()).toEqual(new Set([current]));
  });

  it("filters out alerts that were already displayed", () => {
    const alert = sampleAlert();
    markExclusionReminderShown(alert.alertKey);
    const unshown = filterUnshownExclusionReminderAlerts([alert], readShownExclusionReminderKeys());
    expect(unshown).toHaveLength(0);
  });
});

describe("exclusion reminder alert ordering & copy", () => {
  const t = (key: string, params?: Record<string, string | number>) => {
    if (key === "notifications.reminderAlert.messageInDays") {
      return `L'exclusion de ${params?.name} (${params?.type}) se termine dans ${params?.count} jours.`;
    }
    if (key === "notifications.reminderAlert.messageTomorrow") {
      return `L'exclusion de ${params?.name} (${params?.type}) se termine dans 1 jour.`;
    }
    if (key === "notifications.reminderAlert.messageToday") {
      return `L'exclusion de ${params?.name} (${params?.type}) se termine aujourd'hui.`;
    }
    if (key.startsWith("exclusions.type.")) {
      const type = key.replace("exclusions.type.", "");
      if (type === "annual_leave") return "Congé";
      if (type === "female_dog_heat") return "Chienne en chaleur";
      return type;
    }
    return key;
  };

  it("sorts by urgency (today first)", () => {
    const sorted = sortExclusionReminderAlerts([
      sampleAlert({ daysRemaining: 2, milestone: "d2", endDate: "2026-08-17" }),
      sampleAlert({
        exclusionId: "ex-2",
        daysRemaining: 0,
        milestone: "d0",
        endDate: "2026-08-15",
        alertKey: buildExclusionReminderAlertKey("ex-2", "d0", "2026-08-15"),
      }),
    ]);
    expect(sorted[0]?.daysRemaining).toBe(0);
  });

  it("formats popup message with agent/dog name and exclusion type", () => {
    expect(
      formatExclusionReminderAlertMessage(
        {
          subjectName: "IRA",
          exclusionType: "female_dog_heat",
          daysRemaining: 2,
        },
        t,
      ),
    ).toBe("L'exclusion de IRA (Chienne en chaleur) se termine dans 2 jours.");

    expect(
      formatExclusionReminderAlertMessage(
        {
          subjectName: "Hassan Dami",
          exclusionType: "annual_leave",
          daysRemaining: 1,
        },
        t,
      ),
    ).toContain("1 jour");
  });
});
