import { describe, expect, it } from "vitest";
import { parseThemePreference, resolveTheme } from "@/components/theme-provider";

describe("theme preference", () => {
  it("defaults to light so the current interface is unchanged", () => {
    expect(parseThemePreference(null)).toBe("light");
    expect(parseThemePreference("unknown")).toBe("light");
  });

  it("accepts light, dark and system", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  it("resolves explicit themes without consulting the system", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});
