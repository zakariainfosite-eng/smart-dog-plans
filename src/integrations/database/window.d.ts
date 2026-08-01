import type { ElectronDatabaseBridge } from "./electron-bridge";
import type { ElectronAuthBridge } from "@/integrations/auth/window";
import type { RestQueryRequest, RestQueryResult } from "./rest-query-types";

type ElectronFilesBridge = {
  saveExportFiles(request: {
    defaultBasename: string;
    files: Array<{ filename: string; dataBase64?: string; data?: number[] }>;
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
      auth?: ElectronAuthBridge;
      database?: ElectronDatabaseBridge;
      rest?: ElectronRestBridge;
      files?: ElectronFilesBridge;
    };
  }
}

export {};
