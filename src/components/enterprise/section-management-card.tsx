import type { ReactNode } from "react";
import { Ban, Layers, Moon, Pencil, Sun, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { cn } from "@/lib/utils";

type SectionManagementCardProps = {
  name: string;
  shiftType: "day" | "night";
  active: boolean;
  agentCount: number;
  availableCount: number;
  unavailableCount: number;
  activeExclusionsCount: number;
  commanderFullName: string;
  commanderGrade: string;
  commanderMle: string;
  shiftDayLabel: string;
  shiftNightLabel: string;
  activeLabel: string;
  inactiveLabel: string;
  agentsLabel: string;
  availableLabel: string;
  unavailableLabel: string;
  exclusionsLabel: string;
  commanderLabel: string;
  gradeLabel: string;
  mleLabel: string;
  editLabel: string;
  deleteLabel: string;
  openLabel?: string;
  onOpen?: () => void;
  onExclusionsClick?: () => void;
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
  unavailableCount,
  activeExclusionsCount,
  commanderFullName,
  commanderGrade,
  commanderMle,
  shiftDayLabel,
  shiftNightLabel,
  activeLabel,
  inactiveLabel,
  agentsLabel,
  availableLabel,
  unavailableLabel,
  exclusionsLabel,
  commanderLabel,
  gradeLabel,
  mleLabel,
  editLabel,
  deleteLabel,
  openLabel,
  onOpen,
  onExclusionsClick,
  onEdit,
  onDelete,
  className,
}: SectionManagementCardProps) {
  const isDay = shiftType === "day";

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
        "enterprise-card hover-lift group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20",
        onOpen && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border/60 bg-muted/20 px-4 py-4">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-soft",
            isDay ? "bg-amber-500/10 text-amber-600" : "bg-indigo-500/10 text-indigo-600",
          )}
        >
          {isDay ? <Sun className="h-5 w-5" strokeWidth={2} /> : <Moon className="h-5 w-5" strokeWidth={2} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-tight text-foreground">{name}</h3>
            <StatusBadge tone={active ? "success" : "neutral"}>
              {active ? activeLabel : inactiveLabel}
            </StatusBadge>
          </div>
          <StatusBadge tone={isDay ? "warning" : "primary"} className="mt-2">
            {isDay ? shiftDayLabel : shiftNightLabel}
          </StatusBadge>
        </div>
        <Layers className="h-4 w-4 shrink-0 text-muted-foreground/40" strokeWidth={1.75} />
      </div>

      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {commanderLabel}
        </p>
        {commanderFullName.trim() ? (
          <>
            <p className="mt-1 text-sm font-semibold text-foreground">{commanderFullName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {gradeLabel}:{" "}
              <span className="font-medium text-foreground">{commanderGrade || "—"}</span>
              {" · "}
              {mleLabel}:{" "}
              <span className="font-medium text-foreground">{commanderMle || "—"}</span>
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">—</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-4 py-4">
        <StatTile
          icon={<Users className="h-3.5 w-3.5" />}
          label={agentsLabel}
          value={agentCount}
        />
        <StatTile
          icon={<UserCheck className="h-3.5 w-3.5" />}
          label={availableLabel}
          value={availableCount}
          valueClassName="text-emerald-700 dark:text-emerald-400"
        />
        <StatTile
          icon={<UserX className="h-3.5 w-3.5" />}
          label={unavailableLabel}
          value={unavailableCount}
          valueClassName="text-amber-700 dark:text-amber-400"
        />
        <button
          type="button"
          className={cn(
            "rounded-xl border border-border/60 bg-background/80 px-3 py-2.5 text-left transition-colors",
            onExclusionsClick &&
              "hover:border-destructive/30 hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onExclusionsClick?.();
          }}
          disabled={!onExclusionsClick}
          aria-label={exclusionsLabel}
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Ban className="h-3.5 w-3.5" />
            {exclusionsLabel}
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-destructive">
            {activeExclusionsCount}
          </p>
        </button>
      </div>

      <div
        className="mt-auto flex items-center justify-end gap-1 border-t border-border/60 bg-muted/10 px-3 py-2 opacity-90 transition-opacity group-hover:opacity-100"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2.5" onClick={onEdit} aria-label={editLabel}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {editLabel}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-lg px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          aria-label={deleteLabel}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {deleteLabel}
        </Button>
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
    <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", valueClassName)}>
        {value}
      </p>
    </div>
  );
}
