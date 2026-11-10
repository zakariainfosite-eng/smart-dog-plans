import { describe, expect, it } from "vitest";

import { DEFAULT_EXCLUSION_SETTINGS } from "@/lib/exclusion-settings";
import {
  planExclusionLifecycleNotifications,
  shouldPlanExclusionEndedNotification,
  shouldPlanExclusionStartNotification,
} from "@/lib/notifications/exclusion-lifecycle-events";
import { exclusionNotificationDedupeKey } from "@/lib/notifications/exclusion-return-types";
import {
  formatExclusionEndingSubject,
  formatExclusionReturnMessage,
} from "@/lib/notifications/exclusion-return-messages";

const personnelLeave = {
  id: "ex-1",
  agent_id: "a-1",
  dog_id: null,
  exclusion_type: "annual_leave",
  start_date: "2026-08-07",
  end_date: "2026-08-09",
  active: true as const,
};

const dogSick = {
  id: "ex-dog",
  agent_id: null,
  dog_id: "d-1",
  exclusion_type: "dog_sick",
  start_date: "2026-08-07",
  end_date: "2026-08-09",
  active: true as const,
};

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === "exclusions.type.annual_leave") return "Congé";
  if (key === "exclusions.type.dog_sick") return "Maladie";
  if (key === "exclusions.type.brand_new_type") return key;
  if (key === "notifications.lifecycle.started.personnel.title") return "Exclusion commencée";
  if (key === "notifications.lifecycle.started.personnel.bodyToday") {
    return `${params?.name} entre en exclusion aujourd'hui — ${params?.type}.`;
  }
  if (key === "notifications.lifecycle.endingSoon.title") return "Retour prochainement";
  if (key === "notifications.lifecycle.endingSoon.personnel.body") {
    return `${params?.name} termine son exclusion (${params?.type}) dans 2 jours et sera bientôt disponible.`;
  }
  if (key === "notifications.lifecycle.ended.personnel.title") return "De nouveau disponible";
  if (key === "notifications.lifecycle.ended.personnel.body") {
    return `${params?.name} est de nouveau disponible après son exclusion — ${params?.type}.`;
  }
  if (key === "notifications.lifecycle.started.dog.title") return "Exclusion du chien commencée";
  if (key === "notifications.lifecycle.started.dog.bodyToday") {
    return `Le chien ${params?.name} entre en exclusion aujourd'hui — ${params?.type}.`;
  }
  if (key === "notifications.lifecycle.endingSoon.dog.body") {
    return `Le chien ${params?.name} termine son exclusion (${params?.type}) dans 2 jours et sera bientôt disponible.`;
  }
  if (key === "notifications.lifecycle.ended.dog.title") return "Chien de nouveau disponible";
  if (key === "notifications.lifecycle.ended.dog.body") {
    return `Le chien ${params?.name} est de nouveau disponible après la fin de son exclusion — ${params?.type}.`;
  }
  return key;
};

describe("exclusion lifecycle notifications", () => {
  it("1 — employee exclusion starts today → start notification", () => {
    const planned = planExclusionLifecycleNotifications(
      personnelLeave,
      "2026-08-07",
      DEFAULT_EXCLUSION_SETTINGS,
    );
    expect(planned.some((row) => row.milestone === "start" && row.notificationType === "exclusion_started")).toBe(
      true,
    );
  });

  it("2 — dog exclusion starts today → start notification", () => {
    const planned = planExclusionLifecycleNotifications(dogSick, "2026-08-07", DEFAULT_EXCLUSION_SETTINGS);
    expect(planned.some((row) => row.milestone === "start")).toBe(true);
  });

  it("3 — employee ends in exactly 2 days → ending soon", () => {
    const planned = planExclusionLifecycleNotifications(
      personnelLeave,
      "2026-08-07",
      DEFAULT_EXCLUSION_SETTINGS,
    );
    expect(planned.some((row) => row.milestone === "d2" && row.notificationType === "exclusion_ending_soon")).toBe(
      true,
    );
  });

  it("4 — dog ends in exactly 2 days → ending soon", () => {
    const planned = planExclusionLifecycleNotifications(dogSick, "2026-08-07", DEFAULT_EXCLUSION_SETTINGS);
    expect(planned.some((row) => row.milestone === "d2")).toBe(true);
  });

  it("5 — employee exclusion ended → available notification on return date", () => {
    expect(shouldPlanExclusionEndedNotification(personnelLeave, "2026-08-10")).toBe(true);
    const planned = planExclusionLifecycleNotifications(
      personnelLeave,
      "2026-08-10",
      DEFAULT_EXCLUSION_SETTINGS,
    );
    expect(planned.some((row) => row.milestone === "ended" && row.notificationType === "exclusion_ended")).toBe(
      true,
    );
  });

  it("6 — dog exclusion ended → available notification", () => {
    expect(shouldPlanExclusionEndedNotification(dogSick, "2026-08-10")).toBe(true);
  });

  it("7 — future exclusion → no start before actual start date", () => {
    expect(shouldPlanExclusionStartNotification(personnelLeave, "2026-08-05")).toBe(false);
    const planned = planExclusionLifecycleNotifications(
      personnelLeave,
      "2026-08-05",
      DEFAULT_EXCLUSION_SETTINGS,
    );
    expect(planned.some((row) => row.milestone === "start")).toBe(false);
  });

  it("8–9 — unknown exclusion types still work dynamically", () => {
    const custom = {
      ...personnelLeave,
      exclusion_type: "brand_new_type",
    };
    const planned = planExclusionLifecycleNotifications(custom, "2026-08-07", DEFAULT_EXCLUSION_SETTINGS);
    expect(planned.length).toBeGreaterThan(0);

    const msg = formatExclusionReturnMessage(
      {
        subject_kind: "personnel",
        subject_name: "Ahmed Amrani",
        exclusion_type: "annual_leave",
        end_date: "2026-08-09",
        return_date: "2026-08-07",
        milestone: "start",
        notification_type: "exclusion_started",
      },
      t,
      "fr",
      "2026-08-07",
    );
    expect(msg).toBe("Ahmed Amrani entre en exclusion aujourd'hui — Congé.");
    expect(formatExclusionEndingSubject(
      {
        exclusion_type: "annual_leave",
        subject_kind: "personnel",
        notification_type: "exclusion_started",
        milestone: "start",
      },
      t,
    )).toBe("Exclusion commencée");
  });

  it("10 — dedupe key prevents duplicate delivery for same exclusion + milestone", () => {
    const a = exclusionNotificationDedupeKey("ex-1", "start");
    const b = exclusionNotificationDedupeKey("ex-1", "start");
    const c = exclusionNotificationDedupeKey("ex-1", "d2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("11 — catch-up start within window after missed day", () => {
    expect(shouldPlanExclusionStartNotification(personnelLeave, "2026-08-08")).toBe(true);
    expect(shouldPlanExclusionStartNotification(personnelLeave, "2026-08-20")).toBe(false);
  });

  it("12 — open-ended exclusion only plans start", () => {
    const open = {
      ...personnelLeave,
      exclusion_type: "training",
      end_date: null,
    };
    const planned = planExclusionLifecycleNotifications(open, "2026-08-07", DEFAULT_EXCLUSION_SETTINGS);
    expect(planned).toEqual([
      expect.objectContaining({ milestone: "start", notificationType: "exclusion_started" }),
    ]);
  });
});
