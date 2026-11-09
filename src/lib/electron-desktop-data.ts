import type { ClearLocalDataResult } from "@/lib/clear-local-data";
import { ClearLocalDataError } from "@/lib/clear-local-data";
import {
  WindowsDbImportError,
  type ActiveDatabaseDiagnostics,
  type WindowsDbImportResult,
  type WindowsDbInspection,
} from "@/lib/windows-db-import";

type ElectronDataBridge = {
  pickSqliteDatabase(): Promise<
    | { canceled: true }
    | { canceled: false; fileName: string; fileSize: number }
  >;
  inspectPickedSqliteDatabase(): Promise<WindowsDbInspection>;
  restorePickedSqliteDatabase(): Promise<WindowsDbImportResult>;
  getActiveDatabaseDiagnostics(): Promise<ActiveDatabaseDiagnostics>;
  clearLocalData(): Promise<ClearLocalDataResult>;
  clearPendingPick(): Promise<void>;
};

type ElectronAppBridge = {
  relaunch(): Promise<void>;
};

function getDataBridge(): ElectronDataBridge {
  const bridge = globalThis.window?.cynoplanning?.data;
  if (!bridge) {
    throw new Error("Electron data bridge is not available.");
  }
  return bridge;
}

function getAppBridge(): ElectronAppBridge {
  const bridge = globalThis.window?.cynoplanning?.app;
  if (!bridge?.relaunch) {
    throw new Error("Electron app bridge is not available.");
  }
  return bridge;
}

function mapDesktopDataError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "invalid_file") {
    throw new WindowsDbImportError("invalid_file", "Selected file is not a valid SQLite database.");
  }
  if (message === "no_pick") {
    throw new WindowsDbImportError("unreadable", "No database file is selected.");
  }
  if (message.startsWith("integrity:") || message.startsWith("leftover:")) {
    throw new ClearLocalDataError("clear_failed", "Local data could not be cleared.");
  }
  if (message.includes("backup")) {
    throw new ClearLocalDataError("backup_failed", "Local database backup failed. Operation cancelled.");
  }
  throw error;
}

export async function pickElectronSqliteDatabase(): Promise<{
  fileName: string;
  fileSize: number;
} | null> {
  try {
    const result = await getDataBridge().pickSqliteDatabase();
    if (result.canceled) return null;
    return { fileName: result.fileName, fileSize: result.fileSize };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "invalid_file") {
      throw new WindowsDbImportError("invalid_file", "Selected file is not a valid SQLite database.");
    }
    mapDesktopDataError(error);
  }
}

export async function inspectElectronPickedDatabase(): Promise<WindowsDbInspection> {
  try {
    return await getDataBridge().inspectPickedSqliteDatabase();
  } catch (error) {
    mapDesktopDataError(error);
  }
}

export async function restoreElectronPickedDatabase(): Promise<WindowsDbImportResult> {
  try {
    return await getDataBridge().restorePickedSqliteDatabase();
  } catch (error) {
    if (error instanceof WindowsDbImportError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message === "backup_failed") {
      throw new WindowsDbImportError("backup_failed", "Windows database backup failed. Import cancelled.");
    }
    if (message.startsWith("import_verify_failed")) {
      throw new WindowsDbImportError(
        "import_failed",
        "Imported database was not activated — row counts on disk do not match the selected file.",
        { cause: error },
      );
    }
    throw new WindowsDbImportError("import_failed", "Windows database import failed.", { cause: error });
  }
}

export async function getElectronActiveDatabaseDiagnostics(): Promise<ActiveDatabaseDiagnostics> {
  return getDataBridge().getActiveDatabaseDiagnostics();
}

export async function relaunchElectronApp(): Promise<void> {
  await getAppBridge().relaunch();
}

export async function clearLocalElectronData(): Promise<ClearLocalDataResult> {
  try {
    return await getDataBridge().clearLocalData();
  } catch (error) {
    if (error instanceof ClearLocalDataError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message === "backup_failed") {
      throw new ClearLocalDataError("backup_failed", "Local database backup failed. Clear cancelled.");
    }
    if (message === "clear_failed") {
      throw new ClearLocalDataError("clear_failed", "Local data could not be cleared.", { cause: error });
    }
    throw new ClearLocalDataError("clear_failed", "Local data could not be cleared.", { cause: error });
  }
}

export async function cancelElectronDatabasePick(): Promise<void> {
  await getDataBridge().clearPendingPick();
}
