import { Users, type LucideIcon } from "lucide-react";

import { SpecialtyBreakdownLines } from "@/components/agents/specialty-breakdown-lines";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/use-i18n";
import type { PersonnelCategoryStats, SpecialtyPairStats } from "@/lib/personnel-fonction-stats";
import { cn } from "@/lib/utils";

type EmployeesTotalStatCardProps = {
  total: number;
  categories: PersonnelCategoryStats;
  specialty: SpecialtyPairStats;
  label: string;
  trend?: string;
  loading?: boolean;
  icon?: LucideIcon;
  className?: string;
  onTotalClick?: () => void;
  onCynotechniciensClick?: () => void;
  onAdministrativeClick?: () => void;
  onNarcoticsClick?: () => void;
  onExplosivesClick?: () => void;
};

/** Matches {@link PageStatCard} with cynotechnicien / administratif + specialty breakdown. */
export function EmployeesTotalStatCard({
  total,
  categories,
  specialty,
  label,
  trend,
  loading,
  icon: Icon = Users,
  className,
  onTotalClick,
  onCynotechniciensClick,
  onAdministrativeClick,
  onNarcoticsClick,
  onExplosivesClick,
}: EmployeesTotalStatCardProps) {
  const { t } = useI18n();

  return (
    <article
      className={cn(
        "group relative flex min-h-[122px] flex-col overflow-hidden rounded-[18px] border border-[#023A84]/10 bg-white px-4 pb-2.5 pt-3.5 shadow-[0_3px_14px_-4px_rgba(2,58,132,0.10)] transition-all duration-200 ease-out dark:bg-card",
        "hover:-translate-y-0.5 hover:border-[#023A84]/25 hover:shadow-[0_8px_20px_-6px_rgba(2,58,132,0.16)]",
        onTotalClick && "cursor-pointer",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#023A84] via-[#1a5aab] to-[#4A90D9] opacity-90 transition-opacity duration-200 group-hover:opacity-100"
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#023A84]/12 text-[#023A84] shadow-sm ring-1 ring-inset ring-black/5 transition-transform duration-200 group-hover:scale-105">
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              {onTotalClick ? (
                <button
                  type="button"
                  className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={onTotalClick}
                  aria-label={label}
                >
                  <p className="font-brand text-[32px] font-bold leading-none tracking-tight text-[#0B1F3A] tabular-nums dark:text-foreground">
                    {loading ? "—" : total}
                  </p>
                </button>
              ) : (
                <p className="font-brand text-[32px] font-bold leading-none tracking-tight text-[#0B1F3A] tabular-nums dark:text-foreground">
                  {loading ? "—" : total}
                </p>
              )}
              {trend ? (
                <span className="mt-1 shrink-0 rounded-full bg-[#023A84]/8 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[#023A84]">
                  {trend}
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-[13px] font-medium leading-tight text-[#6B7280]">
              {label}
            </p>
          </div>
        </div>

        {loading ? (
          <Skeleton className="mt-1.5 h-[48px] w-full shrink-0" />
        ) : (
          <div className="mt-1.5 space-y-1">
            <p className="whitespace-pre-line text-[10px] font-medium leading-snug text-[#023A84]/75">
              <button
                type="button"
                className="block w-full rounded px-0.5 text-left hover:bg-[#023A84]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                onClick={onCynotechniciensClick}
                disabled={!onCynotechniciensClick}
              >
                {`🐕 ${t("employees.stat.cynotechniciens")} : ${categories.cynotechniciens}`}
              </button>
              <button
                type="button"
                className="block w-full rounded px-0.5 text-left hover:bg-[#023A84]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                onClick={onAdministrativeClick}
                disabled={!onAdministrativeClick}
              >
                {`📋 ${t("employees.stat.administrative")} : ${categories.administrative}`}
              </button>
            </p>
            <SpecialtyBreakdownLines
              specialty={specialty}
              onNarcoticsClick={onNarcoticsClick}
              onExplosivesClick={onExplosivesClick}
            />
          </div>
        )}
      </div>
    </article>
  );
}
