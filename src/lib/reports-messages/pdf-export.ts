import { jsPDF } from "jspdf";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { ReportTemplateDefinition, RoleDocumentRow } from "@/lib/reports-messages/types";
import { exportJsPdf } from "@/lib/documents/export-jspdf";

type PdfLabelResolver = (key: string) => string;

type GenerateRoleDocumentPdfOptions = {
  document: RoleDocumentRow;
  template: ReportTemplateDefinition;
  t: PdfLabelResolver;
  agentLabel?: string | null;
  dogLabel?: string | null;
  sectionLabel?: string | null;
};

function safeDateLabel(value: string | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value.slice(0, 10)), "dd/MM/yyyy", { locale: fr });
  } catch {
    return value;
  }
}

export function generateRoleDocumentPdf({
  document,
  template,
  t,
  agentLabel,
  dogLabel,
  sectionLabel,
}: GenerateRoleDocumentPdfOptions): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  const line = (text: string, size = 10, bold = false) => {
    if (y > 275) {
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

  line("CynoPlanning", 16, true);
  line(t("reportsMessages.pdf.subtitle"), 9);
  y += 4;

  line(document.title, 14, true);
  if (document.reference_number) {
    line(`${t("reportsMessages.pdf.reference")} : ${document.reference_number}`, 10, true);
  }
  line(`${t("reportsMessages.pdf.date")} : ${safeDateLabel(document.payload.report_date)}`, 10);
  line(`${t("reportsMessages.pdf.author")} : ${document.created_by_name}`, 10);
  if (document.report_month && document.report_year) {
    line(
      `${t("reportsMessages.pdf.period")} : ${String(document.report_month).padStart(2, "0")}/${document.report_year}`,
      10,
    );
  }
  y += 4;

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  if (agentLabel) line(`${t("reportsMessages.fields.agent")} : ${agentLabel}`, 10);
  if (dogLabel) line(`${t("reportsMessages.fields.dog")} : ${dogLabel}`, 10);
  if (sectionLabel) line(`${t("reportsMessages.fields.section")} : ${sectionLabel}`, 10);

  for (const field of template.fields) {
    if (field.type === "agent" || field.type === "dog" || field.type === "section") continue;
    const raw = document.payload[field.id];
    if (!raw?.trim()) continue;
    const label = t(`reportsMessages.fields.${field.labelKey}`);
    if (field.type === "textarea") {
      line(`${label} :`, 10, true);
      line(raw, 10);
    } else {
      line(`${label} : ${raw}`, 10);
    }
  }

  y += 8;
  line(t("reportsMessages.pdf.signatureArea"), 10, true);
  doc.line(margin, y + 12, margin + 70, y + 12);

  return doc;
}

export async function downloadRoleDocumentPdf(
  options: GenerateRoleDocumentPdfOptions,
): Promise<void> {
  const doc = generateRoleDocumentPdf(options);
  const ref = options.document.reference_number ?? options.document.id.slice(0, 8);
  const filename = `${ref.replace(/[^\w-]+/g, "_")}.pdf`;
  await exportJsPdf(doc, filename);
}

export function printRoleDocumentPdf(options: GenerateRoleDocumentPdfOptions): void {
  const doc = generateRoleDocumentPdf(options);
  doc.autoPrint();
  const blobUrl = doc.output("bloburl");
  const win = window.open(blobUrl, "_blank");
  if (!win) return;
  win.focus();
}
