import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_SETTINGS,
  canEditDocumentSettings,
  documentSettingsEqual,
  parseDocumentSettings,
} from "@/lib/document-settings";
import { documentLogoStoragePathFromUrl, validateDocumentLogoFile } from "@/lib/document-logo-api";

describe("document settings", () => {
  it("defaults to A4 portrait without a custom logo, footer, or page numbers", () => {
    expect(parseDocumentSettings(null)).toEqual(DEFAULT_DOCUMENT_SETTINGS);
    expect(parseDocumentSettings({})).toEqual(DEFAULT_DOCUMENT_SETTINGS);
    expect(DEFAULT_DOCUMENT_SETTINGS.pageFormat).toBe("a4");
    expect(DEFAULT_DOCUMENT_SETTINGS.orientation).toBe("portrait");
    expect(DEFAULT_DOCUMENT_SETTINGS.logoUrl).toBeNull();
    expect(DEFAULT_DOCUMENT_SETTINGS.pageNumbers).toBe(false);
    expect(DEFAULT_DOCUMENT_SETTINGS.documentLocale).toBe("fr");
  });

  it("ignores unsupported page formats instead of inventing them", () => {
    expect(
      parseDocumentSettings({
        pageFormat: "letter",
        orientation: "landscape",
        footer_text: "  Brigade cynotechnique — CynoPlanning  ",
        page_numbers: true,
        document_locale: "ar",
        logo_url: "cynoplanning-media://document-logos/header.png",
      }),
    ).toEqual({
      pageFormat: "a4",
      orientation: "landscape",
      footerText: "Brigade cynotechnique — CynoPlanning",
      pageNumbers: true,
      documentLocale: "ar",
      logoUrl: "cynoplanning-media://document-logos/header.png",
    });
  });

  it("does not treat organisation fields as document settings", () => {
    const parsed = parseDocumentSettings({
      unitName: "Should not be stored here",
      serviceName: "Ignored",
      city: "Ignored",
    });
    expect(parsed).toEqual(DEFAULT_DOCUMENT_SETTINGS);
  });

  it("compares normalized values without mutating existing documents", () => {
    const a = parseDocumentSettings({ orientation: "portrait", footerText: " Brigade " });
    const b = parseDocumentSettings({ orientation: "portrait", footer_text: "Brigade" });
    expect(documentSettingsEqual(a, b)).toBe(true);
  });

  it("restricts edits to the existing admin role", () => {
    expect(canEditDocumentSettings("admin")).toBe(true);
    expect(canEditDocumentSettings("user")).toBe(false);
    expect(canEditDocumentSettings(null)).toBe(false);
  });
});

describe("document logo storage", () => {
  it("reuses the existing cynoplanning-media URL scheme", () => {
    expect(
      documentLogoStoragePathFromUrl("cynoplanning-media://document-logos/header.png"),
    ).toBe("header.png");
    expect(documentLogoStoragePathFromUrl("/assets/police-cynotechnique-logo.png")).toBeNull();
  });

  it("accepts PNG and JPEG only", () => {
    const png = new File([new Uint8Array([1])], "logo.png", { type: "image/png" });
    const jpeg = new File([new Uint8Array([1])], "logo.jpg", { type: "image/jpeg" });
    const svg = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
    expect(validateDocumentLogoFile(png)).toBeNull();
    expect(validateDocumentLogoFile(jpeg)).toBeNull();
    expect(validateDocumentLogoFile(svg)).toBe("invalidType");
  });
});
