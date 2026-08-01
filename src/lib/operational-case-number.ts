import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";

type Db = DbClient;

async function casesTable(db: Db): Promise<string> {
  const { resolveOperationalCasesTable } = await import("@/lib/operational-case-api");
  return resolveOperationalCasesTable(db);
}

const CASE_NUMBER_PREFIX = "CO";
const CASE_NUMBER_REGEX = /^CO-(\d{4})-(\d{6})$/;

export function resolveCaseNumberYear(caseDate?: string): number {
  if (caseDate?.trim()) {
    const year = Number(caseDate.slice(0, 4));
    if (Number.isFinite(year) && year >= 2000 && year <= 2100) return year;
  }
  return new Date().getFullYear();
}

export function formatOperationalCaseNumber(year: number, sequence: number): string {
  return `${CASE_NUMBER_PREFIX}-${year}-${String(sequence).padStart(6, "0")}`;
}

export function parseOperationalCaseNumber(caseNumber: string): { year: number; sequence: number } | null {
  const match = caseNumber.match(CASE_NUMBER_REGEX);
  if (!match) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}

export function isDuplicateCaseNumberError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; details?: string };
  return (
    e.code === "23505" &&
    (e.message?.includes("operational_cases_case_number_unique") ||
      e.message?.includes("case_number") ||
      e.details?.includes("case_number") ||
      false)
  );
}

async function fetchMaxCaseSequenceForYear(db: Db, year: number): Promise<number> {
  const table = await casesTable(db);
  const { data, error } = await db
    .from(table)
    .select("case_number")
    .ilike("case_number", `${CASE_NUMBER_PREFIX}-${year}-%`);
  if (error) throw error;

  let max = 0;
  for (const row of data ?? []) {
    const parsed = parseOperationalCaseNumber(row.case_number);
    if (parsed?.year === year) max = Math.max(max, parsed.sequence);
  }
  return max;
}

async function caseNumberExists(db: Db, caseNumber: string): Promise<boolean> {
  const table = await casesTable(db);
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("case_number", caseNumber);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Preview the next case number for a given case date (does not reserve it). */
export async function previewNextOperationalCaseNumber(
  db: Db,
  caseDate?: string,
): Promise<string> {
  const year = resolveCaseNumberYear(caseDate);
  const maxSeq = await fetchMaxCaseSequenceForYear(db, year);
  return formatOperationalCaseNumber(year, maxSeq + 1);
}

/** Allocate a unique case number, verifying availability and skipping conflicts. */
export async function allocateOperationalCaseNumber(
  db: Db,
  caseDate?: string,
  startAfterSequence?: number,
): Promise<string> {
  const year = resolveCaseNumberYear(caseDate);
  let sequence = startAfterSequence ?? (await fetchMaxCaseSequenceForYear(db, year));

  for (let attempt = 0; attempt < 25; attempt++) {
    sequence += 1;
    const caseNumber = formatOperationalCaseNumber(year, sequence);
    const exists = await caseNumberExists(db, caseNumber);
    if (!exists) return caseNumber;
  }

  throw new Error("Unable to allocate a unique operational case number.");
}
