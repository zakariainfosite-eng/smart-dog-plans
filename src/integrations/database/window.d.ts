import type { ElectronDatabaseBridge } from "./electron-bridge";
import type { ElectronAuthBridge } from "@/integrations/auth/window";
import type { RestQueryRequest, RestQueryResult } from "./rest-query-types";

import type { ClearLocalDataResult } from "@/lib/clear-local-data";
import type { WindowsDbImportResult, WindowsDbInspection } from "@/lib/windows-db-import";

type ElectronDataBridge = {
  pickSqliteDatabase(): Promise<
    | { canceled: true }
    | { canceled: false; fileName: string; fileSize: number }
  >;
  inspectPickedSqliteDatabase(): Promise<WindowsDbInspection>;
  restorePickedSqliteDatabase(): Promise<WindowsDbImportResult>;
  clearLocalData(): Promise<ClearLocalDataResult>;
  clearPendingPick(): Promise<void>;
};

type ElectronFilesBridge = {
  saveExportFiles(request: {
    defaultBasename: string;
    files: Array<{
      filename: string;
      dataBase64?: string;
      data?: number[];
      byteLength?: number;
    }>;
  }): Promise<{ canceled: true } | { canceled: false; paths: string[] }>;
};

type ElectronRestBridge = {
  query(request: RestQueryRequest): Promise<RestQueryResult>;
  storageUpload(request: {
    bucket: string;
    path: string;
    dataBase64: string;
    contentType?: string;
    upsert?: boolean;
  }): Promise<{ error: { message: string } | null }>;
  storageRemove(request: {
    bucket: string;
    paths: string[];
  }): Promise<{ error: { message: string } | null }>;
  storageDownload(request: {
    bucket: string;
    path: string;
  }): Promise<{ data: string | null; error: { message: string } | null }>;
};

declare global {
  interface Window {
    cynoplanning?: {
      meta?: { platform: "electron"; desktopData: boolean };
      auth?: ElectronAuthBridge;
      database?: ElectronDatabaseBridge;
      data?: ElectronDataBridge;
      rest?: ElectronRestBridge;
      files?: ElectronFilesBridge;
    };
  }
}

export {};
