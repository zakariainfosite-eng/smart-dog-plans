import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORGANIZATION_SETTINGS,
  canEditOrganizationSettings,
  isValidOrganizationEmail,
  isValidOrganizationPhone,
  normalizeOrganizationSettings,
  parseOrganizationSettings,
  validateOrganizationSettings,
} from "@/lib/organization-settings";

describe("organization settings", () => {
  it("uses current CynoPlanning defaults when nothing is stored", () => {
    expect(parseOrganizationSettings(null)).toEqual(DEFAULT_ORGANIZATION_SETTINGS);
    expect(parseOrganizationSettings({})).toEqual(DEFAULT_ORGANIZATION_SETTINGS);
  });

  it("reuses existing camelCase or snake_case values without inventing duplicates", () => {
    expect(
      parseOrganizationSettings({
        unit_name: "Unité K9",
        serviceName: "Service K9",
        city: "Tétouan",
        country: "Maroc",
        phone_number: "+212 661-234567",
        additional_information: "BPJ",
      }),
    ).toMatchObject({
      unitName: "Unité K9",
      serviceName: "Service K9",
      city: "Tétouan",
      country: "Maroc",
      phone: "+212 661-234567",
      notes: "BPJ",
    });
  });

  it("requires organisation, service, city and country", () => {
    const errors = validateOrganizationSettings({
      ...DEFAULT_ORGANIZATION_SETTINGS,
      unitName: "  ",
      serviceName: "",
      city: "",
      country: " ",
    });
    expect(errors.unitName).toBe("required");
    expect(errors.serviceName).toBe("required");
    expect(errors.city).toBe("required");
    expect(errors.country).toBe("required");
  });

  it("accepts empty optional fields and trims values", () => {
    const normalized = normalizeOrganizationSettings({
      ...DEFAULT_ORGANIZATION_SETTINGS,
      address: "  ",
      phone: "",
      email: "",
      notes: "  note  ",
    });
    expect(normalized.address).toBe("");
    expect(normalized.notes).toBe("note");
    expect(validateOrganizationSettings(normalized)).toEqual({});
  });

  it("validates email only when provided", () => {
    expect(isValidOrganizationEmail("")).toBe(true);
    expect(isValidOrganizationEmail("commandement@police.ma")).toBe(true);
    expect(isValidOrganizationEmail("not-an-email")).toBe(false);
    expect(
      validateOrganizationSettings({
        ...DEFAULT_ORGANIZATION_SETTINGS,
        email: "bad",
      }).email,
    ).toBe("email");
  });

  it("accepts Moroccan and international phone formats", () => {
    expect(isValidOrganizationPhone("")).toBe(true);
    expect(isValidOrganizationPhone("0539 12 34 56")).toBe(true);
    expect(isValidOrganizationPhone("06-12-34-56-78")).toBe(true);
    expect(isValidOrganizationPhone("+212 6 12 34 56 78")).toBe(true);
    expect(isValidOrganizationPhone("00212612345678")).toBe(true);
    expect(isValidOrganizationPhone("+33 1 23 45 67 89")).toBe(true);
    expect(isValidOrganizationPhone("abc")).toBe(false);
    expect(isValidOrganizationPhone("12")).toBe(false);
  });

  it("grants edit access only to the existing admin role", () => {
    expect(canEditOrganizationSettings("admin")).toBe(true);
    expect(canEditOrganizationSettings("user")).toBe(false);
    expect(canEditOrganizationSettings(null)).toBe(false);
  });
});
