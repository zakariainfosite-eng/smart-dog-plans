import { describe, expect, it } from "vitest";
import {
  identityColumnsFor,
  intersectImportableColumns,
  isGeneratedColumn,
  isSqliteDatabaseBytes,
  missingRequiredSourceColumns,
  planTableImport,
  serializeIdentity,
  type SqliteColumnInfo,
} from "@/lib/windows-db-import";

const SQLITE_HEADER = new TextEncoder().encode("SQLite format 3\0");

function column(
  name: string,
  extra: Partial<SqliteColumnInfo> = {},
): SqliteColumnInfo {
  return {
    name,
    notnull: 0,
    dflt_value: null,
    pk: 0,
    hidden: 0,
    ...extra,
  };
}

describe("windows-db-import validation", () => {
  it("accepts the SQLite magic header regardless of file extension", () => {
    const bytes = new Uint8Array(32);
    bytes.set(SQLITE_HEADER);
    expect(isSqliteDatabaseBytes(bytes)).toBe(true);
    expect(isSqliteDatabaseBytes(new Uint8Array([1, 2, 3, 4]))).toBe(false);
    expect(isSqliteDatabaseBytes(new Uint8Array(8))).toBe(false);
  });

  it("skips generated columns such as checkpoints.total_required_staff", () => {
    const generated = column("total_required_staff", { hidden: 3 });
    const named = column("total_required_staff", { hidden: 0 });
    expect(isGeneratedColumn(generated)).toBe(true);
    expect(isGeneratedColumn(named)).toBe(true);
    expect(isGeneratedColumn(column("name"))).toBe(false);
  });

  it("intersects only non-generated compatible columns", () => {
    const android = [
      column("id", { notnull: 1, pk: 1 }),
      column("name", { notnull: 1 }),
      column("total_required_staff", { hidden: 3 }),
      column("android_only"),
    ];
    expect(intersectImportableColumns(android, ["id", "name", "total_required_staff", "windows_only"])).toEqual([
      "id",
      "name",
    ]);
  });

  it("reports required columns missing from the Windows table", () => {
    const android = [
      column("id", { notnull: 1, pk: 1 }),
      column("email", { notnull: 1 }),
      column("role", { notnull: 1, dflt_value: "user" }),
    ];
    expect(missingRequiredSourceColumns(android, ["id"])).toEqual(["email"]);
  });
});

describe("windows-db-import row planning", () => {
  const agentColumns = [
    column("id", { notnull: 1, pk: 1 }),
    column("first_name", { notnull: 1 }),
    column("professional_number", { notnull: 1 }),
    column("dog_id"),
  ];

  it("skips Windows rows whose id already exists on Android", () => {
    const planned = planTableImport({
      table: "agents",
      columns: ["id", "first_name", "professional_number"],
      androidColumns: agentColumns,
      rows: [
        { id: "a1", first_name: "Ada", professional_number: "P-1" },
        { id: "a2", first_name: "Bob", professional_number: "P-2" },
      ],
      existingIdentities: new Set([serializeIdentity(["id"], { id: "a1" })]),
      uniqueLookups: [
        {
          columns: ["professional_number"],
          occupied: new Map([[serializeIdentity(["professional_number"], { professional_number: "P-1" }), "id=a1"]]),
        },
      ],
      fkLookups: [],
    });

    expect(planned.map((item) => item.kind)).toEqual(["skip", "insert"]);
    expect(planned[0]).toMatchObject({ reason: "duplicate_id" });
  });

  it("reports a unique-key conflict instead of overwriting the Android row", () => {
    const planned = planTableImport({
      table: "agents",
      columns: ["id", "first_name", "professional_number"],
      androidColumns: agentColumns,
      rows: [{ id: "win-1", first_name: "Ada", professional_number: "P-1" }],
      existingIdentities: new Set(),
      uniqueLookups: [
        {
          columns: ["professional_number"],
          occupied: new Map([[serializeIdentity(["professional_number"], { professional_number: "P-1" }), "id=android-1"]]),
        },
      ],
      fkLookups: [],
    });

    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({
      kind: "conflict",
      reason: "unique_key",
      detail: "agents.professional_number",
    });
  });

  it("does not invent missing required values", () => {
    const planned = planTableImport({
      table: "agents",
      columns: ["id", "first_name", "professional_number"],
      androidColumns: agentColumns,
      rows: [{ id: "a3", first_name: "NoNumber" }],
      existingIdentities: new Set(),
      uniqueLookups: [],
      fkLookups: [],
    });

    expect(planned[0]).toMatchObject({
      kind: "conflict",
      reason: "missing_required",
    });
  });

  it("does not import a row whose foreign key is absent on Android", () => {
    const planned = planTableImport({
      table: "agents",
      columns: ["id", "first_name", "professional_number", "dog_id"],
      androidColumns: agentColumns,
      rows: [{ id: "a4", first_name: "Eve", professional_number: "P-4", dog_id: "missing-dog" }],
      existingIdentities: new Set(),
      uniqueLookups: [],
      fkLookups: [{ column: "dog_id", present: new Set(["dog-1"]) }],
    });

    expect(planned[0]).toMatchObject({
      kind: "conflict",
      reason: "missing_fk",
      detail: "agents.dog_id",
    });
  });

  it("uses composite identity columns for document_reference_sequences", () => {
    expect(identityColumnsFor("document_reference_sequences")).toEqual(["prefix", "year"]);
    expect(identityColumnsFor("agents")).toEqual(["id"]);
  });
});
