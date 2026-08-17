import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/use-i18n";
import type { SpecialtyPairStats } from "@/lib/personnel-fonction-stats";
import { cn } from "@/lib/utils";

type SpecialtyBreakdownLinesProps = {
  specialty: SpecialtyPairStats;
  /** When set, shows a Total line above the specialty rows. */
  total?: number;
  /** Optional third line for administrative personnel (never mixed into specialty). */
  administrative?: number;
  /** Default: Stupéfiants then Explosifs. */
  explosivesFirst?: boolean;
  loading?: boolean;
  className?: string;
  onNarcoticsClick?: () => void;
  onExplosivesClick?: () => void;
  onTotalClick?: () => void;
  onAdministrativeClick?: () => void;
};

export function SpecialtyBreakdownLines({
  specialty,
  total,
  administrative,
  explosivesFirst = false,
  loading,
  className,
  onNarcoticsClick,
  onExplosivesClick,
  onTotalClick,
  onAdministrativeClick,
}: SpecialtyBreakdownLinesProps) {
  const { t } = useI18n();
  const extraLines = (total != null ? 1 : 0) + (administrative != null ? 1 : 0);

  if (loading) {
    return (
      <Skeleton
        className={cn(extraLines === 0 ? "h-[28px]" : extraLines === 1 ? "h-[42px]" : "h-[56px]", "w-full", className)}
      />
    );
  }

  const specialtyRows = explosivesFirst
    ? [
        { key: "explosives" as const, label: t("specialty.explosives"), value: specialty.explosives, onClick: onExplosivesClick },
        { key: "narcotics" as const, label: t("specialty.narcotics"), value: specialty.narcotics, onClick: onNarcoticsClick },
      ]
    : [
        { key: "narcotics" as const, label: t("specialty.narcotics"), value: specialty.narcotics, onClick: onNarcoticsClick },
        { key: "explosives" as const, label: t("specialty.explosives"), value: specialty.explosives, onClick: onExplosivesClick },
      ];

  return (
    <div className={cn("space-y-0.5 text-[10px] font-medium leading-snug text-[#023A84]/75", className)}>
      {total != null ? (
        <BreakdownLine
          label={t("specialty.total")}
          value={total}
          onClick={onTotalClick}
        />
      ) : null}
      {specialtyRows.map((row) => (
        <BreakdownLine
          key={row.key}
          label={row.label}
          value={row.value}
          onClick={row.onClick}
        />
      ))}
      {administrative != null ? (
        <BreakdownLine
          label={t("employees.stat.administrative")}
          value={administrative}
          onClick={onAdministrativeClick}
        />
      ) : null}
    </div>
  );
}

function BreakdownLine({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums text-[#0B1F3A] dark:text-foreground">{value}</span>
    </>
  );

  if (!onClick) {
    return <div className="flex items-baseline justify-between gap-2">{content}</div>;
  }

  return (
    <button
      type="button"
      className="-mx-1 flex w-[calc(100%+0.5rem)] items-baseline justify-between gap-2 rounded px-1 text-left hover:bg-[#023A84]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {content}
    </button>
  );
}
