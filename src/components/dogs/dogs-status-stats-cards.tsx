import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export type DogsStatusStatsCardData = {
  narcotics: number;
  explosives: number;
  total: number;
};

type DogsStatusStatsCardsProps = {
  active: DogsStatusStatsCardData;
  excluded: DogsStatusStatsCardData;
  loading?: boolean;
};

function StatRow({
  emoji,
  label,
  value,
  valueClassName,
}: {
  emoji: string;
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        {emoji ? (
          <span aria-hidden className="text-base leading-none">
            {emoji}
          </span>
        ) : null}
        <span className={cn("truncate", !emoji && "font-medium text-foreground")}>{label}</span>
      </span>
      <span
        className={cn(
          "shrink-0 font-semibold tabular-nums tracking-tight",
          valueClassName ?? "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DogsStatusStatsCard({
  title,
  narcotics,
  explosives,
  total,
  totalLabel,
  loading,
  valueClassName,
}: {
  title: string;
  narcotics: number;
  explosives: number;
  total: number;
  totalLabel: string;
  loading?: boolean;
  valueClassName?: string;
}) {
  const { t } = useI18n();

  return (
    <article className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="mt-3 h-5 w-full" />
        </div>
      ) : (
        <div className="space-y-2">
          <StatRow
            emoji="🐕"
            label={t("dogs.stat.narcotics")}
            value={narcotics}
            valueClassName={valueClassName}
          />
          <StatRow
            emoji="💣"
            label={t("dogs.stat.explosives")}
            value={explosives}
            valueClassName={valueClassName}
          />
          <div className="mt-3 border-t border-border/60 pt-3">
            <StatRow
              emoji=""
              label={totalLabel}
              value={total}
              valueClassName={cn("text-base", valueClassName ?? "text-foreground")}
            />
          </div>
        </div>
      )}
    </article>
  );
}

export function DogsStatusStatsCards({ active, excluded, loading }: DogsStatusStatsCardsProps) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <DogsStatusStatsCard
        title={t("dogs.stat.active")}
        narcotics={active.narcotics}
        explosives={active.explosives}
        total={active.total}
        totalLabel={t("dogs.statistics.totalActive")}
        loading={loading}
        valueClassName="text-emerald-700 dark:text-emerald-400"
      />
      <DogsStatusStatsCard
        title={t("dogs.stat.excluded")}
        narcotics={excluded.narcotics}
        explosives={excluded.explosives}
        total={excluded.total}
        totalLabel={t("dogs.statistics.totalExcluded")}
        loading={loading}
        valueClassName="text-destructive"
      />
    </div>
  );
}
