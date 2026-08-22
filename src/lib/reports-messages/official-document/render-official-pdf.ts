import { jsPDF } from "jspdf";
import { FP_LAYOUT, FP_PAGE } from "@/lib/documents/feuille-presence-layout";
import {
  buildFeuillePresenceLogoAsset,
  drawFeuillePresenceLogoContained,
  type FeuillePresenceLogoAsset,
} from "@/lib/documents/feuille-presence-logo";
import { A4, contentBottom, contentWidth, MESSAGE_SIGNATURE_LAYOUT } from "@/lib/reports-messages/official-document/layout";
import {
  MESSAGE_BODY_LAYOUT,
  justifiedWordPositions,
  layoutJustifiedMessage,
} from "@/lib/reports-messages/official-document/justified-text";
import type {
  OfficialDocumentBuildContext,
  OfficialDocumentModel,
  OfficialRadioTableCell,
} from "@/lib/reports-messages/official-document/types";
import {
  RADIO_TABLE_COLUMN_FRACTIONS,
  radioTableRowsForOfficialTable,
} from "@/lib/reports-messages/official-document/radio-table-cells";

type UiLabels = OfficialDocumentBuildContext["labels"];

export type OfficialPdfRenderOptions = {
  /** Same Feuille de présence logo bytes/data URL — Message / Demande only. */
  logoData?: string | Uint8Array;
};

type RenderCtx = {
  logoAsset?: FeuillePresenceLogoAsset;
  withOfficialBranding: boolean;
};

/** Active render context — set for the duration of `renderOfficialDocumentPdf`. */
let currentRenderCtx: RenderCtx = { withOfficialBranding: false };

const BLACK = { r: 0, g: 0, b: 0 } as const;
const FONT = "times" as const;

function setFont(doc: jsPDF, style: "normal" | "bold" | "italic", size: number) {
  doc.setFont(FONT, style);
  doc.setFontSize(size);
  doc.setTextColor(BLACK.r, BLACK.g, BLACK.b);
}

function drawMessagePageWatermark(doc: jsPDF, logoAsset: FeuillePresenceLogoAsset | undefined) {
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
    // Watermark is optional.
  }
}

function drawMessageHeaderLogo(doc: jsPDF, logoAsset: FeuillePresenceLogoAsset | undefined) {
  if (!logoAsset) return;
  const { cx, cy, size } = FP_LAYOUT.logo;
  try {
    drawFeuillePresenceLogoContained(doc, logoAsset, cx, cy, size, { compression: "NONE" });
  } catch {
    // Header seal is optional.
  }
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  labels: UiLabels,
  model: OfficialDocumentModel,
): number {
  if (y + needed <= contentBottom()) return y;
  doc.addPage();
  if (currentRenderCtx.withOfficialBranding) {
    drawMessagePageWatermark(doc, currentRenderCtx.logoAsset);
  }
  return drawContinuationHeader(doc, model, labels);
}

function drawContinuationHeader(
  doc: jsPDF,
  model: OfficialDocumentModel,
  labels: UiLabels,
): number {
  const left = A4.marginLeft;
  const right = A4.width - A4.marginRight;
  let y: number = A4.marginTop;

  if (currentRenderCtx.withOfficialBranding) {
    drawMessageHeaderLogo(doc, currentRenderCtx.logoAsset);
  }

  setFont(doc, "bold", 8);
  doc.text(model.header.agencyLines.join(" — "), left, y, { align: "left" });
  doc.text(model.header.radioTitle, right, y, { align: "right" });
  y += 4;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  y += 5;

  setFont(doc, "bold", 10);
  const subject = (model.body.subject || "").trim();
  if (subject) {
    doc.text(`${subject} (suite)`, A4.width / 2, y, { align: "center" });
    y += 6;
  } else {
    y += 2;
  }

  // Compact radio table reminder
  y = drawRadioTable(doc, model, labels, y, true);
  y += 3;
  return y;
}

function drawMainHeader(doc: jsPDF, model: OfficialDocumentModel): number {
  const left = A4.marginLeft;
  const right = A4.width - A4.marginRight;
  const branding = currentRenderCtx.withOfficialBranding;
  const lineH = 4.2;

  // Non–Message/Demande: keep existing compact header.
  if (!branding) {
    let y: number = A4.marginTop;
    setFont(doc, "bold", 9);
    model.header.agencyLines.forEach((line, index) => {
      doc.text(line, left, y + index * lineH, { align: "left" });
    });
    setFont(doc, "bold", 12);
    doc.text(model.header.radioTitle, right, y + 2, { align: "right" });
    return y + Math.max(model.header.agencyLines.length * lineH, 8) + 4;
  }

  // Message / Demande: logo stays at Feuille coordinates (unchanged).
  drawMessageHeaderLogo(doc, currentRenderCtx.logoAsset);

  // Agency + RADIO DEPART sit just above the table (below the fixed logo),
  // eliminating the large empty band between header text and the Radio Départ table.
  const logoBottom = FP_LAYOUT.logo.cy + FP_LAYOUT.logo.size / 2;
  const gapAfterLogoMm = 2.5;
  const gapBeforeTableMm = 2.5;
  const firstBaseline = logoBottom + gapAfterLogoMm + 3.2;

  setFont(doc, "bold", 9);
  model.header.agencyLines.forEach((line, index) => {
    doc.text(line, left, firstBaseline + index * lineH, { align: "left" });
  });

  setFont(doc, "bold", 12);
  // Same vertical level as the first agency line, right-aligned.
  doc.text(model.header.radioTitle, right, firstBaseline, { align: "right" });

  const lastBaseline =
    firstBaseline + Math.max(0, model.header.agencyLines.length - 1) * lineH;
  return lastBaseline + gapBeforeTableMm;
}

function drawRadioTableRow(
  doc: jsPDF,
  cells: OfficialRadioTableCell[],
  left: number,
  startY: number,
  totalW: number,
  widths: number[],
  headerH: number,
  valueH: number,
  rowH: number,
  compact: boolean,
) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(left, startY, totalW, rowH);

  let x = left;
  cells.forEach((cell, index) => {
    const w = widths[index] ?? 0;
    if (index > 0) {
      doc.line(x, startY, x, startY + rowH);
    }
    doc.line(x, startY + headerH, x + w, startY + headerH);

    setFont(doc, "bold", compact ? 6.5 : 7);
    doc.text(cell.label, x + w / 2, startY + headerH / 2 + 1.5, {
      align: "center",
      maxWidth: w - 1.5,
    });

    const value = cell.value || "";
    setFont(doc, "normal", compact ? 8 : 9);
    const lines = doc.splitTextToSize(value, w - 2);
    const textBlockH = lines.length * (compact ? 3 : 3.4);
    const textY = startY + headerH + (valueH + textBlockH) / 2 - 1;
    doc.text(lines, x + w / 2, textY, { align: "center" });

    x += w;
  });
}

function drawRadioTable(
  doc: jsPDF,
  model: OfficialDocumentModel,
  labels: UiLabels,
  startY: number,
  compact = false,
): number {
  const left = A4.marginLeft;
  const totalW = contentWidth();
  const widths = RADIO_TABLE_COLUMN_FRACTIONS.map((fraction) => totalW * fraction);
  void labels;

  const headerH = compact ? 5.5 : 7;
  const valueH = compact ? 7 : 10;
  const rowH = headerH + valueH;
  const rows = radioTableRowsForOfficialTable(model.table);

  let y = startY;
  for (const row of rows) {
    drawRadioTableRow(doc, row, left, y, totalW, widths, headerH, valueH, rowH, compact);
    y += rowH;
  }

  return y;
}

function drawCorrespondence(
  doc: jsPDF,
  model: OfficialDocumentModel,
  labels: UiLabels,
  startY: number,
): number {
  const left = A4.marginLeft;
  const right = A4.width - A4.marginRight;
  let y = startY + 5;
  const lineGap = 4.6;

  if (
    model.correspondence.layout === "message_demande" &&
    model.correspondence.recipientLines &&
    model.correspondence.recipientLines.length > 0
  ) {
    // EXPÉDITEUR : label + body share normal weight (CHANGEMENT 17).
    setFont(doc, "normal", 10);
    const expLabel = `${labels.de || "EXPEDITEUR"} : `;
    const senderLines = (model.correspondence.sender || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const firstLine = senderLines[0] ?? "";
    const restLines = senderLines.slice(1);
    const labelW = doc.getTextWidth(expLabel);
    doc.text(expLabel, left, y);
    if (firstLine) {
      const firstWrapped = doc.splitTextToSize(
        firstLine,
        contentWidth() - labelW,
      ) as string[];
      doc.text(firstWrapped, left + labelW, y);
      y += Math.max(lineGap, firstWrapped.length * 4.2);
    } else {
      y += lineGap;
    }
    for (const line of restLines) {
      const wrapped = doc.splitTextToSize(line, contentWidth()) as string[];
      doc.text(wrapped, left, y);
      y += Math.max(lineGap, wrapped.length * 4.2);
    }
    y += 1.5;

    for (const line of model.correspondence.recipientLines) {
      setFont(doc, "normal", 10);
      doc.text(line.left, left, y, { maxWidth: contentWidth() * 0.72 });
      if (line.right) {
        setFont(doc, "bold", 10);
        doc.text(line.right, right, y, { align: "right" });
      }
      y += lineGap;
    }
    return y + 1;
  }

  const row = (label: string, value: string) => {
    setFont(doc, "bold", 10);
    doc.text(`${label} :`, left, y);
    setFont(doc, "normal", 10);
    const labelW = doc.getTextWidth(`${label} : `);
    const lines = doc.splitTextToSize(value || "", contentWidth() - labelW);
    doc.text(lines, left + labelW, y);
    y += Math.max(5, lines.length * 4.2);
  };

  row(labels.de || "EXPEDITEUR", model.correspondence.sender);
  row(labels.a || "A", model.correspondence.to);
  row(labels.destinataire || "DESTINATAIRE", model.correspondence.recipient);

  if (model.correspondence.city.trim()) {
    setFont(doc, "bold", 10);
    doc.text(model.correspondence.city.toUpperCase(), left, y);
    y += 5;
  }

  if (model.correspondence.diffusion.length > 0) {
    setFont(doc, "bold", 10);
    doc.text(`${labels.diffusion || "DIFFUSION"} :`, left, y);
    y += 4.2;
    setFont(doc, "normal", 10);
    model.correspondence.diffusion.forEach((copy) => {
      const lines = doc.splitTextToSize(`- ${copy}`, contentWidth());
      doc.text(lines, left + 3, y);
      y += lines.length * 4.2;
    });
  }

  return y;
}

function drawPriority(doc: jsPDF, model: OfficialDocumentModel, startY: number): number {
  if (model.priority !== "URGENT") return startY;
  let y = startY + 4;
  setFont(doc, "bold", 14);
  doc.text("U R G E N T", A4.width / 2, y, { align: "center" });
  return y + 5;
}

function drawSubject(doc: jsPDF, model: OfficialDocumentModel, startY: number): number {
  const subject = (model.body.subject || "").trim();
  if (!subject) return startY;
  let y = startY + 3;
  setFont(doc, "bold", 11);
  doc.text(subject, A4.width / 2, y, { align: "center" });
  // underline
  const w = doc.getTextWidth(subject);
  doc.setLineWidth(0.3);
  doc.line(A4.width / 2 - w / 2, y + 1.2, A4.width / 2 + w / 2, y + 1.2);
  return y + 6;
}

function drawFacts(
  doc: jsPDF,
  model: OfficialDocumentModel,
  labels: UiLabels,
  startY: number,
): number {
  if (model.body.facts.length === 0) return startY;
  let y = startY;
  const left = A4.marginLeft;
  const totalW = contentWidth();
  const labelW = totalW * 0.34;
  const valueW = totalW - labelW;
  const pad = 1.6;

  for (const fact of model.body.facts) {
    setFont(doc, "bold", 9);
    const labelLines = doc.splitTextToSize(fact.label, labelW - pad * 2);
    setFont(doc, "normal", 9);
    const valueLines = doc.splitTextToSize(fact.value, valueW - pad * 2);
    const rowH = Math.max(labelLines.length, valueLines.length) * 3.8 + pad * 2;

    y = ensureSpace(doc, y, rowH + 1, labels, model);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(left, y, labelW, rowH);
    doc.rect(left + labelW, y, valueW, rowH);

    setFont(doc, "bold", 9);
    doc.text(labelLines, left + pad, y + pad + 3);
    setFont(doc, "normal", 9);
    doc.text(valueLines, left + labelW + pad, y + pad + 3);
    y += rowH;
  }

  return y + 3;
}

function drawMessage(
  doc: jsPDF,
  model: OfficialDocumentModel,
  labels: UiLabels,
  startY: number,
): number {
  const body = model.body.messageBody;
  if (!body.trim()) return startY;

  // Message / Demande + Rapport chienne en chaleur: professional full justification
  if (model.kind === "generic_message" || model.kind === "heat_dog_report") {
    return drawJustifiedMessage(doc, model, labels, startY, body);
  }

  let y = startY + 2;
  const left = A4.marginLeft;
  const maxW = contentWidth();
  const lineH = 4.6;

  setFont(doc, "normal", 11);
  // Preserve exact paragraphs / line breaks: split on \n then wrap each line
  const paragraphs = body.split(/\r?\n/);
  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      y = ensureSpace(doc, y, lineH, labels, model);
      y += lineH * 0.65;
      continue;
    }
    const lines = doc.splitTextToSize(paragraph, maxW) as string[];
    for (const line of lines) {
      y = ensureSpace(doc, y, lineH, labels, model);
      doc.text(line, left, y);
      y += lineH;
    }
  }

  return y + 2;
}

function drawJustifiedMessage(
  doc: jsPDF,
  model: OfficialDocumentModel,
  labels: UiLabels,
  startY: number,
  body: string,
): number {
  const { fontSizePt, lineHeightMm, paragraphGapMm, topGapMm } = MESSAGE_BODY_LAYOUT;
  const left = A4.marginLeft;
  const maxW = contentWidth();
  let y = startY + topGapMm;

  setFont(doc, "normal", fontSizePt);
  const measure = (text: string) => doc.getTextWidth(text);
  const indentW = measure(MESSAGE_BODY_LAYOUT.firstLineIndentSpaces);
  const paragraphs = layoutJustifiedMessage(body, maxW, measure);

  for (const paragraph of paragraphs) {
    if (paragraph.lines.length === 0) {
      y = ensureSpace(doc, y, paragraphGapMm, labels, model);
      y += paragraphGapMm;
      continue;
    }

    for (const line of paragraph.lines) {
      y = ensureSpace(doc, y, lineHeightMm, labels, model);
      setFont(doc, "normal", fontSizePt);
      const lineLeft = line.firstLineIndent ? left + indentW : left;
      const lineWidth = line.firstLineIndent ? maxW - indentW : maxW;
      const xs = justifiedWordPositions(
        line.words,
        lineLeft,
        lineWidth,
        line.justify,
        measure,
      );
      line.words.forEach((word, i) => {
        doc.text(word, xs[i], y);
      });
      y += lineHeightMm;
    }
    y += paragraphGapMm;
  }

  return y;
}

function drawAttachments(
  doc: jsPDF,
  model: OfficialDocumentModel,
  labels: UiLabels,
  startY: number,
): number {
  const list = model.body.attachments?.filter((item) => item.trim()) ?? [];
  if (list.length === 0) return startY;

  let y = startY + 3;
  const left = A4.marginLeft;
  setFont(doc, "bold", 10);
  y = ensureSpace(doc, y, 6, labels, model);
  doc.text("PIÈCES JOINTES :", left, y);
  y += 5;
  setFont(doc, "normal", 10);
  for (const item of list) {
    const lines = doc.splitTextToSize(`- ${item}`, contentWidth()) as string[];
    for (const line of lines) {
      y = ensureSpace(doc, y, 4.4, labels, model);
      doc.text(line, left + 2, y);
      y += 4.4;
    }
  }
  return y + 2;
}

function drawSignatures(
  doc: jsPDF,
  model: OfficialDocumentModel,
  labels: UiLabels,
  startY: number,
): number {
  if (model.signatories.length === 0) return startY;

  if (model.signatureLayout === "vertical") {
    const { gapAfterMessageMm, rowHeightMm, nameFunctionGap } = MESSAGE_SIGNATURE_LAYOUT;
    let y = startY + gapAfterMessageMm;
    const left = A4.marginLeft;

    const rows = model.signatories
      .map((sig) => {
        const name = (sig.fullName || "").trim();
        const fn = (sig.functionTitle || "").trim();
        if (!name && !fn) return null;
        const leftText = (
          sig.endorsement ? `${sig.endorsement} / ${name}` : name
        )
          .toUpperCase()
          .trim();
        return {
          leftText,
          fn: fn.toUpperCase(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    // Function column starts immediately after the longest name + ~3 spaces
    setFont(doc, "normal", 10);
    const gapW = doc.getTextWidth(nameFunctionGap);
    let maxNameW = 0;
    for (const row of rows) {
      maxNameW = Math.max(maxNameW, doc.getTextWidth(row.leftText));
    }
    const functionX = left + maxNameW + gapW;

    for (const row of rows) {
      y = ensureSpace(doc, y, rowHeightMm + 1, labels, model);
      setFont(doc, "normal", 10);
      doc.text(row.leftText, left, y);
      if (row.fn) {
        setFont(doc, "normal", 9.5);
        doc.text(row.fn, functionX, y, { align: "left" });
      }
      y += rowHeightMm;
    }
    return y;
  }

  const perRow = 2;
  const gap = 8;
  const colW = (contentWidth() - gap) / perRow;
  const blockH = 28;
  let y = startY + 6;
  const left = A4.marginLeft;

  for (let i = 0; i < model.signatories.length; i += perRow) {
    y = ensureSpace(doc, y, blockH, labels, model);
    const row = model.signatories.slice(i, i + perRow);
    row.forEach((sig, col) => {
      const x = left + col * (colW + gap);
      const cx = x + colW / 2;
      setFont(doc, "bold", 10);
      if (sig.fullName) {
        doc.text(sig.fullName.toUpperCase(), cx, y, { align: "center", maxWidth: colW });
      }
      setFont(doc, "normal", 9);
      if (sig.functionTitle) {
        doc.text(sig.functionTitle, cx, y + 5, { align: "center", maxWidth: colW });
      }
      doc.setLineWidth(0.3);
      doc.line(x + colW * 0.15, y + 18, x + colW * 0.85, y + 18);
    });
    y += blockH;
  }

  return y;
}

/**
 * Render an official Radio Départ document to jsPDF (A4 portrait).
 * Shared layout for all future official report kinds that use OfficialDocumentModel.
 *
 * Message / Demande (`generic_message`) and heat dog report may receive the
 * Feuille de présence logo for a centered header seal + subtle full-page watermark.
 */
export function renderOfficialDocumentPdf(
  model: OfficialDocumentModel,
  labels: UiLabels,
  options?: OfficialPdfRenderOptions,
): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const withOfficialBranding =
    model.kind === "generic_message" || model.kind === "heat_dog_report";
  let logoAsset: FeuillePresenceLogoAsset | undefined;
  if (withOfficialBranding && options?.logoData) {
    try {
      logoAsset = buildFeuillePresenceLogoAsset(doc, options.logoData);
    } catch {
      logoAsset = undefined;
    }
  }
  currentRenderCtx = { withOfficialBranding, logoAsset };

  // Watermark first — behind header, body and signatures.
  if (withOfficialBranding) {
    drawMessagePageWatermark(doc, logoAsset);
  }

  let y = drawMainHeader(doc, model);
  y = drawRadioTable(doc, model, labels, y);
  y = drawCorrespondence(doc, model, labels, y);
  y = drawPriority(doc, model, y);
  y = drawSubject(doc, model, y);
  y = drawFacts(doc, model, labels, y);
  y = drawMessage(doc, model, labels, y);
  y = drawAttachments(doc, model, labels, y);

  // Keep signatures close to body for Message / Demande vertical layout
  const sigNeeded =
    model.signatories.length > 0
      ? model.signatureLayout === "vertical"
        ? model.signatories.length * MESSAGE_SIGNATURE_LAYOUT.rowHeightMm +
          MESSAGE_SIGNATURE_LAYOUT.gapAfterMessageMm +
          2
        : 32
      : 0;
  if (sigNeeded > 0 && y + sigNeeded > contentBottom()) {
    doc.addPage();
    if (withOfficialBranding) {
      drawMessagePageWatermark(doc, logoAsset);
    }
    y = drawContinuationHeader(doc, model, labels);
  }
  drawSignatures(doc, model, labels, y);

  return doc;
}
