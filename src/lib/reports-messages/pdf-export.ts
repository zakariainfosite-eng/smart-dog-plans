import { jsPDF } from "jspdf";
import { format, parseISO } from "date-fns";
import { ar, fr } from "date-fns/locale";
import { db } from "@/integrations/database/client";
import i18n from "@/lib/i18n";
import { exportJsPdf } from "@/lib/documents/export-jspdf";
import { loadDocumentPresentation, type DocumentPresentation } from "@/lib/documents/document-presentation";
import type { ReportTemplateDefinition, RoleDocumentRow } from "@/lib/reports-messages/types";

type PdfLabelResolver = (key: string) => string;

type GenerateRoleDocumentPdfOptions = {
  document: RoleDocumentRow;
  template: ReportTemplateDefinition;
  t: PdfLabelResolver;
  agentLabel?: string | null;
  dogLabel?: string | null;
  sectionLabel?: string | null;
};

function safeDateLabel(value: string | undefined, locale: "fr" | "ar"): string {
  if (!value) return "—";
  try {
    return format(parseISO(value.slice(0, 10)), "dd/MM/yyyy", { locale: locale === "ar" ? ar : fr });
  } catch {
    return value;
  }
}

function drawPageChrome(
  doc: jsPDF,
  presentation: DocumentPresentation,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  pageLabel: (page: number, total: number) => string,
) {
  const footer = presentation.documents.footerText.trim();
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    if (footer) {
      doc.text(footer, margin, pageHeight - 8, { maxWidth: pageWidth - margin * 2 - 28 });
    }
    if (presentation.documents.pageNumbers) {
      doc.text(pageLabel(page, total), pageWidth - margin, pageHeight - 8, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
  }
}

export async function generateRoleDocumentPdf({
  document,
  template,
  t,
  agentLabel,
  dogLabel,
  sectionLabel,
}: GenerateRoleDocumentPdfOptions): Promise<jsPDF> {
  const presentation = await loadDocumentPresentation(db);
  const locale = presentation.documents.documentLocale;
  const tDoc = i18n.getFixedT(locale);
  const labels: PdfLabelResolver = (key) => {
    const translated = tDoc(key);
    return translated === key ? t(key) : translated;
  };

  const doc = new jsPDF({
    orientation: presentation.documents.orientation,
    unit: "mm",
    format: "a4",
  });
  const margin = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  const line = (text: string, size = 10, bold = false) => {
    if (y > pageHeight - 22) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.45) + 2;
  };

  doc.setDrawColor(2, 58, 132);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  if (presentation.logoBytes && presentation.logoBytes.byteLength > 0) {
    try {
      doc.addImage(presentation.logoBytes, "PNG", pageWidth - margin - 16, y - 2, 16, 16);
    } catch {
      // Header text still renders without the logo.
    }
  }

  const orgName = presentation.organization.unitName.trim() || "CynoPlanning";
  line(orgName, 16, true);
  if (presentation.organization.serviceName.trim()) {
    line(presentation.organization.serviceName.trim(), 10);
  }
  if (presentation.organization.city.trim()) {
    line(presentation.organization.city.trim(), 9);
  }
  line(labels("reportsMessages.pdf.subtitle"), 9);
  y += 4;

  line(document.title, 14, true);
  if (document.reference_number) {
    line(`${labels("reportsMessages.pdf.reference")} : ${document.reference_number}`, 10, true);
  }
  line(`${labels("reportsMessages.pdf.date")} : ${safeDateLabel(document.payload.report_date, locale)}`, 10);
  line(`${labels("reportsMessages.pdf.author")} : ${document.created_by_name}`, 10);
  if (document.report_month && document.report_year) {
    line(
      `${labels("reportsMessages.pdf.period")} : ${String(document.report_month).padStart(2, "0")}/${document.report_year}`,
      10,
    );
  }
  y += 4;

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  if (agentLabel) line(`${labels("reportsMessages.fields.agent")} : ${agentLabel}`, 10);
  if (dogLabel) line(`${labels("reportsMessages.fields.dog")} : ${dogLabel}`, 10);
  if (sectionLabel) line(`${labels("reportsMessages.fields.section")} : ${sectionLabel}`, 10);

  for (const field of template.fields) {
    if (field.type === "agent" || field.type === "dog" || field.type === "section") continue;
    const raw = document.payload[field.id];
    if (!raw?.trim()) continue;
    const label = labels(`reportsMessages.fields.${field.labelKey}`);
    if (field.type === "textarea") {
      line(`${label} :`, 10, true);
      line(raw, 10);
    } else {
      line(`${label} : ${raw}`, 10);
    }
  }

  y += 8;
  line(labels("reportsMessages.pdf.signatureArea"), 10, true);
  doc.line(margin, y + 12, margin + 70, y + 12);

  drawPageChrome(doc, presentation, pageWidth, pageHeight, margin, (page, total) =>
    String(tDoc("settings.documents.preview.pageNumber", { page, total })),
  );
  return doc;
}

export async function downloadRoleDocumentPdf(
  options: GenerateRoleDocumentPdfOptions,
): Promise<void> {
  const doc = await generateRoleDocumentPdf(options);
  const ref = options.document.reference_number ?? options.document.id.slice(0, 8);
  const filename = `${ref.replace(/[^\w-]+/g, "_")}.pdf`;
  await exportJsPdf(doc, filename);
}

export async function printRoleDocumentPdf(options: GenerateRoleDocumentPdfOptions): Promise<void> {
  const doc = await generateRoleDocumentPdf(options);
  doc.autoPrint();
  const blobUrl = doc.output("bloburl");
  const win = window.open(blobUrl, "_blank");
  if (!win) return;
  win.focus();
}
