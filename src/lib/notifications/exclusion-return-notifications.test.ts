import { describe, expect, it } from "vitest";
import {
  daysUntilEnd,
  daysUntilReturn,
  exclusionReturnDateISO,
  exclusionScanWindow,
  milestoneForDaysUntilEnd,
} from "@/lib/notifications/exclusion-return-dates";
import {
  isActiveEndMilestone,
  notificationTypeForExclusion,
  severityForDaysUntilEnd,
  severityForDaysUntilReturn,
} from "@/lib/notifications/exclusion-return-types";
import {
  formatExclusionEndingSubject,
  formatExclusionReturnMessage,
  formatImminentReturnLine,
  isRenderableExclusionNotification,
  isUpcomingExclusionNotification,
} from "@/lib/notifications/exclusion-return-messages";

describe("exclusion return dates", () => {
  it("returns the day after inclusive end_date", () => {
    expect(exclusionReturnDateISO("2026-08-07")).toBe("2026-08-08");
    expect(exclusionReturnDateISO("")).toBeNull();
    expect(exclusionReturnDateISO("invalid")).toBeNull();
  });

  it("computes days until return (legacy dashboard card)", () => {
    expect(daysUntilReturn("2026-08-08", "2026-08-01")).toBe(7);
    expect(daysUntilReturn("2026-08-08", "2026-08-07")).toBe(1);
    expect(daysUntilReturn("2026-08-08", "2026-08-08")).toBe(0);
  });

  it("computes end-date milestones (2, 1, 0 days before end)", () => {
    expect(daysUntilEnd("2026-08-10", "2026-08-08")).toBe(2);
    expect(daysUntilEnd("2026-08-09", "2026-08-08")).toBe(1);
    expect(daysUntilEnd("2026-08-08", "2026-08-08")).toBe(0);
    expect(daysUntilEnd("2026-08-07", "2026-08-08")).toBe(-1);
    expect(milestoneForDaysUntilEnd(2)).toBe("d2");
    expect(milestoneForDaysUntilEnd(1)).toBe("d1");
    expect(milestoneForDaysUntilEnd(0)).toBe("d0");
    expect(milestoneForDaysUntilEnd(3)).toBeNull();
  });

  it("scans active exclusions ending within the next 2 days", () => {
    expect(exclusionScanWindow("2026-08-08")).toEqual({
      minEndDate: "2026-08-08",
      maxEndDate: "2026-08-10",
    });
  });
});

describe("notification typing & severity", () => {
  it("maps exclusion types to notification categories", () => {
    expect(notificationTypeForExclusion("sickness", "personnel")).toBe("end_of_sickness");
    expect(notificationTypeForExclusion("female_dog_heat", "dog")).toBe("end_of_heat");
    expect(notificationTypeForExclusion("mission", "personnel")).toBe("end_of_mission");
    expect(notificationTypeForExclusion("dog_other", "dog")).toBe("dog_return");
  });

  it("colors end-date urgency", () => {
    expect(severityForDaysUntilEnd(0)).toBe("warning");
    expect(severityForDaysUntilEnd(1)).toBe("warning");
    expect(severityForDaysUntilEnd(2)).toBe("info");
  });

  it("colors return-date urgency for dashboard", () => {
    expect(severityForDaysUntilReturn(0)).toBe("success");
    expect(severityForDaysUntilReturn(2)).toBe("warning");
    expect(severityForDaysUntilReturn(7)).toBe("info");
  });

  it("identifies active end milestones", () => {
    expect(isActiveEndMilestone("d2")).toBe(true);
    expect(isActiveEndMilestone("d7")).toBe(false);
  });
});

describe("message formatting", () => {
  const t = (key: string, params?: Record<string, string | number>) => {
    if (key === "notifications.ending.subject") {
      return `Fin prochaine d'exclusion — ${params?.type}`;
    }
    if (key === "notifications.message.personnel.endsInDays") {
      return `Attention : L'exclusion de ${params?.name} (${params?.type}) se termine dans ${params?.count} jours.`;
    }
    if (key === "notifications.message.personnel.endsTomorrow") {
      return `Attention : L'exclusion de ${params?.name} (${params?.type}) se termine dans 1 jour.`;
    }
    if (key === "notifications.message.personnel.endsToday") {
      return `Attention : L'exclusion de ${params?.name} (${params?.type}) se termine aujourd'hui.`;
    }
    if (key === "notifications.message.dog.endsInDays") {
      return `Attention : La période d'exclusion ${params?.article} ${params?.name} (${params?.type}) se termine dans ${params?.count} jours.`;
    }
    if (key === "notifications.message.dog.endsTomorrow") {
      return `Attention : La période d'exclusion ${params?.article} ${params?.name} (${params?.type}) se termine dans 1 jour.`;
    }
    if (key === "notifications.message.dog.articleFemale") return "de la chienne";
    if (key === "notifications.message.dog.articleMale") return "du chien";
    if (key === "notifications.imminent.inDays") {
      return `${params?.name} — returns in ${params?.count} days`;
    }
    if (key === "notifications.imminent.heatEndsTomorrow") {
      return `${params?.name} — Heat period ends tomorrow`;
    }
    if (key === "notifications.imminent.availableToday") {
      return `${params?.name} — Available today`;
    }
    if (key.startsWith("exclusions.type.")) {
      const type = key.replace("exclusions.type.", "");
      if (type === "female_dog_heat") return "Chienne en chaleur";
      if (type === "annual_leave") return "Congé";
      if (type === "dog_sick") return "medical exclusion";
      return type;
    }
    return key;
  };

  it("formats end-date personnel and dog messages", () => {
    expect(
      formatExclusionReturnMessage(
        {
          subject_kind: "personnel",
          subject_name: "Mohamed El Khazzar",
          exclusion_type: "annual_leave",
          end_date: "2026-08-10",
          milestone: "d2",
          notification_type: "end_of_leave",
        },
        t,
        "fr",
      ),
    ).toContain("Mohamed El Khazzar (Congé) se termine dans 2 jours");

    expect(
      formatExclusionReturnMessage(
        {
          subject_kind: "personnel",
          subject_name: "Hassan Dami",
          exclusion_type: "sickness",
          end_date: "2026-08-09",
          milestone: "d1",
          notification_type: "end_of_sickness",
        },
        t,
      ),
    ).toContain("Hassan Dami");
    expect(
      formatExclusionReturnMessage(
        {
          subject_kind: "personnel",
          subject_name: "Hassan Dami",
          exclusion_type: "sickness",
          end_date: "2026-08-09",
          milestone: "d1",
          notification_type: "end_of_sickness",
        },
        t,
      ),
    ).toContain("1 jour");

    expect(
      formatExclusionReturnMessage(
        {
          subject_kind: "dog",
          subject_name: "IRA",
          exclusion_type: "female_dog_heat",
          end_date: "2026-08-10",
          milestone: "d2",
          notification_type: "end_of_heat",
        },
        t,
      ),
    ).toContain("de la chienne IRA (Chienne en chaleur)");
  });

  it("formats notification subject lines", () => {
    expect(
      formatExclusionEndingSubject({ exclusion_type: "female_dog_heat" }, t),
    ).toBe("Fin prochaine d'exclusion — Chienne en chaleur");
  });

  it("filters upcoming vs expired notifications", () => {
    expect(isUpcomingExclusionNotification({ end_date: "2026-08-10" }, "2026-08-08")).toBe(true);
    expect(isUpcomingExclusionNotification({ end_date: "2026-08-07" }, "2026-08-08")).toBe(false);
    expect(isUpcomingExclusionNotification({ end_date: "" }, "2026-08-08")).toBe(false);
    expect(isRenderableExclusionNotification({ end_date: "2026-08-10" })).toBe(true);
    expect(isRenderableExclusionNotification({ end_date: "bad" })).toBe(false);
  });

  it("returns NaN for invalid end dates in day calculations", () => {
    expect(daysUntilEnd("invalid", "2026-08-08")).toBeNaN();
    expect(milestoneForDaysUntilEnd(Number.NaN)).toBeNull();
  });

  it("formats imminent return lines (dashboard unchanged)", () => {
    expect(
      formatImminentReturnLine(
        {
          subject_kind: "personnel",
          subject_name: "Mohamed EL KHAZZAR",
          exclusion_type: "mission",
          return_date: "2026-08-08",
          days_until: 2,
        },
        t,
      ),
    ).toBe("Mohamed EL KHAZZAR — returns in 2 days");

    expect(
      formatImminentReturnLine(
        {
          subject_kind: "dog",
          subject_name: "IRA",
          exclusion_type: "female_dog_heat",
          return_date: "2026-08-07",
          days_until: 1,
        },
        t,
      ),
    ).toBe("IRA — Heat period ends tomorrow");
  });
});
