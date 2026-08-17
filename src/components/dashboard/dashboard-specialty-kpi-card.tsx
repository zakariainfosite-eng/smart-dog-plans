import type { LucideIcon } from "lucide-react";
import { Circle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type SpecialtyAccent = "primary" | "danger";

type DashboardSpecialtyKpiCardProps = {
  icon?: LucideIcon;
  label: string;
  narcotics: number;
  explosives: number;
  accent?: SpecialtyAccent;
  loading?: boolean;
  className?: string;
  onNarcoticsClick?: () => void;
  onExplosivesClick?: () => void;
};

const accentStyles: Record<SpecialtyAccent, { iconBg: string; bar: string; value: string }> = {
  primary: {
    iconBg: "bg-[#023A84]/12 text-[#023A84] dark:bg-sky-500/15 dark:text-sky-300",
    bar: "from-[#023A84] via-[#1a5aab] to-[#4A90D9]",
    value: "text-[#0B1F3A] dark:text-foreground",
  },
  danger: {
    iconBg: "bg-red-500/12 text-red-700 dark:text-red-400",
    bar: "from-red-700 via-red-500 to-rose-400",
    value: "text-red-700 dark:text-red-400",
  },
};

function SpecialtyRow({
  label,
  value,
  loading,
  valueClassName,
  onClick,
}: {
  label: string;
  value: number;
  loading?: boolean;
  valueClassName?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="min-w-0 text-[12px] font-medium leading-snug text-[#6B7280]">
        {label}
      </span>
      {loading ? (
        <Skeleton className="h-5 w-8" />
      ) : (
        <span
          className={cn(
            "shrink-0 font-brand text-[22px] font-bold leading-none tabular-nums tracking-tight",
            valueClassName,
          )}
        >
          {value}
        </span>
      )}
    </>
  );

  if (!onClick) {
    return <div className="flex items-baseline justify-between gap-3">{content}</div>;
  }

  return (
    <button
      type="button"
      className="-mx-1 flex w-[calc(100%+0.5rem)] items-baseline justify-between gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-[#023A84]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      aria-label={label}
    >
      {content}
    </button>
  );
}

export function DashboardSpecialtyKpiCard({
  icon: Icon = Circle,
  label,
  narcotics,
  explosives,
  accent = "primary",
  loading,
  className,
  onNarcoticsClick,
  onExplosivesClick,
}: DashboardSpecialtyKpiCardProps) {
  const { t } = useI18n();
  const styles = accentStyles[accent];

  return (
    <article
      className={cn(
        "group relative flex h-full min-h-[148px] flex-col overflow-hidden rounded-[18px] border border-[#023A84]/10 bg-white px-4 pb-3 pt-3.5 shadow-[0_3px_14px_-4px_rgba(2,58,132,0.10)] dark:bg-card",
        "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#023A84]/25 hover:shadow-[0_8px_20px_-6px_rgba(2,58,132,0.16)]",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r opacity-90 transition-opacity duration-200 group-hover:opacity-100",
          styles.bar,
        )}
      />

      <div className="relative flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-inset ring-black/5 transition-transform duration-200 group-hover:scale-105",
              styles.iconBg,
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <p className="min-w-0 pt-1 text-[13px] font-medium leading-snug text-[#6B7280]">
            {label}
          </p>
        </div>

        <div className="space-y-2.5">
          <SpecialtyRow
            label={t("dashboard.stat.narcotics")}
            value={narcotics}
            loading={loading}
            valueClassName={styles.value}
            onClick={onNarcoticsClick}
          />
          <SpecialtyRow
            label={t("dashboard.stat.explosives")}
            value={explosives}
            loading={loading}
            valueClassName={styles.value}
            onClick={onExplosivesClick}
          />
        </div>
      </div>
    </article>
  );
}
