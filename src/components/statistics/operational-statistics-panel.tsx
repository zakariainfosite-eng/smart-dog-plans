import type { ReactNode } from "react";
import type { OperationalStatisticsPayload } from "@/lib/statistics/fetch-operational-statistics";
import type { LabelCount } from "@/lib/statistics/types";
import { cn } from "@/lib/utils";

function StatSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("py-6", className)}>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatBigNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function StatDotRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-foreground">{label}</span>
      <span
        className="min-h-[1px] min-w-[2rem] flex-1 border-b border-dotted border-border/70"
        aria-hidden
      />
      <span className="shrink-0 tabular-nums text-base font-semibold text-foreground">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function StatRankingRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-foreground">{label}</span>
      <span
        className="min-h-[1px] min-w-[2rem] flex-1 border-b border-dotted border-border/70"
        aria-hidden
      />
      <span className="shrink-0 tabular-nums text-base font-semibold text-foreground">
        {value.toLocaleString()} {unit}
      </span>
    </div>
  );
}

function StatRankingRows({
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
    <div className="space-y-0.5">
      {items.map((item) => (
        <StatRankingRow
          key={item.key ?? item.label}
          label={item.label}
          value={item.value}
          unit={unit}
        />
      ))}
    </div>
  );
}

type OperationalStatisticsPanelProps = {
  data: OperationalStatisticsPayload | undefined;
  isLoading: boolean;
  labels: {
    currentYear: (year: number) => string;
    totalOperationalCases: string;
    totalPlanningGenerated: string;
    totalControlsPerformed: string;
    totalNarcoticsDetections: string;
    totalExplosivesDetections: string;
    totalCurrencyDetections: string;
    monthly: string;
    weekly: string;
    today: string;
    todayPlanning: string;
    todayCases: string;
    todayExclusions: string;
    todayActiveTeams: string;
    topAgents: string;
    topCheckpoints: string;
    topDogs: string;
    empty: string;
    missions: string;
    controls: string;
  };
};

export function OperationalStatisticsPanel({
  data,
  isLoading,
  labels,
}: OperationalStatisticsPanelProps) {
  if (isLoading && !data) {
    return (
      <div className="animate-pulse space-y-6 py-4">
        <div className="h-24 rounded bg-muted/30" />
        <div className="h-48 rounded bg-muted/30" />
        <div className="h-32 rounded bg-muted/30" />
      </div>
    );
  }

  const year = data?.year ?? new Date().getFullYear();

  return (
    <div className="divide-y divide-border/50">
      <StatSection title={labels.currentYear(year)}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <StatBigNumber
            label={labels.totalOperationalCases}
            value={data?.yearTotals.operationalCases ?? 0}
          />
          <StatBigNumber
            label={labels.totalPlanningGenerated}
            value={data?.yearTotals.planningGenerated ?? 0}
          />
          <StatBigNumber
            label={labels.totalControlsPerformed}
            value={data?.yearTotals.controlsPerformed ?? 0}
          />
          <StatBigNumber
            label={labels.totalNarcoticsDetections}
            value={data?.yearTotals.narcoticsDetections ?? 0}
          />
          <StatBigNumber
            label={labels.totalExplosivesDetections}
            value={data?.yearTotals.explosivesDetections ?? 0}
          />
          <StatBigNumber
            label={labels.totalCurrencyDetections}
            value={data?.yearTotals.currencyDetections ?? 0}
          />
        </div>
      </StatSection>

      <StatSection title={labels.monthly}>
        <div className="max-w-xl">
          {(data?.monthly ?? []).map((row) => (
            <StatDotRow key={row.monthKey} label={row.label} value={row.value} />
          ))}
        </div>
      </StatSection>

      <StatSection title={labels.weekly}>
        <div className="max-w-xl">
          {(data?.weekly ?? []).map((row) => (
            <StatDotRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </StatSection>

      <StatSection title={labels.today}>
        <div className="grid max-w-xl gap-1 sm:grid-cols-2">
          <StatDotRow label={labels.todayPlanning} value={data?.today.planning ?? 0} />
          <StatDotRow label={labels.todayCases} value={data?.today.operationalCases ?? 0} />
          <StatDotRow label={labels.todayExclusions} value={data?.today.exclusions ?? 0} />
          <StatDotRow label={labels.todayActiveTeams} value={data?.today.activeTeams ?? 0} />
        </div>
      </StatSection>

      <div className="grid gap-0 lg:grid-cols-3 lg:divide-x lg:divide-border/50">
        <StatSection title={labels.topAgents} className="lg:px-8 lg:first:pl-0">
          <StatRankingRows
            items={data?.topAgents ?? []}
            emptyLabel={labels.empty}
            unit={labels.missions}
          />
        </StatSection>
        <StatSection title={labels.topCheckpoints} className="lg:px-8">
          <StatRankingRows
            items={data?.topCheckpoints ?? []}
            emptyLabel={labels.empty}
            unit={labels.controls}
          />
        </StatSection>
        <StatSection title={labels.topDogs} className="lg:px-8 lg:last:pr-0">
          <StatRankingRows
            items={data?.topDogs ?? []}
            emptyLabel={labels.empty}
            unit={labels.missions}
          />
        </StatSection>
      </div>
    </div>
  );
}
