import { describe, expect, it } from "vitest";

import {
  computeCheckpointStaffingCounts,
  listRequiredK9Units,
  sumRequiredK9FromActiveCheckpoints,
  type CheckpointRequiredK9Row,
} from "@/lib/checkpoints/operational-config";

function row(
  partial: Partial<CheckpointRequiredK9Row> & Pick<CheckpointRequiredK9Row, "active">,
): CheckpointRequiredK9Row {
  return {
    day_shift_enabled: true,
    night_shift_enabled: false,
    day_explosives: 0,
    day_narcotics: 0,
    night_explosives: 0,
    night_narcotics: 0,
    ...partial,
  };
}

describe("sumRequiredK9FromActiveCheckpoints", () => {
  it("sums peak concurrent need from active checkpoints only", () => {
    const required = sumRequiredK9FromActiveCheckpoints([
      row({
        active: true,
        day_shift_enabled: true,
        night_shift_enabled: true,
        day_narcotics: 2,
        night_narcotics: 1,
        day_explosives: 1,
        night_explosives: 3,
      }),
      row({
        active: false,
        day_narcotics: 9,
        day_explosives: 9,
      }),
      row({
        active: true,
        day_narcotics: 1,
        day_explosives: 0,
      }),
    ]);

    expect(required).toEqual({ narcotics: 3, explosives: 3, total: 6 });
    expect(required.total).toBe(required.narcotics + required.explosives);
  });

  it("lists one unit per required team so dialog rows match the card", () => {
    const rows = [
      row({
        active: true,
        day_shift_enabled: true,
        night_shift_enabled: true,
        day_narcotics: 2,
        night_narcotics: 1,
        day_explosives: 1,
        night_explosives: 3,
      }),
      row({
        active: false,
        day_narcotics: 9,
        day_explosives: 9,
      }),
      row({
        active: true,
        day_narcotics: 1,
        day_explosives: 0,
      }),
    ];
    const required = sumRequiredK9FromActiveCheckpoints(rows);
    expect(listRequiredK9Units(rows)).toHaveLength(required.total);
    expect(listRequiredK9Units(rows, "narcotics")).toHaveLength(required.narcotics);
    expect(listRequiredK9Units(rows, "explosives")).toHaveLength(required.explosives);
  });

  it("ignores disabled-shift residual counts", () => {
    const required = sumRequiredK9FromActiveCheckpoints([
      row({
        active: true,
        day_shift_enabled: false,
        night_shift_enabled: true,
        day_narcotics: 4,
        day_explosives: 4,
        night_narcotics: 1,
        night_explosives: 2,
      }),
    ]);

    expect(required).toEqual({ narcotics: 1, explosives: 2, total: 3 });
  });
});

describe("computeCheckpointStaffingCounts", () => {
  it("keeps total equal to narcotics + explosives", () => {
    const staffing = computeCheckpointStaffingCounts({
      day_shift_enabled: true,
      night_shift_enabled: true,
      day: { narcotics: 2, explosives: 0 },
      night: { narcotics: 0, explosives: 5 },
    });

    expect(staffing).toEqual({ narcotics: 2, explosives: 5, total: 7 });
  });
});
