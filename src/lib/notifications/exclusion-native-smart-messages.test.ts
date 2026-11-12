import { describe, expect, it } from "vitest";

import {
  formatExclusionDailyNotification,
  formatExclusionReturnTodayNotification,
  formatExclusionReturnTomorrowNotification,
  formatExclusionSavedConfirmationMessage,
} from "@/lib/notifications/exclusion-native-smart-messages";

describe("exclusion native smart messages", () => {
  it("1 — confirmation agent", () => {
    const body = formatExclusionSavedConfirmationMessage({
      subjectKind: "personnel",
      subjectName: "Ahmed",
      startDateISO: "2026-11-12",
      endDateISO: "2026-11-20",
    });
    expect(body).toContain("Ahmed");
    expect(body).toContain("12/11/2026");
    expect(body).toContain("20/11/2026");
  });

  it("2 — confirmation chien", () => {
    const body = formatExclusionSavedConfirmationMessage({
      subjectKind: "dog",
      subjectName: "Rex",
      startDateISO: "2026-11-12",
      endDateISO: "2026-11-20",
    });
    expect(body).toContain("Rex");
  });

  it("5 — jours restants agent (milieu d'exclusion)", () => {
    const { title, body } = formatExclusionDailyNotification({
      subjectKind: "personnel",
      subjectName: "Ahmed",
      fireDayISO: "2026-11-17",
      returnDateISO: "2026-11-21",
    });
    expect(title).toContain("👮");
    expect(body).toContain("4 jours");
  });

  it("5b — jours restants chien", () => {
    const { body } = formatExclusionDailyNotification({
      subjectKind: "dog",
      subjectName: "Rex",
      fireDayISO: "2026-11-15",
      returnDateISO: "2026-11-20",
    });
    expect(body).toContain("5 jours");
  });

  it("6 — retour demain", () => {
    const { title, body } = formatExclusionReturnTomorrowNotification({
      subjectKind: "dog",
      subjectName: "Rex",
    });
    expect(title).toContain("Retour demain");
    expect(body).toContain("demain");
  });

  it("7 — retour aujourd'hui agent", () => {
    const { title, body } = formatExclusionReturnTodayNotification({
      subjectKind: "personnel",
      subjectName: "Ahmed",
    });
    expect(title).toContain("Retour au travail");
    expect(body).toContain("aujourd'hui");
  });

  it("7b — retour aujourd'hui chien", () => {
    const { title } = formatExclusionReturnTodayNotification({
      subjectKind: "dog",
      subjectName: "Rex",
    });
    expect(title).toContain("service");
  });
});
