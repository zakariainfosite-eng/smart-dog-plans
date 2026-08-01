/**
 * Pixel-calibrated layout constants for the official Feuille de Présence (A4 portrait).
 * Measurements derived from the reference scan (768×1024) mapped to 210×297 mm.
 */
import type { jsPDF } from "jspdf";

export const FP_PAGE = { w: 210, h: 297 } as const;

export const FP_MARGIN = {
  left: 11.5,
  right: 11.5,
  top: 7.5,
  bottom: 12,
} as const;

export const FP_CONTENT_W = FP_PAGE.w - FP_MARGIN.left - FP_MARGIN.right;

/** Main attendance table columns — sum equals FP_CONTENT_W (186 mm). */
export const FP_TABLE_COLS = [
  { key: "index", label: "", w: 9.5 },
  { key: "name", label: "NOM ET PRENOM", w: 47.5 },
  { key: "grade", label: "GRADE", w: 16.5 },
  { key: "mle", label: "MLE", w: 16.5 },
  { key: "dog", label: "NOM DU CHIEN", w: 29.5 },
  { key: "assignment", label: "AFFECTATION", w: 21 },
  { key: "hour", label: "HEURE", w: 21 },
  { key: "signature", label: "EMARGEMENT", w: 24.5 },
] as const;

export const FP_TABLE = {
  headerH: 6.8,
  rowH: 7.35,
  narcoticsRows: 13,
  explosivesRows: 6,
  headerFill: [211, 211, 211] as [number, number, number],
  borderWidth: 0.12,
} as const;

export const FP_TYPO = {
  org: { family: "times" as const, style: "normal" as const, size: 7.2 },
  date: { family: "times" as const, style: "normal" as const, size: 7.2 },
  titleMain: { family: "times" as const, style: "bold" as const, size: 15.8 },
  titleSection: { family: "times" as const, style: "bold" as const, size: 13.6 },
  chefLine: { family: "times" as const, style: "bold" as const, size: 9.8 },
  workTitle: { family: "times" as const, style: "bold" as const, size: 8.8 },
  workCell: { family: "times" as const, style: "normal" as const, size: 8.0 },
  sectionTitle: { family: "times" as const, style: "bold" as const, size: 8.8 },
  tableHeader: { family: "helvetica" as const, style: "bold" as const, size: 7.8 },
  rowIndex: { family: "times" as const, style: "bold" as const, size: 8.0 },
  agentName: { family: "times" as const, style: "bold" as const, size: 8.0 },
  footer: { family: "times" as const, style: "bolditalic" as const, size: 10.2 },
  footerBrigade: { family: "times" as const, style: "bolditalic" as const, size: 8.8 },
} as const;

export const FP_LAYOUT = {
  /** Horizontal rule below header band */
  headerRuleY: 41.8,
  /** Title block */
  titleStartY: 44.5,
  titleMainGap: 6.2,
  titleSectionGap: 6.8,
  /** Chef line baseline → work-system box top (~6–8 px visible). */
  chefLineGap: 2.0,
  /** Work-system box (title only — no data row) */
  workBoxTopGap: 0.6,
  workBoxH: 6.2,
  workTitleBaseline: 4.0,
  workTitleUnderline: 4.55,
  /** Work-system box bottom → specialty title band (~6–8 px). */
  workBoxBottomGap: 2.1,
  /** Section title band — twin rules with equal inner padding (mm). */
  sectionTitleBandH: 3.5,
  /** Specialty title band bottom → table header (~4–6 px). */
  sectionTitleBottomGap: 1.6,
  /** Narcotics table bottom → explosives specialty title band (~6–8 px). */
  betweenTablesGap: 2.1,
  /** Logo placement — top centre (~17% smaller than reference scan). */
  logo: { cx: 105, cy: 22, size: 26.5 },
  /** Ministry header — centered lines in the left band (left of the seal). */
  org: {
    /** Inter-line spacing between consecutive header lines (mm). */
    lineLeading: 3.05,
  },
  /** Date line */
  dateY: 9.8,
  /** Dynamic signature block below the last table (mm). */
  signatures: {
    gapAfterTables: 3.5,
    signingSpaceH: 14,
    /** Brigade signature baseline offset below section signature (~12 px). */
    brigadeLabelOffsetY: 3.5,
  },
  /** Minimum free space above footer before page break (mm). */
  contentBottomY: 275,
  /** Attendance-table watermark — same PNG as header, low opacity, drawn before tables. */
  watermark: { opacity: 0.1, areaFill: 0.92 },
} as const;

export const FP_ORG_HEADER_LINES = [
  "ROYAUME DU MAROC",
  "MINISTÈRE DE L'INTÉRIEUR",
  "DIRECTION GÉNÉRALE DE",
  "LA SÛRETÉ NATIONALE",
  "PRÉFECTURE DE POLICE",
  "DE TANGER",
  "DPM TANGER-MED / BPJ",
  "BRIGADE DE LA POLICE",
  "CYNOTECHNIQUE",
] as const;

/** Widest ministry line at the official org font (mm). */
function measureFeuillePresenceOrgBlockWidth(doc: jsPDF): number {
  doc.setFont(FP_TYPO.org.family, FP_TYPO.org.style);
  doc.setFontSize(FP_TYPO.org.size);

  let orgBlockWidth = 0;
  for (const line of FP_ORG_HEADER_LINES) {
    orgBlockWidth = Math.max(orgBlockWidth, doc.getTextWidth(line));
  }
  return orgBlockWidth;
}

/**
 * Horizontal center axis for the ministry block — mirrors the logo↔date gap on the left side.
 * Clamped so the block stays inside the left printable margin.
 */
export function computeFeuillePresenceOrgHeaderCenterX(
  doc: jsPDF,
  dateLine: string,
): number {
  const orgBlockWidth = measureFeuillePresenceOrgBlockWidth(doc);

  doc.setFont(FP_TYPO.date.family, FP_TYPO.date.style);
  doc.setFontSize(FP_TYPO.date.size);
  const dateWidth = doc.getTextWidth(dateLine);

  const logoLeft = FP_LAYOUT.logo.cx - FP_LAYOUT.logo.size / 2;
  const logoRight = FP_LAYOUT.logo.cx + FP_LAYOUT.logo.size / 2;
  const dateAnchorX = FP_PAGE.w - FP_MARGIN.right;
  const dateLeft = dateAnchorX - dateWidth;
  const gap = dateLeft - logoRight;

  const ministryRight = logoLeft - gap;
  const centerX = ministryRight - orgBlockWidth / 2;
  const minCenterX = FP_MARGIN.left + orgBlockWidth / 2;

  return Math.max(centerX, minCenterX);
}

/** First baseline — vertically centers the ministry block in the logo band. */
export function fpOrgHeaderStartY(): number {
  const logoTop = FP_LAYOUT.logo.cy - FP_LAYOUT.logo.size / 2;
  const logoBottom = FP_LAYOUT.logo.cy + FP_LAYOUT.logo.size / 2;
  const { lineLeading } = FP_LAYOUT.org;
  const blockSpan = (FP_ORG_HEADER_LINES.length - 1) * lineLeading;
  const bandCenter = (logoTop + logoBottom) / 2;
  return bandCenter - blockSpan / 2;
}

export const FP_SECTION_NARCOTICS =
  "SPÉCIALITÉ RECHERCHE DES STUPEFIANTS ET BILLETS BANQUE." as const;

export const FP_SECTION_EXPLOSIVES = "SPÉCIALITÉ DÉTECTION DES EXPLOSIFS." as const;

export const FP_POINT_653_ASSIGNMENT = "Point 653" as const;
export const FP_REST_ASSIGNMENT = "REPOS" as const;

export const FP_CHEF_LINE =
  "CHEF DE SECTION .................... GRADE : .................... MLE : ...................." as const;

export const FP_WORK_TITLE = "SYSTÈME DE TRAVAIL : ROULEMENT (12/24)" as const;

export const FP_SIGNATURE_SECTION = "SIGNATURE CHEF SECTION" as const;
export const FP_SIGNATURE_BRIGADE = "SIGNATURE CHEF BRIGADE CYNOTECHNIQUE" as const;

/** Official list title — same typographic scale as FEUILLE DE PRESENCE. */
export const FP_CYNOTECHNICIANS_LIST_TITLE = "LISTE DES CYNOTECHNICIENS" as const;

/**
 * Cynotechnicians list columns — sum equals FP_CONTENT_W (186 mm).
 * Same table metrics (headerH / rowH / fill / borders) as the attendance sheet.
 */
export const FP_CYNOTECHNICIANS_TABLE_COLS = [
  { key: "numero", label: "N°", w: 9 },
  { key: "nom", label: "NOM", w: 30 },
  { key: "prenom", label: "PRÉNOM", w: 28 },
  { key: "matricule", label: "MATRICULE", w: 21 },
  { key: "grade", label: "GRADE", w: 17 },
  { key: "chien", label: "CHIEN AFFECTÉ", w: 28 },
  { key: "specialite", label: "SPÉCIALITÉ", w: 27 },
  { key: "section", label: "SECTION", w: 26 },
] as const;

/** Official list title — same typographic scale as FEUILLE DE PRESENCE. */
export const FP_DOGS_LIST_TITLE = "LISTE DES CHIENS CYNOTECHNIQUES" as const;

/**
 * Cynotechnical dogs list columns — sum equals FP_CONTENT_W (186 mm).
 * Same table metrics (headerH / rowH / fill / borders) as the attendance sheet.
 */
export const FP_DOGS_TABLE_COLS = [
  { key: "numero", label: "N°", w: 9 },
  { key: "nom", label: "NOM DU CHIEN", w: 40 },
  { key: "puce", label: "LA PUCE", w: 30 },
  { key: "race", label: "RACE", w: 30 },
  { key: "specialite", label: "SPÉCIALITÉ", w: 27 },
  { key: "cynotechnicien", label: "CYNOTECHNICIEN AFFECTÉ", w: 50 },
] as const;

/** Bundled official Police Cynotechnique seal (public asset). */
export const FP_OFFICIAL_LOGO_URL = "/assets/police-cynotechnique-logo.png" as const;
