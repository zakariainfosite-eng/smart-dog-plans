import { describe, expect, it } from "vitest";
import { FP_CONTENT_W } from "@/lib/documents/feuille-presence-layout";
import { parseEntityPdfTableTemplate } from "@/lib/reports-messages/entity-pdf-table-store";
import {
  applyChienPdfListFilters,
  buildChienListTableCols,
  chienPdfDogAgeYears,
  defaultChienPdfTableFields,
  enabledChienPdfTableFields,
  normalizeChienPdfMinAgeYears,
  normalizeChienPdfSexFilter,
  normalizeChienPdfTableFieldConfigs,
  type ChienPdfTableFieldConfig,
} from "@/lib/reports-messages/chien-pdf-table-fields";
import { buildSampleChienListPdfData } from "@/lib/documents/build-dogs-list-pdf-data";

/** User example: Nom du chien → Race → Spécialité → Maître — others off. */
function exampleSelection(): ChienPdfTableFieldConfig[] {
  const order = ["dogName", "breed", "specialty", "handlerName"] as const;
  const enabled = new Set<string>(order);
  const rest = defaultChienPdfTableFields()
    .filter((row) => !enabled.has(row.id))
    .map((row) => ({ ...row, enabled: false }));
  return [...order.map((id) => ({ id, enabled: true })), ...rest];
}

describe("PDF_CHIEN_TEMPLATE list columns", () => {
  it("uses only enabled fields in saved order", () => {
    const ordered: ChienPdfTableFieldConfig[] = [
      { id: "microchip", enabled: true },
      { id: "dogName", enabled: true },
      { id: "breed", enabled: false },
      { id: "handlerName", enabled: true },
      { id: "specialty", enabled: false },
    ];
    expect(enabledChienPdfTableFields(ordered).map((row) => row.id)).toEqual([
      "microchip",
      "dogName",
      "handlerName",
      "gender",
    ]);
    expect(buildChienListTableCols(ordered, FP_CONTENT_W).map((col) => col.key)).toEqual([
      "microchip",
      "dogName",
      "handlerName",
      "gender",
    ]);
  });

  it("matches the Nom du chien / Race / Spécialité / Maître example", () => {
    const cols = buildChienListTableCols(exampleSelection(), FP_CONTENT_W);
    expect(cols.map((col) => col.key)).toEqual(["dogName", "breed", "specialty", "handlerName"]);
    expect(cols.map((col) => col.label)).toEqual([
      "NOM DU CHIEN",
      "RACE",
      "SPÉCIALITÉ",
      "NOM DU MAÎTRE",
    ]);
    const width = cols.reduce((sum, col) => sum + col.w, 0);
    expect(width).toBeCloseTo(FP_CONTENT_W, 5);
    expect(cols.some((col) => col.key === "gender")).toBe(false);
    expect(cols.some((col) => col.key === "origin")).toBe(false);
  });

  it("survives a save → reload payload (application_settings.value)", () => {
    const saved = {
      fields: exampleSelection(),
      sexFilter: "female",
      minAgeYears: 5,
      updatedAt: "2026-08-22T16:00:00.000Z",
    };
    const loaded = parseEntityPdfTableTemplate(JSON.parse(JSON.stringify(saved)));
    const normalized = normalizeChienPdfTableFieldConfigs(loaded.fields);
    expect(buildChienListTableCols(normalized, FP_CONTENT_W).map((col) => col.key)).toEqual([
      "dogName",
      "breed",
      "specialty",
      "handlerName",
    ]);
    expect(loaded.sexFilter).toBe("female");
    expect(loaded.minAgeYears).toBe(5);
  });

  it("preview sample uses the same columns as the saved template", () => {
    const cols = buildChienListTableCols(exampleSelection(), FP_CONTENT_W);
    const sample = buildSampleChienListPdfData(exampleSelection());
    expect(sample.columns.map((col) => col.key)).toEqual(cols.map((col) => col.key));
  });
});

describe("PDF_CHIEN_TEMPLATE list filters", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const dogs = [
    { name: "CHERRY", gender: "female", date_of_birth: "2021-03-12" },
    { name: "REX", gender: "male", date_of_birth: "2018-01-15" },
    { name: "NOVA", gender: "female", date_of_birth: null },
  ];

  it("keeps every dog when sex and age are Tous", () => {
    expect(applyChienPdfListFilters(dogs, "all", "all", now).map((dog) => dog.name)).toEqual([
      "CHERRY",
      "REX",
      "NOVA",
    ]);
  });

  it("keeps only males or only females", () => {
    expect(applyChienPdfListFilters(dogs, "male", "all", now).map((dog) => dog.name)).toEqual(["REX"]);
    expect(applyChienPdfListFilters(dogs, "female", "all", now).map((dog) => dog.name)).toEqual([
      "CHERRY",
      "NOVA",
    ]);
  });

  it("computes age from the date of birth and applies the minimum", () => {
    expect(chienPdfDogAgeYears("2021-03-12", now)).toBe(5);
    expect(chienPdfDogAgeYears("2018-01-15", now)).toBe(8);
    expect(applyChienPdfListFilters(dogs, "all", 6, now).map((dog) => dog.name)).toEqual(["REX"]);
    expect(applyChienPdfListFilters(dogs, "all", 5, now).map((dog) => dog.name)).toEqual([
      "CHERRY",
      "REX",
    ]);
  });

  it("excludes a dog without a date of birth when a minimum age is set", () => {
    expect(applyChienPdfListFilters(dogs, "all", 1, now).map((dog) => dog.name)).toEqual([
      "CHERRY",
      "REX",
    ]);
  });

  it("combines sex and minimum age", () => {
    expect(applyChienPdfListFilters(dogs, "female", 5, now).map((dog) => dog.name)).toEqual(["CHERRY"]);
  });

  it("treats invalid stored filters as Tous", () => {
    expect(normalizeChienPdfSexFilter("unknown")).toBe("all");
    expect(normalizeChienPdfMinAgeYears("nope")).toBe("all");
    expect(normalizeChienPdfMinAgeYears(0)).toBe("all");
  });

  it("preview sample follows the same sex filter", () => {
    const males = buildSampleChienListPdfData(exampleSelection(), "male", "all");
    expect(males.rows.map((row) => row.nom)).toEqual(["REX"]);
    const all = buildSampleChienListPdfData(exampleSelection(), "all", "all");
    expect(all.rows.map((row) => row.nom)).toEqual(["CHERRY", "REX"]);
  });
});
