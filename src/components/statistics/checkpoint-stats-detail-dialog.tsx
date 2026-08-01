import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Briefcase, Dog, MapPin, Users } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatMiniKpi } from "@/components/statistics/stat-section";
import { StatDetailList, StatSummaryCard } from "@/components/statistics/stat-summary";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { useI18n } from "@/hooks/use-i18n";
import { formatKg } from "@/lib/operational-case-stats";
import {
  caseSpecialtyBadgeTone,
  caseSpecialtyLabel,
  drugTypeLabel,
  formatSeizureDetails,
  objectTypeLabel,
} from "@/lib/operational-cases";
import type { CheckpointStatRecord } from "@/lib/statistics/checkpoint-stats";

type CheckpointStatsDetailDialogProps = {
  record: CheckpointStatRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaseClick?: (caseId: string) => void;
  monthLabels: (key: string) => string;
  lastUpdated?: string;
};

export function CheckpointStatsDetailDialog({
  record,
  open,
  onOpenChange,
  onCaseClick,
  monthLabels,
  lastUpdated,
}: CheckpointStatsDetailDialogProps) {
  const { t } = useI18n();

  const seizureTypeLabel = useMemo(
    () => (key: string | null) => {
      if (!key) return t("common.none");
      if (key === "currency") return t("operationalCases.specialty.currency");
      const drug = drugTypeLabel(key as Parameters<typeof drugTypeLabel>[0], t);
      if (drug !== "—") return drug;
      try {
        return objectTypeLabel(key as Parameters<typeof objectTypeLabel>[0], t);
      } catch {
        return key;
      }
    },
    [t],
  );

  if (!record) return null;

  const { seizures, analytics } = record;
  const allCases = record.cases;
  const monthItems = record.casesByMonth.map((row) => ({
    key: row.month,
    label: monthLabels(row.month),
    value: row.value,
  }));
  const monthTotal = monthItems.reduce((sum, row) => sum + row.value, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {record.name}
          </DialogTitle>
          <DialogDescription>{t("statistics.checkpointStats.detail.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatMiniKpi label={t("statistics.checkpointStats.table.cases")} value={record.totalCases} />
          <StatMiniKpi label={t("statistics.checkpointStats.table.planning")} value={record.totalPlanningAssignments} />
          <StatMiniKpi label={t("statistics.checkpointStats.table.agents")} value={record.totalAgents} />
          <StatMiniKpi label={t("statistics.checkpointStats.table.dogs")} value={record.totalDogs} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatMiniKpi label={t("statistics.checkpointStats.analytics.casesThisMonth")} value={analytics.casesThisMonth} />
          <StatMiniKpi label={t("statistics.checkpointStats.analytics.casesThisYear")} value={analytics.casesThisYear} />
          <StatMiniKpi
            label={t("statistics.checkpointStats.analytics.mostActiveSpecialty")}
            value={analytics.mostActiveSpecialty ? caseSpecialtyLabel(analytics.mostActiveSpecialty, t) : t("common.none")}
          />
          <StatMiniKpi
            label={t("statistics.checkpointStats.analytics.mostCommonSeizure")}
            value={seizureTypeLabel(analytics.mostCommonSeizureType)}
          />
          <StatMiniKpi
            label={t("statistics.checkpointStats.analytics.mostActiveAgent")}
            value={analytics.mostActiveAgent ?? t("common.none")}
          />
          <StatMiniKpi
            label={t("statistics.checkpointStats.analytics.mostActiveDog")}
            value={analytics.mostActiveDog ?? t("common.none")}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <h4 className="mb-3 text-sm font-semibold">{t("statistics.checkpointStats.seizures.narcotics")}</h4>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.seizures.cannabis")}</dt>
                <dd className="font-medium tabular-nums">{formatKg(seizures.narcotics.cannabisKg)} kg</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.seizures.hashish")}</dt>
                <dd className="font-medium tabular-nums">{formatKg(seizures.narcotics.hashishKg)} kg</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.seizures.cocaine")}</dt>
                <dd className="font-medium tabular-nums">{formatKg(seizures.narcotics.cocaineKg)} kg</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.seizures.heroin")}</dt>
                <dd className="font-medium tabular-nums">{formatKg(seizures.narcotics.heroinKg)} kg</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.seizures.synthetic")}</dt>
                <dd className="font-medium tabular-nums">{formatKg(seizures.narcotics.syntheticDrugsKg)} kg</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.khat")}</dt>
                <dd className="font-medium tabular-nums">{formatKg(seizures.narcotics.khatKg)} kg</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <h4 className="mb-3 text-sm font-semibold">{t("statistics.checkpointStats.seizures.explosives")}</h4>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.firearms")}</dt>
                <dd className="font-medium tabular-nums">{seizures.explosives.firearms}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.bladedWeapons")}</dt>
                <dd className="font-medium tabular-nums">{seizures.explosives.bladedWeapons}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.grenades")}</dt>
                <dd className="font-medium tabular-nums">{seizures.explosives.grenades}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.detonators")}</dt>
                <dd className="font-medium tabular-nums">{seizures.explosives.detonators}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.explosiveMaterials")}</dt>
                <dd className="font-medium tabular-nums">{seizures.explosives.explosiveMaterials}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.ammunition")}</dt>
                <dd className="font-medium tabular-nums">{seizures.explosives.ammunition}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <h4 className="mb-3 text-sm font-semibold">{t("statistics.checkpointStats.seizures.currency")}</h4>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.totalAmount")}</dt>
                <dd className="font-medium tabular-nums">{seizures.currency.totalAmount.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.banknotes")}</dt>
                <dd className="font-medium tabular-nums">{seizures.currency.banknotes}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{t("statistics.checkpointStats.seizures.currencyTypes")}</dt>
                <dd className="max-w-[140px] truncate text-right font-medium">
                  {seizures.currency.currencyTypes.length
                    ? seizures.currency.currencyTypes.join(", ")
                    : t("common.none")}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <StatSummaryCard
          title={t("statistics.checkpointStats.detail.monthlyEvolution")}
          icon={Briefcase}
          total={monthTotal}
          totalLabel={t("statistics.summary.total")}
          lastUpdated={lastUpdated}
          isEmpty={!monthItems.length}
          emptyMessage={t("statistics.summary.empty")}
        >
          <StatDetailList items={monthItems} total={monthTotal} showPercentage={false} />
        </StatSummaryCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border/60 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" />
              {t("statistics.checkpointStats.detail.assignedAgents")}
            </h4>
            {record.assignedAgents.length ? (
              <ul className="space-y-1 text-sm">
                {record.assignedAgents.map((agent) => (
                  <li key={agent.id} className="truncate text-muted-foreground">
                    {agent.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("common.none")}</p>
            )}
          </div>
          <div className="rounded-xl border border-border/60 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Dog className="h-4 w-4 text-primary" />
              {t("statistics.checkpointStats.detail.assignedDogs")}
            </h4>
            {record.assignedDogs.length ? (
              <ul className="space-y-1 text-sm">
                {record.assignedDogs.map((dog) => (
                  <li key={dog.id} className="truncate text-muted-foreground">
                    {dog.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("common.none")}</p>
            )}
          </div>
        </div>

        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Briefcase className="h-4 w-4 text-primary" />
            {t("statistics.checkpointStats.detail.allCases", { count: allCases.length })}
          </h4>
          {allCases.length ? (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {allCases.map((caseRow) => (
                <button
                  key={caseRow.id}
                  type="button"
                  onClick={() => onCaseClick?.(caseRow.id)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold">{caseRow.case_number}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {format(parseISO(caseRow.case_date), "dd/MM/yyyy")} · {formatSeizureDetails(caseRow as never, t)}
                    </p>
                  </div>
                  <StatusBadge tone={caseSpecialtyBadgeTone(caseRow.specialty)} className="shrink-0 px-1.5 py-0 text-[10px]">
                    {caseSpecialtyLabel(caseRow.specialty, t)}
                  </StatusBadge>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("statistics.checkpointStats.empty.cases")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
