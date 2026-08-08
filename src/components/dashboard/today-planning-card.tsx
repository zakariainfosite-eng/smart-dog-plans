import { CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export type TodayPlanningRow = {
  id: string;
  shift: string;
  validated: boolean;
  sections: { name: string } | null;
};

type TodayPlanningCardProps = {
  planning: TodayPlanningRow[];
  loading?: boolean;
};

const KNOWN_SHIFTS = ["day", "night", "rest"] as const;

export function TodayPlanningCard({ planning, loading }: TodayPlanningCardProps) {
  const { t } = useI18n();

  const planningTotal = planning.length;
  const validatedCount = planning.filter((row) => row.validated).length;
  const validationProgress =
    planningTotal > 0 ? Math.round((validatedCount / planningTotal) * 100) : 0;

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
          <CalendarDays className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-brand text-lg font-bold tracking-tight text-[#0B1F3A] dark:text-foreground">
            {t("dashboard.todayPlanning")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {planningTotal > 0
              ? t("dashboard.validationProgress", {
                  validated: validatedCount,
                  total: planningTotal,
                })
              : t("dashboard.noPlanningToday")}
          </p>
        </div>
      </header>

      <div className="relative space-y-5 px-5 pb-6 sm:px-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <>
            <div className="rounded-2xl border border-[#023A84]/8 bg-[#023A84]/[0.03] px-4 py-3.5">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#023A84]" />
                  {t("status.validated")}
                </span>
                <span className="font-brand text-lg font-bold tabular-nums text-[#023A84]">
                  {validationProgress}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[#023A84]/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#023A84] to-[#4A90D9] transition-all duration-500 ease-out"
                  style={{ width: `${validationProgress}%` }}
                />
              </div>
              <div className="mt-2.5 flex items-center gap-2 border-t border-[#023A84]/8 pt-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4A90D9]" aria-hidden />
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#023A84]/75">
                  {t("dashboard.kpi.hint.today")}
                </p>
              </div>
            </div>

            {planningTotal === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#023A84]/20 bg-[#023A84]/[0.02] px-4 py-8 text-center text-sm text-muted-foreground">
                {t("dashboard.noPlanningToday")}
              </div>
            ) : (
              <ul className="space-y-2.5">
                {planning.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[#023A84]/8 bg-white/70 px-4 py-3.5 shadow-sm transition-all duration-200 hover:border-[#023A84]/20 hover:bg-[#023A84]/[0.03] dark:bg-card/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0B1F3A] dark:text-foreground">
                        {row.sections?.name ?? t("dashboard.sectionFallback")}
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {KNOWN_SHIFTS.includes(row.shift as (typeof KNOWN_SHIFTS)[number])
                          ? t(`shift.${row.shift}`)
                          : row.shift}
                      </p>
                    </div>
                    <StatusBadge tone={row.validated ? "success" : "warning"}>
                      {t(`status.${row.validated ? "validated" : "draft"}`)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
