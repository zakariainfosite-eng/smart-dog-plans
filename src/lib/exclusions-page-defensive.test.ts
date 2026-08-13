import { describe, expect, it } from "vitest";
import { todayISODate } from "@/lib/agent-exclusions";

function isExclusionRowEnabled(active: boolean | number | null | undefined): boolean {
  return active === true || active === 1;
}

function isCurrentlyActiveExclusionRow(exclusion: {
  start_date?: string | null;
  end_date?: string | null;
  active?: boolean | number | null;
}): boolean {
  if (!isExclusionRowEnabled(exclusion.active)) return false;
  const start = exclusion.start_date?.trim();
  const end = exclusion.end_date?.trim();
  if (!start || !end) return false;
  const today = todayISODate();
  return start <= today && today <= end;
}

function exclusionLabel(type: string | null | undefined, t: (key: string) => string): string {
  if (!type) return "—";
  const key = `exclusions.type.${type}`;
  const translated = t(key);
  return translated === key ? String(type) : translated;
}

describe("exclusions page defensive helpers", () => {
  it("treats sqlite active=1 as enabled", () => {
    expect(
      isCurrentlyActiveExclusionRow({
        active: 1,
        start_date: "2020-01-01",
        end_date: "2099-01-01",
      }),
    ).toBe(true);
  });

  it("skips rows with missing dates", () => {
    expect(isCurrentlyActiveExclusionRow({ active: true, start_date: "", end_date: "2099-01-01" })).toBe(
      false,
    );
  });

  it("falls back for unknown exclusion types", () => {
    const t = (key: string) => key;
    expect(exclusionLabel("legacy_custom_type", t)).toBe("legacy_custom_type");
    expect(exclusionLabel(null, t)).toBe("—");
  });
});
