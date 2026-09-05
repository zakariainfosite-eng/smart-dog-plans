export type {
  OfficialCorrespondence,
  OfficialDocumentBody,
  OfficialDocumentBuildContext,
  OfficialDocumentKind,
  OfficialDocumentModel,
  OfficialFactRow,
  OfficialPriority,
  OfficialRadioDepartHeader,
  OfficialRadioDepartTable,
  OfficialRadioTableCell,
  OfficialSignatory,
} from "@/lib/reports-messages/official-document/types";

export { A4, contentBottom, contentWidth, MESSAGE_SIGNATURE_LAYOUT } from "@/lib/reports-messages/official-document/layout";

export {
  MESSAGE_BODY_LAYOUT,
  layoutJustifiedMessage,
} from "@/lib/reports-messages/official-document/justified-text";

export {
  buildSickDogOfficialDocument,
  sickDogOfficialLabelsFromT,
} from "@/lib/reports-messages/official-document/build-sick-dog-document";

export { renderOfficialDocumentPdf } from "@/lib/reports-messages/official-document/render-official-pdf";
export type { OfficialPdfRenderOptions } from "@/lib/reports-messages/official-document/render-official-pdf";

export {
  renderOfficialDocumentDocx,
} from "@/lib/reports-messages/official-document/render-official-docx";
export type { OfficialDocxRenderOptions } from "@/lib/reports-messages/official-document/render-official-docx";

export { loadMessageDemandeOfficialLogo } from "@/lib/reports-messages/official-document/message-demande-logo";

export { exportSickDogReportPdf } from "@/lib/reports-messages/official-document/export-sick-dog-pdf";
