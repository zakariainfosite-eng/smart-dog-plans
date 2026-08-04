import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  MapPin, Plus, Pencil, Trash2, Moon, Users, Activity,
  ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import {
  createCheckpoint,
  deleteCheckpoint,
  getCheckpoints,
  updateCheckpoint,
  type Checkpoint,
  type CheckpointWithPosts,
} from "@/integrations/database";
import { PageTitle } from "@/components/layout/PageTitle";
import {
  PageTableShell,
  PageTablePagination,
  pageHeroLastUpdatedMeta,
} from "@/components/enterprise/page-layout";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { SearchField } from "@/components/enterprise/search-field";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { EnterpriseDataTable } from "@/components/enterprise/data-table";
import { RequirementBadges } from "@/components/enterprise/requirement-badges";
import { StatusBadge } from "@/components/enterprise/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckpointConfigDialog } from "@/components/checkpoints/checkpoint-config-dialog";
import { CheckpointOperationalSummary } from "@/components/checkpoints/checkpoint-operational-summary";
import {
  staffingCountsFromCheckpointRow,
  type CheckpointOperationalConfig,
} from "@/lib/checkpoints/operational-config";
import { formatPageLastUpdated, paginate, totalPages } from "@/lib/page-ui";

export const Route = createFileRoute("/_authenticated/checkpoints")({
  head: () => ({ meta: [{ title: "Points de contrôle — Smart K9 Planning" }] }),
  component: CheckpointsPage,
});

type FilterValue = "all" | "active" | "inactive" | "night";

const PAGE_SIZE = 15;

function CheckpointsPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.checkpoints.title");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Checkpoint | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CheckpointWithPosts | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["checkpoints-with-posts"],
    queryFn: () => getCheckpoints(),
  });

  const loadErrorMessage =
    error instanceof Error
      ? error.message
      : error
        ? String(error)
        : t("checkpoints.error.loadFailed");

  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      active: list.filter((c) => c.active).length,
      night: list.filter((c) => c.night_only).length,
      posts: list.reduce((sum, c) => sum + staffingCountsFromCheckpointRow(c).total, 0),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (isError) return [];
    return (data ?? []).filter((c) => {
      const q = search.toLowerCase();
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (filter === "active") return c.active;
      if (filter === "inactive") return !c.active;
      if (filter === "night") return c.night_only;
      return true;
    });
  }, [data, search, filter, isError]);

  const hasFilters = search.trim() !== "" || filter !== "all";

  const resetFilters = () => {
    setSearch("");
    setFilter("all");
    setPage(1);
  };

  const filteredTotal = filtered.length;
  const pages = totalPages(filteredTotal, PAGE_SIZE);
  const paginated = useMemo(
    () => paginate(filtered, page, PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search, filter]);


  const upsert = useMutation({
    mutationFn: async (values: CheckpointOperationalConfig & { id?: string }) => {
      if (values.id) {
        await updateCheckpoint(values.id, values);
        return;
      }
      await createCheckpoint(values);
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? t("checkpoints.toast.updated") : t("checkpoints.toast.created"));
      setDialogOpen(false); setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["checkpoints-with-posts"] });
    },
    onError: (e: Error) => {
      toast.error(
        e.message.includes("duplicate key") || e.message.includes("unique")
          ? t("checkpoints.toast.nameUnique")
          : e.message,
      );
    },
  });


  const remove = useMutation({
    mutationFn: async (cp: CheckpointWithPosts) => {
      await deleteCheckpoint(cp.id);
    },
    onSuccess: () => {
      toast.success(t("checkpoints.toast.deleted"));
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["checkpoints-with-posts"] });
    },
    onError: (e: Error) => {
      toast.error(
        e.message === "CHECKPOINT_HISTORY_EXISTS"
          ? t("checkpoints.error.historyExists")
          : e.message,
      );
    },
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (c: Checkpoint) => { setEditing(c); setDialogOpen(true); };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const columns = useMemo<ColumnDef<CheckpointWithPosts>[]>(
    () => [
      {
        id: "expand",
        header: () => null,
        meta: { width: "44px", align: "center" },
        cell: ({ row }) => {
          const isOpen = expanded.has(row.original.id);
          return (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={() => toggleExpanded(row.original.id)}
                aria-label={t("aria.togglePosts")}
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          );
        },
      },
      {
        id: "name",
        header: t("common.name"),
        meta: { width: "28%" },
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapPin className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <p className="truncate text-sm font-semibold leading-tight tabular-nums tracking-tight text-foreground">
                {c.name}
              </p>
            </div>
          );
        },
      },
      {
        id: "priority",
        header: t("checkpoints.config.priority"),
        meta: { width: "12%", align: "center" },
        cell: ({ row }) => (
          <div className="flex justify-center">
            <StatusBadge tone="neutral" className="px-2 py-0.5 text-[11px]">
              {row.original.priority} —{" "}
              {t(`checkpoints.config.priorityLevel.${row.original.priority}`)}
            </StatusBadge>
          </div>
        ),
      },
      {
        id: "mandatory",
        header: t("checkpoints.config.mandatory"),
        meta: { width: "10%", align: "center" },
        cell: ({ row }) => {
          const isMandatory = row.original.mandatory !== false;
          return (
            <div className="flex justify-center">
              <StatusBadge
                tone={isMandatory ? "danger" : "neutral"}
                className="px-2 py-0.5 text-[11px]"
              >
                {isMandatory
                  ? t("checkpoints.badge.mandatory")
                  : t("checkpoints.badge.optional")}
              </StatusBadge>
            </div>
          );
        },
      },
      {
        id: "femalePolicy",
        header: t("checkpoints.config.femaleAgents"),
        meta: { width: "12%", align: "center" },
        cell: ({ row }) => (
          <div className="flex justify-center">
            <StatusBadge tone="neutral" className="px-2 py-0.5 text-[11px]">
              {t(`checkpoints.config.femalePolicy.${row.original.female_policy}`)}
            </StatusBadge>
          </div>
        ),
      },
      {
        id: "requirements",
        header: t("checkpoints.table.operationalReqs"),
        meta: { width: "28%" },
        cell: ({ row }) => {
          const c = row.original;
          const staffing = staffingCountsFromCheckpointRow(c);
          return (
            <div className="min-w-0">
              <RequirementBadges
                narcotics={staffing.narcotics}
                explosives={staffing.explosives}
                narcoticsLabel={t("checkpoints.badge.narcotics")}
                explosivesLabel={t("checkpoints.badge.explosives")}
                className="gap-1"
              />
              <p className="mt-1 text-xs leading-tight text-[#6B7280]">
                {t("checkpoints.table.total", { count: staffing.total })}
              </p>
            </div>
          );
        },
      },
      {
        id: "status",
        header: t("common.status"),
        meta: { width: "12%", align: "center" },
        cell: ({ row }) => (
          <div className="flex justify-center">
            <StatusBadge
              tone={row.original.active ? "success" : "neutral"}
              className="px-2 py-0.5 text-[11px]"
            >
              {row.original.active ? t("common.active") : t("common.inactive")}
            </StatusBadge>
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        meta: { width: "88px", sticky: "right", align: "center" },
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => openEdit(row.original)}
              aria-label={t("aria.edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label={t("aria.delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [t, expanded],
  );

  return (
    <div className="space-y-6">
      <PageTitle
        icon={MapPin}
        title={t("checkpoints.title")}
        description={t("checkpoints.description")}
        loading={isLoading}
        meta={[
          { label: t("checkpoints.stat.total"), value: stats.total },
          pageHeroLastUpdatedMeta(
            t("common.page.lastUpdated"),
            formatPageLastUpdated(dataUpdatedAt, locale),
          ),
        ]}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("checkpoints.new")}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={MapPin} label={t("checkpoints.stat.total")} value={stats.total} accent="primary" loading={isLoading} />
        <KpiCard icon={Activity} label={t("common.active")} value={stats.active} accent="success" loading={isLoading} />
        <KpiCard icon={Moon} label={t("checkpoints.stat.nightOnly")} value={stats.night} accent="warning" loading={isLoading} />
        <KpiCard icon={Users} label={t("checkpoints.stat.requiredTeams")} value={stats.posts} accent="neutral" loading={isLoading} />
      </div>

      <FilterBar
        showReset={hasFilters}
        onReset={resetFilters}
        resetLabel={t("common.page.filterReset")}
      >
        <SearchField
          className="min-w-0 flex-1 lg:max-w-md"
          placeholder={t("common.searchByName")}
          value={search}
          onChange={setSearch}
        />
        <FilterPills>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
            <FilterSelectTrigger><SelectValue /></FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("checkpoints.filter.all")}</SelectItem>
              <SelectItem value="active">{t("common.active")}</SelectItem>
              <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
              <SelectItem value="night">{t("checkpoints.filter.nightOnly")}</SelectItem>
            </SelectContent>
          </Select>
        </FilterPills>
      </FilterBar>

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("checkpoints.error.loadFailed")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="break-words font-mono text-xs sm:text-sm">{loadErrorMessage}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/40 bg-background"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {t("checkpoints.error.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
      <PageTableShell
        header={
          <p className="text-sm font-medium text-foreground">
            {t("common.page.showing", { displayed: filteredTotal, total: stats.total })}
          </p>
        }
        footer={
          <PageTablePagination
            showingLabel={t("common.page.showing", {
              displayed: paginated.length,
              total: filteredTotal,
            })}
            page={page}
            totalPages={pages}
            onPageChange={setPage}
            prevLabel={t("common.page.prev")}
            nextLabel={t("common.page.next")}
          />
        }
      >
        <DataTableShell isLoading={isLoading} variant="readable">
          <EnterpriseDataTable
            data={paginated}
            columns={columns}
            getRowId={(row) => row.id}
            layout="fixed"
            density="comfortable"
            responsiveScroll
            isSubRowOpen={(row) => expanded.has(row.original.id)}
            renderSubRow={(row) => (
              <CheckpointOperationalSummary checkpoint={row.original} />
            )}
            emptyState={
              <EmptyState
                icon={MapPin}
                title={data?.length ? t("checkpoints.empty.noMatch") : t("checkpoints.empty.none")}
                description={data?.length ? t("common.tryAdjustFilters") : t("checkpoints.empty.createFirst")}
              />
            }
          />
        </DataTableShell>
      </PageTableShell>
      )}

      <CheckpointConfigDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        initial={editing}
        onSubmit={(config) => upsert.mutate({ ...config, id: editing?.id })}
        submitting={upsert.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("checkpoints.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("checkpoints.delete.description", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || remove.isPending}
              onClick={(e) => { e.preventDefault(); if (deleteTarget) remove.mutate(deleteTarget); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
