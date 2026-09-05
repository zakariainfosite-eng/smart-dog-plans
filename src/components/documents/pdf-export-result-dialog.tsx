import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/hooks/use-i18n";
import {
  dismissPdfExportResult,
  getPdfExportResult,
  logPdfExport,
  logPdfExportError,
  openPdfWithSystemViewer,
  subscribePdfExportResult,
} from "@/lib/documents/pdf-export-result";

export function PdfExportResultDialog() {
  const { t } = useI18n();
  const result = useSyncExternalStore(
    subscribePdfExportResult,
    getPdfExportResult,
    getPdfExportResult,
  );

  const openFile = async () => {
    if (!result) return;
    logPdfExport("Open URI:", result.uri);
    try {
      await openPdfWithSystemViewer(result.uri);
    } catch (error) {
      logPdfExportError("Open failed", error instanceof Error ? error.message : String(error));
      toast.error(t("pdfExport.openError"));
    }
  };

  const shareFile = async () => {
    if (!result) return;
    logPdfExport("Share URI:", result.uri);
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: result.filename,
        url: result.uri,
        dialogTitle: t("pdfExport.share"),
      });
    } catch (error) {
      logPdfExportError("Share failed", error instanceof Error ? error.message : String(error));
      toast.error(t("pdfExport.shareError"));
    }
  };

  return (
    <AlertDialog open={Boolean(result)} onOpenChange={(open) => !open && dismissPdfExportResult()}>
      <AlertDialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("pdfExport.savedTitle")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1">
              <p className="break-all font-medium text-foreground">{result?.filename}</p>
              {result?.directoryLabel ? (
                <p className="text-xs text-muted-foreground">{result.directoryLabel}</p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" className="w-full" onClick={() => void openFile()}>
            {t("pdfExport.open")}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => void shareFile()}>
            {t("pdfExport.share")}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => dismissPdfExportResult()}>
            {t("pdfExport.close")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
