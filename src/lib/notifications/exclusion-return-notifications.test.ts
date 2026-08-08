import { describe, expect, it } from "vitest";
import {
  daysUntilReturn,
  exclusionReturnDateISO,
  milestoneForDaysUntil,
} from "@/lib/notifications/exclusion-return-dates";
import {
  notificationTypeForExclusion,
  severityForDaysUntilReturn,
} from "@/lib/notifications/exclusion-return-types";
import {
  formatExclusionReturnMessage,
  formatImminentReturnLine,
} from "@/lib/notifications/exclusion-return-messages";

describe("exclusion return dates", () => {
  it("returns the day after inclusive end_date", () => {
    expect(exclusionReturnDateISO("2026-08-07")).toBe("2026-08-08");
  });

  it("computes milestone days until return", () => {
    expect(daysUntilReturn("2026-08-08", "2026-08-01")).toBe(7);
    expect(daysUntilReturn("2026-08-08", "2026-08-05")).toBe(3);
    expect(daysUntilReturn("2026-08-08", "2026-08-07")).toBe(1);
    expect(daysUntilReturn("2026-08-08", "2026-08-08")).toBe(0);
    expect(milestoneForDaysUntil(7)).toBe("d7");
    expect(milestoneForDaysUntil(2)).toBeNull();
  });
});

describe("notification typing & severity", () => {
  it("maps exclusion types to notification categories", () => {
    expect(notificationTypeForExclusion("sickness", "personnel")).toBe("end_of_sickness");
    expect(notificationTypeForExclusion("female_dog_heat", "dog")).toBe("end_of_heat");
    expect(notificationTypeForExclusion("mission", "personnel")).toBe("end_of_mission");
    expect(notificationTypeForExclusion("dog_other", "dog")).toBe("dog_return");
  });

  it("colors by urgency", () => {
    expect(severityForDaysUntilReturn(0)).toBe("success");
    expect(severityForDaysUntilReturn(2)).toBe("warning");
    expect(severityForDaysUntilReturn(7)).toBe("info");
  });
});

describe("message formatting", () => {
  const t = (key: string, params?: Record<string, string | number>) => {
    if (key === "notifications.message.personnel.inDays") {
      return `${params?.name} will become available in ${params?.count} days (${params?.date}).`;
    }
    if (key === "notifications.message.personnel.tomorrow") {
      return `${params?.name} returns to service tomorrow.`;
    }
    if (key === "notifications.message.personnel.today") {
      return `${params?.name} is available again today.`;
    }
    if (key === "notifications.message.dog.inDays") {
      return `Dog ${params?.name} (${params?.type}) will be operational again in ${params?.count} days.`;
    }
    if (key === "notifications.message.dog.tomorrow") {
      return `Dog ${params?.name} finishes ${params?.type} tomorrow.`;
    }
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
      if (type === "dog_sick") return "medical exclusion";
      return type;
    }
    return key;
  };

  it("formats personnel and dog messages", () => {
    expect(
      formatExclusionReturnMessage(
        {
          subject_kind: "personnel",
          subject_name: "Mohamed El Khazzar",
          exclusion_type: "mission",
          return_date: "2026-08-08",
          milestone: "d3",
          notification_type: "end_of_mission",
        },
        t,
        "fr",
      ),
    ).toContain("Mohamed El Khazzar will become available in 3 days");

    expect(
      formatExclusionReturnMessage(
        {
          subject_kind: "personnel",
          subject_name: "Hassan Dami",
          exclusion_type: "sickness",
          return_date: "2026-08-07",
          milestone: "d1",
          notification_type: "end_of_sickness",
        },
        t,
      ),
    ).toBe("Hassan Dami returns to service tomorrow.");

    expect(
      formatExclusionReturnMessage(
        {
          subject_kind: "dog",
          subject_name: "IRA",
          exclusion_type: "female_dog_heat",
          return_date: "2026-08-08",
          milestone: "d3",
          notification_type: "end_of_heat",
        },
        t,
      ),
    ).toBe(
      "Dog IRA (Chienne en chaleur) will be operational again in 3 days.",
    );
  });

  it("formats imminent return lines", () => {
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
