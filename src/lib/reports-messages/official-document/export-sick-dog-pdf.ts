import type { DogRow } from "@/integrations/database";
import { exportJsPdf } from "@/lib/documents/export-jspdf";
import {
  buildSickDogOfficialDocument,
  sickDogOfficialLabelsFromT,
} from "@/lib/reports-messages/official-document/build-sick-dog-document";
import { renderOfficialDocumentPdf } from "@/lib/reports-messages/official-document/render-official-pdf";
import type { SickDogReportFormData } from "@/lib/reports-messages/sick-dog-report";

export async function exportSickDogReportPdf(input: {
  data: SickDogReportFormData;
  dog: DogRow | null;
  specialtyLabel: string;
  handlerLabel: string;
  sectionLabel?: string;
  t: (key: string) => string;
  filename?: string;
}): Promise<void> {
  const labels = sickDogOfficialLabelsFromT(input.t);
  const model = buildSickDogOfficialDocument({
    data: input.data,
    dog: input.dog,
    specialtyLabel: input.specialtyLabel,
    handlerLabel: input.handlerLabel,
    sectionLabel: input.sectionLabel,
    labels,
  });
  const doc = renderOfficialDocumentPdf(model, labels);
  const dogSlug = (input.dog?.name || "chien")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
  const filename =
    input.filename ||
    `rapport-chien-malade-${dogSlug || "brouillon"}-${new Date().toISOString().slice(0, 10)}.pdf`;
  await exportJsPdf(doc, filename);
}
