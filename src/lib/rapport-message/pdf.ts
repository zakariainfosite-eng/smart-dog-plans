import { jsPDF } from "jspdf";
import { formatRapportMessageDate, splitBodyParagraphs } from "@/lib/rapport-message/format";
import type { RapportMessageDraft, RapportMessageExportLabels } from "@/lib/rapport-message/types";

export function generateRapportMessagePdf(
  draft: RapportMessageDraft,
  labels: RapportMessageExportLabels,
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 18) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setTextColor(2, 58, 132);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(labels.brand, pageWidth / 2, y, { align: "center" });
  y += 6;
  if (labels.unitName?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(labels.unitName.trim(), pageWidth / 2, y, { align: "center" });
    y += 6;
  }

  y += 2;
  doc.setDrawColor(2, 58, 132);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(labels.documentTitle, pageWidth / 2, y, { align: "center" });
  y += 12;

  doc.setTextColor(0, 0, 0);
  const meta = [
    [labels.date, formatRapportMessageDate(draft.date)],
    [labels.recipient, draft.recipient.trim() || "—"],
    [labels.sender, draft.sender.trim() || "—"],
    ...(draft.reference.trim() ? [[labels.reference, draft.reference.trim()] as const] : []),
    [labels.subject, draft.title.trim() || "—"],
  ] as const;

  for (const [label, value] of meta) {
    ensureSpace(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${label} :`, margin, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value, contentWidth - 42);
    doc.text(lines, margin + 42, y);
    y += Math.max(7, lines.length * 5.2);
  }

  y += 2;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  const paragraphs = splitBodyParagraphs(draft.body);
  if (paragraphs.length === 0) {
    ensureSpace(8);
    doc.text("—", margin, y);
    y += 8;
  } else {
    for (const paragraph of paragraphs) {
      const lines = doc.splitTextToSize(paragraph, contentWidth);
      ensureSpace(lines.length * 6 + 3);
      doc.text(lines, margin, y);
      y += lines.length * 6 + 3;
    }
  }

  y += 10;
  ensureSpace(18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(labels.signature, pageWidth - margin, y, { align: "right" });
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.text(draft.signature.trim() || draft.sender.trim() || "—", pageWidth - margin, y, {
    align: "right",
  });

  return doc;
}
