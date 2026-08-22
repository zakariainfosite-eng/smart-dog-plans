import { describe, expect, it } from "vitest";
import { parseEntityPdfTableTemplate } from "@/lib/reports-messages/entity-pdf-table-store";
import {
  defaultChienPdfTableFields,
  normalizeChienPdfTableFieldConfigs,
} from "@/lib/reports-messages/chien-pdf-table-fields";
import {
  defaultFonctionnairePdfTableFields,
  normalizeFonctionnairePdfTableFieldConfigs,
} from "@/lib/reports-messages/fonctionnaire-pdf-table-fields";
import { defaultHeatDogTableFields } from "@/lib/reports-messages/document-templates/heat-dog-table-fields";

describe("PDF_CHIEN_TEMPLATE catalog", () => {
  it("drops leftover Radio Départ ids from a stored chien payload", () => {
    const normalized = normalizeChienPdfTableFieldConfigs([
      { id: "origin" as never, enabled: true },
      { id: "dogName", enabled: true },
      { id: "number" as never, enabled: true },
      { id: "breed", enabled: false },
    ]);
    expect(normalized[0]).toEqual({ id: "dogName", enabled: true });
    expect(normalized.find((row) => row.id === "breed")).toEqual({ id: "breed", enabled: false });
    expect(normalized.some((row) => (row.id as string) === "origin")).toBe(false);
    expect(normalized.some((row) => (row.id as string) === "number")).toBe(false);
    expect(new Set(normalized.map((row) => row.id))).toEqual(
      new Set(defaultChienPdfTableFields().map((row) => row.id)),
    );
  });

  it("falls back to the Chiens list defaults when nothing valid is stored", () => {
    expect(normalizeChienPdfTableFieldConfigs([])).toEqual(defaultChienPdfTableFields());
    expect(normalizeChienPdfTableFieldConfigs(null)).toEqual(defaultChienPdfTableFields());
    const parsed = parseEntityPdfTableTemplate({
      fields: [
        { id: "origin", enabled: true },
        { id: "words", enabled: true },
      ],
    });
    expect(normalizeChienPdfTableFieldConfigs(parsed.fields as never)).toEqual(
      defaultChienPdfTableFields(),
    );
  });
});

describe("PDF_FUNCTIONNAIRE_TEMPLATE independence", () => {
  it("does not share Radio Départ ids with the Chiens list catalog", () => {
    const chienIds = defaultChienPdfTableFields().map((row) => row.id);
    const fonctionnaireIds = defaultFonctionnairePdfTableFields().map((row) => row.id);
    const heatIds = defaultHeatDogTableFields().map((row) => row.id);
    expect(chienIds).not.toContain("origin");
    expect(chienIds).not.toContain("lastName");
    expect(fonctionnaireIds).not.toContain("origin");
    expect(heatIds).toContain("origin");
  });

  it("keeps stored order and does not mix in chien ids", () => {
    const normalized = normalizeFonctionnairePdfTableFieldConfigs([
      { id: "matricule", enabled: true },
      { id: "lastName", enabled: true },
      { id: "origin" as never, enabled: true },
    ]);
    expect(normalized[0]).toEqual({ id: "matricule", enabled: true });
    expect(normalized[1]).toEqual({ id: "lastName", enabled: true });
    expect(normalized.some((row) => row.id === "section")).toBe(true);
  });
});
