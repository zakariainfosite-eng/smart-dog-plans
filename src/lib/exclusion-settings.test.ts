import { describe, expect, it } from "vitest";
import {
  DOG_EXCLUSION_FORM_TYPES,
  OPEN_ENDED_EXCLUSION_TYPES,
  PERSONNEL_EXCLUSION_FORM_TYPES,
  isOpenEndedExclusionType,
} from "@/lib/agent-exclusions";
import {
  DEFAULT_EXCLUSION_SETTINGS,
  EXCLUSION_SETTINGS_CATALOG,
  EXCLUSION_SETTINGS_CREATION_TYPES,
  availableExclusionFormTypes,
  canEditExclusionSettings,
  defaultExclusionFormType,
  exclusionSettingsEqual,
  exclusionTypeDurationKind,
  isConfiguredReminderMilestone,
  isExclusionTypeEnabledForCreation,
  parseExclusionSettings,
  setExclusionTypeEnabled,
} from "@/lib/exclusion-settings";

describe("exclusion settings", () => {
  it("reuses the existing creation catalogs without inventing types", () => {
    expect(EXCLUSION_SETTINGS_CREATION_TYPES).toEqual([
      ...PERSONNEL_EXCLUSION_FORM_TYPES,
      ...DOG_EXCLUSION_FORM_TYPES,
    ]);
    expect(EXCLUSION_SETTINGS_CATALOG.map((row) => row.type)).toEqual(EXCLUSION_SETTINGS_CREATION_TYPES);
  });

  it("keeps Sous observation and Chien sans maître as open-ended", () => {
    expect(OPEN_ENDED_EXCLUSION_TYPES).toEqual(["dog_vet_visit", "dog_without_handler"]);
    expect(exclusionTypeDurationKind("dog_vet_visit")).toBe("openEnded");
    expect(exclusionTypeDurationKind("dog_without_handler")).toBe("openEnded");
    expect(exclusionTypeDurationKind("dog_sick")).toBe("dated");
    expect(isOpenEndedExclusionType("dog_injured")).toBe(false);
  });

  it("ignores stored duration overrides so open-ended types cannot gain an end date", () => {
    const parsed = parseExclusionSettings({
      disabledTypes: [],
      reminders: { d2: true, d1: true, d0: true },
      openEndedTypes: ["dog_sick"],
      requireEndDate: { dog_vet_visit: true },
    });
    expect(parsed).toEqual(DEFAULT_EXCLUSION_SETTINGS);
    expect(exclusionTypeDurationKind("dog_vet_visit")).toBe("openEnded");
    expect(exclusionTypeDurationKind("dog_sick")).toBe("dated");
  });

  it("defaults to every type enabled and every reminder on", () => {
    expect(parseExclusionSettings(null)).toEqual(DEFAULT_EXCLUSION_SETTINGS);
    expect(parseExclusionSettings({})).toEqual(DEFAULT_EXCLUSION_SETTINGS);
    expect(DEFAULT_EXCLUSION_SETTINGS.disabledTypes).toEqual([]);
    expect(DEFAULT_EXCLUSION_SETTINGS.reminders).toEqual({ d2: true, d1: true, d0: true });
  });

  it("stores disable flags for creation only and never invents custom types", () => {
    const parsed = parseExclusionSettings({
      disabledTypes: ["dog_injured", "not_a_real_type", "dog_injured", "absence"],
      reminders: { d2: false, d1: true, d0: false },
    });
    expect(parsed.disabledTypes).toEqual(["dog_injured"]);
    expect(parsed.reminders).toEqual({ d2: false, d1: true, d0: false });
    expect(isExclusionTypeEnabledForCreation("dog_injured", parsed)).toBe(false);
    expect(isExclusionTypeEnabledForCreation("dog_sick", parsed)).toBe(true);
  });

  it("hides a disabled type from new forms while keeping it when editing that record", () => {
    const settings = setExclusionTypeEnabled(DEFAULT_EXCLUSION_SETTINGS, "dog_injured", false);
    expect(availableExclusionFormTypes(DOG_EXCLUSION_FORM_TYPES, settings)).toEqual([
      "female_dog_heat",
      "dog_sick",
      "dog_vet_visit",
      "dog_without_handler",
    ]);
    expect(availableExclusionFormTypes(DOG_EXCLUSION_FORM_TYPES, settings, "dog_injured")).toEqual(
      DOG_EXCLUSION_FORM_TYPES,
    );
    const existingRecord = { exclusion_type: "dog_injured", notes: "unchanged" };
    expect(existingRecord.exclusion_type).toBe("dog_injured");
  });

  it("picks the first still-enabled type as the create-form default", () => {
    const settings = setExclusionTypeEnabled(DEFAULT_EXCLUSION_SETTINGS, "sickness", false);
    expect(defaultExclusionFormType(PERSONNEL_EXCLUSION_FORM_TYPES, settings, "sickness")).toBe(
      "annual_leave",
    );
  });

  it("keeps reminder generation at d2/d1/d0 unless a switch is off", () => {
    expect(isConfiguredReminderMilestone("d2")).toBe(true);
    expect(isConfiguredReminderMilestone("d7")).toBe(false);
    const settings = parseExclusionSettings({ reminders: { d2: false, d1: true, d0: true } });
    expect(isConfiguredReminderMilestone("d2", settings)).toBe(false);
    expect(isConfiguredReminderMilestone("d1", settings)).toBe(true);
    expect(isConfiguredReminderMilestone("d0", settings)).toBe(true);
  });

  it("does not treat settings equality as a mutation of exclusion records", () => {
    const a = setExclusionTypeEnabled(DEFAULT_EXCLUSION_SETTINGS, "dog_sick", false);
    const b = parseExclusionSettings({ disabled_types: ["dog_sick"] });
    expect(exclusionSettingsEqual(a, b)).toBe(true);
    expect(exclusionSettingsEqual(a, DEFAULT_EXCLUSION_SETTINGS)).toBe(false);
  });

  it("restricts edits to the existing admin role", () => {
    expect(canEditExclusionSettings("admin")).toBe(true);
    expect(canEditExclusionSettings("user")).toBe(false);
    expect(canEditExclusionSettings(null)).toBe(false);
  });
});
