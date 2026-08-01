import { jsPDF } from "jspdf";
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

/** Official K9 attendance sheet — A4 portrait blank template. */
export type FeuillePresenceOptions = {
  year?: number;
  filename?: string;
  /** Populated attendance data from validated planning. */
  data?: FeuillePresenceData;
  /** Original PNG bytes or data URL — used for header seal and table watermark. */
  logoDataUrl?: string | Uint8Array;
};

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
  renderFeuillePresencePage(doc, year, resolveLogoSources(options.logoDataUrl), options.data);
  return doc;
}

export function downloadFeuillePresencePdf(options: FeuillePresenceOptions = {}): void {
  const year = options.year ?? new Date().getFullYear();
  const filename = options.filename ?? `feuille-presence-${year}.pdf`;
  generateFeuillePresencePdf(options).save(filename);
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

export async function downloadFeuillePresencePdfWithLogo(
  options: FeuillePresenceOptions & { logoUrl?: string } = {},
): Promise<void> {
  if (options.logoDataUrl) {
    downloadFeuillePresencePdf(options);
    return;
  }

  const logos = await loadFeuillePresenceLogos(options.logoUrl ?? FP_OFFICIAL_LOGO_URL);
  downloadFeuillePresencePdf({
    ...options,
    logoDataUrl: logos.header,
  });
}

export async function generateFeuillePresencePdfWithLogo(
  options: FeuillePresenceOptions & { logoUrl?: string } = {},
): Promise<jsPDF> {
  if (options.logoDataUrl) {
    return generateFeuillePresencePdf(options);
  }

  const logos = await loadFeuillePresenceLogos(options.logoUrl ?? FP_OFFICIAL_LOGO_URL);
  return generateFeuillePresencePdf({
    ...options,
    logoDataUrl: logos.header,
  });
}

/** Same engine / template chrome as Feuille de présence — cynotechnicians table body. */
export function generateCynotechniciansListPdf(options: CynotechniciansListPdfOptions): jsPDF {
  const year = options.year ?? new Date().getFullYear();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  renderCynotechniciansListPages(doc, year, resolveLogoSources(options.logoDataUrl), options.data);
  return doc;
}

export function downloadCynotechniciansListPdf(options: CynotechniciansListPdfOptions): void {
  const dateISO = new Date().toISOString().slice(0, 10);
  const filename = options.filename ?? `Liste_Cynotechniciens_${dateISO}.pdf`;
  generateCynotechniciansListPdf(options).save(filename);
}

export async function downloadCynotechniciansListPdfWithLogo(
  options: CynotechniciansListPdfOptions,
): Promise<void> {
  if (options.logoDataUrl) {
    downloadCynotechniciansListPdf(options);
    return;
  }

  const logos = await loadFeuillePresenceLogos(options.logoUrl ?? FP_OFFICIAL_LOGO_URL);
  downloadCynotechniciansListPdf({
    ...options,
    logoDataUrl: logos.header,
  });
}

/** Same engine / template chrome as Feuille de présence — cynotechnical dogs table body. */
export function generateDogsListPdf(options: DogsListPdfOptions): jsPDF {
  const year = options.year ?? new Date().getFullYear();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  renderDogsListPages(doc, year, resolveLogoSources(options.logoDataUrl), options.data);
  return doc;
}

export function downloadDogsListPdf(options: DogsListPdfOptions): void {
  const dateISO = new Date().toISOString().slice(0, 10);
  const filename = options.filename ?? `Liste_Chiens_Cynotechniques_${dateISO}.pdf`;
  generateDogsListPdf(options).save(filename);
}

export async function downloadDogsListPdfWithLogo(
  options: DogsListPdfOptions,
): Promise<void> {
  if (options.logoDataUrl) {
    downloadDogsListPdf(options);
    return;
  }

  const logos = await loadFeuillePresenceLogos(options.logoUrl ?? FP_OFFICIAL_LOGO_URL);
  downloadDogsListPdf({
    ...options,
    logoDataUrl: logos.header,
  });
}
