/** Format unknown thrown values for logs and toasts. */
export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? ` | cause: ${error.cause.name}: ${error.cause.message}`
        : error.cause != null
          ? ` | cause: ${String(error.cause)}`
          : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function stackUnknownError(error: unknown): string {
  if (error instanceof Error && error.stack) return error.stack;
  return formatUnknownError(error);
}

/**
 * Tag an export failure with its pipeline phase so UI/logs can classify it.
 * Phases: prepare | pdf-generate | docx-generate | ipc-save | browser-download | filesystem
 */
export function wrapExportError(phase: string, error: unknown): Error {
  const message = formatUnknownError(error);
  const wrapped = new Error(`[planning-export:${phase}] ${message}`);
  (wrapped as Error & { phase: string; cause: unknown }).phase = phase;
  (wrapped as Error & { cause: unknown }).cause = error;
  if (error instanceof Error && error.stack) {
    wrapped.stack = `${wrapped.message}\n${error.stack}`;
  }
  return wrapped;
}
