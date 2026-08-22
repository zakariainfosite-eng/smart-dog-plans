import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import {
  agentHistoryEventTypeI18nKey,
  canManageAgentHistory,
  deleteAgentHistoryEntry,
  formatHistoryDate,
  type AgentAdministrativeHistoryRow,
} from "@/lib/agent-history";
import { AgentHistoryDialog } from "@/components/agents/agent-history-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/enterprise/status-badge";

type AgentAdministrativeHistoryProps = {
  agentId: string;
  entries: AgentAdministrativeHistoryRow[];
};

export function AgentAdministrativeHistory({ agentId, entries }: AgentAdministrativeHistoryProps) {
  const { t } = useI18n();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canManage = canManageAgentHistory(role);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentAdministrativeHistoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentAdministrativeHistoryRow | null>(null);

  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const byStart = b.start_date.localeCompare(a.start_date);
        if (byStart !== 0) return byStart;
        return b.created_at.localeCompare(a.created_at);
      }),
    [entries],
  );

  const deleteMutation = useMutation({
    mutationFn: async (row: AgentAdministrativeHistoryRow) => {
      await deleteAgentHistoryEntry(db, row.id);
    },
    onSuccess: async () => {
      toast.success(t("agentDetails.adminHistory.toast.deleted"));
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["agent-details", agentId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row: AgentAdministrativeHistoryRow) => {
    setEditing(row);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("agentDetails.adminHistory.subtitle")}</p>
        {canManage ? (
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t("agentDetails.adminHistory.add")}
          </Button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("agentDetails.adminHistory.empty")}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {sorted.map((row) => (
            <li key={row.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatHistoryDate(row.start_date)}
                    {row.end_date ? ` → ${formatHistoryDate(row.end_date)}` : ""}
                  </span>
                  <StatusBadge tone="primary">
                    {t(agentHistoryEventTypeI18nKey(row.event_type))}
                  </StatusBadge>
                  {row.source_type !== "manual" ? (
                    <StatusBadge tone="neutral">
                      {t(`agentDetails.adminHistory.source.${row.source_type}`)}
                    </StatusBadge>
                  ) : null}
                </div>

                {row.reason?.trim() ? (
                  <p className="text-sm leading-snug text-foreground">{row.reason.trim()}</p>
                ) : null}
                {row.observation?.trim() ? (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {row.observation.trim()}
                  </p>
                ) : null}

                <p className="text-[11px] text-muted-foreground">
                  {row.reference?.trim()
                    ? `${t("agentDetails.adminHistory.field.reference")}: ${row.reference.trim()} · `
                    : ""}
                  {t("agentDetails.adminHistory.field.createdAt")}:{" "}
                  {formatHistoryDate(row.created_at)}
                  {" · "}
                  {t("agentDetails.adminHistory.field.createdBy")}:{" "}
                  {row.created_by?.trim() || t("common.none")}
                </p>
              </div>

              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={t("common.actions")}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(row)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t("action.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("action.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <>
          <AgentHistoryDialog
            agentId={agentId}
            entry={editing}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />

          <AlertDialog
            open={!!deleteTarget}
            onOpenChange={(next) => !next && setDeleteTarget(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("agentDetails.adminHistory.delete.title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("agentDetails.adminHistory.delete.description")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: "danger" })}
                  onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
                >
                  {t("action.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  );
}
