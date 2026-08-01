export function isMissingSoftDeleteColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "42703" && (e.message?.includes("is_deleted") ?? false);
}

export function filterNotDeleted<T extends { is_deleted?: boolean | null }>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter((row) => row.is_deleted !== true);
}

export function formatPgError(error: unknown): string {
  const e = error as {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  };
  return [
    e.code ? `code=${e.code}` : null,
    e.message,
    e.details ? `details=${e.details}` : null,
    e.hint ? `hint=${e.hint}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}
