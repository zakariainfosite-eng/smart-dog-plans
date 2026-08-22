import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/integrations/database/client";
import {
  resolveEffectiveTemplate,
  type EffectiveTemplateConfig,
} from "@/lib/reports-messages/document-templates/merge-template";
import {
  DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY,
  TEMPLATE_SNAPSHOT_PAYLOAD_KEY,
  fetchDocumentTemplatesSettingsOrDefault,
  parseDocumentTemplatesSettings,
  type SingleTemplateOverride,
} from "@/lib/reports-messages/document-templates/template-overrides-store";
import type { RoleDocumentPayload } from "@/lib/reports-messages/types";

export function parseTemplateSnapshot(
  payload: RoleDocumentPayload | null | undefined,
): SingleTemplateOverride | null {
  const raw = payload?.[TEMPLATE_SNAPSHOT_PAYLOAD_KEY];
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    // Reuse settings parser for a single override via wrap
    const wrapped = parseDocumentTemplatesSettings({ byId: { _tmp: parsed } });
    return wrapped.byId._tmp ?? null;
  } catch {
    return null;
  }
}

export function withTemplateSnapshot(
  payload: RoleDocumentPayload,
  override: SingleTemplateOverride,
): RoleDocumentPayload {
  return {
    ...payload,
    [TEMPLATE_SNAPSHOT_PAYLOAD_KEY]: JSON.stringify(override),
  };
}

export function useEffectiveDocumentTemplate(
  templateId: string,
  options?: {
    /** When set (finalized docs), prefer frozen snapshot over live admin config */
    payload?: RoleDocumentPayload | null;
    preferSnapshot?: boolean;
  },
): {
  effective: EffectiveTemplateConfig | null;
  isLoading: boolean;
} {
  const { data: settings, isLoading } = useQuery({
    queryKey: DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY,
    queryFn: () => fetchDocumentTemplatesSettingsOrDefault(db),
  });

  const effective = useMemo(() => {
    const snapshot =
      options?.preferSnapshot !== false
        ? parseTemplateSnapshot(options?.payload ?? null)
        : null;
    return resolveEffectiveTemplate(templateId, settings ?? { byId: {} }, snapshot);
  }, [templateId, settings, options?.payload, options?.preferSnapshot]);

  return { effective, isLoading };
}
