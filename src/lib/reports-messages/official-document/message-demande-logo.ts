import { db } from "@/integrations/database/client";
import { loadDocumentLogoBytes } from "@/lib/document-logo-api";
import { FP_OFFICIAL_LOGO_URL } from "@/lib/documents/feuille-presence-layout";
import { loadFeuillePresenceLogo } from "@/lib/documents/feuille-presence-pdf";

/**
 * Same logo source as Feuille de présence:
 * custom document logo when configured, otherwise the official seal asset.
 */
export async function loadMessageDemandeOfficialLogo(): Promise<
  string | Uint8Array | undefined
> {
  try {
    const fromSettings = await loadDocumentLogoBytes(db);
    if (fromSettings && fromSettings.byteLength > 0) return fromSettings;
  } catch {
    // Fall through to bundled official asset.
  }
  return loadFeuillePresenceLogo(FP_OFFICIAL_LOGO_URL);
}
