import { describe, expect, it } from "vitest";

import { DEFAULT_PLANNING_SETTINGS } from "@/lib/planning-settings";
import {
  PLANNING_REMINDER_TITLE,
  PLANNING_REMINDER_TYPE,
  buildPlanningNotificationPlan,
  buildPlanningReminderCandidate,
  combineLocalDateTime,
  formatPlanningReminderBody,
  isOperationalPlanningAssignment,
  notificationIdForAssignment,
  planningReminderAt,
  planningShiftStartHhmm,
  type PlanningReminderAssignment,
} from "@/lib/notifications/android-planning-local-notifications";

function assignment(overrides: Partial<PlanningReminderAssignment> = {}): PlanningReminderAssignment {
  return {
    assignmentId: "asg-1",
    agentName: "BENALI KARIM",
    pointName: "Point 1",
    sectionName: "SECTION 1",
    planningDate: "2026-09-07",
    shift: "day",
    isHqReserve: false,
    isOffDuty: false,
    hasCheckpoint: true,
    validated: true,
    ...overrides,
  };
}

describe("android planning local notifications", () => {
  it("schedules exactly one hour before the shift start", () => {
    const planned = combineLocalDateTime("2026-09-07", "09:00");
    const remind = planningReminderAt(planned);
    expect(remind.getTime()).toBe(planned.getTime() - 60 * 60 * 1000);
    expect(remind.getHours()).toBe(8);
    expect(remind.getMinutes()).toBe(0);
  });

  it("uses night start for night shift", () => {
    expect(planningShiftStartHhmm("night", DEFAULT_PLANNING_SETTINGS)).toBe("21:00");
    const candidate = buildPlanningReminderCandidate(
      assignment({ shift: "night" }),
      DEFAULT_PLANNING_SETTINGS,
      new Date(2026, 8, 7, 10, 0, 0),
    );
    expect(candidate?.plannedAt.getHours()).toBe(21);
    expect(candidate?.remindAt.getHours()).toBe(20);
  });

  it("skips past reminders so old planning is not re-fired", () => {
    const candidate = buildPlanningReminderCandidate(
      assignment(),
      DEFAULT_PLANNING_SETTINGS,
      new Date(2026, 8, 7, 8, 30, 0),
    );
    expect(candidate).toBeNull();
  });

  it("skips drafts, reserve, rest, and assignments without a point", () => {
    expect(isOperationalPlanningAssignment({ ...assignment(), validated: false })).toBe(false);
    expect(isOperationalPlanningAssignment({ ...assignment(), isHqReserve: true })).toBe(false);
    expect(isOperationalPlanningAssignment({ ...assignment(), isOffDuty: true })).toBe(false);
    expect(isOperationalPlanningAssignment({ ...assignment(), hasCheckpoint: false })).toBe(false);
    expect(
      buildPlanningReminderCandidate(
        assignment({ isHqReserve: true }),
        DEFAULT_PLANNING_SETTINGS,
        new Date(2026, 8, 6, 8, 0, 0),
      ),
    ).toBeNull();
  });

  it("keeps a stable notification id per assignment to prevent duplicates", () => {
    const first = notificationIdForAssignment("asg-abc");
    const second = notificationIdForAssignment("asg-abc");
    const other = notificationIdForAssignment("asg-xyz");
    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toBeGreaterThan(0);
  });

  it("includes agent, point, section and date/time in the body", () => {
    const plannedAt = combineLocalDateTime("2026-09-07", "09:00");
    const body = formatPlanningReminderBody({
      agentName: "BENALI KARIM",
      pointName: "Point 1",
      sectionName: "SECTION 1",
      plannedAt,
    });
    expect(body).toContain("BENALI KARIM");
    expect(body).toContain("Point 1");
    expect(body).toContain("SECTION 1");
    expect(body).toContain("07/09/2026 09:00");
  });

  it("uses the required title and cancels previous planning reminders before rescheduling", () => {
    const now = new Date(2026, 8, 6, 8, 0, 0);
    const next = buildPlanningReminderCandidate(assignment(), DEFAULT_PLANNING_SETTINGS, now);
    expect(next?.title).toBe(PLANNING_REMINDER_TITLE);
    expect(next).not.toBeNull();

    const staleId = 4242;
    const plan = buildPlanningNotificationPlan({
      pending: [
        { id: staleId, extraType: PLANNING_REMINDER_TYPE },
        { id: 99, extraType: "other" },
      ],
      candidates: [next!],
    });
    expect(plan.cancelIds).toEqual(expect.arrayContaining([staleId, next!.notificationId]));
    expect(plan.cancelIds).not.toContain(99);
    expect(plan.schedule).toHaveLength(1);
    expect(plan.schedule[0]?.assignmentId).toBe("asg-1");
  });
});
