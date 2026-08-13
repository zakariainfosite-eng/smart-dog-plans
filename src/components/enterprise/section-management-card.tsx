import type { ReactNode } from "react";
import { Moon, Sun, UserCheck, Users } from "lucide-react";
import { RowActionButtons } from "@/components/enterprise/row-action-buttons";
import { StatusBadge } from "@/components/enterprise/status-badge";
import type { ExclusionType } from "@/lib/agent-exclusions";
import {
  SECTION_EXCLUSION_DISPLAY_TYPES,
  sumSectionExclusionBreakdown,
  type SectionExclusionBreakdown,
} from "@/lib/section-operational-stats";
import { cn } from "@/lib/utils";

export type SectionBreakdownLabel = {
  key: string;
  label: string;
  types: ExclusionType[];
};

type SectionManagementCardProps = {
  name: string;
  shiftType: "day" | "night";
  active: boolean;
  agentCount: number;
  availableCount: number;
  /** Per-reason counts for assigned personnel (0 allowed). */
  exclusionBreakdown: SectionExclusionBreakdown;
  /** Ordered labels for the breakdown grid. */
  breakdownLabels: SectionBreakdownLabel[];
  /** Operational narcotics (Total minus active exclusions). */
  narcoticsOperational: number;
  /** All assigned narcotics handlers in the section. */
  narcoticsTotal: number;
  /** Operational explosives (Total minus active exclusions). */
  explosivesOperational: number;
  /** All assigned explosives handlers in the section. */
  explosivesTotal: number;
  narcoticsLabel: string;
  explosivesLabel: string;
  operationalLabel: string;
  totalLabel: string;
  commanderFullName: string;
  commanderGrade: string;
  commanderMle: string;
  /** When true, show dotted placeholders instead of identity values. */
  commanderManualFill?: boolean;
  /** Keep mixed-case title (e.g. Adjoint replacement) instead of CSS uppercase. */
  commanderLabelPreserveCase?: boolean;
  shiftDayLabel: string;
  shiftNightLabel: string;
  activeLabel: string;
  inactiveLabel: string;
  agentsLabel: string;
  availableLabel: string;
  exclusionsDetailLabel?: string;
  commanderLabel: string;
  gradeLabel: string;
  mleLabel: string;
  editLabel: string;
  deleteLabel: string;
  openLabel?: string;
  onOpen?: () => void;
  /** Open all active exclusions for the section. */
  onExclusionsClick?: () => void;
  /** Open active exclusions for one breakdown counter (Maladie, Congé, …). */
  onExclusionTypeClick?: (types: ExclusionType[], label: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
};

export function SectionManagementCard({
  name,
  shiftType,
  active,
  agentCount,
  availableCount,
  exclusionBreakdown,
  breakdownLabels,
  narcoticsOperational,
  narcoticsTotal,
  explosivesOperational,
  explosivesTotal,
  narcoticsLabel,
  explosivesLabel,
  operationalLabel,
  totalLabel,
  commanderFullName,
  commanderGrade,
  commanderMle,
  commanderManualFill = false,
  commanderLabelPreserveCase = false,
  shiftDayLabel,
  shiftNightLabel,
  activeLabel,
  inactiveLabel,
  agentsLabel,
  availableLabel,
  exclusionsDetailLabel,
  commanderLabel,
  gradeLabel,
  mleLabel,
  editLabel,
  deleteLabel,
  openLabel,
  onOpen,
  onExclusionsClick,
  onExclusionTypeClick,
  onEdit,
  onDelete,
  className,
}: SectionManagementCardProps) {
  const isDay = shiftType === "day";
  const labels =
    breakdownLabels.length > 0
      ? breakdownLabels
      : SECTION_EXCLUSION_DISPLAY_TYPES.map((key) => ({
          key,
          label: key,
          types: [key],
        }));

  const gradeDisplay = commanderManualFill
    ? commanderGrade || "…………"
    : commanderGrade || "—";
  const mleDisplay = commanderManualFill
    ? commanderMle || "…………"
    : commanderMle || "—";

  return (
    <article
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={openLabel ?? name}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[18px] border border-[#023A84]/10 bg-card",
        "shadow-[0_3px_14px_-4px_rgba(2,58,132,0.10)] transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-[#023A84]/25 hover:shadow-[0_8px_20px_-6px_rgba(2,58,132,0.16)]",
        onOpen && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div
        aria-hidden
        className="h-[3px] shrink-0 bg-gradient-to-r from-[#023A84] via-[#1a5aab] to-[#4A90D9]"
      />

      <div className="flex items-center gap-2.5 border-b border-[#023A84]/8 px-3.5 py-2.5">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-inset ring-black/5",
            isDay
              ? "bg-amber-500/12 text-amber-600"
              : "bg-[#023A84]/12 text-[#023A84]",
          )}
        >
          {isDay ? (
            <Sun className="h-3.5 w-3.5" strokeWidth={2.25} />
          ) : (
            <Moon className="h-3.5 w-3.5" strokeWidth={2.25} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight text-[#0B1F3A] dark:text-foreground">
              {name}
            </h3>
            <StatusBadge
              tone={active ? "success" : "neutral"}
              className="h-5 shrink-0 px-1.5 text-[10px]"
            >
              {active ? activeLabel : inactiveLabel}
            </StatusBadge>
          </div>
          <div className="mt-1">
            <StatusBadge
              tone={isDay ? "warning" : "primary"}
              className="h-5 px-1.5 text-[10px]"
            >
              {isDay ? shiftDayLabel : shiftNightLabel}
            </StatusBadge>
          </div>
        </div>
      </div>

      <div className="border-b border-[#023A84]/8 px-3.5 py-2">
        <p
          className={cn(
            "text-[10px] font-semibold tracking-[0.06em] text-[#023A84]/70",
            !commanderLabelPreserveCase && "uppercase",
          )}
        >
          {commanderLabel}
        </p>
        {commanderManualFill || commanderFullName.trim() ? (
          <>
            <p
              className={cn(
                "mt-0.5 truncate text-sm font-bold leading-tight text-[#0B1F3A] dark:text-foreground",
                commanderManualFill && "tracking-widest text-muted-foreground",
              )}
            >
              {commanderManualFill
                ? commanderFullName || "………………………………"
                : commanderFullName}
            </p>
            <p
              className={cn(
                "mt-0.5 truncate text-[11px] leading-tight text-muted-foreground",
                commanderManualFill && "tracking-wider",
              )}
            >
              <span>
                {gradeLabel}{" "}
                <span className="font-semibold text-foreground/85">{gradeDisplay}</span>
              </span>
              <span className="mx-1.5 text-[#023A84]/30">·</span>
              <span>
                {mleLabel}{" "}
                <span className="font-semibold tabular-nums text-foreground/85">
                  {mleDisplay}
                </span>
              </span>
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">—</p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3.5 py-2.5">
        <div className="grid grid-cols-2 gap-1.5">
          <StatTile
            icon={<Users className="h-3 w-3" />}
            label={agentsLabel}
            value={agentCount}
          />
          <StatTile
            icon={<UserCheck className="h-3 w-3" />}
            label={availableLabel}
            value={availableCount}
            valueClassName="text-emerald-700 dark:text-emerald-400"
          />
          <SpecialtyStatTile
            emoji="🐕"
            label={narcoticsLabel}
            operationalLabel={operationalLabel}
            totalLabel={totalLabel}
            operational={narcoticsOperational}
            total={narcoticsTotal}
          />
          <SpecialtyStatTile
            emoji="💣"
            label={explosivesLabel}
            operationalLabel={operationalLabel}
            totalLabel={totalLabel}
            operational={explosivesOperational}
            total={explosivesTotal}
          />
        </div>

        <div
          className={cn(
            "rounded-xl border border-[#023A84]/10 bg-[#023A84]/[0.02] px-2.5 py-2",
            (onExclusionsClick || onExclusionTypeClick) &&
              "transition-colors hover:border-[#023A84]/25 hover:bg-[#023A84]/[0.04]",
          )}
          aria-label={exclusionsDetailLabel}
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {labels.map(({ key, label, types }) => (
              <BreakdownRow
                key={key}
                label={label}
                value={sumSectionExclusionBreakdown(exclusionBreakdown, types)}
                onClick={
                  onExclusionTypeClick || onExclusionsClick
                    ? () => {
                        if (onExclusionTypeClick) {
                          onExclusionTypeClick(types, label);
                          return;
                        }
                        onExclusionsClick?.();
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      </div>

      <div
        className="mt-auto flex items-center justify-end px-2.5 pb-2.5 pt-1"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <RowActionButtons
          editLabel={editLabel}
          deleteLabel={deleteLabel}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </article>
  );
}

function StatTile({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-[#023A84]/10 bg-[#023A84]/[0.02] px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums leading-none tracking-tight text-[#0B1F3A] dark:text-foreground",
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SpecialtyStatTile({
  emoji,
  label,
  operationalLabel,
  totalLabel,
  operational,
  total,
}: {
  emoji: string;
  label: string;
  operationalLabel: string;
  totalLabel: string;
  operational: number;
  total: number;
}) {
  return (
    <div className="rounded-lg border border-[#023A84]/10 bg-[#023A84]/[0.02] px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <span aria-hidden className="text-[11px] leading-none">
          {emoji}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <dl className="mt-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="truncate text-[10px] text-muted-foreground">{operationalLabel}</dt>
          <dd
            className={cn(
              "shrink-0 text-sm font-bold tabular-nums leading-none tracking-tight",
              operational > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-muted-foreground/70",
            )}
          >
            {operational}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="truncate text-[10px] text-muted-foreground">{totalLabel}</dt>
          <dd className="shrink-0 text-xs font-semibold tabular-nums leading-none tracking-tight text-foreground">
            {total}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-[11px] leading-4",
        interactive &&
          "cursor-pointer transition-colors hover:bg-[#023A84]/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#023A84]/30",
      )}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={(event) => {
        if (!onClick) return;
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }
      }}
      aria-label={interactive ? label : undefined}
    >
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span
        className={cn(
          "w-5 shrink-0 text-right font-semibold tabular-nums",
          value > 0 ? "text-[#0B1F3A] dark:text-foreground" : "text-muted-foreground/60",
        )}
      >
        {value}
      </span>
    </div>
  );
}
