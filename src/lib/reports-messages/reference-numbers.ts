import type { DbClient } from "@/integrations/database/client";
import type { DocumentKind, ReferencePrefix } from "@/lib/reports-messages/types";
import { getReferencePrefixForKind } from "@/lib/reports-messages/templates";

function formatReferenceNumber(prefix: ReferencePrefix, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Allocate the next sequential reference number (persisted in SQLite).
 * Safe for single-user desktop; uses read-modify-write on document_reference_sequences.
 */
export async function allocateDocumentReference(
  db: DbClient,
  kind: DocumentKind,
  year: number = new Date().getFullYear(),
): Promise<string> {
  const prefix = getReferencePrefixForKind(kind);

  const { data: existing, error: readError } = await db
    .from("document_reference_sequences")
    .select("last_number")
    .eq("prefix", prefix)
    .eq("year", year)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  const nextNumber = (existing?.last_number ?? 0) + 1;

  if (!existing) {
    const { error: insertError } = await db.from("document_reference_sequences").insert({
      prefix,
      year,
      last_number: nextNumber,
    });
    if (insertError) {
      throw new Error(insertError.message);
    }
  } else {
    const { error: updateError } = await db
      .from("document_reference_sequences")
      .update({ last_number: nextNumber })
      .eq("prefix", prefix)
      .eq("year", year);
    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return formatReferenceNumber(prefix, year, nextNumber);
}

export { formatReferenceNumber };
