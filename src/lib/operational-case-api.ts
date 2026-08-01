import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import { filterNotDeleted, formatPgError, isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import { randomId } from "@/lib/random-id";
import {
  allocateOperationalCaseNumber,
  isDuplicateCaseNumberError,
  parseOperationalCaseNumber,
  resolveCaseNumberYear,
} from "@/lib/operational-case-number";

/** Canonical operational cases table selected for this project. */
export const OPERATIONAL_CASES_TABLE = "operational_cases" as const;

/** Legacy/alternate table names probed when the canonical table is absent. */
export const OPERATIONAL_CASES_TABLE_CANDIDATES = [
  OPERATIONAL_CASES_TABLE,
  "cases_operationnelles",
  "operation_cases",
  "operational_case",
] as const;

let resolvedOperationalCasesTable: string | null = null;

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    e.code === "PGRST205" ||
    (e.message?.includes("Could not find the table") ?? false) ||
    (e.message?.includes("does not exist") ?? false)
  );
}

/** Resolve the live operational cases table name once per session. */
export async function resolveOperationalCasesTable(db: Db): Promise<string> {
  if (resolvedOperationalCasesTable) return resolvedOperationalCasesTable;

  for (const table of OPERATIONAL_CASES_TABLE_CANDIDATES) {
    const { error } = await db.from(table).select("id").limit(1);
    if (!error) {
      resolvedOperationalCasesTable = table;
      if (table !== OPERATIONAL_CASES_TABLE) {
        console.warn("[OperationalCases] Using alternate table:", table);
      }
      return table;
    }
    if (!isMissingTableError(error)) {
      resolvedOperationalCasesTable = OPERATIONAL_CASES_TABLE;
      return OPERATIONAL_CASES_TABLE;
    }
  }

  resolvedOperationalCasesTable = OPERATIONAL_CASES_TABLE;
  return OPERATIONAL_CASES_TABLE;
}

export const OPERATIONAL_CASE_ATTACHMENTS_TABLE = "operational_case_attachments" as const;

export const OPERATIONAL_CASE_ATTACHMENTS_BUCKET = "operational-case-attachments";

export const OPERATIONAL_CASE_SELECT =
  "*, agent:agents(id, first_name, last_name, professional_number, photo_url), dog:dog_id(id, name, photo_url, specialty), checkpoint:checkpoint_id(id, name), attachments:operational_case_attachments(id, file_name, storage_path, file_size, mime_type, created_at)" as const;

export const OPERATIONAL_CASE_AGENT_SELECT =
  "*, dog:dog_id(id, name), checkpoint:checkpoint_id(id, name), attachments:operational_case_attachments(id, file_name, storage_path, file_size, mime_type, created_at)" as const;

export const OPERATIONAL_CASE_DOG_SELECT =
  "*, agent:agent_id(id, first_name, last_name, professional_number), checkpoint:checkpoint_id(id, name), attachments:operational_case_attachments(id, file_name, storage_path, file_size, mime_type, created_at)" as const;

export type OperationalCaseAttachment =
  Database["public"]["Tables"]["operational_case_attachments"]["Row"];

export type OperationalCaseWithRelations =
  Database["public"]["Tables"]["operational_cases"]["Row"] & {
    agent?: {
      id: string;
      first_name: string;
      last_name: string;
      professional_number: string;
      photo_url?: string | null;
    } | null;
    dog: {
      id: string;
      name: string;
      photo_url?: string | null;
      specialty?: Database["public"]["Enums"]["dog_specialty"] | null;
    } | null;
    checkpoint: { id: string; name: string } | null;
    attachments: OperationalCaseAttachment[];
  };

type Db = DbClient;

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapOperationalCaseRow(row: unknown): OperationalCaseWithRelations {
  const raw = row as Record<string, unknown>;
  const attachments = raw.attachments;
  return {
    ...(raw as Database["public"]["Tables"]["operational_cases"]["Row"]),
    agent: raw.agent != null ? unwrapOne(raw.agent as OperationalCaseWithRelations["agent"]) : undefined,
    dog: unwrapOne(raw.dog as OperationalCaseWithRelations["dog"]),
    checkpoint: unwrapOne(raw.checkpoint as OperationalCaseWithRelations["checkpoint"]),
    attachments: Array.isArray(attachments)
      ? (attachments as OperationalCaseAttachment[])
      : attachments
        ? [attachments as OperationalCaseAttachment]
        : [],
  };
}

export function checkpointLabel(caseRow: Pick<OperationalCaseWithRelations, "checkpoint" | "location">): string {
  return caseRow.checkpoint?.name ?? caseRow.location ?? "—";
}

export async function uploadCaseAttachments(
  db: Db,
  caseId: string,
  files: File[],
): Promise<void> {
  for (const file of files) {
    const storagePath = `${caseId}/${randomId()}-${file.name}`;
    const { error: uploadError } = await db.storage
      .from(OPERATIONAL_CASE_ATTACHMENTS_BUCKET)
      .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) throw uploadError;

    const { error: insertError } = await db.from(OPERATIONAL_CASE_ATTACHMENTS_TABLE).insert({
      case_id: caseId,
      file_name: file.name,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || null,
    });
    if (insertError) {
      await db.storage.from(OPERATIONAL_CASE_ATTACHMENTS_BUCKET).remove([storagePath]);
      throw insertError;
    }
  }
}

export async function fetchCaseAttachments(
  db: Db,
  caseId: string,
): Promise<OperationalCaseAttachment[]> {
  const { data, error } = await db
    .from(OPERATIONAL_CASE_ATTACHMENTS_TABLE)
    .select("id, case_id, file_name, storage_path, file_size, mime_type, created_at")
    .eq("case_id", caseId);

  if (error) {
    throw new Error(`Failed to load case attachments: ${formatPgError(error)}`);
  }

  return data ?? [];
}

export async function deleteCaseAttachment(db: Db, attachment: OperationalCaseAttachment): Promise<void> {
  const { error: dbError } = await db
    .from(OPERATIONAL_CASE_ATTACHMENTS_TABLE)
    .delete()
    .eq("id", attachment.id);
  if (dbError) {
    throw new Error(`Failed to delete attachment record: ${formatPgError(dbError)}`);
  }

  const { error: storageError } = await db.storage
    .from(OPERATIONAL_CASE_ATTACHMENTS_BUCKET)
    .remove([attachment.storage_path]);
  if (storageError) {
    throw new Error(`Failed to delete attachment file: ${formatPgError(storageError)}`);
  }
}

export async function getAttachmentDownloadUrl(
  db: Db,
  storagePath: string,
): Promise<string> {
  const { data, error } = await db.storage
    .from(OPERATIONAL_CASE_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Permanently delete an operational case after removing linked attachments.
 * Order: load attachments → delete attachment rows → delete storage files → delete case.
 * Stops before case deletion if any attachment step fails.
 */
export async function deleteOperationalCase(db: Db, id: string): Promise<void> {
  const table = await resolveOperationalCasesTable(db);

  const attachments = await fetchCaseAttachments(db, id);

  if (attachments.length > 0) {
    const { error: attachmentDeleteError } = await db
      .from(OPERATIONAL_CASE_ATTACHMENTS_TABLE)
      .delete()
      .eq("case_id", id);
    if (attachmentDeleteError) {
      throw new Error(
        `Failed to delete attachment records: ${formatPgError(attachmentDeleteError)}`,
      );
    }

    const storagePaths = attachments
      .map((attachment: any) => attachment.storage_path)
      .filter((path): path is string => Boolean(path));

    if (storagePaths.length > 0) {
      const { error: storageError } = await db.storage
        .from(OPERATIONAL_CASE_ATTACHMENTS_BUCKET)
        .remove(storagePaths);
      if (storageError) {
        throw new Error(`Failed to delete attachment files: ${formatPgError(storageError)}`);
      }
    }
  }

  const { error: caseDeleteError } = await db.from(table).delete().eq("id", id);
  if (caseDeleteError) {
    throw new Error(`Failed to delete operational case: ${formatPgError(caseDeleteError)}`);
  }
}

/** @deprecated Use deleteOperationalCase — hard delete with attachment cleanup. */
export async function softDeleteOperationalCase(db: Db, id: string): Promise<void> {
  return deleteOperationalCase(db, id);
}

export async function saveOperationalCase(
  db: Db,
  payload: Record<string, unknown>,
  id?: string,
): Promise<string> {
  const table = await resolveOperationalCasesTable(db);

  if (id) {
    const { case_number: _ignored, ...updatePayload } = payload;
    const { error } = await db.from(table).update(updatePayload).eq("id", id);
    if (error) throw error;
    return id;
  }

  const caseDate = typeof payload.case_date === "string" ? payload.case_date : undefined;
  let startAfter: number | undefined;
  const requestedNumber = typeof payload.case_number === "string" ? payload.case_number.trim() : "";
  if (requestedNumber) {
    const parsed = parseOperationalCaseNumber(requestedNumber);
    if (parsed && parsed.year === resolveCaseNumberYear(caseDate)) {
      startAfter = parsed.sequence - 1;
    }
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const caseNumber = await allocateOperationalCaseNumber(db, caseDate, startAfter);
    const insertPayload = { ...payload, case_number: caseNumber };
    const { data, error } = await db.from(table).insert(insertPayload).select("id").single();

    if (!error) return data.id;

    if (isDuplicateCaseNumberError(error)) {
      const parsed = parseOperationalCaseNumber(caseNumber);
      startAfter = parsed?.sequence ?? startAfter;
      continue;
    }

    throw error;
  }

  throw new Error("Unable to save operational case: could not allocate a unique case number.");
}

export async function fetchOperationalCases(
  db: Db,
  select: string = OPERATIONAL_CASE_SELECT,
): Promise<OperationalCaseWithRelations[]> {
  const table = await resolveOperationalCasesTable(db);
  const { data, error } = await db
    .from(table)
    .select(select)
    .eq("is_deleted", false)
    .order("case_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!error) return (data ?? []).map(mapOperationalCaseRow);

  if (isMissingSoftDeleteColumn(error)) {
    const legacy = await db
      .from(table)
      .select(select)
      .order("case_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (!legacy.error) return filterNotDeleted(legacy.data ?? []).map(mapOperationalCaseRow);
  }

  const fallback = await db
    .from(table)
    .select("*, agent:agents(id, first_name, last_name, professional_number), dog:dog_id(id, name)")
    .eq("is_deleted", false)
    .order("case_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!fallback.error) return (fallback.data ?? []).map(mapOperationalCaseRow);

  if (isMissingSoftDeleteColumn(fallback.error)) {
    const legacyFallback = await db
      .from(table)
      .select("*, agent:agents(id, first_name, last_name, professional_number), dog:dog_id(id, name)")
      .order("case_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (legacyFallback.error) throw legacyFallback.error;
    return filterNotDeleted(legacyFallback.data ?? []).map((row: any) =>
      mapOperationalCaseRow({ ...(row as object), checkpoint: null, attachments: [] }),
    );
  }

  throw fallback.error;
}

export async function fetchAgentOperationalCases(
  db: Db,
  agentId: string,
): Promise<OperationalCaseWithRelations[]> {
  const table = await resolveOperationalCasesTable(db);
  const { data, error } = await db
    .from(table)
    .select(OPERATIONAL_CASE_AGENT_SELECT)
    .eq("agent_id", agentId)
    .eq("is_deleted", false)
    .order("case_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!error) return (data ?? []).map(mapOperationalCaseRow);

  if (isMissingSoftDeleteColumn(error)) {
    const legacy = await db
      .from(table)
      .select(OPERATIONAL_CASE_AGENT_SELECT)
      .eq("agent_id", agentId)
      .order("case_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (!legacy.error) return filterNotDeleted(legacy.data ?? []).map(mapOperationalCaseRow);
  }

  const fallback = await db
    .from(table)
    .select("*, dog:dog_id(id, name)")
    .eq("agent_id", agentId)
    .eq("is_deleted", false)
    .order("case_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!fallback.error) {
    return (fallback.data ?? []).map((row: any) =>
      mapOperationalCaseRow({ ...(row as object), checkpoint: null, attachments: [] }),
    );
  }

  if (isMissingSoftDeleteColumn(fallback.error)) {
    const legacyFallback = await db
      .from(table)
      .select("*, dog:dog_id(id, name)")
      .eq("agent_id", agentId)
      .order("case_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (legacyFallback.error) {
      console.warn("[OperationalCases] query skipped", {
        agentId,
        message: legacyFallback.error.message,
        code: legacyFallback.error.code,
      });
      return [];
    }
    return filterNotDeleted(legacyFallback.data ?? []).map((row: any) =>
      mapOperationalCaseRow({ ...(row as object), checkpoint: null, attachments: [] }),
    );
  }

  console.warn("[OperationalCases] query skipped", {
    agentId,
    message: fallback.error.message,
    code: fallback.error.code,
  });
  return [];
}

export async function fetchDogOperationalCases(
  db: Db,
  dogId: string,
): Promise<OperationalCaseWithRelations[]> {
  const table = await resolveOperationalCasesTable(db);
  const { data, error } = await db
    .from(table)
    .select(OPERATIONAL_CASE_DOG_SELECT)
    .eq("dog_id", dogId)
    .eq("is_deleted", false)
    .order("case_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!error) return (data ?? []).map(mapOperationalCaseRow);

  if (isMissingSoftDeleteColumn(error)) {
    const legacy = await db
      .from(table)
      .select(OPERATIONAL_CASE_DOG_SELECT)
      .eq("dog_id", dogId)
      .order("case_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (!legacy.error) return filterNotDeleted(legacy.data ?? []).map(mapOperationalCaseRow);
  }

  const fallback = await db
    .from(table)
    .select("*, agent:agent_id(id, first_name, last_name, professional_number)")
    .eq("dog_id", dogId)
    .eq("is_deleted", false)
    .order("case_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!fallback.error) {
    return (fallback.data ?? []).map((row: any) =>
      mapOperationalCaseRow({ ...(row as object), checkpoint: null, attachments: [] }),
    );
  }

  if (isMissingSoftDeleteColumn(fallback.error)) {
    const legacyFallback = await db
      .from(table)
      .select("*, agent:agent_id(id, first_name, last_name, professional_number)")
      .eq("dog_id", dogId)
      .order("case_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (legacyFallback.error) {
      console.warn("[OperationalCases] dog query skipped", {
        dogId,
        message: legacyFallback.error.message,
        code: legacyFallback.error.code,
      });
      return [];
    }
    return filterNotDeleted(legacyFallback.data ?? []).map((row: any) =>
      mapOperationalCaseRow({ ...(row as object), checkpoint: null, attachments: [] }),
    );
  }

  console.warn("[OperationalCases] dog query skipped", {
    dogId,
    message: fallback.error.message,
    code: fallback.error.code,
  });
  return [];
}
