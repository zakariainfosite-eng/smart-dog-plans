import { describe, expect, it } from "vitest";

import {
  buildStatisticDenseCells,
  buildStatisticDenseSchema,
  buildStatisticRecordView,
  detectStatisticDetailsKind,
  formatStatisticCount,
  resolveStatisticCategory,
  splitStatisticTitle,
} from "@/lib/statistics/statistic-dialog-presentation";
import {
  checkpointStatisticColumns,
  dogStatisticColumns,
  exclusionStatisticColumns,
  personnelStatisticColumns,
} from "@/lib/statistics/statistic-detail-columns";
import { resolveSemanticBadgeTone } from "@/lib/ui/semantic-badge-tone";

const t = ((key: string) => key) as never;

describe("formatStatisticCount", () => {
  it("pads single-digit totals", () => {
    expect(formatStatisticCount(1)).toBe("01");
    expect(formatStatisticCount(0)).toBe("00");
    expect(formatStatisticCount(12)).toBe("12");
  });
});

describe("splitStatisticTitle", () => {
  it("extracts a specialty category from a composed title", () => {
    expect(splitStatisticTitle("Maîtres avec chien — Explosifs")).toEqual({
      title: "Maîtres avec chien",
      category: "Explosifs",
    });
  });

  it("keeps a plain title unchanged", () => {
    expect(splitStatisticTitle("Fonctionnaires exclus")).toEqual({
      title: "Fonctionnaires exclus",
      category: null,
    });
  });
});

describe("resolveSemanticBadgeTone", () => {
  it("maps operational labels to semantic tones", () => {
    expect(resolveSemanticBadgeTone("Disponible", "status")).toBe("success");
    expect(resolveSemanticBadgeTone("Actif", "status")).toBe("info");
    expect(resolveSemanticBadgeTone("Malade", "status")).toBe("danger");
    expect(resolveSemanticBadgeTone("Exclu", "status")).toBe("danger");
    expect(resolveSemanticBadgeTone("Congé", "status")).toBe("warning");
    expect(resolveSemanticBadgeTone("Explosifs", "specialty")).toBe("warning");
    expect(resolveSemanticBadgeTone("Stupéfiants", "specialty")).toBe("info");
    expect(resolveSemanticBadgeTone("Sans chien", "status")).toBe("neutral");
  });
});

describe("buildStatisticRecordView", () => {
  it("promotes personnel identity and omits empty fields", () => {
    const view = buildStatisticRecordView(
      {
        id: "a",
        cells: {
          firstName: "Hassan",
          lastName: "Nabil",
          fonction: "Cynotechnicien",
          specialty: "Stupéfiants & Billets de banque",
          status: "Actif",
          section: "SECTION 3",
          dogName: "RIA",
        },
      },
      personnelStatisticColumns(t),
    );

    expect(view.title).toBe("Hassan Nabil");
    expect(view.subtitle).toBe("Cynotechnicien");
    expect(view.asideTitle).toBe("RIA");
    expect(view.status).toBe("Actif");
    expect(view.meta.map((item) => item.id)).toEqual(["specialty", "section"]);
    expect(view.meta.some((item) => item.value === "—")).toBe(false);
  });

  it("keeps exclusion dates and type without duplicating empty columns", () => {
    const view = buildStatisticRecordView(
      {
        id: "b",
        cells: {
          firstName: "Hassan",
          lastName: "Nabil",
          dogName: "RIA",
          exclusionType: "Chienne en chaleur",
          specialty: "Stupéfiants & Billets de banque",
          startDate: "02/08/2026",
          endDate: "22/08/2026",
          status: "Actif",
        },
      },
      exclusionStatisticColumns(t),
    );

    expect(view.asideTitle).toBe("RIA");
    expect(view.asideType).toBe("Chienne en chaleur");
    expect(view.meta.map((item) => item.id)).toEqual(["specialty", "startDate", "endDate"]);
  });

  it("does not duplicate checkpoint name fields", () => {
    const view = buildStatisticRecordView(
      {
        id: "c",
        cells: {
          checkpoint: "Poste Nord",
          name: "Poste Nord",
          type: "Frontière",
          specialty: "Explosifs",
          status: "Actif",
          nightOnly: "Non",
          required: "2",
        },
      },
      checkpointStatisticColumns(t),
    );

    expect(view.title).toBe("Poste Nord");
    expect(view.subtitle).toBe("Frontière");
    expect(view.meta.map((item) => item.id)).toEqual(["specialty", "nightOnly", "required"]);
  });

  it("uses the dog name as the title for dog records", () => {
    const view = buildStatisticRecordView(
      {
        id: "d",
        cells: {
          dogName: "Bono",
          handler: "Hakim Ben Achak",
          specialty: "Explosifs",
          status: "Disponible",
          exclusionType: "—",
        },
      },
      dogStatisticColumns(t),
    );

    expect(view.title).toBe("Bono");
    expect(view.subtitle).toBe("Hakim Ben Achak");
    expect(view.asideType).toBeNull();
    expect(view.meta.map((item) => item.id)).toEqual(["specialty"]);
  });
});

describe("buildStatisticDenseSchema", () => {
  it("uses a stable exclusion column order for every row", () => {
    const columns = exclusionStatisticColumns(t);
    const schema = buildStatisticDenseSchema(columns);
    expect(schema.map((column) => column.id)).toEqual([
      "title",
      "dogName",
      "specialty",
      "exclusionType",
      "dates",
      "status",
    ]);

    const withDog = buildStatisticDenseCells(
      {
        id: "b",
        cells: {
          firstName: "Hassan",
          lastName: "Nabil",
          dogName: "RIA",
          exclusionType: "Chienne en chaleur",
          specialty: "Explosifs",
          startDate: "02/08/2026",
          endDate: "22/08/2026",
          status: "Actif",
        },
      },
      schema,
    );
    const withoutDog = buildStatisticDenseCells(
      {
        id: "c",
        cells: {
          firstName: "Rexo",
          lastName: "",
          dogName: "—",
          exclusionType: "Chien sans maître",
          specialty: "Explosifs",
          startDate: "17/08/2026",
          endDate: "—",
          status: "Actif",
        },
      },
      schema,
    );

    expect(withDog.map((cell) => cell.id)).toEqual(withoutDog.map((cell) => cell.id));
    expect(withoutDog.find((cell) => cell.id === "dogName")?.value).toBe("—");
    expect(withoutDog.find((cell) => cell.id === "dates")?.value).toBe("17/08/2026");
    expect(withDog.find((cell) => cell.id === "dates")?.value).toBe("02/08/2026 → 22/08/2026");
  });
});

describe("resolveStatisticCategory", () => {
  const columns = personnelStatisticColumns(t);

  it("prefers the title suffix, then a unanimous specialty", () => {
    expect(
      resolveStatisticCategory("Maîtres avec chien — Explosifs", [], columns),
    ).toBe("Explosifs");

    expect(
      resolveStatisticCategory(
        "Maîtres avec chien",
        [{ id: "a", cells: { specialty: "Explosifs" } }],
        columns,
      ),
    ).toBe("Explosifs");

    expect(resolveStatisticCategory("Fonctionnaires exclus", [], columns)).toBe(
      "Fonctionnaires exclus",
    );
  });
});

describe("detectStatisticDetailsKind", () => {
  it("detects personnel tables from first name and fonction columns", () => {
    expect(
      detectStatisticDetailsKind([
        { id: "firstName", header: "Prénom" },
        { id: "fonction", header: "Fonction" },
      ]),
    ).toBe("personnel");
  });
});
