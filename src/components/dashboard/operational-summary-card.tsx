import {
  Activity,
  AlertTriangle,
  ClipboardList,
  GraduationCap,
  HeartPulse,
  CalendarOff,
  PawPrint,
  Shield,
  SunMedium,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { OperationalSummary } from "@/lib/dashboard/fetch-operational-summary";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type OperationalSummaryCardProps = {
  summary: OperationalSummary;
  loading?: boolean;
};

type MetricTile = {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "neutral" | "danger" | "warning";
};

const toneStyles: Record<MetricTile["tone"], string> = {
  neutral: "border-[#023A84]/10 bg-[#023A84]/[0.03] text-[#023A84]",
  danger: "border-red-200/80 bg-red-50/80 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
  warning:
    "border-amber-200/80 bg-amber-50/80 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
};

function InfoRow({
  icon: Icon,
  label,
  value,
  emphasize,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#023A84]/8 bg-white/70 px-4 py-3.5 shadow-sm dark:bg-card/60">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#023A84]/10 text-[#023A84]">
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-1 truncate text-sm font-semibold text-foreground",
            emphasize && "text-base text-[#0B1F3A] dark:text-foreground",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export function OperationalSummaryCard({ summary, loading }: OperationalSummaryCardProps) {
  const { t } = useI18n();

  const commanderDisplay = summary.commanderName
    ? [summary.commanderName, summary.commanderGrade, summary.commanderMle]
        .filter(Boolean)
        .join(" — ")
    : t("dashboard.operationalSummary.commanderMissing");

  const sectionLabel = summary.hasActiveSection
    ? summary.sectionName
    : t("dashboard.operationalSummary.noSection");

  const metrics: MetricTile[] = [
    {
      label: t("dashboard.operationalSummary.agentsMaladie"),
      value: summary.agentsMaladie,
      icon: HeartPulse,
      tone: summary.agentsMaladie > 0 ? "danger" : "neutral",
    },
    {
      label: t("dashboard.operationalSummary.agentsFormation"),
      value: summary.agentsFormation,
      icon: GraduationCap,
      tone: summary.agentsFormation > 0 ? "warning" : "neutral",
    },
    {
      label: t("dashboard.operationalSummary.agentsConge"),
      value: summary.agentsConge,
      icon: CalendarOff,
      tone: summary.agentsConge > 0 ? "warning" : "neutral",
    },
    {
      label: t("dashboard.operationalSummary.unavailableDogs"),
      value: summary.unavailableDogs,
      icon: PawPrint,
      tone: summary.unavailableDogs > 0 ? "warning" : "neutral",
    },
  ];

  return (
    <section
      className={cn(
        "group relative overflow-hidden rounded-[20px] border border-[#023A84]/10 bg-card",
        "shadow-[0_4px_20px_-4px_rgba(2,58,132,0.10)] transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-[#023A84]/22 hover:shadow-[0_12px_28px_-8px_rgba(2,58,132,0.16)]",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#023A84] via-[#1a5aab] to-[#4A90D9]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[#023A84]/[0.04]"
      />

      <header className="relative flex items-start gap-3.5 px-5 pb-4 pt-6 sm:px-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#023A84]/12 text-[#023A84] shadow-sm ring-1 ring-inset ring-black/5">
          <ClipboardList className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h2 className="font-brand text-lg font-bold tracking-tight text-[#0B1F3A] dark:text-foreground">
            {t("dashboard.operationalSummary.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.operationalSummary.subtitle")}
          </p>
        </div>
      </header>

      <div className="relative space-y-4 px-5 pb-6 sm:px-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <>
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl border px-4 py-3.5",
                summary.hasPlanning
                  ? "border-emerald-200/80 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-300"
                  : "border-amber-200/80 bg-amber-50/70 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-300",
              )}
            >
              <Activity className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
              <p className="text-sm font-medium leading-relaxed">
                {summary.hasPlanning
                  ? t("dashboard.operationalSummary.planningReady")
                  : t("dashboard.operationalSummary.noPlanning")}
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-1">
              <InfoRow
                icon={Shield}
                label={t("dashboard.operationalSummary.activeSection")}
                value={sectionLabel}
                emphasize
              />
              <div className="grid gap-2.5 sm:grid-cols-2">
                <InfoRow
                  icon={SunMedium}
                  label={t("dashboard.operationalSummary.currentShift")}
                  value={t(`shift.${summary.shift}`)}
                />
                <InfoRow
                  icon={UserRound}
                  label={t("dashboard.operationalSummary.sectionChief")}
                  value={commanderDisplay}
                />
              </div>
            </div>

            <div>
              <div className="mb-2.5 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-[#023A84]/70" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#023A84]/75">
                  {t("dashboard.operationalSummary.availabilityTitle")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {metrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div
                      key={metric.label}
                      className={cn(
                        "rounded-2xl border px-3.5 py-3 transition-colors duration-200",
                        toneStyles[metric.tone],
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Icon className="h-4 w-4 opacity-80" strokeWidth={2.25} />
                        <span className="font-brand text-2xl font-bold tabular-nums leading-none">
                          {metric.value}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] font-medium leading-snug opacity-80">
                        {metric.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
