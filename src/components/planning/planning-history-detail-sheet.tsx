import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Dog as DogIcon,
  FileDown,
  FileText,
  Files,
  Loader2,
  MapPin,
  Moon,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { PageContentShell } from "@/components/enterprise/page-layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { exportFeuillePresencePlanning } from "@/lib/documents/planning-export";
import type { PlanningExportFormat } from "@/lib/documents/planning-export-types";
import { formatUnknownError } from "@/lib/documents/export-error";
import { downloadFeuillePresencePdfWithLogo } from "@/lib/documents/feuille-presence-pdf";
import { deleteStoredPlanning } from "@/lib/planning/delete-stored-planning";
import type { StoredPlanningDetail } from "@/lib/planning/load-stored-planning-detail";
import { prepareStoredPlanningExport } from "@/lib/planning/load-stored-planning-detail";
import type { CheckpointAssignment } from "@/lib/planning/engine";
import { translatePoint653Reason } from "@/lib/planning-i18n";
import { useI18n } from "@/hooks/use-i18n";

type PlanningHistoryDetailSheetProps = {
  detail: StoredPlanningDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
};

export function PlanningHistoryDetailSheet({
  detail,
  open,
  onOpenChange,
  onDeleted,
}: PlanningHistoryDetailSheetProps) {
  const { t } = useI18n();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!detail) return null;

  const checkpoints = detail.engineResult.checkpoints.filter((cp) => cp.total_staffed > 0);
  const summary = detail.engineResult.summary;

  const handleExport = async (format: PlanningExportFormat) => {
    setExporting(true);
    try {
      const bundle = await prepareStoredPlanningExport(db, detail.id);
      const saveResult = await exportFeuillePresencePlanning(
        {
          planningDate: bundle.planningDate,
          data: bundle.data,
          basename: bundle.basename,
        },
        format,
      );

      if (saveResult.canceled) {
        toast.message(t("history.export.canceled"));
        return;
      }

      toast.success(
        format === "both" ? t("history.export.successBoth") : t("history.export.success"),
      );
    } catch (error) {
      toast.error(`${t("history.export.error")}\n${formatUnknownError(error)}`, {
        duration: 12_000,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setExporting(true);
    try {
      const bundle = await prepareStoredPlanningExport(db, detail.id);
      await downloadFeuillePresencePdfWithLogo({
        year: bundle.planningDate.getFullYear(),
        data: bundle.data,
        filename: `${bundle.basename}.pdf`,
      });
      toast.success(t("history.export.pdfSuccess"));
    } catch (error) {
      toast.error(`${t("history.export.error")}\n${formatUnknownError(error)}`, {
        duration: 12_000,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteStoredPlanning(db, detail.id);
      toast.success(t("history.delete.success"));
      setConfirmDelete(false);
      onOpenChange(false);
      onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("history.delete.error"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader className="space-y-3 text-left">
            <SheetTitle>{t("history.detail.title")}</SheetTitle>
            <SheetDescription>
              {format(parseISO(detail.planning_date), "PPP")} · {detail.section.name} ·{" "}
              {t(`shift.${detail.shift}`)}
            </SheetDescription>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={detail.validated ? "success" : "warning"}>
                {t(`status.${detail.validated ? "validated" : "draft"}`)}
              </StatusBadge>
              <Badge variant="outline">
                {t("history.table.agents", { count: summary.assignedToCheckpoints + summary.point653Employees + summary.restEmployees })}
              </Badge>
              <Badge variant="outline">
                {t("history.table.dogs", {
                  count: detail.engineResult.assignments.filter((row) => row.dog_id).length
                    + detail.engineResult.point653.filter((row) => row.dog_id).length
                    + detail.engineResult.offDuty.filter((row) => row.dog_id).length,
                })}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={exporting} onClick={() => void handleDownloadPdf()}>
                <FileDown className="mr-2 h-4 w-4" />
                {t("history.export.pdf")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="default" size="sm" disabled={exporting}>
                    {exporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Files className="mr-2 h-4 w-4" />
                    )}
                    {t("history.export.menu")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => void handleExport("pdf")}>
                    <FileText className="mr-2 h-4 w-4" />
                    {t("history.export.pdf")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleExport("docx")}>
                    <FileText className="mr-2 h-4 w-4" />
                    {t("history.export.docx")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void handleExport("both")}>
                    <Files className="mr-2 h-4 w-4" />
                    {t("history.export.both")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("history.delete.action")}
              </Button>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label={t("dailyPlanning.stat.assigned")}
                value={summary.assignedToCheckpoints}
                accent="success"
              />
              <KpiCard
                label={t("dailyPlanning.stat.point653")}
                value={summary.point653Employees}
                accent="primary"
              />
              <KpiCard
                label={t("dailyPlanning.stat.rest")}
                value={summary.restEmployees}
                accent="primary"
              />
              <KpiCard
                label={t("dailyPlanning.stat.fullyStaffed")}
                value={summary.fullyStaffedCheckpoints}
                accent="success"
              />
            </div>

            <PlanningAssignmentsView checkpoints={checkpoints} />

            {detail.engineResult.offDuty.length > 0 ? (
              <PageContentShell>
                <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
                  <Moon className="h-4 w-4" />
                  {t("dailyPlanning.rest.title", { count: detail.engineResult.offDuty.length })}
                </h3>
                <ul className="divide-y">
                  {detail.engineResult.offDuty.map((entry) => (
                    <li key={entry.agent_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <StatusBadge tone="neutral">{t("dailyPlanning.rest.badge")}</StatusBadge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {entry.professional_number}
                      </span>
                      <span className="font-medium">{entry.agent_name}</span>
                      {entry.dog_name ? (
                        <span className="text-muted-foreground">· {entry.dog_name}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </PageContentShell>
            ) : null}

            {detail.engineResult.point653.length > 0 ? (
              <PageContentShell>
                <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {t("dailyPlanning.point653.title", { count: detail.engineResult.point653.length })}
                </h3>
                <ul className="divide-y">
                  {detail.engineResult.point653.map((entry) => (
                    <li key={entry.agent_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <StatusBadge tone="primary">{t("dailyPlanning.point653.badge")}</StatusBadge>
                      <span className="font-mono text-xs text-muted-foreground">
                        #{entry.professional_number}
                      </span>
                      <span className="font-medium">{entry.agent_name}</span>
                      {entry.dog_name ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <DogIcon className="h-3 w-3" /> {entry.dog_name}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground">
                        {translatePoint653Reason(entry.reason, t)}
                      </span>
                    </li>
                  ))}
                </ul>
              </PageContentShell>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("history.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("history.delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? t("history.delete.deleting") : t("history.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PlanningAssignmentsView({ checkpoints }: { checkpoints: CheckpointAssignment[] }) {
  const { t } = useI18n();

  return (
    <PageContentShell>
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <MapPin className="h-5 w-5" /> {t("dailyPlanning.assignments.title")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("dailyPlanning.assignments.description")}</p>
      </div>
      <div className="mt-4">
        {checkpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("dailyPlanning.assignments.noCheckpoints")}
          </p>
        ) : (
          <div className="space-y-4">
            {checkpoints.map((cp) => (
              <div key={cp.checkpoint_id} className="enterprise-card rounded-2xl p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{cp.checkpoint_name}</span>
                  {cp.night_only ? (
                    <StatusBadge tone="primary">
                      <Moon className="h-3 w-3" /> {t("dailyPlanning.badge.nightOnly")}
                    </StatusBadge>
                  ) : null}
                  {cp.is_understaffed ? (
                    <StatusBadge tone="danger">{t("dailyPlanning.badge.understaffed")}</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">{t("dailyPlanning.badge.fullyStaffed")}</StatusBadge>
                  )}
                </div>
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">{t("dailyPlanning.table.specialty")}</th>
                        <th className="px-4 py-3 font-medium">{t("dailyPlanning.table.handler")}</th>
                        <th className="px-4 py-3 font-medium">{t("dailyPlanning.table.dog")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cp.slots.map((slot, idx) => (
                        <tr
                          key={`${cp.checkpoint_id}-${slot.post_id}-${idx}`}
                          className="border-b border-border/40 even:bg-muted/20"
                        >
                          <td className="px-4 py-3 font-medium">
                            {t(`specialty.${slot.specialty_required}`)}
                          </td>
                          <td className="px-4 py-3">
                            {slot.team ? (
                              <span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  #{slot.team.professional_number}
                                </span>{" "}
                                {slot.team.agent_name}
                              </span>
                            ) : (
                              <span className="italic text-destructive">
                                {t("dailyPlanning.slot.unfilled")}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {slot.team?.dog_name ? (
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <DogIcon className="h-3.5 w-3.5" /> {slot.team.dog_name}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContentShell>
  );
}
