import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { Input } from "@/components/ui/input";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/use-i18n";
import { formatKg } from "@/lib/operational-case-stats";
import type {
  CasesSeizureTotals,
  CasesStatisticsFilterOptions,
  CasesStatisticsFilters,
  CasesStatisticsPayload,
} from "@/lib/statistics/cases-statistics-types";
import { DEFAULT_CASES_STATISTICS_FILTERS } from "@/lib/statistics/cases-statistics-types";
import type { LabelCount } from "@/lib/statistics/types";
import { cn } from "@/lib/utils";

const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"] as const;

type CasesStatisticsDashboardProps = {
  data: CasesStatisticsPayload | undefined;
  filterOptions: CasesStatisticsFilterOptions;
  isLoading: boolean;
  filters: CasesStatisticsFilters;
  onFiltersChange: (filters: CasesStatisticsFilters) => void;
  hasNoSourceData: boolean;
};

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="border-b border-border/70 pb-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function StatPanel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border/70 bg-background p-5", className)}>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-border/50 py-2 last:border-b-0">
      <span className={cn("text-sm text-foreground", emphasize && "font-semibold")}>{label}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums text-foreground",
          emphasize ? "text-xl font-semibold" : "text-base font-semibold",
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

function RankingTable({
  items,
  emptyLabel,
  unit,
}: {
  items: LabelCount[];
  emptyLabel: string;
  unit: string;
}) {
  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <table className="w-full text-sm">
      <tbody>
        {items.map((item, index) => (
          <tr key={item.key ?? item.label} className="border-b border-border/40 last:border-b-0">
            <td className="w-8 py-2.5 align-top tabular-nums text-muted-foreground">
              {index + 1}.
            </td>
            <td className="py-2.5 pr-3 font-medium text-foreground">{item.label}</td>
            <td className="py-2.5 text-right tabular-nums font-semibold text-foreground">
              {item.value.toLocaleString()} {unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatMassDisplay(kg: number, locale: string): string {
  if (kg <= 0) return `0 kg`;
  if (kg < 1) {
    const grams = kg * 1000;
    return `${grams.toLocaleString(locale, { maximumFractionDigits: 1 })} g`;
  }
  return `${formatKg(kg)} kg`;
}

function buildSeizureRows(
  seizures: CasesSeizureTotals,
  t: (key: string) => string,
  locale: string,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  if (seizures.cannabisKg > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.cannabis"),
      value: formatMassDisplay(seizures.cannabisKg, locale),
    });
  }
  if (seizures.kifKg > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.resin"),
      value: formatMassDisplay(seizures.kifKg, locale),
    });
  }
  if (seizures.cocaineKg > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.cocaine"),
      value: formatMassDisplay(seizures.cocaineKg, locale),
    });
  }
  if (seizures.heroinKg > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.heroin"),
      value: formatMassDisplay(seizures.heroinKg, locale),
    });
  }
  if (seizures.ecstasyKg > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.ecstasy"),
      value: formatMassDisplay(seizures.ecstasyKg, locale),
    });
  }
  if (seizures.psychotropesPieces > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.psychotropes"),
      value: `${seizures.psychotropesPieces.toLocaleString(locale)} ${t("statistics.casesDashboard.seizures.tablets")}`,
    });
  } else if (seizures.psychotropesKg > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.psychotropes"),
      value: formatMassDisplay(seizures.psychotropesKg, locale),
    });
  }
  if (seizures.otherNarcoticsKg > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.otherNarcotics"),
      value: formatMassDisplay(seizures.otherNarcoticsKg, locale),
    });
  }
  if (seizures.currencyByCode.length > 0) {
    for (const row of seizures.currencyByCode) {
      rows.push({
        label: t("statistics.casesDashboard.seizures.banknotes"),
        value: `${row.value.toLocaleString(locale, { maximumFractionDigits: 0 })} ${row.label}`,
      });
    }
  } else if (seizures.currencyAmount > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.currencyAmount"),
      value: seizures.currencyAmount.toLocaleString(locale, { maximumFractionDigits: 0 }),
    });
  }
  if (seizures.banknotesCount > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.banknoteCount"),
      value: seizures.banknotesCount.toLocaleString(locale),
    });
  }
  if (seizures.explosivesObjects > 0) {
    rows.push({
      label: t("statistics.casesDashboard.seizures.explosives"),
      value: seizures.explosivesObjects.toLocaleString(locale),
    });
  }
  for (const extra of seizures.otherSeizures) {
    rows.push({
      label: extra.label,
      value: extra.value.toLocaleString(locale, { maximumFractionDigits: 2 }),
    });
  }

  return rows;
}

export function CasesStatisticsDashboard({
  data,
  filterOptions,
  isLoading,
  filters,
  onFiltersChange,
  hasNoSourceData,
}: CasesStatisticsDashboardProps) {
  const { t, locale } = useI18n();

  const updateFilter = <K extends keyof CasesStatisticsFilters>(
    key: K,
    value: CasesStatisticsFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  const resetFilters = () => onFiltersChange(DEFAULT_CASES_STATISTICS_FILTERS);

  const hasActiveFilters =
    filters.month !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.specialty !== "" ||
    filters.sectionId !== "" ||
    filters.checkpointId !== "" ||
    filters.agentId !== "" ||
    filters.dogId !== "" ||
    filters.year !== "";

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

  const lineConfig = {
    value: { label: t("statistics.casesDashboard.cases"), color: "hsl(var(--chart-1))" },
  } satisfies ChartConfig;

  const barConfig = {
    value: { label: t("statistics.casesDashboard.cases"), color: "hsl(var(--chart-2))" },
  } satisfies ChartConfig;

  const filtersBar = (
    <FilterBar showReset={hasActiveFilters} onReset={resetFilters} resetLabel={t("common.page.filterReset")}>
      <FilterPills className="flex w-full flex-wrap gap-2">
        <Select
          value={filters.year || "__all__"}
          onValueChange={(v) => updateFilter("year", v === "__all__" ? "" : v)}
        >
          <FilterSelectTrigger label={t("statistics.casesDashboard.filters.year")} className="min-w-[120px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("statistics.casesDashboard.filters.allYears")}</SelectItem>
            {yearOptions.map((year) => (
              <SelectItem key={year} value={year}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.month || "__all__"}
          onValueChange={(v) => updateFilter("month", v === "__all__" ? "" : v)}
        >
          <FilterSelectTrigger label={t("statistics.casesDashboard.filters.month")} className="min-w-[140px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("statistics.center.filters.allMonths")}</SelectItem>
            {monthOptions.map((month) => (
              <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => updateFilter("dateFrom", e.target.value)}
            className="h-9 w-[150px]"
            aria-label={t("statistics.casesDashboard.filters.dateFrom")}
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => updateFilter("dateTo", e.target.value)}
            className="h-9 w-[150px]"
            aria-label={t("statistics.casesDashboard.filters.dateTo")}
          />
        </div>

        <Select
          value={filters.specialty || "__all__"}
          onValueChange={(v) => updateFilter("specialty", v === "__all__" ? "" : v)}
        >
          <FilterSelectTrigger label={t("statistics.casesDashboard.filters.specialty")} className="min-w-[160px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("statistics.casesDashboard.filters.allSpecialties")}</SelectItem>
            {filterOptions.specialties.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.sectionId || "__all__"}
          onValueChange={(v) => updateFilter("sectionId", v === "__all__" ? "" : v)}
        >
          <FilterSelectTrigger label={t("statistics.casesDashboard.filters.section")} className="min-w-[150px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("common.allSections")}</SelectItem>
            {filterOptions.sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.checkpointId || "__all__"}
          onValueChange={(v) => updateFilter("checkpointId", v === "__all__" ? "" : v)}
        >
          <FilterSelectTrigger label={t("statistics.casesDashboard.filters.checkpoint")} className="min-w-[160px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("statistics.center.filters.allCheckpoints")}</SelectItem>
            {filterOptions.checkpoints.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.agentId || "__all__"}
          onValueChange={(v) => updateFilter("agentId", v === "__all__" ? "" : v)}
        >
          <FilterSelectTrigger label={t("statistics.casesDashboard.filters.agent")} className="min-w-[180px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("statistics.center.filters.allAgents")}</SelectItem>
            {filterOptions.agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.dogId || "__all__"}
          onValueChange={(v) => updateFilter("dogId", v === "__all__" ? "" : v)}
        >
          <FilterSelectTrigger label={t("statistics.casesDashboard.filters.dog")} className="min-w-[150px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("statistics.center.filters.allDogs")}</SelectItem>
            {filterOptions.dogs.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterPills>
    </FilterBar>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-lg" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (hasNoSourceData) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 px-6 py-16 text-center">
        <p className="text-base text-muted-foreground">
          {t("statistics.casesDashboard.empty")}
        </p>
      </div>
    );
  }

  if (!data || data.totalCases === 0) {
    return (
      <div className="space-y-6">
        {filtersBar}
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 px-6 py-12 text-center">
          <p className="text-base text-muted-foreground">
            {t("statistics.casesDashboard.empty")}
          </p>
        </div>
      </div>
    );
  }

  const seizureRows = buildSeizureRows(data.seizures, t, locale);
  // Keep specialty structure readable even when a bucket is zero.
  const specialtyRows = data.bySpecialty;

  return (
    <div className="space-y-8">
      {filtersBar}

      <div className="grid gap-4 lg:grid-cols-2">
        <StatPanel title={t("statistics.casesDashboard.panels.operationalCases")}>
          <StatRow
            label={t("statistics.casesDashboard.totalCases")}
            value={data.totalCases}
            emphasize
          />
          <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("statistics.casesDashboard.bySpecialty")}
          </p>
          {specialtyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("statistics.casesDashboard.noBreakdown")}</p>
          ) : (
            specialtyRows.map((row) => (
              <StatRow key={row.key ?? row.label} label={row.label} value={row.value} />
            ))
          )}
        </StatPanel>

        <StatPanel title={t("statistics.casesDashboard.seizures.title")}>
          {seizureRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("statistics.casesDashboard.noBreakdown")}</p>
          ) : (
            seizureRows.map((row) => (
              <StatRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))
          )}
        </StatPanel>
      </div>

      <Section title={t("statistics.casesDashboard.rankings.title")}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatPanel title={t("statistics.casesDashboard.rankings.agents")}>
            <RankingTable
              items={data.rankings.topAgents}
              emptyLabel={t("statistics.casesDashboard.noBreakdown")}
              unit={t("statistics.casesDashboard.casesUnit")}
            />
          </StatPanel>
          <StatPanel title={t("statistics.casesDashboard.rankings.dogs")}>
            <RankingTable
              items={data.rankings.topDogs}
              emptyLabel={t("statistics.casesDashboard.noBreakdown")}
              unit={t("statistics.casesDashboard.casesUnit")}
            />
          </StatPanel>
          <StatPanel title={t("statistics.casesDashboard.rankings.checkpoints")}>
            <RankingTable
              items={data.rankings.topCheckpoints}
              emptyLabel={t("statistics.casesDashboard.noBreakdown")}
              unit={t("statistics.casesDashboard.casesUnit")}
            />
          </StatPanel>
          <StatPanel title={t("statistics.casesDashboard.rankings.sections")}>
            <RankingTable
              items={data.rankings.topSections}
              emptyLabel={t("statistics.casesDashboard.noBreakdown")}
              unit={t("statistics.casesDashboard.casesUnit")}
            />
          </StatPanel>
        </div>
      </Section>

      <Section title={t("statistics.casesDashboard.charts.title")}>
        <div className="grid gap-4 xl:grid-cols-2">
          <StatPanel title={t("statistics.casesDashboard.charts.monthly")}>
            <ChartContainer config={lineConfig} className="aspect-[16/9] w-full">
              <LineChart data={data.charts.monthlyEvolution}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ChartContainer>
          </StatPanel>

          <StatPanel title={t("statistics.casesDashboard.charts.yearly")}>
            <ChartContainer config={barConfig} className="aspect-[16/9] w-full">
              <BarChart data={data.charts.yearlyEvolution}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </StatPanel>
        </div>
      </Section>
    </div>
  );
}
