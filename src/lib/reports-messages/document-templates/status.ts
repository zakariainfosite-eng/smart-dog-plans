import type {
  DocumentMetaV1,
  DocumentWorkflowStatus,
} from "@/lib/reports-messages/document-templates/types";
import { DOCUMENT_META_PAYLOAD_KEY } from "@/lib/reports-messages/document-templates/types";
import type { RoleDocumentPayload, RoleDocumentRow } from "@/lib/reports-messages/types";

export function parseDocumentMeta(payload: RoleDocumentPayload | null | undefined): DocumentMetaV1 {
  const raw = payload?.[DOCUMENT_META_PAYLOAD_KEY];
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as DocumentMetaV1;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function withDocumentMeta(
  payload: RoleDocumentPayload,
  meta: DocumentMetaV1,
): RoleDocumentPayload {
  return {
    ...payload,
    [DOCUMENT_META_PAYLOAD_KEY]: JSON.stringify(meta),
  };
}

export function markPayloadExported(payload: RoleDocumentPayload, at = new Date().toISOString()): RoleDocumentPayload {
  const meta = parseDocumentMeta(payload);
  return withDocumentMeta(payload, { ...meta, exportedAt: at });
}

/**
 * Display status without schema change:
 * exported_at in payload meta → Exporté; else DB finalized → Finalisé; else Brouillon.
 */
export function getDocumentWorkflowStatus(
  document: Pick<RoleDocumentRow, "status" | "payload">,
): DocumentWorkflowStatus {
  const meta = parseDocumentMeta(document.payload);
  if (meta.exportedAt) return "exported";
  if (document.status === "finalized") return "finalized";
  return "draft";
}
