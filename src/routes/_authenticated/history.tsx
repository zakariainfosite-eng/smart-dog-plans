import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { Eye, History } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { PageTitle } from "@/components/layout/PageTitle";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  PageContentShell,
  PageTableShell,
  pageHeroLastUpdatedMeta,
} from "@/components/enterprise/page-layout";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { EnterpriseDataTable } from "@/components/enterprise/data-table";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { Button } from "@/components/ui/button";
import { PlanningHistoryDetailSheet } from "@/components/planning/planning-history-detail-sheet";
import { fetchPlanningHistory, type PlanningHistoryListItem } from "@/lib/planning/fetch-planning-history";
import { loadStoredPlanningDetail } from "@/lib/planning/load-stored-planning-detail";
import type { StoredPlanningDetail } from "@/lib/planning/load-stored-planning-detail";
import { formatPageLastUpdated } from "@/lib/page-ui";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Historique — Smart K9 Planning" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.history.title");
  const [selectedPlanningId, setSelectedPlanningId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoredPlanningDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const { data, isLoading, isError, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["planning-history"],
    queryFn: () => fetchPlanningHistory(db),
  });

  const lastUpdated = useMemo(
    () => formatPageLastUpdated(dataUpdatedAt, locale),
    [dataUpdatedAt, locale],
  );

  const openPlanning = async (planningId: string) => {
    if (loadingDetail) return;
    setLoadingDetail(true);
    setSelectedPlanningId(planningId);
    try {
      const loaded = await loadStoredPlanningDetail(db, planningId);
      setDetail(loaded);
      setDetailOpen(true);
    } catch (loadError) {
      console.error("[history] failed to load planning", loadError);
      toast.error(t("history.loadError"));
    } finally {
      setLoadingDetail(false);
    }
  };

  const columns = useMemo<ColumnDef<PlanningHistoryListItem>[]>(
    () => [
      {
        id: "date",
        header: t("history.table.date"),
        meta: { width: "16%" },
        cell: ({ row }) => (
          <span className="font-medium">
            {format(parseISO(row.original.planning_date), "dd/MM/yyyy")}
          </span>
        ),
      },
      {
        id: "section",
        header: t("history.table.section"),
        meta: { width: "22%" },
        cell: ({ row }) => (
          <span className="truncate">{row.original.section_name}</span>
        ),
      },
      {
        id: "shift",
        header: t("history.table.shift"),
        meta: { width: "12%" },
        cell: ({ row }) => t(`shift.${row.original.shift}`),
      },
      {
        id: "agents",
        header: t("history.table.agentsLabel"),
        meta: { width: "12%", align: "center" },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.agent_count}</span>
        ),
      },
      {
        id: "dogs",
        header: t("history.table.dogsLabel"),
        meta: { width: "12%", align: "center" },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.dog_count}</span>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        meta: { width: "14%", align: "center" },
        cell: ({ row }) => (
          <div className="flex justify-center">
            <StatusBadge tone={row.original.validated ? "success" : "warning"}>
              {t(`status.${row.original.validated ? "validated" : "draft"}`)}
            </StatusBadge>
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        meta: { width: "12%", align: "center" },
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            disabled={loadingDetail && selectedPlanningId === row.original.id}
            onClick={() => void openPlanning(row.original.id)}
          >
            <Eye className="mr-2 h-4 w-4" />
            {t("history.open")}
          </Button>
        ),
      },
    ],
    [t, loadingDetail, selectedPlanningId],
  );

  return (
    <div className="space-y-6 pb-8">
      <PageTitle
        icon={History}
        title={t("history.title")}
        description={t("history.description")}
        meta={[
          pageHeroLastUpdatedMeta(t("common.page.lastUpdated"), lastUpdated),
          {
            label: t("history.stat.total"),
            value: data?.length ?? 0,
          },
        ]}
      />

      <PageTableShell
        header={
          <p className="text-sm font-medium text-foreground">
            {t("history.table.count", { count: data?.length ?? 0 })}
          </p>
        }
      >
        <DataTableShell isLoading={isLoading} variant="readable">
          {isError ? (
            <PageContentShell>
              <EmptyState
                icon={History}
                title={t("history.error.title")}
                description={error instanceof Error ? error.message : t("history.error.description")}
                action={
                  <Button variant="outline" onClick={() => void refetch()}>
                    {t("action.tryAgain")}
                  </Button>
                }
              />
            </PageContentShell>
          ) : !isLoading && (data?.length ?? 0) === 0 ? (
            <PageContentShell>
              <EmptyState
                icon={History}
                title={t("history.empty.title")}
                description={t("history.empty.description")}
              />
            </PageContentShell>
          ) : (
            <EnterpriseDataTable
              data={data ?? []}
              columns={columns}
              getRowId={(row) => row.id}
              layout="fixed"
              density="comfortable"
              responsiveScroll
            />
          )}
        </DataTableShell>
      </PageTableShell>

      <PlanningHistoryDetailSheet
        detail={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDeleted={() => {
          setDetail(null);
          void refetch();
        }}
      />
    </div>
  );
}
