import { db } from "@/integrations/database/client";
import { savePlanningExportFiles } from "@/lib/documents/planning-export";
import { exportJsPdf } from "@/lib/documents/export-jspdf";
import { fetchOrganizationSettings } from "@/lib/organization-settings";
import { generateRapportMessagePdf } from "@/lib/rapport-message/pdf";
import { rapportMessageExportBasename } from "@/lib/rapport-message/format";
import type { RapportMessageDraft, RapportMessageExportLabels } from "@/lib/rapport-message/types";

export function rapportMessageExportLabels(t: (key: string) => string, unitName?: string): RapportMessageExportLabels {
  return {
    brand: t("app.name"),
    documentTitle: t("rapportMessage.documentTitle"),
    date: t("rapportMessage.fields.date"),
    recipient: t("rapportMessage.fields.recipient"),
    sender: t("rapportMessage.fields.sender"),
    reference: t("rapportMessage.fields.reference"),
    subject: t("rapportMessage.fields.title"),
    signature: t("rapportMessage.fields.signature"),
    unitName,
  };
}

async function loadUnitName(): Promise<string | undefined> {
  try {
    const settings = await fetchOrganizationSettings(db);
    return settings.unitName || settings.serviceName || undefined;
  } catch {
    return undefined;
  }
}

export async function exportRapportMessagePdf(
  draft: RapportMessageDraft,
  t: (key: string) => string,
): Promise<void> {
  const labels = rapportMessageExportLabels(t, await loadUnitName());
  const doc = generateRapportMessagePdf(draft, labels);
  await exportJsPdf(doc, `${rapportMessageExportBasename(draft)}.pdf`);
}

export async function exportRapportMessageDocx(
  draft: RapportMessageDraft,
  t: (key: string) => string,
): Promise<{ canceled: boolean }> {
  const labels = rapportMessageExportLabels(t, await loadUnitName());
  const { generateRapportMessageDocx } = await import("@/lib/rapport-message/docx");
  const bytes = await generateRapportMessageDocx(draft, labels);
  const filename = `${rapportMessageExportBasename(draft)}.docx`;
  const result = await savePlanningExportFiles([
    {
      filename,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes,
    },
  ]);
  return { canceled: result.canceled };
}
