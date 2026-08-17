import { Ban, Dog as DogIcon } from "lucide-react";

import { SpecialtyBreakdownLines } from "@/components/agents/specialty-breakdown-lines";
import { KpiCard } from "@/components/enterprise/kpi-card";
import type { CheckpointDogStats } from "@/lib/checkpoints/checkpoint-dog-stats";
import { useI18n } from "@/hooks/use-i18n";

type CheckpointDogOverviewCardsProps = {
  stats: CheckpointDogStats;
  loading?: boolean;
  onActiveClick?: () => void;
  onActiveNarcoticsClick?: () => void;
  onActiveExplosivesClick?: () => void;
  onExcludedClick?: () => void;
  onExcludedNarcoticsClick?: () => void;
  onExcludedExplosivesClick?: () => void;
};

export function CheckpointDogOverviewCards({
  stats,
  loading,
  onActiveClick,
  onActiveNarcoticsClick,
  onActiveExplosivesClick,
  onExcludedClick,
  onExcludedNarcoticsClick,
  onExcludedExplosivesClick,
}: CheckpointDogOverviewCardsProps) {
  const { t } = useI18n();

  const activeTotal =
    stats.activeTotal ?? stats.narcotics.active + stats.explosives.active;
  const excludedTotal =
    stats.excludedTotal ?? stats.narcotics.excluded + stats.explosives.excluded;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <KpiCard
        icon={DogIcon}
        label={t("dogs.stat.active")}
        value={activeTotal}
        accent="success"
        loading={loading}
        className="h-full"
        onDetailsClick={onActiveClick}
        footer={
          <SpecialtyBreakdownLines
            specialty={{
              narcotics: stats.narcotics.active,
              explosives: stats.explosives.active,
            }}
            loading={loading}
            onNarcoticsClick={onActiveNarcoticsClick}
            onExplosivesClick={onActiveExplosivesClick}
          />
        }
      />
      <KpiCard
        icon={Ban}
        label={t("dogs.stat.excluded")}
        value={excludedTotal}
        accent="danger"
        loading={loading}
        className="h-full"
        onDetailsClick={onExcludedClick}
        footer={
          <SpecialtyBreakdownLines
            specialty={{
              narcotics: stats.narcotics.excluded,
              explosives: stats.explosives.excluded,
            }}
            loading={loading}
            onNarcoticsClick={onExcludedNarcoticsClick}
            onExplosivesClick={onExcludedExplosivesClick}
          />
        }
      />
    </div>
  );
}
