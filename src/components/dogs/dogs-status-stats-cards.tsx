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
  onActiveNarcoticsClick?: () => void;
  onActiveExplosivesClick?: () => void;
  onActiveTotalClick?: () => void;
  onExcludedNarcoticsClick?: () => void;
  onExcludedExplosivesClick?: () => void;
  onExcludedTotalClick?: () => void;
};

function StatRow({
  emoji,
  label,
  value,
  valueClassName,
  onClick,
}: {
  emoji: string;
  label: string;
  value: number;
  valueClassName?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
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
    </>
  );

  if (!onClick) {
    return <div className="flex items-center justify-between gap-3 text-sm">{content}</div>;
  }

  return (
    <button
      type="button"
      className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-3 rounded-lg px-1 py-0.5 text-left text-sm hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      aria-label={label}
    >
      {content}
    </button>
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
  onNarcoticsClick,
  onExplosivesClick,
  onTotalClick,
}: {
  title: string;
  narcotics: number;
  explosives: number;
  total: number;
  totalLabel: string;
  loading?: boolean;
  valueClassName?: string;
  onNarcoticsClick?: () => void;
  onExplosivesClick?: () => void;
  onTotalClick?: () => void;
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
            onClick={onNarcoticsClick}
          />
          <StatRow
            emoji="💣"
            label={t("dogs.stat.explosives")}
            value={explosives}
            valueClassName={valueClassName}
            onClick={onExplosivesClick}
          />
          <div className="mt-3 border-t border-border/60 pt-3">
            <StatRow
              emoji=""
              label={totalLabel}
              value={total}
              valueClassName={cn("text-base", valueClassName ?? "text-foreground")}
              onClick={onTotalClick}
            />
          </div>
        </div>
      )}
    </article>
  );
}

export function DogsStatusStatsCards({
  active,
  excluded,
  loading,
  onActiveNarcoticsClick,
  onActiveExplosivesClick,
  onActiveTotalClick,
  onExcludedNarcoticsClick,
  onExcludedExplosivesClick,
  onExcludedTotalClick,
}: DogsStatusStatsCardsProps) {
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
        onNarcoticsClick={onActiveNarcoticsClick}
        onExplosivesClick={onActiveExplosivesClick}
        onTotalClick={onActiveTotalClick}
      />
      <DogsStatusStatsCard
        title={t("dogs.stat.excluded")}
        narcotics={excluded.narcotics}
        explosives={excluded.explosives}
        total={excluded.total}
        totalLabel={t("dogs.statistics.totalExcluded")}
        loading={loading}
        valueClassName="text-destructive"
        onNarcoticsClick={onExcludedNarcoticsClick}
        onExplosivesClick={onExcludedExplosivesClick}
        onTotalClick={onExcludedTotalClick}
      />
    </div>
  );
}
