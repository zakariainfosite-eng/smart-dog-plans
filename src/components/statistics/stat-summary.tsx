import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { LabelCount, LabelCountWithPct, MonthBreakdown } from "@/lib/statistics/types";
import { withPercentages } from "@/lib/statistics/aggregate";
import { cn } from "@/lib/utils";

type StatSummaryCardProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  total?: number;
  totalLabel?: string;
  lastUpdated?: string;
  children: ReactNode;
  className?: string;
  emptyMessage?: string;
  isEmpty?: boolean;
};

export function StatSummaryCard({
  title,
  description,
  icon: Icon,
  total,
  totalLabel,
  lastUpdated,
  children,
  className,
  emptyMessage,
  isEmpty,
}: StatSummaryCardProps) {
  return (
    <Card className={cn("overflow-hidden rounded-[20px] border-border/60 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card", className)}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" strokeWidth={2.25} />
              </span>
            ) : null}
            <div className="min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
            </div>
          </div>
          {total != null ? (
            <div className="shrink-0 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                {totalLabel ?? "Total"}
              </p>
              <p className="text-xl font-bold tabular-nums text-primary">{total.toLocaleString()}</p>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isEmpty && emptyMessage ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          children
        )}
      </CardContent>
      {lastUpdated ? (
        <CardFooter className="border-t border-border/50 bg-muted/20 py-2.5 text-[11px] text-muted-foreground">
          <Clock3 className="mr-1.5 h-3.5 w-3.5 shrink-0" />
          {lastUpdated}
        </CardFooter>
      ) : null}
    </Card>
  );
}

type StatDetailListProps = {
  items: LabelCount[];
  total?: number;
  emptyMessage?: string;
  showPercentage?: boolean;
  variant?: "bullets" | "categories";
  percentageOfTotalLabel?: string;
};

export function StatDetailList({
  items,
  total,
  emptyMessage,
  showPercentage = true,
  variant = "bullets",
  percentageOfTotalLabel = "% of total",
}: StatDetailListProps) {
  if (items.length === 0) {
    return emptyMessage ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : null;
  }

  const rows = withPercentages(items, total);

  if (variant === "categories") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <CategoryBlock
            key={row.key ?? row.label}
            row={row}
            showPercentage={showPercentage}
            percentageOfTotalLabel={percentageOfTotalLabel}
          />
        ))}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.key ?? row.label}
          className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5 text-sm"
        >
          <span className="flex min-w-0 items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span className="truncate">{row.label}</span>
          </span>
          <span className="shrink-0 text-right tabular-nums">
            <span className="font-semibold">{row.value.toLocaleString()}</span>
            {showPercentage ? <span className="ml-2 text-xs text-muted-foreground">({row.pct}%)</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CategoryBlock({
  row,
  showPercentage,
  percentageOfTotalLabel,
}: {
  row: LabelCountWithPct;
  showPercentage: boolean;
  percentageOfTotalLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
      <h4 className="text-sm font-semibold">{row.label}</h4>
      <p className="mt-2 text-2xl font-bold tabular-nums text-primary">{row.value.toLocaleString()}</p>
      {showPercentage ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {row.pct}% {percentageOfTotalLabel}
        </p>
      ) : null}
    </div>
  );
}

type StatMonthBreakdownListProps = {
  months: MonthBreakdown[];
  totalLabel: string;
  itemSuffix?: (count: number) => string;
  emptyMessage?: string;
};

export function StatMonthBreakdownList({
  months,
  totalLabel,
  itemSuffix,
  emptyMessage,
}: StatMonthBreakdownListProps) {
  if (months.length === 0) {
    return emptyMessage ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : null;
  }

  return (
    <div className="space-y-4">
      {months.map((month) => (
        <div key={month.month} className="rounded-xl border border-border/60 bg-muted/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/40 pb-2">
            <h4 className="text-sm font-semibold capitalize">{month.label}</h4>
            <span className="text-xs font-medium text-muted-foreground">
              {totalLabel}: <span className="font-semibold tabular-nums text-foreground">{month.total}</span>
            </span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {month.items.map((item) => (
              <li key={item.key ?? item.label} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span className="text-primary">•</span>
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {item.value.toLocaleString()}
                  {itemSuffix ? ` ${itemSuffix(item.value)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type StatRankingTextListProps = {
  items: LabelCount[];
  emptyMessage?: string;
};

export function StatRankingTextList({ items, emptyMessage }: StatRankingTextListProps) {
  if (items.length === 0) {
    return emptyMessage ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : null;
  }

  const rows = withPercentages(items);
  const max = rows[0]?.value ?? 1;

  return (
    <ol className="space-y-2">
      {rows.map((row, index) => (
        <li
          key={row.key ?? row.label}
          className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{row.label}</p>
            <p className="text-xs text-muted-foreground">
              {row.pct}% · {row.value.toLocaleString()} / {max.toLocaleString()}
            </p>
          </div>
          <span className="shrink-0 text-lg font-bold tabular-nums text-primary">{row.value}</span>
        </li>
      ))}
    </ol>
  );
}

type StatCheckpointSeizureSummaryProps = {
  rows: Array<{ label: string; stacks: Array<{ key: string; label: string; value: number }> }>;
  emptyMessage?: string;
};

export function StatCheckpointSeizureSummary({ rows, emptyMessage }: StatCheckpointSeizureSummaryProps) {
  if (rows.length === 0) {
    return emptyMessage ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : null;
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const total = row.stacks.reduce((sum, item) => sum + item.value, 0);
        const items = withPercentages(
          row.stacks.map((stack) => ({ key: stack.key, label: stack.label, value: stack.value })),
          total,
        );
        return (
          <div key={row.label} className="rounded-xl border border-border/60 bg-muted/10 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{row.label}</h4>
              <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
            </div>
            <ul className="space-y-1 text-sm">
              {items.map((item) => (
                <li key={item.key ?? item.label} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">• {item.label}</span>
                  <span className="font-medium tabular-nums">
                    {item.value} ({item.pct}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** @deprecated Use StatSummaryCard — kept for gradual migration */
export const StatChartCard = StatSummaryCard;
