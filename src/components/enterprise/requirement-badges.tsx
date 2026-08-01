import { Banknote, Bomb, Pill } from "lucide-react";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { cn } from "@/lib/utils";

type RequirementBadgesProps = {
  narcotics: number;
  explosives: number;
  currency?: number;
  narcoticsLabel: string;
  explosivesLabel: string;
  currencyLabel?: string;
  className?: string;
};

export function RequirementBadges({
  narcotics,
  explosives,
  currency = 0,
  narcoticsLabel,
  explosivesLabel,
  currencyLabel,
  className,
}: RequirementBadgesProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {narcotics > 0 && (
        <StatusBadge tone="success" className="gap-1 px-1.5 py-0.5 text-[11px]">
          <Pill className="h-3 w-3 shrink-0" />
          <span className="font-semibold tabular-nums">{narcotics}</span>
          <span className="font-normal opacity-90">{narcoticsLabel}</span>
        </StatusBadge>
      )}
      {explosives > 0 && (
        <StatusBadge tone="danger" className="gap-1 px-1.5 py-0.5 text-[11px]">
          <Bomb className="h-3 w-3 shrink-0" />
          <span className="font-semibold tabular-nums">{explosives}</span>
          <span className="font-normal opacity-90">{explosivesLabel}</span>
        </StatusBadge>
      )}
      {currency > 0 && currencyLabel && (
        <StatusBadge tone="warning" className="gap-1 px-1.5 py-0.5 text-[11px]">
          <Banknote className="h-3 w-3 shrink-0" />
          <span className="font-semibold tabular-nums">{currency}</span>
          <span className="font-normal opacity-90">{currencyLabel}</span>
        </StatusBadge>
      )}
      {narcotics === 0 && explosives === 0 && currency === 0 && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}
