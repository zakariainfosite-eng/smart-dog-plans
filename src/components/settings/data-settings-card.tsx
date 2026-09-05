import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Database, HardDriveUpload, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageContentShell } from "@/components/enterprise/page-layout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import {
  ClearLocalDataError,
  canClearLocalData,
  clearLocalAndroidData,
} from "@/lib/clear-local-data";
import { isElectronDesktopRuntime } from "@/lib/runtime-platform";
import {
  WindowsDbImportError,
  canImportWindowsDatabase,
  inspectWindowsDatabase,
  importWindowsDatabase,
  isSqliteDatabaseBytes,
  readPickedDatabaseFile,
  type WindowsDbImportResult,
  type WindowsDbInspection,
} from "@/lib/windows-db-import";

const WINDOWS_DB_ACCEPT = ".db,.sqlite,.sqlite3,application/x-sqlite3,application/vnd.sqlite3,application/octet-stream";

export function DataSettingsCard() {
  const { t } = useI18n();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const canImport = canImportWindowsDatabase(role);
  const canClear = canClearLocalData(role);
  const onDesktop = isElectronDesktopRuntime();

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "inspecting" | "importing" | "clearing">("idle");
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [pending, setPending] = useState<{
    fileName: string;
    fileSize: number;
    bytes: Uint8Array;
    inspection: WindowsDbInspection;
  } | null>(null);
  const [result, setResult] = useState<WindowsDbImportResult | null>(null);

  const resetFileInput = () => {
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = async (file: File | null) => {
    resetFileInput();
    if (!file || !canImport || busy) return;

    setBusy(true);
    setPhase("inspecting");
    setResult(null);
    try {
      const bytes = await readPickedDatabaseFile(file);
      if (!isSqliteDatabaseBytes(bytes)) {
        toast.error(t("settings.data.windowsImport.toast.invalidFile"));
        return;
      }

      const { getLocalSqliteExecutor } = await import("@/integrations/database/local-sqlite");
      const executor = await getLocalSqliteExecutor();
      const inspection = await inspectWindowsDatabase({
        fileName: file.name,
        fileSize: file.size,
        bytes,
        executor,
      });
      setPending({
        fileName: file.name,
        fileSize: file.size,
        bytes,
        inspection,
      });
    } catch (error) {
      const code = error instanceof WindowsDbImportError ? error.code : "unreadable";
      toast.error(
        code === "invalid_file"
          ? t("settings.data.windowsImport.toast.invalidFile")
          : t("settings.data.windowsImport.toast.unreadable"),
      );
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  };

  const onCancelImport = () => {
    if (busy) return;
    setPending(null);
    toast.message(t("settings.data.windowsImport.toast.canceled"));
  };

  const closePendingDialog = (open: boolean) => {
    if (open || busy) return;
    setPending(null);
  };

  const onConfirmImport = async () => {
    if (!pending || !canImport || busy) return;
    setBusy(true);
    setPhase("importing");
    try {
      const imported = await importWindowsDatabase(pending);
      setPending(null);
      setResult(imported);
      await queryClient.invalidateQueries();
      toast.success(
        t("settings.data.windowsImport.toast.success", {
          imported: imported.imported,
          skipped: imported.skipped,
          conflicts: imported.conflicts,
        }),
      );
    } catch (error) {
      const code = error instanceof WindowsDbImportError ? error.code : "import_failed";
      if (code === "backup_failed") {
        toast.error(t("settings.data.windowsImport.toast.backupFailed"));
      } else {
        toast.error(t("settings.data.windowsImport.toast.failed"));
      }
      setPending(null);
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  };

  const closeClearDialog = (open: boolean) => {
    if (open || busy) return;
    setConfirmClear(false);
  };

  const onConfirmClear = async () => {
    if (!canClear || busy) return;
    setBusy(true);
    setPhase("clearing");
    try {
      await clearLocalAndroidData();
      setConfirmClear(false);
      setCleared(true);
      await queryClient.invalidateQueries();
      toast.success(t("settings.data.clearLocal.success"));
    } catch (error) {
      const code = error instanceof ClearLocalDataError ? error.code : "clear_failed";
      toast.error(
        code === "backup_failed"
          ? t("settings.data.clearLocal.toast.backupFailed")
          : t("settings.data.clearLocal.toast.failed"),
      );
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  };

  const counts = pending?.inspection.confirmationCounts;
  const incompatible = pending?.inspection.incompatibleTables ?? [];
  const statusNote = onDesktop
    ? t("settings.data.desktopUnavailable")
    : canImport
      ? t("settings.data.windowsImport.hint")
      : t("settings.data.viewOnly");

  return (
    <PageContentShell padding={false} className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-muted via-muted/80 to-muted/60 text-muted-foreground">
            <Database className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{t("settings.data.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.data.description")}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">{statusNote}</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="rounded-xl border border-border/70 bg-muted/15 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight">
                {t("settings.data.windowsImport.title")}
              </h3>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                {t("settings.data.windowsImport.description")}
              </p>
            </div>
            <div className="shrink-0">
              <input
                ref={fileRef}
                type="file"
                accept={WINDOWS_DB_ACCEPT}
                className="hidden"
                onChange={(event) => void onPickFile(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={!canImport || busy}
              >
                <HardDriveUpload className="h-4 w-4" />
                {busy && phase === "inspecting"
                  ? t("settings.data.windowsImport.inspecting")
                  : t("settings.data.windowsImport.button")}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/70 bg-muted/15 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight">
                {t("settings.data.clearLocal.title")}
              </h3>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                {t("settings.data.clearLocal.description")}
              </p>
            </div>
            <div className="shrink-0">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmClear(true)}
                disabled={!canClear || busy}
              >
                <Trash2 className="h-4 w-4" />
                {busy && phase === "clearing"
                  ? t("settings.data.clearLocal.clearing")
                  : t("settings.data.clearLocal.button")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={Boolean(pending)} onOpenChange={closePendingDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.data.windowsImport.detectedTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <ul className="space-y-1 tabular-nums">
                  <li>
                    {t("settings.data.windowsImport.counts.agents")}: {counts?.agents ?? 0}
                  </li>
                  <li>
                    {t("settings.data.windowsImport.counts.dogs")}: {counts?.dogs ?? 0}
                  </li>
                  <li>
                    {t("settings.data.windowsImport.counts.checkpoints")}: {counts?.checkpoints ?? 0}
                  </li>
                  <li>
                    {t("settings.data.windowsImport.counts.planning")}: {counts?.planning ?? 0}
                  </li>
                  <li>
                    {t("settings.data.windowsImport.counts.exclusions")}: {counts?.exclusions ?? 0}
                  </li>
                  <li>
                    {t("settings.data.windowsImport.counts.users")}: {counts?.users ?? 0}
                  </li>
                </ul>
                {incompatible.length > 0 ? (
                  <p>
                    {t("settings.data.windowsImport.incompatible", {
                      tables: incompatible.map((item) => item.name).join(", "),
                    })}
                  </p>
                ) : null}
                <p className="font-medium text-foreground">
                  {t("settings.data.windowsImport.confirmQuestion")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={onCancelImport}>
              {t("settings.data.windowsImport.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void onConfirmImport();
              }}
            >
              {busy && phase === "importing"
                ? t("settings.data.windowsImport.importing")
                : t("settings.data.windowsImport.import")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(result)} onOpenChange={(open) => !open && setResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.data.windowsImport.result.title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{t("settings.data.windowsImport.result.imported", { count: result?.imported ?? 0 })}</p>
                <p>{t("settings.data.windowsImport.result.skipped", { count: result?.skipped ?? 0 })}</p>
                <p>{t("settings.data.windowsImport.result.conflicts", { count: result?.conflicts ?? 0 })}</p>
                {result && result.conflictReports.length > 0 ? (
                  <ul className="max-h-40 space-y-1 overflow-auto text-xs">
                    {result.conflictReports.slice(0, 40).map((item, index) => (
                      <li key={`${item.table}-${item.reason}-${index}`}>
                        {item.table}: {item.detail}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setResult(null)}>
              {t("settings.data.windowsImport.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClear} onOpenChange={closeClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.data.clearLocal.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.data.clearLocal.confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("settings.data.clearLocal.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void onConfirmClear();
              }}
            >
              {busy && phase === "clearing"
                ? t("settings.data.clearLocal.clearing")
                : t("settings.data.clearLocal.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cleared} onOpenChange={(open) => !open && setCleared(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.data.clearLocal.successTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.data.clearLocal.success")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setCleared(false)}>
              {t("settings.data.clearLocal.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContentShell>
  );
}
