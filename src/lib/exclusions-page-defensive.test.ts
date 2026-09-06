import { describe, expect, it } from "vitest";
import {
  exclusionDateRangesOverlap,
  exclusionTypeI18nKey,
  hasConflictingExistingExclusion,
  isAgentExclusionActive,
  isOpenEndedExclusionType,
  todayISODate,
} from "@/lib/agent-exclusions";

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
  const key = exclusionTypeI18nKey(type);
  const translated = t(key);
  return translated === key ? String(type) : translated;
}

function exclusionFormTypeLabel(type: string | null | undefined, t: (key: string) => string): string {
  return exclusionLabel(type, t);
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

  it("displays Sous observation for stored dog_vet_visit in form and table", () => {
    const t = (key: string) =>
      key === "exclusions.formType.dog_vet_visit"
        ? "Sous observation"
        : key === "exclusions.type.dog_vet_visit"
          ? "Visite vétérinaire"
          : key === "exclusions.type.dog_sick"
            ? "Chien malade"
            : key;
    expect(exclusionTypeI18nKey("dog_vet_visit")).toBe("exclusions.formType.dog_vet_visit");
    expect(exclusionTypeI18nKey("dog_sick")).toBe("exclusions.type.dog_sick");
    expect(exclusionFormTypeLabel("dog_vet_visit", t)).toBe("Sous observation");
    expect(exclusionLabel("dog_vet_visit", t)).toBe("Sous observation");
    expect(exclusionFormTypeLabel("dog_sick", t)).toBe("Chien malade");
  });

  it("maps Chien sans maître from the stored dog_without_handler code", () => {
    const t = (key: string) =>
      key === "exclusions.type.dog_without_handler" ? "Chien sans maître" : key;
    expect(exclusionTypeI18nKey("dog_without_handler")).toBe("exclusions.type.dog_without_handler");
    expect(exclusionLabel("dog_without_handler", t)).toBe("Chien sans maître");
    expect(isOpenEndedExclusionType("dog_without_handler")).toBe(true);
    expect(isOpenEndedExclusionType("dog_vet_visit")).toBe(true);
    expect(isOpenEndedExclusionType("training")).toBe(true);
    expect(isOpenEndedExclusionType("mission")).toBe(true);
    expect(isOpenEndedExclusionType("rest")).toBe(false);
    expect(isOpenEndedExclusionType("dog_sick")).toBe(false);
  });

  it("treats open-ended dog exclusions as active without an end date", () => {
    expect(
      isAgentExclusionActive(
        {
          agent_id: null,
          dog_id: "d1",
          exclusion_type: "dog_without_handler",
          start_date: "2020-01-01",
          end_date: null,
          active: true,
        },
        todayISODate(),
      ),
    ).toBe(true);
  });

  it("does not treat a dog heat exclusion as a fonctionnaire overlap", () => {
    const heatOnHandlerDog = {
      id: "ex-heat",
      agent_id: "agent-1",
      dog_id: "dog-1",
      exclusion_type: "female_dog_heat",
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    };
    expect(
      hasConflictingExistingExclusion(
        {
          applyTo: "agent",
          agentId: "agent-1",
          dogId: null,
          start_date: "2026-08-10",
          end_date: "2026-08-20",
          exclusion_type: "annual_leave",
        },
        [heatOnHandlerDog],
      ),
    ).toBe(false);
  });

  it("still blocks overlapping personnel exclusions for the same agent", () => {
    const existingLeave = {
      agent_id: "agent-1",
      dog_id: null,
      exclusion_type: "sickness",
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    };
    expect(
      hasConflictingExistingExclusion(
        {
          applyTo: "agent",
          agentId: "agent-1",
          dogId: null,
          start_date: "2026-08-10",
          end_date: "2026-08-20",
          exclusion_type: "annual_leave",
        },
        [existingLeave],
      ),
    ).toBe(true);
  });

  it("only overlaps dog exclusions against the same dog_id", () => {
    const heat = {
      agent_id: "agent-1",
      dog_id: "dog-1",
      exclusion_type: "female_dog_heat",
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    };
    const otherDogSick = {
      agent_id: "agent-2",
      dog_id: "dog-2",
      exclusion_type: "dog_sick",
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    };
    const nextHeat = {
      applyTo: "dog" as const,
      agentId: null,
      dogId: "dog-1",
      start_date: "2026-08-10",
      end_date: "2026-08-20",
      exclusion_type: "dog_sick",
    };
    expect(hasConflictingExistingExclusion(nextHeat, [heat])).toBe(true);
    expect(hasConflictingExistingExclusion(nextHeat, [otherDogSick])).toBe(false);
    expect(
      hasConflictingExistingExclusion(nextHeat, [
        {
          agent_id: "agent-1",
          dog_id: null,
          exclusion_type: "annual_leave",
          start_date: "2026-08-01",
          end_date: "2026-08-31",
        },
      ]),
    ).toBe(false);
  });

  it("detects overlap for an open-ended exclusion against a dated one", () => {
    expect(
      exclusionDateRangesOverlap(
        {
          start_date: "2026-08-01",
          end_date: null,
          exclusion_type: "dog_vet_visit",
        },
        {
          start_date: "2026-08-10",
          end_date: "2026-08-20",
          exclusion_type: "dog_sick",
        },
      ),
    ).toBe(true);
    expect(
      exclusionDateRangesOverlap(
        {
          start_date: "2026-08-01",
          end_date: "2026-08-05",
          exclusion_type: "dog_sick",
        },
        {
          start_date: "2026-08-10",
          end_date: "2026-08-20",
          exclusion_type: "dog_sick",
        },
      ),
    ).toBe(false);
  });
});
