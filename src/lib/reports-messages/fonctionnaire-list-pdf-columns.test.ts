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
import {
  buildCynotechniciansListPdfData,
  buildSampleFonctionnaireListPdfData,
} from "@/lib/documents/build-cynotechnicians-list-pdf-data";

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

  it("adapts columns to the selected list type", () => {
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

    const adminKeys = ["lastName", "firstName", "matricule", "grade"];
    const cynoKeys = ["lastName", "firstName", "matricule", "grade", "dogName", "specialty"];
    expect(admin.columns.map((col) => col.key)).toEqual(adminKeys);
    expect(cyno.columns.map((col) => col.key)).toEqual(cynoKeys);
    expect(admin.tables[0]?.columns?.map((col) => col.key)).toEqual(adminKeys);
    expect(cyno.tables[0]?.columns?.map((col) => col.key)).toEqual(cynoKeys);
    expect(all.tables[0]?.columns?.map((col) => col.key)).toEqual(adminKeys);
    expect(all.tables[1]?.columns?.map((col) => col.key)).toEqual(cynoKeys);
    expect(admin.columns.some((col) => col.key === "dogName")).toBe(false);
    expect(admin.columns.some((col) => col.key === "specialty")).toBe(false);
    expect(admin.columns.some((col) => col.key === "section")).toBe(false);
    expect(all.tables[0]?.rows[0]?.chien).toBe("");
    expect(all.tables[0]?.rows[0]?.specialite).toBe("");
    expect(all.tables[0]?.rows[0]?.section).toBe("");
    expect(all.tables[1]?.rows[0]?.chien).toBe("CHERRY");
  });

  it("keeps real cynotechnical values and omits placeholders", () => {
    const fields = exampleSelection();
    const data = buildCynotechniciansListPdfData(
      [
        {
          id: "a1",
          first_name: "Omar",
          last_name: "Alaoui",
          professional_number: "100",
          grade: "Commissaire",
          gender: "male",
          fonction: "chef_brigadier",
          marital_status: "single",
          date_naissance: "1990-01-01",
          origine: null,
          section_id: null,
          dog_id: null,
          is_section_chief: false,
          active: true,
          phone: null,
          address: null,
          observations: null,
          photo_url: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          sections: null,
          dogs: null,
        },
        {
          id: "c1",
          first_name: "Karim",
          last_name: "Zidane",
          professional_number: "300",
          grade: "Brigadier",
          gender: "male",
          fonction: "cynotechnicien",
          marital_status: "single",
          date_naissance: "1990-01-01",
          origine: null,
          section_id: null,
          dog_id: null,
          is_section_chief: false,
          active: true,
          phone: null,
          address: null,
          observations: null,
          photo_url: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          sections: null,
          dogs: null,
        },
        {
          id: "c2",
          first_name: "Nadia",
          last_name: "Benali",
          professional_number: "301",
          grade: "Brigadier",
          gender: "female",
          fonction: "cynotechnicien",
          marital_status: "single",
          date_naissance: "1991-01-01",
          origine: null,
          section_id: "s1",
          dog_id: "d1",
          is_section_chief: false,
          active: true,
          phone: null,
          address: null,
          observations: null,
          photo_url: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          sections: { id: "s1", name: "Section Explosifs" },
          dogs: { id: "d1", name: "Rex", specialty: "explosives", status: "available" },
        },
      ] as never,
      [],
      new Date("2026-08-23T00:00:00.000Z"),
      fields,
      "all",
    );

    const adminRow = data.tables[0]?.rows[0];
    const withoutDog = data.tables[1]?.rows.find((row) => row.matricule === "300");
    const withDog = data.tables[1]?.rows.find((row) => row.matricule === "301");
    expect(adminRow?.chien).toBe("");
    expect(adminRow?.specialite).toBe("");
    expect(adminRow?.section).toBe("");
    expect(withoutDog?.chien).toBe("");
    expect(withoutDog?.specialite).toBe("");
    expect(withoutDog?.section).toBe("");
    expect(withDog?.chien).toBe("Rex");
    expect(withDog?.specialite).toBe("EXPLOSIFS");
    expect(withDog?.section).toBe("Section Explosifs");
  });

  it("omits cynotechnical columns from the administrative field set", () => {
    const cols = buildFonctionnaireListTableCols(exampleSelection(), FP_CONTENT_W, {
      includeCynotechnical: false,
    });
    expect(cols.map((col) => col.key)).toEqual([
      "lastName",
      "firstName",
      "matricule",
      "grade",
    ]);
    expect(cols.reduce((sum, col) => sum + col.w, 0)).toBeCloseTo(FP_CONTENT_W, 5);
  });
});
