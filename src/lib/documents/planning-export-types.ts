export type PlanningExportFormat = "pdf" | "docx" | "both";

export type PlanningExportFile = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type PlanningExportSaveResult =
  | { canceled: true }
  | { canceled: false; paths: string[] };
