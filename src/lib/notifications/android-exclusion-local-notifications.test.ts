import { describe, expect, it } from "vitest";

import { DEFAULT_EXCLUSION_SETTINGS } from "@/lib/exclusion-settings";
import {
  buildExclusionNativeNotificationPlan,
  buildExclusionNativeReminderCandidate,
  countFutureLifecycleCandidatesForExclusion,
  notificationIdForExclusionMilestone,
  planFutureExclusionLifecycleNativeSchedules,
} from "@/lib/notifications/android-exclusion-local-notifications";
import { combineLocalDateTime } from "@/lib/notifications/android-planning-local-notifications";

const ahmedLeave = {
  id: "ex-ahmed",
  agent_id: "a-1",
  dog_id: null,
  exclusion_type: "annual_leave",
  start_date: "2026-11-15",
  end_date: "2026-11-25",
  active: true as const,
};

const openEnded = {
  id: "ex-open",
  agent_id: "a-2",
  dog_id: null,
  exclusion_type: "dog_without_handler",
  start_date: "2026-12-01",
  end_date: null,
  active: true as const,
};

describe("android exclusion lifecycle native schedules", () => {
  it("Ahmed congé 15→25 : 6 futurs (start, d2, ended × 2 heures)", () => {
    const now = combineLocalDateTime("2026-11-01", "07:00");
    const planned = planFutureExclusionLifecycleNativeSchedules(ahmedLeave, DEFAULT_EXCLUSION_SETTINGS);
    expect(planned).toHaveLength(6);
    expect(planned.filter((r) => r.kind === "start")).toHaveLength(2);
    expect(planned.filter((r) => r.kind === "d2")).toHaveLength(2);
    expect(planned.filter((r) => r.kind === "ended")).toHaveLength(2);
    expect(planned.find((r) => r.kind === "start" && r.timeSlot === "t1")?.fireDayISO).toBe("2026-11-15");
    expect(planned.find((r) => r.kind === "d2" && r.timeSlot === "t2")?.fireDayISO).toBe("2026-11-23");
    expect(planned.find((r) => r.kind === "ended" && r.timeSlot === "t1")?.fireDayISO).toBe("2026-11-26");
    expect(countFutureLifecycleCandidatesForExclusion(ahmedLeave, DEFAULT_EXCLUSION_SETTINGS, now, "Ahmed")).toBe(6);
  });

  it("horaires personnalisés appliqués au fireAt", () => {
    const settings = {
      ...DEFAULT_EXCLUSION_SETTINGS,
      androidNotificationTimes: { time1: "09:30", time2: "18:00" },
    };
    const planned = planFutureExclusionLifecycleNativeSchedules(ahmedLeave, settings);
    const startT1 = planned.find((r) => r.milestone === "start@t1")!;
    const candidate = buildExclusionNativeReminderCandidate(
      ahmedLeave,
      startT1,
      "Ahmed",
      combineLocalDateTime("2026-11-01", "08:00"),
    );
    expect(candidate?.fireAt).toEqual(combineLocalDateTime("2026-11-15", "09:30"));
  });

  it("open-ended : uniquement start × 2", () => {
    const planned = planFutureExclusionLifecycleNativeSchedules(openEnded, DEFAULT_EXCLUSION_SETTINGS);
    expect(planned).toHaveLength(2);
    expect(planned.every((r) => r.kind === "start")).toBe(true);
  });

  it("dates passées ignorées", () => {
    const now = combineLocalDateTime("2026-11-27", "08:00");
    expect(countFutureLifecycleCandidatesForExclusion(ahmedLeave, DEFAULT_EXCLUSION_SETTINGS, now, "Ahmed")).toBe(0);
  });

  it("IDs stables par milestone+slot", () => {
    const a = notificationIdForExclusionMilestone("ex-1", "start@t1");
    const b = notificationIdForExclusionMilestone("ex-1", "start@t1");
    expect(a).toBe(b);
    expect(a).not.toBe(notificationIdForExclusionMilestone("ex-1", "start@t2"));
  });

  it("reconcile: pending correct → no cancel, no reschedule", () => {
    const id = notificationIdForExclusionMilestone(ahmedLeave.id, "start@t1");
    const fireAt = combineLocalDateTime("2026-11-15", "08:00");
    const plan = buildExclusionNativeNotificationPlan({
      pending: [
        {
          id,
          extraType: "exclusion-lifecycle",
          exclusionId: ahmedLeave.id,
          milestone: "start@t1",
          schedule: {
            on: {
              year: fireAt.getFullYear(),
              month: fireAt.getMonth(),
              day: fireAt.getDate(),
              hour: fireAt.getHours(),
              minute: fireAt.getMinutes(),
              second: 0,
            },
          },
        },
      ],
      candidates: [
        {
          exclusionId: ahmedLeave.id,
          milestone: "start@t1",
          kind: "start",
          timeSlot: "t1",
          notificationId: id,
          title: "t",
          body: "b",
          fireAt,
        },
      ],
    });
    expect(plan.cancelIds).toHaveLength(0);
    expect(plan.schedule).toHaveLength(0);
  });

  it("reconcile: missing expected → schedule only", () => {
    const id = notificationIdForExclusionMilestone(ahmedLeave.id, "start@t1");
    const fireAt = combineLocalDateTime("2026-11-15", "08:00");
    const plan = buildExclusionNativeNotificationPlan({
      pending: [],
      candidates: [
        {
          exclusionId: ahmedLeave.id,
          milestone: "start@t1",
          kind: "start",
          timeSlot: "t1",
          notificationId: id,
          title: "t",
          body: "b",
          fireAt,
        },
      ],
    });
    expect(plan.cancelIds).toHaveLength(0);
    expect(plan.schedule).toHaveLength(1);
  });

  it("reconcile: obsolete pending → cancel only", () => {
    const staleId = 9_999_999;
    const plan = buildExclusionNativeNotificationPlan({
      pending: [
        {
          id: staleId,
          extraType: "exclusion-lifecycle",
          exclusionId: "gone-exclusion",
          milestone: "start@t1",
        },
      ],
      candidates: [],
    });
    expect(plan.cancelIds).toEqual([staleId]);
    expect(plan.schedule).toHaveLength(0);
  });

  it("reconcile: time change → cancel + reschedule", () => {
    const id = notificationIdForExclusionMilestone(ahmedLeave.id, "start@t1");
    const oldFireAt = combineLocalDateTime("2026-11-15", "08:00");
    const newFireAt = combineLocalDateTime("2026-11-15", "09:30");
    const plan = buildExclusionNativeNotificationPlan({
      pending: [
        {
          id,
          extraType: "exclusion-lifecycle",
          exclusionId: ahmedLeave.id,
          milestone: "start@t1",
          schedule: {
            on: {
              year: oldFireAt.getFullYear(),
              month: oldFireAt.getMonth(),
              day: oldFireAt.getDate(),
              hour: oldFireAt.getHours(),
              minute: oldFireAt.getMinutes(),
              second: 0,
            },
          },
        },
      ],
      candidates: [
        {
          exclusionId: ahmedLeave.id,
          milestone: "start@t1",
          kind: "start",
          timeSlot: "t1",
          notificationId: id,
          title: "t",
          body: "b",
          fireAt: newFireAt,
        },
      ],
    });
    expect(plan.cancelIds).toEqual([id]);
    expect(plan.schedule).toHaveLength(1);
    expect(plan.schedule[0]?.fireAt).toEqual(newFireAt);
  });

  it("inactive exclusion schedules nothing", () => {
    expect(
      planFutureExclusionLifecycleNativeSchedules({ ...ahmedLeave, active: false }, DEFAULT_EXCLUSION_SETTINGS).length,
    ).toBe(0);
  });
});
