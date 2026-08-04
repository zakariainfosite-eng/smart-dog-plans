import { Buffer } from "buffer";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  convertMillimetersToTwip,
} from "docx";
import {
  assertDocxZipMagic,
  toZipSafeUint8Array,
} from "@/lib/documents/docx-binary";
import {
  FP_CONTENT_W,
  FP_LAYOUT,
  FP_MARGIN,
  FP_OFFICIAL_LOGO_URL,
  FP_ORG_HEADER_LINES,
  FP_SECTION_EXPLOSIVES,
  FP_SECTION_NARCOTICS,
  FP_SIGNATURE_BRIGADE,
  FP_SIGNATURE_SECTION,
  FP_TABLE,
  FP_TABLE_COLS,
  FP_WORK_TITLE,
} from "@/lib/documents/feuille-presence-layout";
import { computeWatermarkBoxSize, fitLogoInSquareBox } from "@/lib/documents/feuille-presence-logo";
import type { FeuillePresenceData, FeuillePresenceTableRow } from "@/lib/documents/feuille-presence-types";
import { sortFeuillePresenceDataByMatricule } from "@/lib/documents/sort-attendance-by-matricule";

/**
 * Electron renderer runs with nodeIntegration:false / sandbox:true — no Node Buffer.
 * The `docx` → JSZip pipeline still calls Buffer.isBuffer even for browser outputs.
 */
function ensureDocxBuffer(): void {
  const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
  if (typeof g.Buffer === "undefined") {
    g.Buffer = Buffer;
  }
}

const PAGE_W = convertMillimetersToTwip(210);
const PAGE_H = convertMillimetersToTwip(297);
const MARGIN = convertMillimetersToTwip(FP_MARGIN.left);
const CONTENT_W = convertMillimetersToTwip(FP_CONTENT_W);

const COL_WIDTHS = FP_TABLE_COLS.map((col) => convertMillimetersToTwip(col.w));
const MM_TO_EMU = 914400 / 25.4;
const PX_PER_MM = 96 / 25.4;

const THIN = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const BOX_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

async function loadLogoBytes(url: string): Promise<Uint8Array | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    // Same-realm copy — required for JSZip instanceof checks inside `docx`.
    return toZipSafeUint8Array(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

function isPngBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  );
}

/** Match PDF table-region watermark scale (mm → px at 96 dpi). */
function computeDocxTableRegionHeightMm(data: FeuillePresenceData): number {
  const narcoticsCount = data.narcoticsRows?.length ?? FP_TABLE.narcoticsRows;
  const explosivesCount = data.explosivesRows?.length ?? FP_TABLE.explosivesRows;
  return (
    FP_TABLE.headerH
    + narcoticsCount * FP_TABLE.rowH
    + FP_LAYOUT.betweenTablesGap
    + FP_LAYOUT.sectionTitleBandH
    + FP_LAYOUT.sectionTitleBottomGap
    + explosivesCount * FP_TABLE.rowH
  );
}

/** PDF-calibrated Y bounds for the narcotics+explosives table block (mm from page top). */
function computeDocxTableRegionBoundsMm(data: FeuillePresenceData): { topMm: number; bottomMm: number } {
  const topMm =
    FP_LAYOUT.titleStartY
    + FP_LAYOUT.titleMainGap
    + FP_LAYOUT.titleSectionGap
    + FP_LAYOUT.chefLineGap
    + FP_LAYOUT.workBoxTopGap
    + FP_LAYOUT.workBoxH
    + FP_LAYOUT.workBoxBottomGap
    + FP_LAYOUT.sectionTitleBandH
    + FP_LAYOUT.sectionTitleBottomGap;
  return { topMm, bottomMm: topMm + computeDocxTableRegionHeightMm(data) };
}

function mmToEmu(mm: number): number {
  return Math.round(mm * MM_TO_EMU);
}

function computeDocxWatermarkDisplaySize(
  nativeWidth: number,
  nativeHeight: number,
  regionTopMm: number,
  regionBottomMm: number,
): { width: number; height: number } {
  const regionH = regionBottomMm - regionTopMm;
  const boxSizeMm = computeWatermarkBoxSize(FP_CONTENT_W, regionH, FP_LAYOUT.watermark.areaFill);
  const boxSizePx = boxSizeMm * PX_PER_MM;
  const { w, h } = fitLogoInSquareBox(nativeWidth, nativeHeight, boxSizePx);
  return { width: w, height: h };
}

type DocxWatermarkAsset = {
  bytes: Uint8Array;
  nativeWidth: number;
  nativeHeight: number;
};

/** DOCX-only ink level (~2.5%) — Word renders PNG watermarks darker than PDF. */
const DOCX_WATERMARK_INK = 0.025;

/**
 * Build a Word-safe faint watermark from the official header seal.
 * DOCX often ignores PNG alpha — blend the seal toward white in grayscale.
 */
async function buildDocxWatermarkAsset(
  logoBytes: Uint8Array,
): Promise<DocxWatermarkAsset | undefined> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return undefined;
  }

  const mix = DOCX_WATERMARK_INK;

  try {
    const blob = new Blob([toZipSafeUint8Array(logoBytes)], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3];
      if (alpha === 0) continue;

      const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      const light = 255 * (1 - mix) + gray * mix;
      pixels[i] = light;
      pixels[i + 1] = light;
      pixels[i + 2] = light;
      pixels[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    bitmap.close();

    const outBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/png");
    });
    if (!outBlob) return undefined;

    return {
      bytes: toZipSafeUint8Array(await outBlob.arrayBuffer()),
      nativeWidth: canvas.width,
      nativeHeight: canvas.height,
    };
  } catch {
    return undefined;
  }
}

function tableWatermarkAnchorParagraph(
  watermarkBytes: Uint8Array,
  widthPx: number,
  heightPx: number,
  centerYMm: number,
): Paragraph {
  const w = Math.max(1, Math.round(widthPx));
  const h = Math.max(1, Math.round(heightPx));
  const topMm = centerYMm - h / PX_PER_MM / 2;

  return new Paragraph({
    spacing: { before: 0, after: 0, line: 0 },
    children: [
      new ImageRun({
        type: "png",
        data: toZipSafeUint8Array(watermarkBytes),
        transformation: { width: w, height: h },
        altText: {
          id: "2",
          name: "watermark",
          description: "Official attendance sheet watermark",
          title: "Police Cynotechnique",
        },
        floating: {
          behindDocument: true,
          allowOverlap: true,
          lockAnchor: false,
          layoutInCell: true,
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.PAGE,
            align: HorizontalPositionAlign.CENTER,
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PAGE,
            offset: mmToEmu(topMm),
          },
          wrap: {
            type: TextWrappingType.NONE,
          },
        },
      }),
    ],
  });
}

function textRun(
  text: string,
  opts?: { bold?: boolean; italics?: boolean; size?: number; font?: string },
): TextRun {
  return new TextRun({
    text,
    bold: opts?.bold,
    italics: opts?.italics,
    size: opts?.size ?? 16,
    font: opts?.font ?? "Times New Roman",
  });
}

function para(
  children: TextRun[],
  opts?: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingAfter?: number },
): Paragraph {
  return new Paragraph({
    alignment: opts?.align ?? AlignmentType.CENTER,
    spacing: { after: opts?.spacingAfter ?? 60 },
    children,
  });
}

function cell(
  text: string,
  width: number,
  opts?: { bold?: boolean; fill?: string; fontSize?: number; font?: string },
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    borders: BOX_BORDERS,
    shading: opts?.fill ? { fill: opts.fill } : undefined,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          textRun(text, {
            bold: opts?.bold,
            size: opts?.fontSize ?? 15,
            font: opts?.font ?? "Times New Roman",
          }),
        ],
      }),
    ],
  });
}

function emptyCell(width: number): TableCell {
  return cell("", width);
}

function headerRow(): TableRow {
  return new TableRow({
    children: FP_TABLE_COLS.map((col, i) =>
      cell(col.label, COL_WIDTHS[i], {
        bold: true,
        fill: "D3D3D3",
        fontSize: 14,
        font: "Arial",
      }),
    ),
  });
}

function dataRow(row: FeuillePresenceTableRow, index: number): TableRow {
  const values = [
    `${String(index + 1).padStart(2, "0")}.`,
    row.fullName,
    row.grade,
    row.mle,
    row.dogName,
    row.assignment,
    row.hour,
    row.signature,
  ];
  return new TableRow({
    children: values.map((value, i) =>
      cell(value, COL_WIDTHS[i], {
        bold: i === 0 || i === 1,
        fontSize: 15,
      }),
    ),
  });
}

function blankRow(index: number): TableRow {
  return new TableRow({
    children: FP_TABLE_COLS.map((col, i) =>
      col.key === "index"
        ? cell(`${String(index + 1).padStart(2, "0")}.`, COL_WIDTHS[i], { bold: true })
        : emptyCell(COL_WIDTHS[i]),
    ),
  });
}

function buildTableRows(
  rows: FeuillePresenceTableRow[] | undefined,
  blankCount: number,
  withHeader: boolean,
): TableRow[] {
  const out: TableRow[] = [];
  if (withHeader) out.push(headerRow());

  if (rows && rows.length > 0) {
    out.push(...rows.map((row, i) => dataRow(row, i)));
    return out;
  }

  for (let i = 0; i < blankCount; i += 1) {
    out.push(blankRow(i));
  }
  return out;
}

function attendanceTable(
  rows: FeuillePresenceTableRow[] | undefined,
  blankCount: number,
  withHeader: boolean,
): Table {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COL_WIDTHS,
    rows: buildTableRows(rows, blankCount, withHeader),
  });
}

function chefLine(data: FeuillePresenceData): Paragraph {
  const name = data.chefName.trim() || "....................";
  const grade = data.chefGrade.trim() || "....................";
  const mle = data.chefMle.trim() || "....................";
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      textRun("CHEF DE SECTION ", { bold: true, size: 18 }),
      textRun(name, { size: 18 }),
      textRun("   GRADE : ", { bold: true, size: 18 }),
      textRun(grade, { size: 18 }),
      textRun("   MLE : ", { bold: true, size: 18 }),
      textRun(mle, { size: 18 }),
    ],
  });
}

function workSystemBox(): Table {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            borders: BOX_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 60 },
                children: [textRun(FP_WORK_TITLE, { bold: true, size: 16 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function sectionTitle(title: string): Paragraph {
  return para([textRun(title, { bold: true, size: 16 })], { spacingAfter: 80 });
}

export type GenerateFeuillePresenceDocxOptions = {
  logoUrl?: string;
  /** Prefer preloaded PNG bytes (same as PDF) — avoids a second fetch in packaged Electron. */
  logoBytes?: Uint8Array;
};

/**
 * Word export of the approved Feuille de présence — same structure as the PDF template.
 * Only dynamic planning fields differ (date, section, chef, table rows).
 */
export async function generateFeuillePresenceDocx(
  data: FeuillePresenceData,
  logoUrlOrOptions: string | GenerateFeuillePresenceDocxOptions = FP_OFFICIAL_LOGO_URL,
): Promise<Uint8Array> {
  // Presentation-only: always export rows in matricule order.
  data = sortFeuillePresenceDataByMatricule(data);

  const options: GenerateFeuillePresenceDocxOptions =
    typeof logoUrlOrOptions === "string"
      ? { logoUrl: logoUrlOrOptions }
      : logoUrlOrOptions;

  let logoBytes =
    options.logoBytes != null
      ? toZipSafeUint8Array(options.logoBytes)
      : await loadLogoBytes(options.logoUrl ?? FP_OFFICIAL_LOGO_URL);
  // Refuse non-PNG payloads (e.g. HTML error pages) that would corrupt the OOXML package.
  if (logoBytes && !isPngBytes(logoBytes)) {
    console.warn("[docx] logo bytes are not a PNG — omitting seal from Word export");
    logoBytes = undefined;
  }

  const watermarkAsset = logoBytes ? await buildDocxWatermarkAsset(logoBytes) : undefined;
  let watermarkAnchorParagraph: Paragraph | null = null;
  if (watermarkAsset) {
    const { topMm, bottomMm } = computeDocxTableRegionBoundsMm(data);
    const centerYMm = (topMm + bottomMm) / 2;
    const { width, height } = computeDocxWatermarkDisplaySize(
      watermarkAsset.nativeWidth,
      watermarkAsset.nativeHeight,
      topMm,
      bottomMm,
    );
    watermarkAnchorParagraph = tableWatermarkAnchorParagraph(
      watermarkAsset.bytes,
      width,
      height,
      centerYMm,
    );
  }

  const orgLines = FP_ORG_HEADER_LINES.map((line) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
      children: [textRun(line, { size: 13 })],
    }),
  );

  const logoCellChildren: Paragraph[] = logoBytes
    ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: "png",
              data: logoBytes,
              transformation: { width: 90, height: 90 },
              altText: {
                id: "1",
                name: "logo",
                description: "Official seal",
                title: "Police Cynotechnique",
              },
            }),
          ],
        }),
      ]
    : [
        para([textRun("POLICE", { size: 12, bold: true })]),
        para([textRun("CYNOTECHNIQUE", { size: 12, bold: true })]),
      ];

  const headerBand = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [
      convertMillimetersToTwip(62),
      convertMillimetersToTwip(62),
      convertMillimetersToTwip(62),
    ],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: convertMillimetersToTwip(62), type: WidthType.DXA },
            borders: NO_BORDERS,
            children: orgLines,
          }),
          new TableCell({
            width: { size: convertMillimetersToTwip(62), type: WidthType.DXA },
            borders: NO_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: logoCellChildren,
          }),
          new TableCell({
            width: { size: convertMillimetersToTwip(62), type: WidthType.DXA },
            borders: NO_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [textRun(data.dateLine, { size: 13 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const signatures = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_W / 2, type: WidthType.DXA },
            borders: NO_BORDERS,
            children: [
              new Paragraph({
                spacing: { before: 400 },
                children: [textRun(FP_SIGNATURE_SECTION, { bold: true, italics: true, size: 18 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: CONTENT_W / 2, type: WidthType.DXA },
            borders: NO_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 480 },
                children: [
                  textRun(FP_SIGNATURE_BRIGADE, { bold: true, italics: true, size: 16 }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: {
              top: convertMillimetersToTwip(FP_MARGIN.top),
              bottom: convertMillimetersToTwip(FP_MARGIN.bottom),
              left: MARGIN,
              right: MARGIN,
            },
          },
        },
        children: [
          headerBand,
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 },
            },
            spacing: { after: 160 },
            children: [],
          }),
          para([textRun("FEUILLE DE PRESENCE", { bold: true, size: 28 })], { spacingAfter: 80 }),
          para([textRun(data.sectionName || "SECTION", { bold: true, size: 24 })], {
            spacingAfter: 100,
          }),
          chefLine(data),
          workSystemBox(),
          new Paragraph({ spacing: { after: 100 }, children: [] }),
          ...(watermarkAnchorParagraph ? [watermarkAnchorParagraph] : []),
          sectionTitle(FP_SECTION_NARCOTICS),
          attendanceTable(data.narcoticsRows, FP_TABLE.narcoticsRows, true),
          new Paragraph({ spacing: { after: 100 }, children: [] }),
          sectionTitle(FP_SECTION_EXPLOSIVES),
          // Same as PDF: explosives block continues without repeating column headers.
          attendanceTable(data.explosivesRows, FP_TABLE.explosivesRows, false),
          signatures,
        ],
      },
    ],
  });

  // Buffer polyfill still required by JSZip internals inside `docx`.
  ensureDocxBuffer();
  if (typeof (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer?.isBuffer !== "function") {
    throw new Error(
      "DOCX export: Buffer.isBuffer is missing after polyfill (document generation).",
    );
  }
  try {
    // Prefer Blob packing in Chromium/Electron — more reliable than ArrayBuffer/nodebuffer
    // on Windows production builds where Buffer polyfills interact with JSZip.
    let packed: Uint8Array;
    if (typeof Blob !== "undefined") {
      const blob = await Packer.toBlob(doc);
      packed = toZipSafeUint8Array(await blob.arrayBuffer());
    } else {
      packed = toZipSafeUint8Array(await Packer.toArrayBuffer(doc));
    }
    assertDocxZipMagic(packed, "DOCX Packer output");
    return packed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(`DOCX Packer failed: ${message}`);
    if (error instanceof Error && error.stack) {
      wrapped.stack = `${wrapped.message}\n${error.stack}`;
    }
    throw wrapped;
  }
}
