import type { jsPDF } from "jspdf";
import type {
  CynotechnicianListPdfRow,
  CynotechniciansListPdfData,
  CynotechniciansListPdfTable,
  DogListPdfRow,
  DogsListPdfData,
  FeuillePresenceData,
  FeuillePresenceTableRow,
} from "@/lib/documents/feuille-presence-types";
import {
  buildFeuillePresenceLogoAsset,
  computeWatermarkBoxSize,
  drawFeuillePresenceLogoContained,
  type FeuillePresenceLogoAsset,
  type FeuillePresenceLogoSources,
} from "@/lib/documents/feuille-presence-logo";
import {
  FP_CHEF_ADJOINT_REPLACEMENT_TITLE,
  FP_CHEF_MANUAL_FILL_DOTS,
  FP_CHEF_MANUAL_FILL_GRADE_LABEL,
  FP_CHEF_MANUAL_FILL_MLE_LABEL,
  FP_CHEF_MANUAL_FILL_NAME_LABEL,
  FP_CHEF_TITLE,
  FP_CONTENT_W,
  FP_CYNOTECHNICIANS_LIST_TITLE,
  FP_DOGS_LIST_TITLE,
  FP_LAYOUT,
  FP_MARGIN,
  FP_ORG_HEADER_LINES,
  FP_PAGE,
  FP_SECTION_EXPLOSIVES,
  FP_SECTION_NARCOTICS,
  FP_SIGNATURE_BRIGADE,
  FP_SIGNATURE_SECTION,
  FP_TABLE,
  FP_TABLE_COLS,
  FP_TYPO,
  FP_WORK_TITLE,
  computeFeuillePresenceOrgHeaderCenterX,
  fpOrgHeaderStartY,
} from "@/lib/documents/feuille-presence-layout";
import { buildFonctionnaireListTableCols } from "@/lib/reports-messages/fonctionnaire-pdf-table-fields";
import { buildChienListTableCols } from "@/lib/reports-messages/chien-pdf-table-fields";

type FontStyle = "normal" | "bold" | "italic" | "bolditalic";
type OfficialTableCol = { key: string; label: string; w: number };

function drawCellTextCentered(
  doc: jsPDF,
  text: string,
  cx: number,
  cellY: number,
  cellW: number,
  cellH: number,
  family: "times" | "helvetica",
  style: FontStyle,
  size: number,
  maxWidth?: number,
) {
  if (!text) return;
  setTypo(doc, family, style, size);
  const { h: textH } = doc.getTextDimensions(text);
  const textBaselineY = cellY + (cellH + textH) / 2;
  doc.text(text, cx + cellW / 2, textBaselineY, {
    align: "center",
    maxWidth: maxWidth ?? cellW - 1.2,
  });
}

function setTypo(doc: jsPDF, family: "times" | "helvetica", style: FontStyle, size: number) {
  doc.setFont(family, style);
  doc.setFontSize(size);
}

function drawRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fill?: [number, number, number],
) {
  if (fill) {
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.rect(x, y, w, h, "FD");
  } else {
    doc.rect(x, y, w, h, "S");
  }
}

function drawCentered(doc: jsPDF, text: string, cx: number, y: number, maxWidth?: number) {
  doc.text(text, cx, y, maxWidth ? { align: "center", maxWidth } : { align: "center" });
}

export function applyFeuillePresenceDefaults(doc: jsPDF) {
  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(FP_TABLE.borderWidth);
}

export function drawFeuillePresenceHeader(
  doc: jsPDF,
  year: number,
  logoAsset?: FeuillePresenceLogoAsset,
  dateLine?: string,
) {
  const resolvedDateLine = dateLine ?? `TANGER LE .......... / .......... / ${year}`;
  drawFeuillePresenceOrgHeader(doc, resolvedDateLine);

  const { cx, cy, size } = FP_LAYOUT.logo;
  if (logoAsset) {
    try {
      drawFeuillePresenceLogoContained(doc, logoAsset, cx, cy, size, { compression: "NONE" });
    } catch {
      drawLogoPlaceholder(doc, cx, cy, size / 2);
    }
  } else {
    drawLogoPlaceholder(doc, cx, cy, size / 2);
  }

  setTypo(doc, FP_TYPO.date.family, FP_TYPO.date.style, FP_TYPO.date.size);
  doc.text(resolvedDateLine, FP_PAGE.w - FP_MARGIN.right, FP_LAYOUT.dateY, { align: "right" });
}

function drawFeuillePresenceOrgHeader(doc: jsPDF, dateLine: string) {
  const centerX = computeFeuillePresenceOrgHeaderCenterX(doc, dateLine);
  const { lineLeading } = FP_LAYOUT.org;
  const startY = fpOrgHeaderStartY();

  setTypo(doc, FP_TYPO.org.family, FP_TYPO.org.style, FP_TYPO.org.size);

  let y = startY;
  for (const line of FP_ORG_HEADER_LINES) {
    doc.text(line, centerX, y, { align: "center" });
    y += lineLeading;
  }
}

function drawLogoPlaceholder(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setLineWidth(0.28);
  doc.circle(cx, cy, r, "S");
  doc.setLineWidth(0.15);
  doc.circle(cx, cy, r - 1.8, "S");
  setTypo(doc, "helvetica", "normal", 4.8);
  drawCentered(doc, "POLICE", cx, cy + 3.5, r * 1.6);
  drawCentered(doc, "CYNOTECHNIQUE", cx, cy + 6.2, r * 1.6);
  doc.setLineWidth(FP_TABLE.borderWidth);
}

const FP_CHEF_PLACEHOLDER = "....................";

type ChefLineSegment = { text: string; bold: boolean };

function chefTitleForData(data?: FeuillePresenceData): string {
  return data?.chefMode === "adjoint_replacement"
    ? FP_CHEF_ADJOINT_REPLACEMENT_TITLE
    : FP_CHEF_TITLE;
}

function measureChefSegmentsWidth(
  doc: jsPDF,
  segments: ChefLineSegment[],
  family: "times" | "helvetica",
  size: number,
): number {
  let totalW = 0;
  for (const segment of segments) {
    setTypo(doc, family, segment.bold ? "bold" : "normal", size);
    totalW += doc.getTextWidth(segment.text);
  }
  return totalW;
}

function drawChefSegmentsCentered(
  doc: jsPDF,
  segments: ChefLineSegment[],
  centerX: number,
  y: number,
  family: "times" | "helvetica",
  size: number,
) {
  const totalW = measureChefSegmentsWidth(doc, segments, family, size);
  let x = centerX - totalW / 2;
  for (const segment of segments) {
    setTypo(doc, family, segment.bold ? "bold" : "normal", size);
    doc.text(segment.text, x, y);
    x += doc.getTextWidth(segment.text);
  }
}

/**
 * Single-line leadership header when possible:
 *   CHEF DE SECTION : Nom Prénom    Grade : XXX    MLE : XXXXX
 * Falls back to two lines if the full line exceeds content width:
 *   CHEF DE SECTION : Nom Prénom
 *   Grade : XXX    MLE : XXXXX
 */
function drawChefIdentityLine(doc: jsPDF, data: FeuillePresenceData, startY: number): number {
  const title = chefTitleForData(data);
  const name = data.chefName.trim() || FP_CHEF_PLACEHOLDER;
  const grade = data.chefGrade.trim() || FP_CHEF_PLACEHOLDER;
  const mle = data.chefMle.trim() || FP_CHEF_PLACEHOLDER;
  const family = FP_TYPO.chefLine.family;
  const size = FP_TYPO.chefLine.size;
  const maxW = FP_CONTENT_W;

  const titleNameSegments: ChefLineSegment[] = [
    { text: `${title} : `, bold: true },
    { text: name, bold: false },
  ];
  const gradeMleSegments: ChefLineSegment[] = [
    { text: "Grade : ", bold: true },
    { text: grade, bold: false },
    { text: "    MLE : ", bold: true },
    { text: mle, bold: false },
  ];
  const singleLineSegments: ChefLineSegment[] = [
    ...titleNameSegments,
    { text: "    ", bold: false },
    ...gradeMleSegments,
  ];

  const singleW = measureChefSegmentsWidth(doc, singleLineSegments, family, size);
  if (singleW <= maxW) {
    drawChefSegmentsCentered(doc, singleLineSegments, FP_PAGE.w / 2, startY, family, size);
    return startY + FP_LAYOUT.chefLineGap;
  }

  const lineLeading = 3.6;
  drawChefSegmentsCentered(doc, titleNameSegments, FP_PAGE.w / 2, startY, family, size);
  drawChefSegmentsCentered(
    doc,
    gradeMleSegments,
    FP_PAGE.w / 2,
    startY + lineLeading,
    family,
    size,
  );
  return startY + lineLeading + FP_LAYOUT.chefLineGap;
}

export function drawFeuillePresenceTitleBlock(
  doc: jsPDF,
  startY: number,
  data?: FeuillePresenceData,
): number {
  let y = startY;

  setTypo(doc, FP_TYPO.titleMain.family, FP_TYPO.titleMain.style, FP_TYPO.titleMain.size);
  drawCentered(doc, "FEUILLE DE PRESENCE", FP_PAGE.w / 2, y);
  y += FP_LAYOUT.titleMainGap;

  setTypo(doc, FP_TYPO.titleSection.family, FP_TYPO.titleSection.style, FP_TYPO.titleSection.size);
  drawCentered(doc, data?.sectionName ?? "SECTION", FP_PAGE.w / 2, y);
  y += FP_LAYOUT.titleSectionGap;

  if (data?.chefNeedsReplacement || data?.chefMode === "manual_fill") {
    const lineLeading = 3.6;
    setTypo(doc, FP_TYPO.chefLine.family, "bold", FP_TYPO.chefLine.size);
    drawCentered(doc, FP_CHEF_TITLE, FP_PAGE.w / 2, y);
    y += lineLeading;

    const manualRows: Array<{ label: string }> = [
      { label: FP_CHEF_MANUAL_FILL_NAME_LABEL },
      { label: FP_CHEF_MANUAL_FILL_GRADE_LABEL },
      { label: FP_CHEF_MANUAL_FILL_MLE_LABEL },
    ];
    for (const row of manualRows) {
      setTypo(doc, FP_TYPO.chefLine.family, "bold", FP_TYPO.chefLine.size);
      drawCentered(doc, row.label, FP_PAGE.w / 2, y);
      y += lineLeading * 0.85;
      setTypo(doc, FP_TYPO.chefLine.family, "normal", FP_TYPO.chefLine.size);
      drawCentered(doc, FP_CHEF_MANUAL_FILL_DOTS, FP_PAGE.w / 2, y);
      y += lineLeading;
    }
    y += FP_LAYOUT.chefLineGap;
    return y;
  }

  if (!data) {
    drawChefSegmentsCentered(
      doc,
      [
        { text: `${FP_CHEF_TITLE} : `, bold: true },
        { text: FP_CHEF_PLACEHOLDER, bold: false },
        { text: "    Grade : ", bold: true },
        { text: FP_CHEF_PLACEHOLDER, bold: false },
        { text: "    MLE : ", bold: true },
        { text: FP_CHEF_PLACEHOLDER, bold: false },
      ],
      FP_PAGE.w / 2,
      y,
      FP_TYPO.chefLine.family,
      FP_TYPO.chefLine.size,
    );
    return y + FP_LAYOUT.chefLineGap;
  }

  return drawChefIdentityLine(doc, data, y);
}

export function drawFeuillePresenceWorkSystem(doc: jsPDF, startY: number): number {
  const x = FP_MARGIN.left;
  const y = startY + FP_LAYOUT.workBoxTopGap;
  const boxH = FP_LAYOUT.workBoxH;

  doc.setLineWidth(FP_TABLE.borderWidth);
  doc.rect(x, y, FP_CONTENT_W, boxH);

  setTypo(doc, FP_TYPO.workTitle.family, FP_TYPO.workTitle.style, FP_TYPO.workTitle.size);
  const titleW = doc.getTextWidth(FP_WORK_TITLE);
  const titleX = (FP_PAGE.w - titleW) / 2;
  doc.text(FP_WORK_TITLE, titleX, y + FP_LAYOUT.workTitleBaseline);
  doc.setLineWidth(0.1);
  doc.line(
    titleX,
    y + FP_LAYOUT.workTitleUnderline,
    titleX + titleW,
    y + FP_LAYOUT.workTitleUnderline,
  );
  doc.setLineWidth(FP_TABLE.borderWidth);

  return y + boxH + FP_LAYOUT.workBoxBottomGap;
}

export function drawFeuillePresenceSectionTitle(doc: jsPDF, title: string, y: number): number {
  const centerX = FP_MARGIN.left + FP_CONTENT_W / 2;

  setTypo(doc, FP_TYPO.sectionTitle.family, FP_TYPO.sectionTitle.style, FP_TYPO.sectionTitle.size);
  const { h: textH } = doc.getTextDimensions(title);
  const textBaselineY = y + (FP_LAYOUT.sectionTitleBandH - textH) / 2 + textH;
  doc.text(title, centerX, textBaselineY, { align: "center" });

  return y + FP_LAYOUT.sectionTitleBandH + FP_LAYOUT.sectionTitleBottomGap;
}

function drawOfficialTableHeader(
  doc: jsPDF,
  x: number,
  y: number,
  cols: readonly OfficialTableCol[],
) {
  let cx = x;
  setTypo(doc, FP_TYPO.tableHeader.family, FP_TYPO.tableHeader.style, FP_TYPO.tableHeader.size);
  for (const col of cols) {
    drawRect(doc, cx, y, col.w, FP_TABLE.headerH, FP_TABLE.headerFill);
    if (col.label) {
      doc.text(col.label, cx + col.w / 2, y + FP_TABLE.headerH / 2 + 0.9, {
        align: "center",
        maxWidth: col.w - 1.2,
      });
    }
    cx += col.w;
  }
}

function drawTableHeader(doc: jsPDF, x: number, y: number) {
  drawOfficialTableHeader(doc, x, y, FP_TABLE_COLS);
}

function drawBlankTableRows(doc: jsPDF, x: number, startY: number, rowCount: number): number {
  let y = startY;
  for (let i = 0; i < rowCount; i += 1) {
    let cx = x;
    const rowNum = `${String(i + 1).padStart(2, "0")}.`;
    for (const col of FP_TABLE_COLS) {
      drawRect(doc, cx, y, col.w, FP_TABLE.rowH);
      if (col.key === "index") {
        drawCellTextCentered(
          doc,
          rowNum,
          cx,
          y,
          col.w,
          FP_TABLE.rowH,
          FP_TYPO.rowIndex.family,
          FP_TYPO.rowIndex.style,
          FP_TYPO.rowIndex.size,
        );
      }
      cx += col.w;
    }
    y += FP_TABLE.rowH;
  }
  return y;
}

function drawPopulatedTableRows(
  doc: jsPDF,
  x: number,
  startY: number,
  rows: FeuillePresenceTableRow[],
): number {
  let y = startY;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNum = `${String(i + 1).padStart(2, "0")}.`;
    let cx = x;
    for (const col of FP_TABLE_COLS) {
      drawRect(doc, cx, y, col.w, FP_TABLE.rowH);
      if (col.key === "index") {
        drawCellTextCentered(
          doc,
          rowNum,
          cx,
          y,
          col.w,
          FP_TABLE.rowH,
          FP_TYPO.rowIndex.family,
          FP_TYPO.rowIndex.style,
          FP_TYPO.rowIndex.size,
        );
      } else if (col.key === "name") {
        drawCellTextCentered(
          doc,
          row.fullName,
          cx,
          y,
          col.w,
          FP_TABLE.rowH,
          FP_TYPO.agentName.family,
          FP_TYPO.agentName.style,
          FP_TYPO.agentName.size,
          col.w - 1.4,
        );
      } else if (col.key === "grade") {
        drawCellTextCentered(
          doc,
          row.grade,
          cx,
          y,
          col.w,
          FP_TABLE.rowH,
          FP_TYPO.workCell.family,
          FP_TYPO.workCell.style,
          FP_TYPO.workCell.size,
        );
      } else if (col.key === "mle") {
        drawCellTextCentered(
          doc,
          row.mle,
          cx,
          y,
          col.w,
          FP_TABLE.rowH,
          FP_TYPO.workCell.family,
          FP_TYPO.workCell.style,
          FP_TYPO.workCell.size,
        );
      } else if (col.key === "dog") {
        drawCellTextCentered(
          doc,
          row.dogName,
          cx,
          y,
          col.w,
          FP_TABLE.rowH,
          FP_TYPO.workCell.family,
          FP_TYPO.workCell.style,
          FP_TYPO.workCell.size,
          col.w - 1.4,
        );
      } else if (col.key === "hour") {
        drawCellTextCentered(
          doc,
          row.hour,
          cx,
          y,
          col.w,
          FP_TABLE.rowH,
          FP_TYPO.workCell.family,
          FP_TYPO.workCell.style,
          FP_TYPO.workCell.size,
        );
      } else if (col.key === "assignment") {
        drawCellTextCentered(
          doc,
          row.assignment,
          cx,
          y,
          col.w,
          FP_TABLE.rowH,
          FP_TYPO.workCell.family,
          FP_TYPO.workCell.style,
          FP_TYPO.workCell.size,
          col.w - 1.4,
        );
      } else if (col.key === "signature") {
        drawCellTextCentered(
          doc,
          row.signature,
          cx,
          y,
          col.w,
          FP_TABLE.rowH,
          FP_TYPO.workCell.family,
          FP_TYPO.workCell.style,
          FP_TYPO.workCell.size,
        );
      }
      cx += col.w;
    }
    y += FP_TABLE.rowH;
  }
  return y;
}

export function drawFeuillePresenceNarcoticsTable(
  doc: jsPDF,
  startY: number,
  rows?: FeuillePresenceTableRow[],
): number {
  const x = FP_MARGIN.left;
  let y = startY;
  drawTableHeader(doc, x, y);
  y += FP_TABLE.headerH;
  if (rows) {
    return drawPopulatedTableRows(doc, x, y, rows);
  }
  return drawBlankTableRows(doc, x, y, FP_TABLE.narcoticsRows);
}

export function drawFeuillePresenceExplosivesTable(
  doc: jsPDF,
  startY: number,
  rows?: FeuillePresenceTableRow[],
): number {
  if (rows) {
    return drawPopulatedTableRows(doc, FP_MARGIN.left, startY, rows);
  }
  return drawBlankTableRows(doc, FP_MARGIN.left, startY, FP_TABLE.explosivesRows);
}

export function drawFeuillePresenceSignatures(doc: jsPDF, tablesBottomY: number) {
  const { gapAfterTables, signingSpaceH, brigadeLabelOffsetY } = FP_LAYOUT.signatures;
  const labelY = tablesBottomY + gapAfterTables + signingSpaceH;

  setTypo(doc, FP_TYPO.footer.family, FP_TYPO.footer.style, FP_TYPO.footer.size);
  doc.text(FP_SIGNATURE_SECTION, FP_MARGIN.left, labelY);

  setTypo(
    doc,
    FP_TYPO.footerBrigade.family,
    FP_TYPO.footerBrigade.style,
    FP_TYPO.footerBrigade.size,
  );
  doc.text(FP_SIGNATURE_BRIGADE, FP_PAGE.w - FP_MARGIN.right, labelY + brigadeLabelOffsetY, {
    align: "right",
  });
}

function drawFeuillePresenceTableWatermark(
  doc: jsPDF,
  logoAsset: FeuillePresenceLogoAsset | undefined,
  topY: number,
  bottomY: number,
) {
  if (!logoAsset) return;

  const centerX = FP_MARGIN.left + FP_CONTENT_W / 2;
  const centerY = (topY + bottomY) / 2;
  const regionW = FP_CONTENT_W;
  const regionH = bottomY - topY;
  const boxSize = computeWatermarkBoxSize(regionW, regionH, FP_LAYOUT.watermark.areaFill);

  try {
    drawFeuillePresenceLogoContained(doc, logoAsset, centerX, centerY, boxSize, {
      opacity: FP_LAYOUT.watermark.opacity,
      compression: "NONE",
    });
  } catch {
    // Watermark is optional — header seal still renders.
  }
}

function drawFeuillePresencePageWatermark(
  doc: jsPDF,
  logoAsset: FeuillePresenceLogoAsset | undefined,
) {
  if (!logoAsset) return;

  try {
    drawFeuillePresenceLogoContained(
      doc,
      logoAsset,
      FP_PAGE.w / 2,
      FP_PAGE.h / 2,
      FP_LAYOUT.pageWatermark.boxSize,
      {
        opacity: FP_LAYOUT.pageWatermark.opacity,
        compression: "NONE",
      },
    );
  } catch {
    // Watermark is optional — the unchanged header seal still renders.
  }
}

export function renderFeuillePresencePage(
  doc: jsPDF,
  year: number,
  logos?: FeuillePresenceLogoSources,
  data?: FeuillePresenceData,
) {
  applyFeuillePresenceDefaults(doc);
  const headerAsset = logos?.header ? buildFeuillePresenceLogoAsset(doc, logos.header) : undefined;

  // Draw first so the watermark remains behind every title, table and signature.
  drawFeuillePresencePageWatermark(doc, headerAsset);
  drawFeuillePresenceHeader(doc, year, headerAsset, data?.dateLine);

  let y: number = FP_LAYOUT.titleStartY;
  y = drawFeuillePresenceTitleBlock(doc, y, data);
  y = drawFeuillePresenceWorkSystem(doc, y);
  y = drawFeuillePresenceSectionTitle(doc, FP_SECTION_NARCOTICS, y);

  y = drawFeuillePresenceNarcoticsTable(doc, y, data?.narcoticsRows);
  y += FP_LAYOUT.betweenTablesGap;
  y = drawFeuillePresenceSectionTitle(doc, FP_SECTION_EXPLOSIVES, y);
  y = drawFeuillePresenceExplosivesTable(doc, y, data?.explosivesRows);

  drawFeuillePresenceSignatures(doc, y);
}

function drawCynotechniciansListTitle(doc: jsPDF, startY: number): number {
  setTypo(doc, FP_TYPO.titleMain.family, FP_TYPO.titleMain.style, FP_TYPO.titleMain.size);
  drawCentered(doc, FP_CYNOTECHNICIANS_LIST_TITLE, FP_PAGE.w / 2, startY);
  return startY + FP_LAYOUT.titleMainGap + FP_LAYOUT.sectionTitleBottomGap;
}

function cellValueForCynotechnician(row: CynotechnicianListPdfRow, key: string): string {
  switch (key) {
    case "numero":
      return String(row.numero);
    case "lastName":
    case "nom":
      return row.nom;
    case "firstName":
    case "prenom":
      return row.prenom;
    case "fullName":
      return row.fullName;
    case "matricule":
      return row.matricule;
    case "grade":
      return row.grade;
    case "fonction":
      return row.fonction;
    case "situation":
      return row.situation;
    case "dogName":
    case "chien":
      return row.chien;
    case "specialty":
    case "specialite":
      return row.specialite;
    case "section":
      return row.section;
    case "gender":
      return row.gender;
    case "dateOfBirth":
      return row.dateOfBirth;
    case "origine":
      return row.origine;
    case "phone":
      return row.phone;
    case "maritalStatus":
      return row.maritalStatus;
    case "address":
      return row.address;
    default:
      return "";
  }
}

function personnelListColumns(
  data: CynotechniciansListPdfData,
  table?: CynotechniciansListPdfTable,
): readonly OfficialTableCol[] {
  if (table?.columns && table.columns.length > 0) return table.columns;
  if (data.columns.length > 0) return data.columns;
  return buildFonctionnaireListTableCols(
    undefined,
    FP_CONTENT_W,
    { includeCynotechnical: table?.layout !== "administrative" },
  );
}

function drawCynotechniciansTableRows(
  doc: jsPDF,
  x: number,
  startY: number,
  rows: CynotechnicianListPdfRow[],
  cols: readonly OfficialTableCol[],
): number {
  let y = startY;
  for (const row of rows) {
    let cx = x;
    for (const col of cols) {
      drawRect(doc, cx, y, col.w, FP_TABLE.rowH);
      const value = cellValueForCynotechnician(row, col.key);
      const isNumeroCol = col.key === "numero";
      const isNameCol =
        col.key === "nom" ||
        col.key === "prenom" ||
        col.key === "lastName" ||
        col.key === "firstName" ||
        col.key === "fullName";
      drawCellTextCentered(
        doc,
        value,
        cx,
        y,
        col.w,
        FP_TABLE.rowH,
        isNumeroCol
          ? FP_TYPO.rowIndex.family
          : isNameCol
            ? FP_TYPO.agentName.family
            : FP_TYPO.workCell.family,
        isNumeroCol
          ? FP_TYPO.rowIndex.style
          : isNameCol
            ? FP_TYPO.agentName.style
            : FP_TYPO.workCell.style,
        isNumeroCol
          ? FP_TYPO.rowIndex.size
          : isNameCol
            ? FP_TYPO.agentName.size
            : FP_TYPO.workCell.size,
        col.w - 1.4,
      );
      cx += col.w;
    }
    y += FP_TABLE.rowH;
  }
  return y;
}

function personnelListTableHeaderHeight(hasTitle: boolean): number {
  const titleH = hasTitle ? FP_LAYOUT.sectionTitleBandH + FP_LAYOUT.sectionTitleBottomGap : 0;
  return titleH + FP_TABLE.headerH;
}

/**
 * Official personnel list — reuses Feuille de présence header, logo,
 * fonts, margins, table metrics and watermark. No signature block.
 * Exactly two tables max: administrative/command, then Cynotechniciens.
 */
export function renderCynotechniciansListPages(
  doc: jsPDF,
  year: number,
  logos: FeuillePresenceLogoSources | undefined,
  data: CynotechniciansListPdfData,
) {
  applyFeuillePresenceDefaults(doc);
  const headerAsset = logos?.header ? buildFeuillePresenceLogoAsset(doc, logos.header) : undefined;

  const pageBottomLimit = FP_LAYOUT.contentBottomY;
  const tables = data.tables;

  let tableIndex = 0;
  let rowIndexInTable = 0;
  let pageIndex = 0;
  let y = 0;

  const startPage = () => {
    if (pageIndex > 0) {
      doc.addPage();
      applyFeuillePresenceDefaults(doc);
    }
    drawFeuillePresenceHeader(doc, year, headerAsset, data.dateLine);
    y = drawCynotechniciansListTitle(doc, FP_LAYOUT.titleStartY);
    pageIndex += 1;
  };

  startPage();

  if (tables.length === 0) {
    return;
  }

  while (tableIndex < tables.length) {
    const table = tables[tableIndex]!;
    const isContinuation = rowIndexInTable > 0;
    const hasTitle = table.title.trim().length > 0;
    const headerH = personnelListTableHeaderHeight(hasTitle);

    if (y + headerH + FP_TABLE.rowH > pageBottomLimit) {
      startPage();
    }

    if (hasTitle) {
      const sectionTitle = isContinuation ? `${table.title} (suite)` : table.title;
      y = drawFeuillePresenceSectionTitle(doc, sectionTitle, y);
    }

    const tableCols = personnelListColumns(data, table);
    const tableTopY = y;
    drawOfficialTableHeader(doc, FP_MARGIN.left, y, tableCols);
    y += FP_TABLE.headerH;

    const chunk: CynotechnicianListPdfRow[] = [];
    while (rowIndexInTable < table.rows.length) {
      const nextY = y + (chunk.length + 1) * FP_TABLE.rowH;
      if (nextY > pageBottomLimit && chunk.length > 0) break;
      if (nextY > pageBottomLimit && chunk.length === 0) {
        chunk.push(table.rows[rowIndexInTable]!);
        rowIndexInTable += 1;
        break;
      }
      chunk.push(table.rows[rowIndexInTable]!);
      rowIndexInTable += 1;
    }

    const tableBottomY = y + Math.max(chunk.length, 1) * FP_TABLE.rowH;
    drawFeuillePresenceTableWatermark(doc, headerAsset, tableTopY, tableBottomY);
    y = drawCynotechniciansTableRows(doc, FP_MARGIN.left, y, chunk, tableCols);

    if (rowIndexInTable < table.rows.length) {
      startPage();
      continue;
    }

    tableIndex += 1;
    rowIndexInTable = 0;

    if (tableIndex < tables.length) {
      y += FP_LAYOUT.betweenTablesGap;
      const next = tables[tableIndex]!;
      const nextHeaderH = personnelListTableHeaderHeight(next.title.trim().length > 0);
      if (y + nextHeaderH + FP_TABLE.rowH > pageBottomLimit) {
        startPage();
      }
    }
  }
}

function drawDogsListTitle(doc: jsPDF, startY: number): number {
  setTypo(doc, FP_TYPO.titleMain.family, FP_TYPO.titleMain.style, FP_TYPO.titleMain.size);
  drawCentered(doc, FP_DOGS_LIST_TITLE, FP_PAGE.w / 2, startY);
  return startY + FP_LAYOUT.titleMainGap + FP_LAYOUT.sectionTitleBottomGap;
}

function cellValueForDog(row: DogListPdfRow, key: string): string {
  switch (key) {
    case "dogName":
      return row.nom;
    case "microchip":
      return row.puce;
    case "handlerName":
      return row.cynotechnicien;
    case "handlerMatricule":
      return row.handlerMatricule;
    case "handlerGrade":
      return row.handlerGrade;
    case "specialty":
      return row.specialite;
    case "breed":
      return row.race;
    case "gender":
      return row.sexe;
    case "age":
      return row.age;
    case "dateOfBirth":
      return row.dateOfBirth;
    case "section":
      return row.section;
    case "status":
      return row.status;
    case "assignmentDate":
      return row.assignmentDate;
    case "detectionType":
      return row.detectionType;
    default:
      return "";
  }
}

type DogsCellFont = {
  family: "times" | "helvetica";
  style: FontStyle;
  size: number;
};

const DOGS_TABLE_FONT = {
  header: { family: "helvetica", style: "bold", size: 6.6 } as DogsCellFont,
  body: { family: "times", style: "normal", size: 7.0 } as DogsCellFont,
  name: { family: "times", style: "bold", size: 7.0 } as DogsCellFont,
};

const DOGS_TABLE_METRICS = {
  headerMinH: 5.8,
  rowMinH: 6.2,
  headerPad: 0.8,
  rowPad: 0.95,
  maxLines: 3,
  minFont: 5.8,
};

function dogsBodyCellFont(key: string): DogsCellFont {
  return key === "dogName" || key === "handlerName" ? DOGS_TABLE_FONT.name : DOGS_TABLE_FONT.body;
}

function dogsListColumns(doc: jsPDF, data: DogsListPdfData): OfficialTableCol[] {
  const source =
    data.columns.length > 0 ? data.columns : buildChienListTableCols(undefined, FP_CONTENT_W);

  const longestTokenWidth = (text: string) => {
    const tokens = text.split(/[\s\/]+/).filter((token) => token.length > 0);
    let max = 0;
    for (const token of tokens) {
      max = Math.max(max, doc.getTextWidth(token));
    }
    return max;
  };

  const preferred = source.map((col) => {
    setTypo(doc, DOGS_TABLE_FONT.header.family, DOGS_TABLE_FONT.header.style, DOGS_TABLE_FONT.header.size);
    let need = longestTokenWidth(col.label);
    const font = dogsBodyCellFont(col.key);
    setTypo(doc, font.family, font.style, font.size);
    need = Math.max(need, longestTokenWidth(col.label));
    for (const row of data.rows) {
      const value = cellValueForDog(row, col.key);
      need = Math.max(need, Math.min(doc.getTextWidth(value), 28), longestTokenWidth(value));
    }
    return Math.max(8.5, need + 1.6);
  });

  const sum = preferred.reduce((acc, width) => acc + width, 0);
  const widths = preferred.map((width) => Math.round(((width / sum) * FP_CONTENT_W) * 10) / 10);
  const drift = Math.round((FP_CONTENT_W - widths.reduce((acc, width) => acc + width, 0)) * 10) / 10;
  widths[widths.length - 1] = Math.round(((widths[widths.length - 1] ?? 0) + drift) * 10) / 10;
  return source.map((col, index) => ({ key: col.key, label: col.label, w: widths[index] ?? col.w }));
}

function dogsCellMaxWidth(colW: number): number {
  return Math.max(colW - 1.4, 2);
}

function mmBaselineGap(doc: jsPDF): number {
  return (doc.getFontSize() * Number(doc.getLineHeightFactor()) * 25.4) / 72;
}

type FittedDogsCell = {
  lines: string[];
  font: DogsCellFont;
};

function forceWrapToWidth(doc: jsPDF, value: string, maxWidth: number): string[] {
  const wrapped = doc.splitTextToSize(value, maxWidth);
  const lines: string[] = [];
  for (const line of wrapped) {
    if (doc.getTextWidth(line) <= maxWidth + 0.05) {
      lines.push(line);
      continue;
    }
    let current = "";
    for (const ch of line) {
      const trial = current + ch;
      if (current.length > 0 && doc.getTextWidth(trial) > maxWidth) {
        lines.push(current);
        current = ch;
      } else {
        current = trial;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function wrapAtNaturalBreaks(doc: jsPDF, value: string, maxWidth: number): string[] {
  if (doc.getTextWidth(value) <= maxWidth) return [value];
  const tokens = value.split(/(\s+|\/)/).filter((token) => token.length > 0);
  const lines: string[] = [];
  let current = "";
  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) lines.push(trimmed);
    current = "";
  };
  for (const token of tokens) {
    const trial = current + token;
    if (current && doc.getTextWidth(trial.trim()) > maxWidth) {
      flush();
      current = token.trimStart();
    } else {
      current = trial;
    }
  }
  flush();
  return lines.length > 0 ? lines : [value];
}

function wrapDogsValue(doc: jsPDF, value: string, maxWidth: number): string[] {
  if (doc.getTextWidth(value) <= maxWidth) return [value];
  const ageParts = value.match(/^(\d+\s+ANS)\s+(\d+\s+MOIS)$/i);
  if (ageParts) {
    const first = ageParts[1];
    const second = ageParts[2];
    if (doc.getTextWidth(first) <= maxWidth && doc.getTextWidth(second) <= maxWidth) {
      return [first, second];
    }
  }
  const natural = wrapAtNaturalBreaks(doc, value, maxWidth);
  if (natural.every((line) => doc.getTextWidth(line) <= maxWidth + 0.05)) return natural;
  return forceWrapToWidth(doc, value, maxWidth);
}

function fitDogsCell(doc: jsPDF, text: string, colW: number, font: DogsCellFont): FittedDogsCell {
  const value = text.trim();
  if (!value) return { lines: [], font };
  const maxWidth = dogsCellMaxWidth(colW);

  const widthAt = (size: number) => {
    setTypo(doc, font.family, font.style, size);
    return doc.getTextWidth(value);
  };

  if (widthAt(font.size) <= maxWidth) return { lines: [value], font };

  for (let size = font.size - 0.3; size >= DOGS_TABLE_METRICS.minFont; size -= 0.3) {
    const next = Math.round(size * 10) / 10;
    if (widthAt(next) <= maxWidth) {
      return { lines: [value], font: { ...font, size: next } };
    }
  }

  const tryWrap = (size: number): FittedDogsCell => {
    const next = { ...font, size };
    setTypo(doc, next.family, next.style, next.size);
    return { lines: wrapDogsValue(doc, value, maxWidth), font: next };
  };

  let fitted = tryWrap(font.size);
  if (fitted.lines.length <= DOGS_TABLE_METRICS.maxLines) return fitted;
  for (let size = font.size - 0.3; size >= DOGS_TABLE_METRICS.minFont; size -= 0.3) {
    fitted = tryWrap(Math.round(size * 10) / 10);
    if (fitted.lines.length <= DOGS_TABLE_METRICS.maxLines) return fitted;
  }
  return fitted;
}

function wrappedTextBlock(
  doc: jsPDF,
  lines: string[],
  font: DogsCellFont,
): { textH: number; lineBox: number; blockH: number } {
  setTypo(doc, font.family, font.style, font.size);
  const sample = lines[0] ?? "Hg";
  const { h: textH } = doc.getTextDimensions(sample);
  const lineBox = Math.max(mmBaselineGap(doc), textH * 1.18);
  const blockH = lines.length === 0 ? 0 : lines.length * lineBox;
  return { textH, lineBox, blockH };
}

function drawWrappedCellText(
  doc: jsPDF,
  lines: string[],
  cx: number,
  cellY: number,
  cellW: number,
  cellH: number,
  font: DogsCellFont,
) {
  if (lines.length === 0) return;
  const { textH, lineBox, blockH } = wrappedTextBlock(doc, lines, font);
  let baseline = cellY + (cellH - blockH) / 2 + (lineBox + textH) / 2;
  setTypo(doc, font.family, font.style, font.size);
  for (const line of lines) {
    doc.text(line, cx + cellW / 2, baseline, { align: "center" });
    baseline += lineBox;
  }
}

function dogsHeaderHeight(doc: jsPDF, cols: readonly OfficialTableCol[]): number {
  let needed = DOGS_TABLE_METRICS.headerMinH;
  for (const col of cols) {
    const fitted = fitDogsCell(doc, col.label, col.w, DOGS_TABLE_FONT.header);
    const { blockH } = wrappedTextBlock(doc, fitted.lines, fitted.font);
    needed = Math.max(needed, blockH + DOGS_TABLE_METRICS.headerPad * 2);
  }
  return Math.round(needed * 10) / 10;
}

function dogsRowHeight(
  doc: jsPDF,
  row: DogListPdfRow,
  cols: readonly OfficialTableCol[],
): number {
  let needed = DOGS_TABLE_METRICS.rowMinH;
  for (const col of cols) {
    const fitted = fitDogsCell(doc, cellValueForDog(row, col.key), col.w, dogsBodyCellFont(col.key));
    const { blockH } = wrappedTextBlock(doc, fitted.lines, fitted.font);
    needed = Math.max(needed, blockH + DOGS_TABLE_METRICS.rowPad * 2);
  }
  return Math.round(needed * 10) / 10;
}

function drawDogsTableHeader(
  doc: jsPDF,
  x: number,
  y: number,
  cols: readonly OfficialTableCol[],
  headerH: number,
) {
  let cx = x;
  for (const col of cols) {
    drawRect(doc, cx, y, col.w, headerH, FP_TABLE.headerFill);
    const fitted = fitDogsCell(doc, col.label, col.w, DOGS_TABLE_FONT.header);
    drawWrappedCellText(doc, fitted.lines, cx, y, col.w, headerH, fitted.font);
    cx += col.w;
  }
}

function drawDogsTableRows(
  doc: jsPDF,
  x: number,
  startY: number,
  rows: Array<{ row: DogListPdfRow; h: number }>,
  cols: readonly OfficialTableCol[],
): number {
  let y = startY;
  for (const { row, h } of rows) {
    let cx = x;
    for (const col of cols) {
      drawRect(doc, cx, y, col.w, h);
      const fitted = fitDogsCell(doc, cellValueForDog(row, col.key), col.w, dogsBodyCellFont(col.key));
      drawWrappedCellText(doc, fitted.lines, cx, y, col.w, h, fitted.font);
      cx += col.w;
    }
    y += h;
  }
  return y;
}

/**
 * Official dogs list — reuses Feuille de présence / Fonctionnaires header, logo,
 * fonts, margins, table metrics and watermark. No signature block.
 * Continues onto additional pages with a repeated official header.
 */
export function renderDogsListPages(
  doc: jsPDF,
  year: number,
  logos: FeuillePresenceLogoSources | undefined,
  data: DogsListPdfData,
) {
  applyFeuillePresenceDefaults(doc);
  const headerAsset = logos?.header ? buildFeuillePresenceLogoAsset(doc, logos.header) : undefined;
  const tableCols = dogsListColumns(doc, data);
  const headerH = dogsHeaderHeight(doc, tableCols);
  const pageBottomLimit = FP_LAYOUT.contentBottomY;
  const rows = data.rows;
  let rowIndex = 0;
  let pageIndex = 0;

  do {
    if (pageIndex > 0) {
      doc.addPage();
      applyFeuillePresenceDefaults(doc);
    }

    drawFeuillePresenceHeader(doc, year, headerAsset, data.dateLine);
    let y = drawDogsListTitle(doc, FP_LAYOUT.titleStartY);

    const tableTopY = y;
    drawDogsTableHeader(doc, FP_MARGIN.left, y, tableCols, headerH);
    y += headerH;

    const chunk: Array<{ row: DogListPdfRow; h: number }> = [];
    let chunkH = 0;
    while (rowIndex < rows.length) {
      const row = rows[rowIndex]!;
      const h = dogsRowHeight(doc, row, tableCols);
      if (y + chunkH + h > pageBottomLimit && chunk.length > 0) break;
      if (y + chunkH + h > pageBottomLimit && chunk.length === 0) {
        chunk.push({ row, h });
        rowIndex += 1;
        break;
      }
      chunk.push({ row, h });
      chunkH += h;
      rowIndex += 1;
    }

    const tableBottomY = y + Math.max(chunkH, FP_TABLE.rowH);
    drawFeuillePresenceTableWatermark(doc, headerAsset, tableTopY, tableBottomY);
    drawDogsTableRows(doc, FP_MARGIN.left, y, chunk, tableCols);

    pageIndex += 1;
  } while (rowIndex < rows.length);
}
