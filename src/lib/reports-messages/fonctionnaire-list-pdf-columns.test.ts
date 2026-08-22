import { describe, expect, it } from "vitest";
import { FP_CONTENT_W } from "@/lib/documents/feuille-presence-layout";
import { parseEntityPdfTableTemplate } from "@/lib/reports-messages/entity-pdf-table-store";
import {
  applyFonctionnairePdfListScope,
  buildFonctionnaireListTableCols,
  defaultFonctionnairePdfTableFields,
  enabledFonctionnairePdfTableFields,
  normalizeFonctionnairePdfListScope,
  normalizeFonctionnairePdfTableFieldConfigs,
  type FonctionnairePdfTableFieldConfig,
} from "@/lib/reports-messages/fonctionnaire-pdf-table-fields";
import { buildSampleFonctionnaireListPdfData } from "@/lib/documents/build-cynotechnicians-list-pdf-data";

/** User example: Nom, Prénom, Matricule, Grade, Chien, Spécialité — others off. */
function exampleSelection(): FonctionnairePdfTableFieldConfig[] {
  const order = [
    "lastName",
    "firstName",
    "matricule",
    "grade",
    "dogName",
    "specialty",
  ] as const;
  const enabled = new Set<string>(order);
  const rest = defaultFonctionnairePdfTableFields()
    .filter((row) => !enabled.has(row.id))
    .map((row) => ({ ...row, enabled: false }));
  return [...order.map((id) => ({ id, enabled: true })), ...rest];
}

describe("PDF_FUNCTIONNAIRE_TEMPLATE list columns", () => {
  it("uses only enabled fields in saved order", () => {
    const ordered: FonctionnairePdfTableFieldConfig[] = [
      { id: "matricule", enabled: true },
      { id: "lastName", enabled: true },
      { id: "firstName", enabled: false },
      { id: "grade", enabled: true },
      { id: "dogName", enabled: true },
      { id: "specialty", enabled: false },
      { id: "section", enabled: false },
    ];
    expect(enabledFonctionnairePdfTableFields(ordered).map((row) => row.id)).toEqual([
      "matricule",
      "lastName",
      "grade",
      "dogName",
    ]);
    expect(buildFonctionnaireListTableCols(ordered, FP_CONTENT_W).map((col) => col.key)).toEqual([
      "matricule",
      "lastName",
      "grade",
      "dogName",
    ]);
  });

  it("matches the Nom / Prénom / Matricule / Grade / Chien / Spécialité example", () => {
    const cols = buildFonctionnaireListTableCols(exampleSelection(), FP_CONTENT_W);
    expect(cols.map((col) => col.key)).toEqual([
      "lastName",
      "firstName",
      "matricule",
      "grade",
      "dogName",
      "specialty",
    ]);
    expect(cols.map((col) => col.label)).toEqual([
      "NOM",
      "PRÉNOM",
      "MATRICULE",
      "GRADE",
      "CHIEN",
      "SPÉCIALITÉ",
    ]);
    const width = cols.reduce((sum, col) => sum + col.w, 0);
    expect(width).toBeCloseTo(FP_CONTENT_W, 5);
    expect(cols.some((col) => col.key === "section")).toBe(false);
    expect(cols.some((col) => col.key === "fonction")).toBe(false);
  });

  it("survives a save → reload payload (application_settings.value)", () => {
    const saved = {
      fields: exampleSelection(),
      listScope: "cynotechniciens",
      updatedAt: "2026-08-22T16:00:00.000Z",
    };
    const loaded = parseEntityPdfTableTemplate(JSON.parse(JSON.stringify(saved)));
    const normalized = normalizeFonctionnairePdfTableFieldConfigs(loaded.fields);
    expect(loaded.listScope).toBe("cynotechniciens");
    expect(buildFonctionnaireListTableCols(normalized, FP_CONTENT_W).map((col) => col.key)).toEqual([
      "lastName",
      "firstName",
      "matricule",
      "grade",
      "dogName",
      "specialty",
    ]);
  });
});

describe("PDF_FUNCTIONNAIRE_TEMPLATE listScope", () => {
  it("defaults to all when the stored payload has no listScope", () => {
    expect(normalizeFonctionnairePdfListScope(undefined)).toBe("all");
    expect(parseEntityPdfTableTemplate({ fields: exampleSelection() }).listScope).toBe("all");
    expect(parseEntityPdfTableTemplate({ fields: [], listScope: "nope" }).listScope).toBe("all");
  });

  it("filters rows only and keeps the same columns", () => {
    const groups = {
      administrative: [{ id: "admin" }],
      operational: [{ id: "cyno" }],
    };
    expect(applyFonctionnairePdfListScope(groups, "all")).toEqual(groups);
    expect(applyFonctionnairePdfListScope(groups, "administrative")).toEqual({
      administrative: [{ id: "admin" }],
      operational: [],
    });
    expect(applyFonctionnairePdfListScope(groups, "cynotechniciens")).toEqual({
      administrative: [],
      operational: [{ id: "cyno" }],
    });

    const fields = exampleSelection();
    const all = buildSampleFonctionnaireListPdfData(fields, "all");
    const admin = buildSampleFonctionnaireListPdfData(fields, "administrative");
    const cyno = buildSampleFonctionnaireListPdfData(fields, "cynotechniciens");
    expect(all.tables.map((table) => table.layout)).toEqual(["administrative", "operational"]);
    expect(admin.tables.map((table) => table.layout)).toEqual(["administrative"]);
    expect(cyno.tables.map((table) => table.layout)).toEqual(["operational"]);
    expect(admin.columns).toEqual(all.columns);
    expect(cyno.columns).toEqual(all.columns);
    expect(all.columns.map((col) => col.key)).toEqual([
      "lastName",
      "firstName",
      "matricule",
      "grade",
      "dogName",
      "specialty",
    ]);
  });
});
