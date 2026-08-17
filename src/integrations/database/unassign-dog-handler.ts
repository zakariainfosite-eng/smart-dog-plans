/**
 * Dog ↔ cynotechnicien assignment is stored on `agents.dog_id`
 * (UNIQUE FK to dogs.id). There is no `dogs.agent_id` column and no
 * junction table.
 *
 * "Chien sans maître" (`dog_without_handler`) clears that FK only.
 * It never deletes the dog or the handler, and never reassigns later.
 */

export const DOG_WITHOUT_HANDLER_EXCLUSION_TYPE = "dog_without_handler";

export const UNASSIGN_DOG_FROM_CURRENT_HANDLER_SQL =
  "UPDATE agents SET dog_id = NULL, updated_at = datetime('now') WHERE dog_id = ?";

export const CLEAR_DOG_ASSIGNMENT_DATE_SQL =
  "UPDATE dogs SET assignment_date = NULL, updated_at = datetime('now') WHERE id = ? AND assignment_date IS NOT NULL";

export type UnassignDogHandlerRunResult = { changes: number };

function isActiveFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function trimmedDogId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

/**
 * Returns the dog id to unassign when an exclusion row means an active
 * "Chien sans maître". Returns null when the exclusion should be saved
 * without touching any assignment (inactive, other type, or no dog).
 */
export function dogIdToUnassignForWithoutHandlerExclusion(
  row: { exclusion_type?: unknown; active?: unknown; dog_id?: unknown } | null | undefined,
): string | null {
  if (!row) return null;
  if (row.exclusion_type !== DOG_WITHOUT_HANDLER_EXCLUSION_TYPE) return null;
  if (!isActiveFlag(row.active)) return null;
  return trimmedDogId(row.dog_id);
}

export function unassignDogFromCurrentHandlerSync(
  dogId: string,
  run: (sql: string, params: unknown[]) => UnassignDogHandlerRunResult,
): boolean {
  const result = run(UNASSIGN_DOG_FROM_CURRENT_HANDLER_SQL, [dogId]);
  if (result.changes > 0) {
    run(CLEAR_DOG_ASSIGNMENT_DATE_SQL, [dogId]);
    return true;
  }
  return false;
}

export async function unassignDogFromCurrentHandlerAsync(
  dogId: string,
  run: (sql: string, params: unknown[]) => Promise<UnassignDogHandlerRunResult>,
): Promise<boolean> {
  const result = await run(UNASSIGN_DOG_FROM_CURRENT_HANDLER_SQL, [dogId]);
  if (result.changes > 0) {
    await run(CLEAR_DOG_ASSIGNMENT_DATE_SQL, [dogId]);
    return true;
  }
  return false;
}

/** Apply the unassign side-effect for a saved/updated exclusion row. No-op if none. */
export function applyUnassignIfWithoutHandlerExclusionSync(
  row: { exclusion_type?: unknown; active?: unknown; dog_id?: unknown },
  run: (sql: string, params: unknown[]) => UnassignDogHandlerRunResult,
): boolean {
  const dogId = dogIdToUnassignForWithoutHandlerExclusion(row);
  if (!dogId) return false;
  return unassignDogFromCurrentHandlerSync(dogId, run);
}

export async function applyUnassignIfWithoutHandlerExclusionAsync(
  row: { exclusion_type?: unknown; active?: unknown; dog_id?: unknown },
  run: (sql: string, params: unknown[]) => Promise<UnassignDogHandlerRunResult>,
): Promise<boolean> {
  const dogId = dogIdToUnassignForWithoutHandlerExclusion(row);
  if (!dogId) return false;
  return unassignDogFromCurrentHandlerAsync(dogId, run);
}
