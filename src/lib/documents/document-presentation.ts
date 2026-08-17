import type { DbClient } from "@/integrations/database/client";
import {
  fetchDocumentSettingsOrDefault,
  type DocumentSettings,
} from "@/lib/document-settings";
import { loadDocumentLogoBytes } from "@/lib/document-logo-api";
import {
  DEFAULT_ORGANIZATION_SETTINGS,
  fetchOrganizationSettings,
  type OrganizationSettings,
} from "@/lib/organization-settings";

export type DocumentPresentation = {
  organization: OrganizationSettings;
  documents: DocumentSettings;
  logoBytes?: Uint8Array;
};

export async function loadDocumentPresentation(db: DbClient): Promise<DocumentPresentation> {
  const [documents, organization] = await Promise.all([
    fetchDocumentSettingsOrDefault(db),
    fetchOrganizationSettings(db).catch(() => ({ ...DEFAULT_ORGANIZATION_SETTINGS })),
  ]);
  const logoBytes = await loadDocumentLogoBytes(db, documents);
  return { organization, documents, logoBytes };
}
