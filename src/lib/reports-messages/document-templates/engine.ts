import type { DogRow } from "@/integrations/database";
import {
  buildGenericRadioOfficialDocument,
  buildHeatDogOfficialDocument,
  buildMessageDemandeOfficialDocument,
  buildSickDogOfficialDocumentFromEngine,
} from "@/lib/reports-messages/document-templates/builders";
import type { DocumentTemplateConfig } from "@/lib/reports-messages/document-templates/types";
import type { EffectiveTemplateConfig } from "@/lib/reports-messages/document-templates/merge-template";
import {
  buildDatabaseLinkContext,
  type DatabaseLinkContext,
} from "@/lib/reports-messages/document-templates/resolve-bindings";
import type { MessageDemandeFormData } from "@/lib/reports-messages/document-templates/message-demande";
import type { HeatDogReportFormData } from "@/lib/reports-messages/document-templates/heat-dog-report";
import type { GenericRadioReportFormData } from "@/lib/reports-messages/document-templates/generic-radio-form";
import type { SickDogReportFormData } from "@/lib/reports-messages/sick-dog-report";
import { exportJsPdf } from "@/lib/documents/export-jspdf";
import { savePlanningExportFiles } from "@/lib/documents/planning-export";
import { renderOfficialDocumentPdf } from "@/lib/reports-messages/official-document/render-official-pdf";
import { renderOfficialDocumentDocx } from "@/lib/reports-messages/official-document/render-official-docx";
import { loadMessageDemandeOfficialLogo } from "@/lib/reports-messages/official-document/message-demande-logo";
import type { OfficialDocumentModel } from "@/lib/reports-messages/official-document/types";
import { sickDogOfficialLabelsFromT } from "@/lib/reports-messages/official-document/build-sick-dog-document";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type TemplateEngineInput =
  | {
      config: DocumentTemplateConfig;
      builder: "message_demande";
      data: MessageDemandeFormData;
      dog?: DogRow | null;
      t: (key: string) => string;
      effective?: EffectiveTemplateConfig | null;
    }
  | {
      config: DocumentTemplateConfig;
      builder: "heat_dog";
      data: HeatDogReportFormData;
      dog?: DogRow | null;
      t: (key: string) => string;
      effective?: EffectiveTemplateConfig | null;
    }
  | {
      config: DocumentTemplateConfig;
      builder: "sick_dog";
      data: SickDogReportFormData;
      dog: DogRow | null;
      t: (key: string) => string;
      effective?: EffectiveTemplateConfig | null;
    }
  | {
      config: DocumentTemplateConfig;
      builder: "generic_radio";
      data: GenericRadioReportFormData;
      dog: DogRow | null;
      t: (key: string) => string;
      effective?: EffectiveTemplateConfig | null;
    };

/**
 * Template engine: Document data + config + DB context → OfficialDocumentModel.
 * Same model feeds A4 HTML preview and jsPDF export.
 */
export function buildOfficialDocumentFromTemplate(
  input: TemplateEngineInput,
): OfficialDocumentModel {
  if (input.builder === "message_demande") {
    return buildMessageDemandeOfficialDocument({
      config: input.config,
      data: input.data,
      t: input.t,
      effective: input.effective,
    });
  }

  if (input.builder === "heat_dog") {
    return buildHeatDogOfficialDocument({
      config: input.config,
      data: input.data,
      t: input.t,
      effective: input.effective,
    });
  }

  const db: DatabaseLinkContext = buildDatabaseLinkContext({
    dog: input.dog,
    t: input.t,
  });

  if (input.builder === "sick_dog") {
    return buildSickDogOfficialDocumentFromEngine({
      config: input.config,
      data: input.data,
      dog: input.dog,
      db,
      t: input.t,
      effective: input.effective,
    });
  }

  return buildGenericRadioOfficialDocument({
    config: input.config,
    data: input.data,
    dog: input.dog,
    db,
    t: input.t,
    effective: input.effective,
  });
}

export async function exportOfficialDocumentFromTemplate(
  input: TemplateEngineInput,
  filename: string,
): Promise<void> {
  const model = buildOfficialDocumentFromTemplate(input);
  const labels = sickDogOfficialLabelsFromT(input.t);
  if (input.effective?.header) {
    labels.agencyLine1 = input.effective.header.organizationName || labels.agencyLine1;
    labels.agencyLine2 = input.effective.header.department || labels.agencyLine2;
    labels.radioTitle = input.effective.header.radioTitle || labels.radioTitle;
  }
  const logoData =
    input.builder === "message_demande" || input.builder === "heat_dog"
      ? await loadMessageDemandeOfficialLogo()
      : undefined;
  const doc = renderOfficialDocumentPdf(model, labels, { logoData });
  await exportJsPdf(doc, filename);
}

export async function exportOfficialDocumentDocxFromTemplate(
  input: TemplateEngineInput,
  filename: string,
): Promise<void> {
  const model = buildOfficialDocumentFromTemplate(input);
  const labels = sickDogOfficialLabelsFromT(input.t);
  if (input.effective?.header) {
    labels.agencyLine1 = input.effective.header.organizationName || labels.agencyLine1;
    labels.agencyLine2 = input.effective.header.department || labels.agencyLine2;
    labels.radioTitle = input.effective.header.radioTitle || labels.radioTitle;
  }
  const logoData =
    input.builder === "message_demande" || input.builder === "heat_dog"
      ? await loadMessageDemandeOfficialLogo()
      : undefined;
  const bytes = await renderOfficialDocumentDocx(model, labels, { logoData });
  await savePlanningExportFiles([
    {
      filename,
      mimeType: DOCX_MIME,
      bytes,
    },
  ]);
}
