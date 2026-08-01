import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Briefcase, MapPin, Trophy } from "lucide-react";

import { EmptyState } from "@/components/layout/EmptyState";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { EnterpriseDataTable } from "@/components/enterprise/data-table";
import { CellTooltip, TableTooltipProvider } from "@/components/enterprise/cell-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  StatCheckpointSeizureSummary,
  StatDetailList,
  StatRankingTextList,
  StatSummaryCard,
} from "@/components/statistics/stat-summary";
import { CheckpointStatsDetailDialog } from "@/components/statistics/checkpoint-stats-detail-dialog";
import {
  OperationalCaseDialog,
  type OperationalCaseDialogMode,
} from "@/components/operational-cases/operational-case-dialog";
import { useI18n } from "@/hooks/use-i18n";
import { db } from "@/integrations/database/client";
import {
  aggregateCheckpointStatistics,
  DEFAULT_CHECKPOINT_STATS_FILTERS,
  type CheckpointStatRecord,
  type CheckpointStatsFilters,
} from "@/lib/statistics/checkpoint-stats";
import {
  CHECKPOINT_STATISTICS_QUERY_KEY,
  extractSectionOptions,
  fetchCheckpointStatisticsRaw,
} from "@/lib/statistics/fetch-checkpoint-statistics";
import { CASE_SPECIALTY_ORDER } from "@/lib/statistics/operational-cases-history";
import type { OperationalCaseWithRelations } from "@/lib/operational-case-api";
import { caseSpecialtyLabel, drugTypeLabel, objectTypeLabel } from "@/lib/operational-cases";
import { formatKg } from "@/lib/operational-case-stats";

const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"] as const;

type StatisticsCheckpointsProps = {
  lastUpdated?: string;
};

export function StatisticsCheckpoints({ lastUpdated }: StatisticsCheckpointsProps) {
  const { t } = useI18n();
  const [filters, setFilters] = useState<CheckpointStatsFilters>(DEFAULT_CHECKPOINT_STATS_FILTERS);
  const [selectedRecord, setSelectedRecord] = useState<CheckpointStatRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<OperationalCaseDialogMode>("view");
  const [activeCase, setActiveCase] = useState<OperationalCaseWithRelations | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: [CHECKPOINT_STATISTICS_QUERY_KEY],
    queryFn: () => fetchCheckpointStatisticsRaw(db),
  });

  const labelFns = useMemo(
    () => ({
      month: (key: string) => {
        const [year, month] = key.split("-");
        const date = new Date(Number(year), Number(month) - 1, 1);
        return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      },
      specialty: (key: string) => t(`operationalCases.specialty.${key}`, { defaultValue: key }),
      seizureType: (key: string) => {
        if (key === "currency") return t("operationalCases.specialty.currency");
        const drug = drugTypeLabel(key as Parameters<typeof drugTypeLabel>[0], t);
        if (drug !== "—") return drug;
        try {
          return objectTypeLabel(key as Parameters<typeof objectTypeLabel>[0], t);
        } catch {
          return key;
        }
      },
      unknown: t("common.none"),
    }),
    [t],
  );

  const stats = useMemo(
    () => (raw ? aggregateCheckpointStatistics(raw, filters, labelFns) : null),
    [raw, filters, labelFns],
  );

  const sections = useMemo(() => (raw ? extractSectionOptions(raw) : []), [raw]);
  const checkpoints = raw?.checkpoints ?? [];

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const row of raw?.cases ?? []) set.add(row.case_date.slice(0, 4));
    for (const row of raw?.assignments ?? []) {
      const date = row.planning?.planning_date;
      if (date) set.add(date.slice(0, 4));
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [raw]);

  const seizureSummaryRows = useMemo(() => {
    return (stats?.charts.seizureTypesByCheckpoint ?? []).map((row) => ({
      label: row.label,
      stacks: row.stacks.map((stack) => ({
        key: stack.key ?? "",
        label: labelFns.seizureType(stack.key ?? ""),
        value: stack.value,
      })),
    }));
  }, [stats, labelFns]);

  const casesChartTotal = useMemo(
    () => (stats?.charts.casesByCheckpoint ?? []).reduce((sum, row) => sum + row.value, 0),
    [stats],
  );

  const updateFilter = <K extends keyof CheckpointStatsFilters>(key: K, value: CheckpointStatsFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const openDetail = (record: CheckpointStatRecord) => {
    setSelectedRecord(record);
    setDetailOpen(true);
  };

  const openCaseById = (caseId: string) => {
    const match =
      selectedRecord?.cases.find((c) => c.id === caseId) ??
      raw?.cases.find((c) => c.id === caseId) ??
      null;
    if (!match) return;
    setActiveCase(match as OperationalCaseWithRelations);
    setDialogMode("view");
    setDialogOpen(true);
  };

  const columns = useMemo<ColumnDef<CheckpointStatRecord>[]>(
    () => [
      {
        id: "name",
        header: t("statistics.checkpointStats.table.name"),
        meta: { width: "16%" },
        cell: ({ row }) => (
          <CellTooltip label={row.original.name}>
            <span className="truncate text-sm font-semibold">{row.original.name}</span>
          </CellTooltip>
        ),
      },
      {
        id: "cases",
        header: t("statistics.checkpointStats.table.cases"),
        meta: { width: "8%" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.totalCases}</span>,
      },
      {
        id: "planning",
        header: t("statistics.checkpointStats.table.planning"),
        meta: { width: "9%" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.totalPlanningAssignments}</span>,
      },
      {
        id: "agents",
        header: t("statistics.checkpointStats.table.agents"),
        meta: { width: "8%" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.totalAgents}</span>,
      },
      {
        id: "dogs",
        header: t("statistics.checkpointStats.table.dogs"),
        meta: { width: "8%" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.totalDogs}</span>,
      },
      {
        id: "narcotics",
        header: t("statistics.checkpointStats.table.narcoticsKg"),
        meta: { width: "10%" },
        cell: ({ row }) => {
          const total =
            row.original.seizures.narcotics.cannabisKg +
            row.original.seizures.narcotics.hashishKg +
            row.original.seizures.narcotics.cocaineKg +
            row.original.seizures.narcotics.heroinKg +
            row.original.seizures.narcotics.syntheticDrugsKg +
            row.original.seizures.narcotics.khatKg;
          return <span className="tabular-nums text-xs">{formatKg(total)} kg</span>;
        },
      },
      {
        id: "month",
        header: t("statistics.checkpointStats.analytics.casesThisMonth"),
        meta: { width: "9%" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.analytics.casesThisMonth}</span>,
      },
      {
        id: "year",
        header: t("statistics.checkpointStats.analytics.casesThisYear"),
        meta: { width: "9%" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.analytics.casesThisYear}</span>,
      },
      {
        id: "topAgent",
        header: t("statistics.checkpointStats.analytics.mostActiveAgent"),
        meta: { width: "12%" },
        cell: ({ row }) => (
          <CellTooltip label={row.original.analytics.mostActiveAgent ?? t("common.none")}>
            <span className="truncate text-sm">{row.original.analytics.mostActiveAgent ?? "—"}</span>
          </CellTooltip>
        ),
      },
      {
        id: "topDog",
        header: t("statistics.checkpointStats.analytics.mostActiveDog"),
        meta: { width: "11%" },
        cell: ({ row }) => (
          <CellTooltip label={row.original.analytics.mostActiveDog ?? t("common.none")}>
            <span className="truncate text-sm">{row.original.analytics.mostActiveDog ?? "—"}</span>
          </CellTooltip>
        ),
      },
    ],
    [t],
  );

  const filterPills = [
    filters.dateFrom && {
      label: `${t("statistics.casesHistory.filter.dateFrom")}: ${filters.dateFrom}`,
      onRemove: () => updateFilter("dateFrom", ""),
    },
    filters.dateTo && {
      label: `${t("statistics.casesHistory.filter.dateTo")}: ${filters.dateTo}`,
      onRemove: () => updateFilter("dateTo", ""),
    },
    filters.year !== "all" && {
      label: `${t("statistics.casesHistory.filter.year")}: ${filters.year}`,
      onRemove: () => updateFilter("year", "all"),
    },
    filters.month !== "all" && {
      label: `${t("statistics.casesHistory.filter.month")}: ${t(`statistics.casesHistory.months.${filters.month}`)}`,
      onRemove: () => updateFilter("month", "all"),
    },
    filters.specialty !== "all" && {
      label: caseSpecialtyLabel(filters.specialty, t),
      onRemove: () => updateFilter("specialty", "all"),
    },
    filters.sectionId !== "all" && {
      label: sections.find((s) => s.id === filters.sectionId)?.name ?? filters.sectionId,
      onRemove: () => updateFilter("sectionId", "all"),
    },
    filters.checkpointId !== "all" && {
      label: checkpoints.find((c) => c.id === filters.checkpointId)?.name ?? filters.checkpointId,
      onRemove: () => updateFilter("checkpointId", "all"),
    },
  ].filter(Boolean) as { label: string; onRemove: () => void }[];

  const records = stats?.checkpoints ?? [];
  const emptyMessage = t("statistics.summary.empty");

  return (
    <div className="space-y-4">
      <FilterBar>
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => updateFilter("dateFrom", e.target.value)}
          className="h-9 w-[150px]"
          aria-label={t("statistics.casesHistory.filter.dateFrom")}
        />
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => updateFilter("dateTo", e.target.value)}
          className="h-9 w-[150px]"
          aria-label={t("statistics.casesHistory.filter.dateTo")}
        />
        <Select value={filters.year} onValueChange={(v) => updateFilter("year", v)}>
          <FilterSelectTrigger label={t("statistics.casesHistory.filter.year")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.casesHistory.filter.allYears")}</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.month} onValueChange={(v) => updateFilter("month", v)}>
          <FilterSelectTrigger label={t("statistics.casesHistory.filter.month")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.casesHistory.filter.allMonths")}</SelectItem>
            {MONTH_KEYS.map((month) => (
              <SelectItem key={month} value={month}>
                {t(`statistics.casesHistory.months.${month}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.specialty}
          onValueChange={(v) => updateFilter("specialty", v as CheckpointStatsFilters["specialty"])}
        >
          <FilterSelectTrigger label={t("operationalCases.filter.specialty")} />
          <SelectContent>
            <SelectItem value="all">{t("operationalCases.filter.allSpecialties")}</SelectItem>
            {CASE_SPECIALTY_ORDER.map((specialty) => (
              <SelectItem key={specialty} value={specialty}>
                {caseSpecialtyLabel(specialty, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.sectionId} onValueChange={(v) => updateFilter("sectionId", v)}>
          <FilterSelectTrigger label={t("field.section")} />
          <SelectContent>
            <SelectItem value="all">{t("common.allSections")}</SelectItem>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.checkpointId} onValueChange={(v) => updateFilter("checkpointId", v)}>
          <FilterSelectTrigger label={t("operationalCases.table.checkpoint")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.casesHistory.filter.allCheckpoints")}</SelectItem>
            {checkpoints.map((checkpoint) => (
              <SelectItem key={checkpoint.id} value={checkpoint.id}>
                {checkpoint.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FilterPills pills={filterPills} />
      </FilterBar>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <StatSummaryCard title={t("statistics.checkpointStats.rankings.byCases")} icon={Trophy} lastUpdated={lastUpdated}>
          <StatRankingTextList items={stats?.rankings.byCases ?? []} emptyMessage={emptyMessage} />
        </StatSummaryCard>
        <StatSummaryCard title={t("statistics.checkpointStats.rankings.byNarcotics")} icon={Trophy} lastUpdated={lastUpdated}>
          <StatRankingTextList items={stats?.rankings.byNarcoticsKg ?? []} emptyMessage={emptyMessage} />
        </StatSummaryCard>
        <StatSummaryCard title={t("statistics.checkpointStats.rankings.byExplosives")} icon={Trophy} lastUpdated={lastUpdated}>
          <StatRankingTextList items={stats?.rankings.byExplosiveCases ?? []} emptyMessage={emptyMessage} />
        </StatSummaryCard>
        <StatSummaryCard title={t("statistics.checkpointStats.rankings.byCurrency")} icon={Trophy} lastUpdated={lastUpdated}>
          <StatRankingTextList items={stats?.rankings.byCurrencyCases ?? []} emptyMessage={emptyMessage} />
        </StatSummaryCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatSummaryCard
          title={t("statistics.checkpointStats.chart.casesByCheckpoint")}
          icon={MapPin}
          total={casesChartTotal}
          totalLabel={t("statistics.summary.total")}
          lastUpdated={lastUpdated}
          isEmpty={!stats?.charts.casesByCheckpoint.length}
          emptyMessage={emptyMessage}
        >
          <StatDetailList items={stats?.charts.casesByCheckpoint ?? []} total={casesChartTotal} />
        </StatSummaryCard>
        <StatSummaryCard
          title={t("statistics.checkpointStats.chart.specialtyDistribution")}
          icon={Briefcase}
          total={casesChartTotal}
          totalLabel={t("statistics.summary.total")}
          lastUpdated={lastUpdated}
          isEmpty={!stats?.charts.specialtyDistribution.length}
          emptyMessage={emptyMessage}
        >
          <StatDetailList
            items={stats?.charts.specialtyDistribution ?? []}
            total={casesChartTotal}
            variant="categories"
            percentageOfTotalLabel={t("statistics.summary.ofTotal")}
          />
        </StatSummaryCard>
        <StatSummaryCard
          title={t("statistics.checkpointStats.chart.seizureTypesByCheckpoint")}
          icon={Briefcase}
          lastUpdated={lastUpdated}
          className="lg:col-span-2"
          isEmpty={!seizureSummaryRows.length}
          emptyMessage={t("statistics.checkpointStats.empty.chart")}
        >
          <StatCheckpointSeizureSummary rows={seizureSummaryRows} />
        </StatSummaryCard>
      </div>

      <TableTooltipProvider>
        <DataTableShell isLoading={isLoading}>
          <EnterpriseDataTable
            columns={columns}
            data={records}
            loading={isLoading}
            layout="fixed"
            density="compact"
            responsiveScroll
            onRowClick={(row) => openDetail(row.original)}
            emptyState={
              <EmptyState
                icon={MapPin}
                title={t("statistics.checkpointStats.empty.none")}
                description={t("common.tryAdjustFilters")}
              />
            }
          />
        </DataTableShell>
      </TableTooltipProvider>

      <CheckpointStatsDetailDialog
        record={selectedRecord}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCaseClick={openCaseById}
        monthLabels={labelFns.month}
        lastUpdated={lastUpdated}
      />

      <OperationalCaseDialog
        mode={dialogMode}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        caseRow={activeCase}
        onModeChange={(mode) => setDialogMode(mode)}
      />
    </div>
  );
}
