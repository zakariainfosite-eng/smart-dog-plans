import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Briefcase,
  CalendarDays,
  Flame,
  Plus,
  Scale,
} from "lucide-react";
import { toast } from "sonner";

import { PageTitle } from "@/components/layout/PageTitle";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { SearchField } from "@/components/enterprise/search-field";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import {
  PageTableShell,
  pageHeroLastUpdatedMeta,
} from "@/components/enterprise/page-layout";
import { formatPageLastUpdated } from "@/lib/page-ui";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import {
  Select,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
import {
  OperationalCaseDialog,
  type OperationalCaseDialogMode,
} from "@/components/operational-cases/operational-case-dialog";
import { OperationalCasesTable } from "@/components/operational-cases/operational-cases-table";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { db } from "@/integrations/database/client";
import { getAgents } from "@/integrations/database";
import {
  checkpointLabel,
  fetchOperationalCases,
  deleteOperationalCase,
  type OperationalCaseWithRelations,
} from "@/lib/operational-case-api";
import { printOperationalCase } from "@/lib/operational-case-print";
import {
  caseDisplayStatus,
  caseSpecialtyLabel,
  caseStatusLabel,
  computeOperationalCasesStats,
  type CaseDisplayStatus,
} from "@/lib/operational-cases";
import { formatKg } from "@/lib/operational-case-stats";
import type { Database } from "@/integrations/database/schema-types";

type OperationalCaseSpecialty = Database["public"]["Enums"]["operational_case_specialty"];

export const Route = createFileRoute("/_authenticated/operational-cases")({
  head: () => ({ meta: [{ title: "Cas opérationnels — Smart K9 Planning" }] }),
  component: OperationalCasesPage,
});

const SPECIALTY_ORDER: OperationalCaseSpecialty[] = ["narcotics", "explosives", "currency"];
const STATUS_ORDER: CaseDisplayStatus[] = ["closed", "in_progress", "draft"];

function OperationalCasesPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.operationalCases.title");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [checkpointFilter, setCheckpointFilter] = useState<string>("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<"all" | OperationalCaseSpecialty>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CaseDisplayStatus>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<OperationalCaseDialogMode>("create");
  const [activeCase, setActiveCase] = useState<OperationalCaseWithRelations | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OperationalCaseWithRelations | null>(null);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["operational-cases"],
    queryFn: () => fetchOperationalCases(db),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-basic-operational-cases"],
    queryFn: async () => {
      const rows = await getAgents();
      return rows
        .filter((row) => row.active)
        .map((row) => ({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const stats = useMemo(() => computeOperationalCasesStats(data ?? []), [data]);

  const totalSeizedLabel = useMemo(() => {
    const parts: string[] = [];
    if (stats.totalNarcoticsKg > 0) parts.push(`${formatKg(stats.totalNarcoticsKg)} kg`);
    if (stats.totalExplosiveObjects > 0) parts.push(`${stats.totalExplosiveObjects} obj.`);
    if (stats.totalCurrencyAmount > 0) {
      parts.push(stats.totalCurrencyAmount.toLocaleString(undefined, { maximumFractionDigits: 0 }));
    }
    return parts.length ? parts.join(" · ") : "0";
  }, [stats]);

  const checkpoints = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.checkpoint) map.set(row.checkpoint.id, row.checkpoint.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((row) => {
      const q = search.toLowerCase();
      if (q) {
        const hay = [
          row.case_number,
          checkpointLabel(row),
          row.agent ? `${row.agent.first_name} ${row.agent.last_name}` : "",
          row.agent?.professional_number ?? "",
          row.dog?.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dateFilter && row.case_date !== dateFilter) return false;
      if (checkpointFilter !== "all" && row.checkpoint_id !== checkpointFilter) return false;
      if (specialtyFilter !== "all" && row.specialty !== specialtyFilter) return false;
      if (statusFilter !== "all" && caseDisplayStatus(row) !== statusFilter) return false;
      if (agentFilter !== "all" && row.agent_id !== agentFilter) return false;
      return true;
    });
  }, [data, search, dateFilter, checkpointFilter, specialtyFilter, statusFilter, agentFilter]);

  const hasActiveFilters =
    !!search ||
    !!dateFilter ||
    checkpointFilter !== "all" ||
    specialtyFilter !== "all" ||
    statusFilter !== "all" ||
    agentFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setDateFilter("");
    setCheckpointFilter("all");
    setSpecialtyFilter("all");
    setStatusFilter("all");
    setAgentFilter("all");
  };

  const lastUpdated = formatPageLastUpdated(dataUpdatedAt, locale);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteOperationalCase(db, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operational-cases"] });
      toast.success(t("operationalCases.toast.deleted"));
      setDeleteTarget(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openCreate = () => {
    setActiveCase(null);
    setDialogMode("create");
    setDialogOpen(true);
  };

  const openView = (row: OperationalCaseWithRelations) => {
    setActiveCase(row);
    setDialogMode("view");
    setDialogOpen(true);
  };

  const openEdit = (row: OperationalCaseWithRelations) => {
    setActiveCase(row);
    setDialogMode("edit");
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageTitle
        icon={Briefcase}
        title={t("operationalCases.title")}
        description={t("operationalCases.description")}
        loading={isLoading}
        meta={[
          pageHeroLastUpdatedMeta(t("common.page.lastUpdated"), lastUpdated),
          { label: t("operationalCases.stat.total"), value: stats.total },
        ]}
        actions={
          <Button size="lg" className="shrink-0 shadow-soft" onClick={openCreate}>
            <Plus className="mr-2 h-5 w-5" />
            {t("operationalCases.newAffair")}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Briefcase} label={t("operationalCases.stat.total")} value={stats.total} accent="primary" loading={isLoading} />
        <KpiCard icon={CalendarDays} label={t("operationalCases.stat.thisMonth")} value={stats.thisMonth} accent="primary" loading={isLoading} />
        <KpiCard icon={Scale} label={t("operationalCases.stat.narcotics")} value={stats.narcotics} accent="success" loading={isLoading} />
        <KpiCard icon={Flame} label={t("operationalCases.stat.explosives")} value={stats.explosives} accent="danger" loading={isLoading} />
        <KpiCard icon={Banknote} label={t("operationalCases.stat.currency")} value={stats.currency} accent="warning" loading={isLoading} />
        <KpiCard icon={Briefcase} label={t("operationalCases.stat.totalSeized")} value={totalSeizedLabel} accent="neutral" loading={isLoading} />
      </div>

      <FilterBar
        className="mb-0 flex-nowrap overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible"
        showReset={hasActiveFilters}
        onReset={resetFilters}
        resetLabel={t("common.page.filterReset")}
      >
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t("operationalCases.search")}
          className="min-w-[200px] shrink-0 lg:min-w-[240px] lg:flex-1"
        />
        <FilterPills>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-9 w-[150px] shrink-0"
            aria-label={t("operationalCases.filter.date")}
          />
          <Select value={checkpointFilter} onValueChange={setCheckpointFilter}>
            <FilterSelectTrigger label={t("operationalCases.table.checkpoint")} className="shrink-0" />
            <SelectContent>
              <SelectItem value="all">{t("statistics.casesHistory.filter.allCheckpoints")}</SelectItem>
              {checkpoints.map((cp) => (
                <SelectItem key={cp.id} value={cp.id}>{cp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={specialtyFilter} onValueChange={(v) => setSpecialtyFilter(v as typeof specialtyFilter)}>
            <FilterSelectTrigger label={t("operationalCases.filter.specialty")} className="shrink-0" />
            <SelectContent>
              <SelectItem value="all">{t("operationalCases.filter.allSpecialties")}</SelectItem>
              {SPECIALTY_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{caseSpecialtyLabel(s, t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <FilterSelectTrigger label={t("common.status")} className="shrink-0" />
            <SelectContent>
              <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>{caseStatusLabel(s, t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <FilterSelectTrigger label={t("operationalCases.filter.agent")} className="shrink-0" />
            <SelectContent>
              <SelectItem value="all">{t("operationalCases.filter.allAgents")}</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterPills>
      </FilterBar>

      <PageTableShell>
        <DataTableShell isLoading={isLoading} variant="readable">
          <OperationalCasesTable
            data={filtered}
            loading={isLoading}
            onRowClick={openView}
            onView={openView}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            onPrint={(row) => printOperationalCase(row, t)}
            emptyState={
              <EmptyState
                icon={Briefcase}
                title={data?.length ? t("operationalCases.empty.noMatch") : t("operationalCases.empty.none")}
                description={data?.length ? t("common.tryAdjustFilters") : t("operationalCases.empty.createFirst")}
                action={
                  !data?.length ? (
                    <Button onClick={openCreate}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t("operationalCases.newAffair")}
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </DataTableShell>
      </PageTableShell>

      <OperationalCaseDialog
        mode={dialogMode}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        caseRow={activeCase}
        onModeChange={(mode) => setDialogMode(mode)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("operationalCases.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("operationalCases.delete.description", { number: deleteTarget?.case_number ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
