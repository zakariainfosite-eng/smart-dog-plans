import { jsPDF } from "jspdf";
import { db } from "@/integrations/database/client";
import { loadDocumentLogoBytes } from "@/lib/document-logo-api";
import { exportJsPdf } from "@/lib/documents/export-jspdf";
import { FP_OFFICIAL_LOGO_URL } from "@/lib/documents/feuille-presence-layout";
import type { FeuillePresenceLogoSources } from "@/lib/documents/feuille-presence-logo";
import {
  renderCynotechniciansListPages,
  renderDogsListPages,
  renderFeuillePresencePage,
} from "@/lib/documents/feuille-presence-render";
import type {
  CynotechniciansListPdfData,
  DogsListPdfData,
  FeuillePresenceData,
} from "@/lib/documents/feuille-presence-types";
import { sortFeuillePresenceDataByMatricule } from "@/lib/documents/sort-attendance-by-matricule";

/** Official K9 attendance sheet — A4 portrait blank template. */
export type FeuillePresenceOptions = {
  year?: number;
  filename?: string;
  /** Populated attendance data from validated planning. */
  data?: FeuillePresenceData;
  /** Original PNG bytes or data URL — used for header seal and table watermark. */
  logoDataUrl?: string | Uint8Array;
};

/**
 * PRESERVE — Female presence customization (DAY sheets only; do not remove):
 * After male rows in each specialty table, female cynotechniciennes of that
 * specialty appear with personnel fields only and an empty Affectation column.
 * Night sheets omit these rows entirely. Rotation Engine must not strip day rows.
 */

export type CynotechniciansListPdfOptions = {
  year?: number;
  filename?: string;
  data: CynotechniciansListPdfData;
  logoDataUrl?: string | Uint8Array;
  logoUrl?: string;
};

export type DogsListPdfOptions = {
  year?: number;
  filename?: string;
  data: DogsListPdfData;
  logoDataUrl?: string | Uint8Array;
  logoUrl?: string;
};

export { FP_OFFICIAL_LOGO_URL };
export type { FeuillePresenceLogoSources };

function resolveLogoSources(
  logoDataUrl?: string | Uint8Array,
): FeuillePresenceLogoSources | undefined {
  if (!logoDataUrl) return undefined;
  return { header: logoDataUrl };
}

export function generateFeuillePresencePdf(options: FeuillePresenceOptions = {}): jsPDF {
  const year = options.year ?? new Date().getFullYear();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  // Keep male→female specialty blocks on day data (presenceOnly rows must remain).
  const data = options.data
    ? sortFeuillePresenceDataByMatricule(options.data)
    : undefined;
  renderFeuillePresencePage(doc, year, resolveLogoSources(options.logoDataUrl), data);
  return doc;
}

export async function downloadFeuillePresencePdf(
  options: FeuillePresenceOptions = {},
): Promise<void> {
  const year = options.year ?? new Date().getFullYear();
  const filename = options.filename ?? `feuille-presence-${year}.pdf`;
  await exportJsPdf(generateFeuillePresencePdf(options), filename);
}

type RawLogoPayload = {
  bytes: Uint8Array;
};

async function loadRawLogo(url: string): Promise<RawLogoPayload | undefined> {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return { bytes };
  } catch {
    return undefined;
  }
}

/** Header seal and table watermark — original PNG bytes, no transforms. */
export async function loadFeuillePresenceLogo(url: string): Promise<Uint8Array | undefined> {
  const raw = await loadRawLogo(url);
  return raw?.bytes;
}

export async function loadFeuillePresenceLogos(
  url: string,
): Promise<FeuillePresenceLogoSources> {
  const raw = await loadRawLogo(url);
  if (!raw) return {};
  return { header: raw.bytes };
}

async function resolveLogoDataUrl(
  options: { logoDataUrl?: string | Uint8Array; logoUrl?: string },
): Promise<string | Uint8Array | undefined> {
  if (options.logoDataUrl) return options.logoDataUrl;
  if (options.logoUrl) {
    const logos = await loadFeuillePresenceLogos(options.logoUrl);
    return logos.header;
  }
  return loadDocumentLogoBytes(db);
}

export async function downloadFeuillePresencePdfWithLogo(
  options: FeuillePresenceOptions & { logoUrl?: string } = {},
): Promise<void> {
  const logoDataUrl = await resolveLogoDataUrl(options);
  await downloadFeuillePresencePdf({
    ...options,
    logoDataUrl,
  });
}

export async function generateFeuillePresencePdfWithLogo(
  options: FeuillePresenceOptions & { logoUrl?: string } = {},
): Promise<jsPDF> {
  const logoDataUrl = await resolveLogoDataUrl(options);
  return generateFeuillePresencePdf({
    ...options,
    logoDataUrl,
  });
}

/** Same engine / template chrome as Feuille de présence — cynotechnicians table body. */
export function generateCynotechniciansListPdf(options: CynotechniciansListPdfOptions): jsPDF {
  const year = options.year ?? new Date().getFullYear();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  renderCynotechniciansListPages(doc, year, resolveLogoSources(options.logoDataUrl), options.data);
  return doc;
}

export async function downloadCynotechniciansListPdf(
  options: CynotechniciansListPdfOptions,
): Promise<void> {
  const dateISO = new Date().toISOString().slice(0, 10);
  const filename = options.filename ?? `Liste_Fonctionnaires_${dateISO}.pdf`;
  await exportJsPdf(generateCynotechniciansListPdf(options), filename);
}

export async function downloadCynotechniciansListPdfWithLogo(
  options: CynotechniciansListPdfOptions,
): Promise<void> {
  const logoDataUrl = await resolveLogoDataUrl(options);
  await downloadCynotechniciansListPdf({
    ...options,
    logoDataUrl,
  });
}

/** Same engine / template chrome as Feuille de présence — cynotechnical dogs table body. */
export function generateDogsListPdf(options: DogsListPdfOptions): jsPDF {
  const year = options.year ?? new Date().getFullYear();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  renderDogsListPages(doc, year, resolveLogoSources(options.logoDataUrl), options.data);
  return doc;
}

export async function downloadDogsListPdf(options: DogsListPdfOptions): Promise<void> {
  const dateISO = new Date().toISOString().slice(0, 10);
  const filename = options.filename ?? `Liste_Chiens_${dateISO}.pdf`;
  await exportJsPdf(generateDogsListPdf(options), filename);
}

export async function downloadDogsListPdfWithLogo(
  options: DogsListPdfOptions,
): Promise<void> {
  const logoDataUrl = await resolveLogoDataUrl(options);
  await downloadDogsListPdf({
    ...options,
    logoDataUrl,
  });
}
