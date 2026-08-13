import { Ban, Dog as DogIcon } from "lucide-react";

import { KpiCard } from "@/components/enterprise/kpi-card";
import type { CheckpointDogStats } from "@/lib/checkpoints/checkpoint-dog-stats";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type CheckpointDogOverviewCardsProps = {
  stats: CheckpointDogStats;
  loading?: boolean;
};

const trendCardClass =
  "h-full [&_p:last-child]:whitespace-pre-line [&_p:last-child]:normal-case [&_p:last-child]:text-xs [&_p:last-child]:leading-relaxed";

export function CheckpointDogOverviewCards({ stats, loading }: CheckpointDogOverviewCardsProps) {
  const { t } = useI18n();

  const activeTotal =
    stats.activeTotal ?? stats.narcotics.active + stats.explosives.active;
  const excludedTotal =
    stats.excludedTotal ?? stats.narcotics.excluded + stats.explosives.excluded;

  const activeTrend = [
    `${t("dogs.stat.narcotics")} : ${stats.narcotics.active}`,
    `${t("dogs.stat.explosives")} : ${stats.explosives.active}`,
  ].join("\n");

  const excludedTrend = [
    `${t("dogs.stat.narcotics")} : ${stats.narcotics.excluded}`,
    `${t("dogs.stat.explosives")} : ${stats.explosives.excluded}`,
  ].join("\n");

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <KpiCard
        icon={DogIcon}
        label={t("dogs.stat.active")}
        value={activeTotal}
        trend={activeTrend}
        accent="success"
        loading={loading}
        className={cn(trendCardClass)}
      />
      <KpiCard
        icon={Ban}
        label={t("dogs.stat.excluded")}
        value={excludedTotal}
        trend={excludedTrend}
        accent="danger"
        loading={loading}
        className={cn(trendCardClass)}
      />
    </div>
  );
}
