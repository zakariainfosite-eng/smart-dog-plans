import { describe, expect, it } from "vitest";
import { createDefaultHeatDogReportFormData } from "@/lib/reports-messages/document-templates/heat-dog-report";
import {
  buildHeatDogRadioTableCells,
  defaultHeatDogTableFields,
  normalizeHeatDogTableFieldConfigs,
  type HeatDogTableFieldConfig,
} from "@/lib/reports-messages/document-templates/heat-dog-table-fields";
import {
  DEFAULT_RADIO_TABLE_LABELS,
  radioTableRowsFromCells,
} from "@/lib/reports-messages/official-document/radio-table-cells";
import { buildHeatDogOfficialDocument } from "@/lib/reports-messages/document-templates/builders";
import { getDocumentTemplateConfig } from "@/lib/reports-messages/document-templates/registry";
import { resolveEffectiveTemplate } from "@/lib/reports-messages/document-templates/merge-template";

const DEFAULT_LABELS = [
  DEFAULT_RADIO_TABLE_LABELS.origin,
  DEFAULT_RADIO_TABLE_LABELS.number,
  DEFAULT_RADIO_TABLE_LABELS.words,
  DEFAULT_RADIO_TABLE_LABELS.departureDateTime,
  DEFAULT_RADIO_TABLE_LABELS.serviceMention,
];

function sampleData() {
  const data = createDefaultHeatDogReportFormData({ userName: "Service vétérinaire" });
  data.referenceNumber = "CH-2026-012";
  data.wordCount = "42";
  data.departureDateTime = "2026-08-22 09:30";
  data.dogName = "CHERRY";
  data.specialty = "Explosifs et armes à feu";
  data.handlerName = "RAJA EL KASSMI";
  data.handlerGrade = "GDPX";
  data.handlerMatricule = "133398";
  data.hasMaster = true;
  data.breed = "Malinois";
  data.microchip = "982000123456789";
  data.dogBirthDate = "2021-03-12";
  data.heatStartDate = "2026-08-01";
  data.heatEndDate = "2026-08-21";
  data.aideSoignantName = "ISMAIL AGHDDIOU";
  data.aideSoignantGrade = "GDPX";
  data.aideSoignantMatricule = "119461";
  data.reportDate = "2026-08-19";
  return data;
}

describe("heat dog Radio Départ table field config", () => {
  it("defaults to the current 5 Radio Départ columns, same French labels and order", () => {
    const cells = buildHeatDogRadioTableCells(sampleData(), defaultHeatDogTableFields());
    expect(cells.map((cell) => cell.label)).toEqual(DEFAULT_LABELS);
    expect(cells.map((cell) => cell.value)).toEqual([
      "",
      "CH-2026-012",
      "42",
      "2026-08-22 09:30",
      "Service vétérinaire",
    ]);
  });

  it("uses only enabled fields and preserves admin order", () => {
    const fields: HeatDogTableFieldConfig[] = [
      { id: "dogName", enabled: true },
      { id: "specialty", enabled: true },
      { id: "handlerName", enabled: true },
      { id: "handlerMatricule", enabled: true },
      { id: "breed", enabled: false },
      { id: "origin", enabled: false },
    ];
    const cells = buildHeatDogRadioTableCells(sampleData(), fields);
    expect(cells.map((cell) => cell.label)).toEqual([
      "Nom du chien",
      "Spécialité",
      "Nom / Prénom du maître",
      "Matricule du maître",
    ]);
    expect(cells.map((cell) => cell.value)).toEqual([
      "CHERRY",
      "Explosifs et armes à feu",
      "RAJA EL KASSMI",
      "133398",
    ]);
  });

  it("falls back to the current 5 columns when nothing is enabled", () => {
    const allOff = defaultHeatDogTableFields().map((row) => ({ ...row, enabled: false }));
    const cells = buildHeatDogRadioTableCells(sampleData(), allOff);
    expect(cells.map((cell) => cell.label)).toEqual(DEFAULT_LABELS);
  });

  it("keeps stored order and appends new catalog fields disabled", () => {
    const normalized = normalizeHeatDogTableFieldConfigs([
      { id: "dogName", enabled: true },
      { id: "origin", enabled: true },
    ]);
    expect(normalized[0]).toEqual({ id: "dogName", enabled: true });
    expect(normalized[1]).toEqual({ id: "origin", enabled: true });
    expect(normalized.some((row) => row.id === "microchip" && row.enabled === false)).toBe(true);
  });

  it("pads the last table row to 5 cells so the existing chrome stays full-width", () => {
    const rows = radioTableRowsFromCells([
      { label: "Nom du chien", value: "CHERRY" },
      { label: "Spécialité", value: "Explosifs" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(5);
    expect(rows[0]?.[0]?.label).toBe("Nom du chien");
    expect(rows[0]?.[2]?.label).toBe("");
  });
});

describe("heat dog official builder — table cells only", () => {
  const config = getDocumentTemplateConfig("injured_dog_report");

  it("emits default Radio Départ cells identical to the current table", () => {
    expect(config?.builder).toBe("heat_dog");
    if (!config) throw new Error("missing heat dog template");
    const effective = resolveEffectiveTemplate("injured_dog_report", { byId: {} });
    const model = buildHeatDogOfficialDocument({
      config,
      data: sampleData(),
      t: (key) => key,
      effective,
    });
    expect(model.table.cells?.map((cell) => cell.label)).toEqual(DEFAULT_LABELS);
    expect(model.table.number).toBe("CH-2026-012");
    expect(model.table.serviceMention).toBe("Service vétérinaire");
    expect(model.body.subject).toBe("");
  });

  it("keeps the default Radio Départ table even if leftover Chiens fields are passed", () => {
    if (!config) throw new Error("missing heat dog template");
    const effective = resolveEffectiveTemplate("injured_dog_report", { byId: {} });
    const model = buildHeatDogOfficialDocument({
      config,
      data: sampleData(),
      t: (key) => key,
      effective,
    });
    expect(model.table.cells?.map((cell) => cell.label)).toEqual(DEFAULT_LABELS);
  });
});
