import { Sun, Moon } from "lucide-react";

import { StatusBadge } from "@/components/enterprise/status-badge";
import type { Database } from "@/integrations/database/schema-types";
import { normalizeOperatingDays } from "@/lib/checkpoints/operational-config";
import { useI18n } from "@/hooks/use-i18n";

type CheckpointSummaryRow = Pick<
  Database["public"]["Tables"]["checkpoints"]["Row"],
  | "day_shift_enabled"
  | "night_shift_enabled"
  | "day_explosives"
  | "day_narcotics"
  | "night_explosives"
  | "night_narcotics"
  | "female_policy"
  | "priority"
  | "operating_days"
>;

const WEEKDAY_KEYS = ["", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function ShiftLine({
  icon: Icon,
  label,
  explosives,
  narcotics,
  explosivesLabel,
  narcoticsLabel,
}: {
  icon: typeof Sun;
  label: string;
  explosives: number;
  narcotics: number;
  explosivesLabel: string;
  narcoticsLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="font-medium text-foreground">{label}</span>
      <span>{explosivesLabel}: {explosives}</span>
      <span>{narcoticsLabel}: {narcotics}</span>
    </div>
  );
}

export function CheckpointOperationalSummary({ checkpoint }: { checkpoint: CheckpointSummaryRow }) {
  const { t } = useI18n();
  const days = normalizeOperatingDays(checkpoint.operating_days);
  const dayLabels = days.map((d) => t(`weekday.${WEEKDAY_KEYS[d]}`)).join(", ");

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone="neutral">
          {checkpoint.priority} —{" "}
          {t(`checkpoints.config.priorityLevel.${checkpoint.priority ?? 3}`)}
        </StatusBadge>
        <StatusBadge tone="neutral">
          {t(`checkpoints.config.femalePolicy.${checkpoint.female_policy}`)}
        </StatusBadge>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("checkpoints.config.operatingDays")}: {dayLabels}
      </p>
      {checkpoint.day_shift_enabled ? (
        <ShiftLine
          icon={Sun}
          label={t("checkpoints.config.dayShift")}
          explosives={checkpoint.day_explosives}
          narcotics={checkpoint.day_narcotics}
          explosivesLabel={t("checkpoints.config.team.explosives")}
          narcoticsLabel={t("checkpoints.config.team.narcotics")}
        />
      ) : null}
      {checkpoint.night_shift_enabled ? (
        <ShiftLine
          icon={Moon}
          label={t("checkpoints.config.nightShift")}
          explosives={checkpoint.night_explosives}
          narcotics={checkpoint.night_narcotics}
          explosivesLabel={t("checkpoints.config.team.explosives")}
          narcoticsLabel={t("checkpoints.config.team.narcotics")}
        />
      ) : null}
    </div>
  );
}
