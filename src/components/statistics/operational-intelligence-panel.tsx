import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";

import { Input } from "@/components/ui/input";
import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { StatisticsCasesHistory } from "@/components/statistics/statistics-cases-history";
import {
  reportDecimal,
  reportNum,
  SortableReportTable,
} from "@/components/statistics/sortable-report-table";
import { useI18n } from "@/hooks/use-i18n";
import type {
  AnnualMetricRow,
  DailyActivityRow,
  MonthlySummaryRow,
  OperationalIntelligencePayload,
  RankingRow,
  SectionPerformanceRow,
  StatisticsCenterFilterOptions,
  StatisticsCenterFilters,
} from "@/lib/statistics/statistics-center-types";
import { DEFAULT_STATISTICS_CENTER_FILTERS } from "@/lib/statistics/statistics-center-types";

const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"] as const;

type OperationalIntelligencePanelProps = {
  data: OperationalIntelligencePayload | undefined;
  filterOptions: StatisticsCenterFilterOptions;
  isLoading: boolean;
  filters: StatisticsCenterFilters;
  onFiltersChange: (filters: StatisticsCenterFilters) => void;
};

function IntelligenceSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-border/50 pt-10 first:border-t-0 first:pt-0">
      <div className="border-l-2 border-primary/70 pl-4">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function formatDay(date: string) {
  try {
    return format(parseISO(date), "dd/MM/yyyy");
  } catch {
    return date;
  }
}

const metricLabelKey: Record<string, string> = {
  planning: "statistics.intelligence.metrics.planning",
  cases: "statistics.intelligence.metrics.cases",
  assignments: "statistics.intelligence.metrics.assignments",
  drug: "statistics.intelligence.metrics.drug",
  explosive: "statistics.intelligence.metrics.explosive",
  currency: "statistics.intelligence.metrics.currency",
  exclusions: "statistics.intelligence.metrics.exclusions",
};

export function OperationalIntelligencePanel({
  data,
  filterOptions,
  isLoading,
  filters,
  onFiltersChange,
}: OperationalIntelligencePanelProps) {
  const { t, locale } = useI18n();

  const updateFilter = <K extends keyof StatisticsCenterFilters>(
    key: K,
    value: StatisticsCenterFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  const resetFilters = () => onFiltersChange(DEFAULT_STATISTICS_CENTER_FILTERS);

  const hasActiveFilters =
    filters.month !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.checkpointId !== "" ||
    filters.sectionId !== "" ||
    filters.agentId !== "" ||
    filters.dogId !== "";

  const monthOptions = useMemo(
    () =>
      MONTH_KEYS.map((month, index) => ({
        value: month,
        label: new Date(2000, index, 1).toLocaleDateString(locale, { month: "long" }),
      })),
    [locale],
  );

  const yearOptions =
    filterOptions.years.length > 0 ? filterOptions.years : [String(new Date().getFullYear())];

  const annualColumns = useMemo<ColumnDef<AnnualMetricRow>[]>(
    () => [
      {
        id: "metric",
        header: t("statistics.intelligence.columns.metric"),
        accessorFn: (row) => t(metricLabelKey[row.id] ?? row.id),
        cell: ({ row }) => t(metricLabelKey[row.original.id] ?? row.original.id),
      },
      {
        id: "annualTotal",
        header: t("statistics.intelligence.columns.annualTotal"),
        accessorKey: "annualTotal",
        cell: ({ row }) => reportNum(row.original.annualTotal),
      },
      {
        id: "monthlyAverage",
        header: t("statistics.intelligence.columns.monthlyAverage"),
        accessorKey: "monthlyAverage",
        cell: ({ row }) => reportDecimal(row.original.monthlyAverage),
      },
    ],
    [t],
  );

  const monthlyActivityColumns = useMemo<ColumnDef<MonthlySummaryRow>[]>(
    () => [
      { id: "month", header: t("statistics.intelligence.columns.month"), accessorKey: "monthLabel" },
      { id: "planning", header: t("statistics.intelligence.columns.planning"), accessorKey: "generatedPlanning", cell: ({ row }) => reportNum(row.original.generatedPlanning) },
      { id: "assignments", header: t("statistics.intelligence.columns.assignments"), accessorKey: "assignments", cell: ({ row }) => reportNum(row.original.assignments) },
      { id: "cases", header: t("statistics.intelligence.columns.cases"), accessorKey: "operationalCases", cell: ({ row }) => reportNum(row.original.operationalCases) },
      { id: "drug", header: t("statistics.intelligence.columns.drug"), accessorKey: "drugDetections", cell: ({ row }) => reportNum(row.original.drugDetections) },
      { id: "explosive", header: t("statistics.intelligence.columns.explosive"), accessorKey: "explosiveDetections", cell: ({ row }) => reportNum(row.original.explosiveDetections) },
      { id: "currency", header: t("statistics.intelligence.columns.currency"), accessorKey: "currencyDetections", cell: ({ row }) => reportNum(row.original.currencyDetections) },
    ],
    [t],
  );

  const monthlyDetailedColumns = useMemo<ColumnDef<MonthlySummaryRow>[]>(
    () => [
      ...monthlyActivityColumns,
      { id: "exclusions", header: t("statistics.intelligence.columns.exclusions"), accessorKey: "exclusions", cell: ({ row }) => reportNum(row.original.exclusions) },
      { id: "activeTeams", header: t("statistics.intelligence.columns.activeTeams"), accessorKey: "activeTeams", cell: ({ row }) => reportNum(row.original.activeTeams) },
      { id: "inactiveTeams", header: t("statistics.intelligence.columns.inactiveTeams"), accessorKey: "inactiveTeams", cell: ({ row }) => reportNum(row.original.inactiveTeams) },
      { id: "avgMissions", header: t("statistics.intelligence.columns.avgMissionsPerDay"), accessorKey: "avgMissionsPerDay", cell: ({ row }) => reportDecimal(row.original.avgMissionsPerDay) },
      { id: "avgCases", header: t("statistics.intelligence.columns.avgCasesPerDay"), accessorKey: "avgCasesPerDay", cell: ({ row }) => reportDecimal(row.original.avgCasesPerDay) },
    ],
    [monthlyActivityColumns, t],
  );

  const rankingColumns = useMemo<ColumnDef<RankingRow>[]>(
    () => [
      { id: "rank", header: t("statistics.intelligence.columns.rank"), accessorKey: "rank", cell: ({ row }) => reportNum(row.original.rank) },
      { id: "name", header: t("statistics.intelligence.columns.name"), accessorKey: "name" },
      { id: "detail", header: t("statistics.intelligence.columns.detail"), accessorKey: "detail" },
      { id: "missions", header: t("statistics.intelligence.columns.missions"), accessorKey: "missions", cell: ({ row }) => reportNum(row.original.missions) },
      { id: "cases", header: t("statistics.intelligence.columns.cases"), accessorKey: "cases", cell: ({ row }) => reportNum(row.original.cases) },
      { id: "detections", header: t("statistics.intelligence.columns.detections"), accessorKey: "detections", cell: ({ row }) => reportNum(row.original.detections) },
      { id: "score", header: t("statistics.intelligence.columns.activityScore"), accessorKey: "activityScore", cell: ({ row }) => reportNum(row.original.activityScore) },
    ],
    [t],
  );

  const sectionColumns = useMemo<ColumnDef<SectionPerformanceRow>[]>(
    () => [
      { id: "name", header: t("field.section"), accessorKey: "name" },
      { id: "planning", header: t("statistics.intelligence.columns.planning"), accessorKey: "generatedPlanning", cell: ({ row }) => reportNum(row.original.generatedPlanning) },
      { id: "missions", header: t("statistics.intelligence.columns.missions"), accessorKey: "totalMissions", cell: ({ row }) => reportNum(row.original.totalMissions) },
      { id: "cases", header: t("statistics.intelligence.columns.cases"), accessorKey: "operationalCases", cell: ({ row }) => reportNum(row.original.operationalCases) },
      { id: "drug", header: t("statistics.intelligence.columns.drug"), accessorKey: "drugDetections", cell: ({ row }) => reportNum(row.original.drugDetections) },
      { id: "explosive", header: t("statistics.intelligence.columns.explosive"), accessorKey: "explosiveDetections", cell: ({ row }) => reportNum(row.original.explosiveDetections) },
      { id: "currency", header: t("statistics.intelligence.columns.currency"), accessorKey: "currencyDetections", cell: ({ row }) => reportNum(row.original.currencyDetections) },
      { id: "agents", header: t("statistics.intelligence.columns.activeAgents"), accessorKey: "activeAgents", cell: ({ row }) => reportNum(row.original.activeAgents) },
      { id: "avg", header: t("statistics.intelligence.columns.avgMissionsPerMonth"), accessorKey: "avgMissionsPerMonth", cell: ({ row }) => reportDecimal(row.original.avgMissionsPerMonth) },
    ],
    [t],
  );

  const dailyColumns = useMemo<ColumnDef<DailyActivityRow>[]>(
    () => [
      { id: "date", header: t("statistics.intelligence.columns.date"), accessorKey: "date", cell: ({ row }) => formatDay(row.original.date) },
      { id: "planning", header: t("statistics.intelligence.columns.planning"), accessorKey: "generatedPlanning", cell: ({ row }) => reportNum(row.original.generatedPlanning) },
      { id: "assignments", header: t("statistics.intelligence.columns.assignments"), accessorKey: "assignments", cell: ({ row }) => reportNum(row.original.assignments) },
      { id: "cases", header: t("statistics.intelligence.columns.cases"), accessorKey: "operationalCases", cell: ({ row }) => reportNum(row.original.operationalCases) },
      { id: "drug", header: t("statistics.intelligence.columns.drug"), accessorKey: "drugDetections", cell: ({ row }) => reportNum(row.original.drugDetections) },
      { id: "explosive", header: t("statistics.intelligence.columns.explosive"), accessorKey: "explosiveDetections", cell: ({ row }) => reportNum(row.original.explosiveDetections) },
      { id: "currency", header: t("statistics.intelligence.columns.currency"), accessorKey: "currencyDetections", cell: ({ row }) => reportNum(row.original.currencyDetections) },
      { id: "teams", header: t("statistics.intelligence.columns.activeTeams"), accessorKey: "activeTeams", cell: ({ row }) => reportNum(row.original.activeTeams) },
    ],
    [t],
  );

  const exportAnnual = (rows: AnnualMetricRow[]) =>
    rows.map((row) => [t(metricLabelKey[row.id] ?? row.id), row.annualTotal, row.monthlyAverage]);

  const exportMonthlyActivity = (rows: MonthlySummaryRow[]) =>
    rows.map((row) => [
      row.monthLabel,
      row.generatedPlanning,
      row.assignments,
      row.operationalCases,
      row.drugDetections,
      row.explosiveDetections,
      row.currencyDetections,
    ]);

  const exportMonthlyDetailed = (rows: MonthlySummaryRow[]) =>
    rows.map((row) => [
      row.monthLabel,
      row.generatedPlanning,
      row.assignments,
      row.operationalCases,
      row.drugDetections,
      row.explosiveDetections,
      row.currencyDetections,
      row.exclusions,
      row.activeTeams,
      row.inactiveTeams,
      row.avgMissionsPerDay,
      row.avgCasesPerDay,
    ]);

  const exportRanking = (rows: RankingRow[]) =>
    rows.map((row) => [row.rank, row.name, row.detail, row.missions, row.cases, row.detections, row.activityScore]);

  const exportSection = (rows: SectionPerformanceRow[]) =>
    rows.map((row) => [
      row.name,
      row.generatedPlanning,
      row.totalMissions,
      row.operationalCases,
      row.drugDetections,
      row.explosiveDetections,
      row.currencyDetections,
      row.activeAgents,
      row.avgMissionsPerMonth,
    ]);

  const exportDaily = (rows: DailyActivityRow[]) =>
    rows.map((row) => [
      formatDay(row.date),
      row.generatedPlanning,
      row.assignments,
      row.operationalCases,
      row.drugDetections,
      row.explosiveDetections,
      row.currencyDetections,
      row.activeTeams,
    ]);

  const filterPills = [
    filters.month && {
      label: `${t("statistics.center.filters.month")}: ${monthOptions.find((m) => m.value === filters.month)?.label}`,
      onRemove: () => updateFilter("month", ""),
    },
    filters.dateFrom && { label: `${t("statistics.casesHistory.filter.dateFrom")}: ${filters.dateFrom}`, onRemove: () => updateFilter("dateFrom", "") },
    filters.dateTo && { label: `${t("statistics.casesHistory.filter.dateTo")}: ${filters.dateTo}`, onRemove: () => updateFilter("dateTo", "") },
    filters.checkpointId && { label: filterOptions.checkpoints.find((c) => c.id === filters.checkpointId)?.name ?? "", onRemove: () => updateFilter("checkpointId", "") },
    filters.sectionId && { label: filterOptions.sections.find((s) => s.id === filters.sectionId)?.name ?? "", onRemove: () => updateFilter("sectionId", "") },
    filters.agentId && { label: filterOptions.agents.find((a) => a.id === filters.agentId)?.name ?? "", onRemove: () => updateFilter("agentId", "") },
    filters.dogId && { label: filterOptions.dogs.find((d) => d.id === filters.dogId)?.name ?? "", onRemove: () => updateFilter("dogId", "") },
  ].filter(Boolean) as { label: string; onRemove: () => void }[];

  const h = data?.highlights;

  return (
    <div className="space-y-2">
      <FilterBar resetLabel={t("common.page.filterReset")} onReset={resetFilters} showReset={hasActiveFilters}>
        <Select value={filters.year} onValueChange={(v) => updateFilter("year", v)}>
          <FilterSelectTrigger label={t("statistics.center.filters.year")} />
          <SelectContent>
            {yearOptions.map((year) => (
              <SelectItem key={year} value={year}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.month || "all"} onValueChange={(v) => updateFilter("month", v === "all" ? "" : v)}>
          <FilterSelectTrigger label={t("statistics.center.filters.month")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.center.filters.allMonths")}</SelectItem>
            {monthOptions.map((month) => (
              <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={filters.dateFrom} onChange={(e) => updateFilter("dateFrom", e.target.value)} className="h-10 w-[150px] bg-white" aria-label={t("statistics.casesHistory.filter.dateFrom")} />
        <Input type="date" value={filters.dateTo} onChange={(e) => updateFilter("dateTo", e.target.value)} className="h-10 w-[150px] bg-white" aria-label={t("statistics.casesHistory.filter.dateTo")} />
        <Select value={filters.checkpointId || "all"} onValueChange={(v) => updateFilter("checkpointId", v === "all" ? "" : v)}>
          <FilterSelectTrigger label={t("statistics.center.filters.checkpoint")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.center.filters.allCheckpoints")}</SelectItem>
            {filterOptions.checkpoints.map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.sectionId || "all"} onValueChange={(v) => updateFilter("sectionId", v === "all" ? "" : v)}>
          <FilterSelectTrigger label={t("field.section")} />
          <SelectContent>
            <SelectItem value="all">{t("common.allSections")}</SelectItem>
            {filterOptions.sections.map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.agentId || "all"} onValueChange={(v) => updateFilter("agentId", v === "all" ? "" : v)}>
          <FilterSelectTrigger label={t("statistics.center.filters.agent")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.center.filters.allAgents")}</SelectItem>
            {filterOptions.agents.map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.dogId || "all"} onValueChange={(v) => updateFilter("dogId", v === "all" ? "" : v)}>
          <FilterSelectTrigger label={t("statistics.center.filters.dog")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.center.filters.allDogs")}</SelectItem>
            {filterOptions.dogs.map((row) => (
              <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {filterPills.length > 0 ? (
        <FilterPills>
          {filterPills.map((pill) => (
            <button key={pill.label} type="button" onClick={pill.onRemove} className="inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-muted-foreground hover:bg-muted/60">
              {pill.label} ×
            </button>
          ))}
        </FilterPills>
      ) : null}

      <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("statistics.intelligence.reportPeriod")}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{data?.year ?? filters.year}</p>
        {data ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("statistics.filter.range", { from: data.detailRange.from, to: data.detailRange.to })}
          </p>
        ) : null}
      </div>

      <IntelligenceSection title={t("statistics.intelligence.sections.annualSummary")}>
        <SortableReportTable
          title={t("statistics.intelligence.sections.annualSummary")}
          data={data?.annualMetrics ?? []}
          columns={annualColumns}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          exportFilenamePrefix={`intel-annual-${filters.year}`}
          exportHeaders={[
            t("statistics.intelligence.columns.metric"),
            t("statistics.intelligence.columns.annualTotal"),
            t("statistics.intelligence.columns.monthlyAverage"),
          ]}
          exportRows={exportAnnual}
        />
      </IntelligenceSection>

      <IntelligenceSection title={t("statistics.intelligence.sections.monthlyActivity")}>
        <SortableReportTable
          title={t("statistics.intelligence.sections.monthlyActivity")}
          data={data?.monthlyActivity ?? []}
          columns={monthlyActivityColumns}
          getRowId={(row) => row.monthKey}
          isLoading={isLoading}
          exportFilenamePrefix={`intel-monthly-${filters.year}`}
          exportHeaders={[
            t("statistics.intelligence.columns.month"),
            t("statistics.intelligence.columns.planning"),
            t("statistics.intelligence.columns.assignments"),
            t("statistics.intelligence.columns.cases"),
            t("statistics.intelligence.columns.drug"),
            t("statistics.intelligence.columns.explosive"),
            t("statistics.intelligence.columns.currency"),
          ]}
          exportRows={exportMonthlyActivity}
        />
      </IntelligenceSection>

      <IntelligenceSection title={t("statistics.intelligence.sections.topAgents")}>
        <SortableReportTable
          title={t("statistics.intelligence.sections.topAgents")}
          data={data?.topAgents ?? []}
          columns={rankingColumns}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          exportFilenamePrefix={`intel-agents-${filters.year}`}
          exportHeaders={[
            t("statistics.intelligence.columns.rank"),
            t("statistics.intelligence.columns.name"),
            t("statistics.intelligence.columns.detail"),
            t("statistics.intelligence.columns.missions"),
            t("statistics.intelligence.columns.cases"),
            t("statistics.intelligence.columns.detections"),
            t("statistics.intelligence.columns.activityScore"),
          ]}
          exportRows={exportRanking}
        />
      </IntelligenceSection>

      <IntelligenceSection title={t("statistics.intelligence.sections.topDogs")}>
        <SortableReportTable
          title={t("statistics.intelligence.sections.topDogs")}
          data={data?.topDogs ?? []}
          columns={rankingColumns}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          exportFilenamePrefix={`intel-dogs-${filters.year}`}
          exportHeaders={[
            t("statistics.intelligence.columns.rank"),
            t("statistics.intelligence.columns.name"),
            t("statistics.intelligence.columns.detail"),
            t("statistics.intelligence.columns.missions"),
            t("statistics.intelligence.columns.cases"),
            t("statistics.intelligence.columns.detections"),
            t("statistics.intelligence.columns.activityScore"),
          ]}
          exportRows={exportRanking}
        />
      </IntelligenceSection>

      <IntelligenceSection title={t("statistics.intelligence.sections.topCheckpoints")}>
        <SortableReportTable
          title={t("statistics.intelligence.sections.topCheckpoints")}
          data={data?.topCheckpoints ?? []}
          columns={rankingColumns}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          exportFilenamePrefix={`intel-checkpoints-${filters.year}`}
          exportHeaders={[
            t("statistics.intelligence.columns.rank"),
            t("statistics.intelligence.columns.name"),
            t("statistics.intelligence.columns.detail"),
            t("statistics.intelligence.columns.missions"),
            t("statistics.intelligence.columns.cases"),
            t("statistics.intelligence.columns.detections"),
            t("statistics.intelligence.columns.activityScore"),
          ]}
          exportRows={exportRanking}
        />
      </IntelligenceSection>

      <IntelligenceSection title={t("statistics.intelligence.sections.sectionPerformance")}>
        <SortableReportTable
          title={t("statistics.intelligence.sections.sectionPerformance")}
          data={data?.sectionPerformance ?? []}
          columns={sectionColumns}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          exportFilenamePrefix={`intel-sections-${filters.year}`}
          exportHeaders={[
            t("field.section"),
            t("statistics.intelligence.columns.planning"),
            t("statistics.intelligence.columns.missions"),
            t("statistics.intelligence.columns.cases"),
            t("statistics.intelligence.columns.drug"),
            t("statistics.intelligence.columns.explosive"),
            t("statistics.intelligence.columns.currency"),
            t("statistics.intelligence.columns.activeAgents"),
            t("statistics.intelligence.columns.avgMissionsPerMonth"),
          ]}
          exportRows={exportSection}
        />
      </IntelligenceSection>

      <IntelligenceSection title={t("statistics.intelligence.sections.monthlyDetailed")}>
        <SortableReportTable
          title={t("statistics.intelligence.sections.monthlyDetailed")}
          data={data?.monthlyDetailed ?? []}
          columns={monthlyDetailedColumns}
          getRowId={(row) => row.monthKey}
          isLoading={isLoading}
          exportFilenamePrefix={`intel-monthly-detail-${filters.year}`}
          exportHeaders={[
            t("statistics.intelligence.columns.month"),
            t("statistics.intelligence.columns.planning"),
            t("statistics.intelligence.columns.assignments"),
            t("statistics.intelligence.columns.cases"),
            t("statistics.intelligence.columns.drug"),
            t("statistics.intelligence.columns.explosive"),
            t("statistics.intelligence.columns.currency"),
            t("statistics.intelligence.columns.exclusions"),
            t("statistics.intelligence.columns.activeTeams"),
            t("statistics.intelligence.columns.inactiveTeams"),
            t("statistics.intelligence.columns.avgMissionsPerDay"),
            t("statistics.intelligence.columns.avgCasesPerDay"),
          ]}
          exportRows={exportMonthlyDetailed}
        />
      </IntelligenceSection>

      <IntelligenceSection title={t("statistics.intelligence.sections.dailyActivity")}>
        <SortableReportTable
          title={t("statistics.intelligence.sections.dailyActivity")}
          data={data?.dailyActivity ?? []}
          columns={dailyColumns}
          getRowId={(row) => row.date}
          isLoading={isLoading}
          exportFilenamePrefix={`intel-daily-${filters.year}`}
          exportHeaders={[
            t("statistics.intelligence.columns.date"),
            t("statistics.intelligence.columns.planning"),
            t("statistics.intelligence.columns.assignments"),
            t("statistics.intelligence.columns.cases"),
            t("statistics.intelligence.columns.drug"),
            t("statistics.intelligence.columns.explosive"),
            t("statistics.intelligence.columns.currency"),
            t("statistics.intelligence.columns.activeTeams"),
          ]}
          exportRows={exportDaily}
        />
      </IntelligenceSection>

      <IntelligenceSection title={t("statistics.intelligence.sections.highlights")}>
        <div className="grid gap-px overflow-hidden rounded-lg border border-border/60 bg-border/40 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              label: t("statistics.intelligence.highlights.mostActiveMonth"),
              value: h?.mostActiveMonth
                ? `${h.mostActiveMonth.label} — ${h.mostActiveMonth.missions} ${t("statistics.intelligence.columns.missions")}, ${h.mostActiveMonth.cases} ${t("statistics.intelligence.columns.cases")}`
                : t("common.none"),
            },
            {
              label: t("statistics.intelligence.highlights.mostActiveCheckpoint"),
              value: h?.mostActiveCheckpoint
                ? `${h.mostActiveCheckpoint.name} — ${h.mostActiveCheckpoint.missions} ${t("statistics.intelligence.columns.missions")}`
                : t("common.none"),
            },
            {
              label: t("statistics.intelligence.highlights.mostActiveDog"),
              value: h?.mostActiveDog
                ? `${h.mostActiveDog.name} — ${h.mostActiveDog.missions} ${t("statistics.intelligence.columns.missions")}, ${h.mostActiveDog.cases} ${t("statistics.intelligence.columns.cases")}`
                : t("common.none"),
            },
            {
              label: t("statistics.intelligence.highlights.mostActiveAgent"),
              value: h?.mostActiveAgent
                ? `${h.mostActiveAgent.name} — ${h.mostActiveAgent.missions} ${t("statistics.intelligence.columns.missions")}, ${h.mostActiveAgent.cases} ${t("statistics.intelligence.columns.cases")}`
                : t("common.none"),
            },
            {
              label: t("statistics.intelligence.highlights.mostActiveSection"),
              value: h?.mostActiveSection
                ? `${h.mostActiveSection.name} — ${h.mostActiveSection.missions} ${t("statistics.intelligence.columns.missions")}, ${h.mostActiveSection.cases} ${t("statistics.intelligence.columns.cases")}`
                : t("common.none"),
            },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-sm font-medium leading-snug text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </IntelligenceSection>

      <IntelligenceSection title={t("statistics.intelligence.sections.casesHistory")}>
        <StatisticsCasesHistory embedded />
      </IntelligenceSection>
    </div>
  );
}
